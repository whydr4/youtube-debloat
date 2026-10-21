// Runs in the page's own JS world before YouTube's scripts.
// Strips ad payloads out of player responses so the player never schedules ads.
(() => {
  // If Safari ignored "world": "MAIN" we're in the isolated world, where these
  // hooks would patch our own copy of JSON/fetch — useless. content.js then
  // re-injects this file into the page via a <script src>.
  if (typeof browser !== "undefined" && browser.runtime && browser.runtime.id) return;
  if (window.__ytDebloat) return;
  window.__ytDebloat = true;
  const root = document.documentElement;
  root.dataset.ytDebloatHooks = document.currentScript ? "fallback" : "main";

  // content.js mirrors the user's settings onto <html>. Read lazily so a
  // toggle in the popup takes effect on the next request, no reload needed.
  const adsEnabled = () => root.dataset.ytdAds !== "off";

  const AD_KEYS = ["adPlacements", "adSlots", "playerAds", "adBreakHeartbeatParams"];
  const NAG_KEYS = ["enforcementMessageViewModel", "upsellDialogRenderer"];
  const AD_URL = /\/youtubei\/v1\/(player|next|get_watch|reel\/reel_watch_sequence)\b/;
  // "Video paused. Continue watching?" — the server sends it with the response
  // when the request says the viewer has been idle (see lactMilliseconds below).
  const IDLE_KEYS = ["youThereRenderer", "youThereData"];
  const AD_TEXT = /"(adPlacements|adSlots|playerAds|adBreakHeartbeatParams|youThereRenderer|youThereData)"/g;
  // Longest key above, with quotes — how much text to hold back between chunks.
  const CARRY = 32;

  // ───────── object-level pruning ─────────
  const prune = (obj) => {
    if (!obj || typeof obj !== "object" || !adsEnabled()) return obj;
    for (const key of AD_KEYS) {
      if (key in obj) delete obj[key];
    }
    const nags = obj.auxiliaryUi && obj.auxiliaryUi.messageRenderers;
    if (nags) for (const key of NAG_KEYS) delete nags[key];
    if (Array.isArray(obj.messages)) obj.messages = obj.messages.filter((m) => !IDLE_KEYS.some((k) => m && k in m));
    for (const key of IDLE_KEYS) if (key in obj) delete obj[key];
    // /youtubei/v1/player can be wrapped: { playerResponse: {...} }
    if (obj.playerResponse) prune(obj.playerResponse);
    return obj;
  };

  // Text-level rename, same trick as uBO's trusted-replace-*-response:
  // the keys stay valid JSON but the player no longer recognises them.
  const scrub = (text) => (typeof text === "string" ? text.replace(AD_TEXT, '"no_ads"') : text);
  const isAdUrl = (url) => AD_URL.test(String(url));

  // Stripping ads from the response is too late on its own: once the server has
  // planned a pre-roll, the media stream it hands out carries a SABR backoff of
  // ~80% of the ad's length, so the video sits black for that long after the ad
  // is gone. Telling the server the viewer has been idle for an hour
  // (contentPlaybackContext.lactMilliseconds) makes it plan no ad at all — and so
  // no backoff. uBO uses the same field, but only after the player has already
  // stalled; here it goes into the first request. The side effect is a
  // "Video paused. Continue watching?" prompt, which IDLE_KEYS strips below.
  // isInlinePlaybackNoAd, the older trick, no longer has any effect.
  const PLAYER_URL = /\/youtubei\/v1\/(player|get_watch)\b/;
  const IDLE_MS = "3600000";
  const flagRequest = (body) => {
    if (typeof body !== "string" || !body.includes('"contentPlaybackContext"')) return body;
    try {
      const o = JSON.parse(body);
      const pr = o.playerRequest || o; // get_watch wraps the player request
      const cpc = pr.playbackContext && pr.playbackContext.contentPlaybackContext;
      if (!cpc) return body;
      cpc.lactMilliseconds = IDLE_MS;
      return JSON.stringify(o);
    } catch (_) {
      return body;
    }
  };

  // Streaming scrubber: rewrites the body chunk by chunk, so YouTube keeps
  // getting bytes as they arrive instead of waiting for the whole response.
  // Never clones the original — a tee'd stream nobody reads keeps the HTTP
  // stream open, and a few of those jam every later request to youtube.com.
  const scrubStream = (win) => {
    const decoder = new win.TextDecoder();
    const encoder = new win.TextEncoder();
    let carry = "";
    return new win.TransformStream({
      transform(chunk, controller) {
        const text = carry + decoder.decode(chunk, { stream: true });
        let cut = text.length - CARRY;
        if (cut <= 0) {
          carry = text;
          return;
        }
        // Cut right after a `":` so no key can straddle the boundary: a key's
        // opening quote is always followed by a letter, never by a colon.
        const q = text.lastIndexOf('":', cut);
        if (q > 0) cut = q + 1;
        carry = text.slice(cut);
        controller.enqueue(encoder.encode(scrub(text.slice(0, cut))));
      },
      flush(controller) {
        const tail = carry + decoder.decode();
        if (tail) controller.enqueue(encoder.encode(scrub(tail)));
      },
    });
  };

  // Media streams (SABR) arrive as UMP: a sequence of [type][size][payload] parts.
  // When the server wanted to show a pre-roll it withholds media for the ad's
  // length and pushes a SNACKBAR_MESSAGE part — the "Something went wrong" toast.
  // The wait is enforced server-side (a signed slot with its own clock), but the
  // toast is just a part we can drop while passing everything else through.
  const UMP_SNACKBAR = 67;
  const readVarint = (b, p) => {
    if (p >= b.length) return null;
    const b0 = b[p];
    const n = b0 < 128 ? 1 : b0 < 192 ? 2 : b0 < 224 ? 3 : b0 < 240 ? 4 : 5;
    if (p + n > b.length) return null;
    switch (n) {
      case 1: return [b0, 1];
      case 2: return [(b0 & 0x3f) | (b[p + 1] << 6), 2];
      case 3: return [(b0 & 0x1f) | (b[p + 1] << 5) | (b[p + 2] << 13), 3];
      case 4: return [(b0 & 0x0f) | (b[p + 1] << 4) | (b[p + 2] << 12) | (b[p + 3] << 20), 4];
      default: return [(b[p + 1] | (b[p + 2] << 8) | (b[p + 3] << 16) | (b[p + 4] << 24)) >>> 0, 5];
    }
  };
  const umpStream = (win) => {
    let pending = new Uint8Array(0); // unparsed bytes at a part boundary
    let remaining = 0;               // payload bytes left in the current part
    let dropping = false;            // current part is a snackbar
    let broken = false;              // parse failed — pass the rest through untouched
    const concat = (a, b) => {
      const out = new Uint8Array(a.length + b.length);
      out.set(a);
      out.set(b, a.length);
      return out;
    };
    return new win.TransformStream({
      transform(chunk, controller) {
        if (broken) return controller.enqueue(chunk);
        const data = pending.length ? concat(pending, chunk) : chunk;
        pending = new Uint8Array(0);
        let p = 0;
        while (p < data.length) {
          if (remaining > 0) {
            const take = Math.min(remaining, data.length - p);
            if (!dropping) controller.enqueue(data.subarray(p, p + take));
            p += take;
            remaining -= take;
            continue;
          }
          const type = readVarint(data, p);
          const size = type && readVarint(data, p + type[1]);
          if (!type || !size) {
            pending = data.slice(p); // header straddles chunks
            return;
          }
          if (size[0] > 1e8) {
            broken = true;
            return controller.enqueue(data.subarray(p));
          }
          const header = type[1] + size[1];
          dropping = type[0] === UMP_SNACKBAR;
          remaining = size[0];
          if (!dropping) controller.enqueue(data.subarray(p, p + header));
          p += header;
        }
      },
      flush(controller) {
        if (pending.length) controller.enqueue(pending);
      },
    });
  };
  const isUmp = (res) => /vnd\.yt-ump/.test(res.headers.get("content-type") || "");

  const patchRealm = (win) => {
    // 1. JSON.parse — covers anything parsed from strings.
    const origParse = win.JSON.parse;
    win.JSON.parse = function (...args) {
      return prune(origParse.apply(this, args));
    };

    // 2. fetch — rewrite bodies of player/next responses on the fly.
    const origFetch = win.fetch;
    win.fetch = async function (input, init) {
      const url = typeof input === "string" ? input : input && input.url;
      if (adsEnabled() && PLAYER_URL.test(String(url))) {
        try {
          if (init && typeof init.body === "string") {
            init = { ...init, body: flagRequest(init.body) };
          } else if (input instanceof win.Request && !(init && init.body)) {
            // YouTube gzips request bodies (content-encoding: gzip); unpack,
            // flag, and send the JSON uncompressed — the server takes either.
            const gzip = /gzip/i.test(input.headers.get("content-encoding") || "");
            const raw = gzip
              ? await new win.Response(input.clone().body.pipeThrough(new win.DecompressionStream("gzip"))).text()
              : await input.clone().text();
            const flagged = flagRequest(raw);
            if (flagged !== raw) {
              const headers = new win.Headers(input.headers);
              headers.delete("content-encoding");
              input = new win.Request(input, { body: flagged, headers });
            }
          }
        } catch (_) { /* send it as is */ }
      }
      const res = await origFetch.call(this, input, init);
      if (!adsEnabled() || !res.body) return res;
      const ump = res.status === 200 && /\/videoplayback\b/.test(String(url)) && isUmp(res);
      if (!isAdUrl(url) && !ump) return res;
      try {
        const headers = new win.Headers(res.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        const body = res.body.pipeThrough(ump ? umpStream(win) : scrubStream(win));
        const patched = new win.Response(body, { status: res.status, statusText: res.statusText, headers });
        Object.defineProperty(patched, "url", { value: res.url });
        return patched;
      } catch (_) {
        return res;
      }
    };

    // 3. XHR — responseText and responseType: "json". Scrubbed once per
    //    request and cached; YouTube reads these getters more than once.
    const XHR = win.XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    XHR.open = function (method, url, ...rest) {
      this.__ytDebloatAd = isAdUrl(url);
      this.__ytDebloatPlayer = PLAYER_URL.test(String(url));
      this.__ytDebloatCache = undefined;
      return origOpen.call(this, method, url, ...rest);
    };
    const origSend = XHR.send;
    XHR.send = function (body) {
      if (this.__ytDebloatPlayer && adsEnabled()) body = flagRequest(body);
      return origSend.call(this, body);
    };
    for (const prop of ["responseText", "response"]) {
      const desc = Object.getOwnPropertyDescriptor(XHR, prop);
      if (!desc || !desc.get) continue;
      Object.defineProperty(XHR, prop, {
        ...desc,
        get() {
          const value = desc.get.call(this);
          if (!this.__ytDebloatAd || this.readyState !== 4 || !adsEnabled()) return value;
          if (typeof value !== "string") return prune(value);
          if (this.__ytDebloatCache === undefined) this.__ytDebloatCache = scrub(value);
          return this.__ytDebloatCache;
        },
      });
    }
  };
  patchRealm(window);

  // 4. YouTube grabs pristine fetch/JSON from a fresh same-origin iframe to dodge
  //    hooks like ours (uBO counters this with trusted-prevent-dom-bypass).
  //    Patch every iframe's realm the moment it's attached.
  const patchFrame = (node) => {
    try {
      const win = node.contentWindow;
      if (win && !win.__ytDebloat) {
        win.__ytDebloat = true;
        patchRealm(win);
      }
    } catch (_) { /* cross-origin iframe — not a bypass vector */ }
  };
  const guardInsert = (proto, name) => {
    const orig = proto[name];
    proto[name] = function (...args) {
      const result = orig.apply(this, args);
      for (const node of args) {
        if (node && node.nodeName === "IFRAME") patchFrame(node);
      }
      return result;
    };
  };
  guardInsert(Node.prototype, "appendChild");
  guardInsert(Node.prototype, "insertBefore");
  guardInsert(Element.prototype, "append");

  // 5. Inline `var ytInitialPlayerResponse = {...}` on first page load. The server
  //    embeds it in the HTML with the ad (and the backoff) already planned, and
  //    no request of ours is involved. Dropping it breaks playback (the player's
  //    own refetch has no attestation and media gets 403), so keep it, and as
  //    soon as the player is up, reload the same video once: that /player
  //    request carries lactMilliseconds and comes back without the backoff.
  //    Skipped for live streams and playlists (reloading loses the playlist).
  const hasAds = (r) => r && typeof r === "object" && AD_KEYS.some((k) => k in r);
  const isLive = (r) => !!(r && r.videoDetails && (r.videoDetails.isLive || r.videoDetails.isLiveContent));
  const startSeconds = (r) => {
    const cfg = r.playerConfig && r.playerConfig.playbackStartConfig;
    if (cfg && cfg.startSeconds) return Number(cfg.startSeconds) || 0;
    const t = new URLSearchParams(location.search).get("t") || "";
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  };
  let reloadScheduled = false;
  const reloadWithoutBackoff = (r) => {
    const id = r.videoDetails && r.videoDetails.videoId;
    if (reloadScheduled || !id || location.pathname !== "/watch" || new URLSearchParams(location.search).has("list")) return;
    reloadScheduled = true;
    const start = startSeconds(r);
    const deadline = Date.now() + 15000;
    const timer = setInterval(() => {
      const p = document.getElementById("movie_player");
      if (Date.now() > deadline || !adsEnabled()) return clearInterval(timer);
      if (!p || !p.loadVideoById || !p.getVideoData || p.getVideoData().video_id !== id) return;
      clearInterval(timer);
      p.loadVideoById(id, start);
    }, 100);
  };
  const trap = (name) => {
    let value;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: () => value,
        set: (v) => {
          if (adsEnabled() && hasAds(v) && !isLive(v)) reloadWithoutBackoff(v);
          value = prune(v);
        },
      });
    } catch (_) { /* already defined non-configurably — DOM skipper still covers it */ }
  };
  trap("ytInitialPlayerResponse");

  // 6. Tell YouTube's ad status probe that ads "loaded".
  try { window.google_ad_status = 1; } catch (_) {}
})();
