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
  const AD_TEXT = /"(adPlacements|adSlots|playerAds|adBreakHeartbeatParams)"/g;
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
    // /youtubei/v1/player can be wrapped: { playerResponse: {...} }
    if (obj.playerResponse) prune(obj.playerResponse);
    return obj;
  };

  // Text-level rename, same trick as uBO's trusted-replace-*-response:
  // the keys stay valid JSON but the player no longer recognises them.
  const scrub = (text) => (typeof text === "string" ? text.replace(AD_TEXT, '"no_ads"') : text);
  const isAdUrl = (url) => AD_URL.test(String(url));

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

  const patchRealm = (win) => {
    // 1. JSON.parse — covers anything parsed from strings.
    const origParse = win.JSON.parse;
    win.JSON.parse = function (...args) {
      return prune(origParse.apply(this, args));
    };

    // 2. fetch — rewrite bodies of player/next responses on the fly.
    const origFetch = win.fetch;
    win.fetch = async function (input, init) {
      const res = await origFetch.call(this, input, init);
      if (!adsEnabled()) return res;
      const url = typeof input === "string" ? input : input && input.url;
      if (!isAdUrl(url) || !res.body) return res;
      try {
        const headers = new win.Headers(res.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        const patched = new win.Response(res.body.pipeThrough(scrubStream(win)), {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
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
      this.__ytDebloatCache = undefined;
      return origOpen.call(this, method, url, ...rest);
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

  // 5. Inline `var ytInitialPlayerResponse = {...}` on first page load.
  const trap = (name) => {
    let value;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: () => value,
        set: (v) => { value = prune(v); },
      });
    } catch (_) { /* already defined non-configurably — DOM skipper still covers it */ }
  };
  trap("ytInitialPlayerResponse");

  // 6. Tell YouTube's ad status probe that ads "loaded".
  try { window.google_ad_status = 1; } catch (_) {}
})();
