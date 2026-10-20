// Runs in the page's own JS world before YouTube's scripts.
// Strips ad payloads out of player responses so the player never schedules ads.
(() => {
  // If Safari ignored "world": "MAIN" we're in the isolated world, where these
  // hooks would patch our own copy of JSON/fetch — useless. content.js then
  // re-injects this file into the page via a <script src>.
  if (typeof browser !== "undefined" && browser.runtime && browser.runtime.id) return;
  if (window.__ytDebloat) return;
  window.__ytDebloat = true;
  document.documentElement.dataset.ytDebloatHooks = document.currentScript ? "fallback" : "main";

  const AD_KEYS = ["adPlacements", "adSlots", "playerAds", "adBreakHeartbeatParams"];
  const NAG_KEYS = ["enforcementMessageViewModel", "upsellDialogRenderer"];
  const AD_URL = /\/youtubei\/v1\/(player|next|get_watch|reel\/reel_watch_sequence)\b/;
  const AD_TEXT = /"(adPlacements|adSlots|playerAds|adBreakHeartbeatParams)"/g;

  // ───────── object-level pruning ─────────
  const prune = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
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

  const patchRealm = (win) => {
    // 1. JSON.parse — covers anything parsed from strings.
    const origParse = win.JSON.parse;
    win.JSON.parse = function (...args) {
      return prune(origParse.apply(this, args));
    };

    // 2. fetch — rewrite bodies of player/next responses.
    const origFetch = win.fetch;
    win.fetch = async function (input, init) {
      const res = await origFetch.call(this, input, init);
      const url = typeof input === "string" ? input : input && input.url;
      if (!isAdUrl(url)) return res;
      try {
        const body = scrub(await res.clone().text());
        const patched = new win.Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
        Object.defineProperty(patched, "url", { value: res.url });
        return patched;
      } catch (_) {
        return res;
      }
    };

    // 3. XHR — responseText and responseType: "json".
    const XHR = win.XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    XHR.open = function (method, url, ...rest) {
      this.__ytDebloatAd = isAdUrl(url);
      return origOpen.call(this, method, url, ...rest);
    };
    for (const prop of ["responseText", "response"]) {
      const desc = Object.getOwnPropertyDescriptor(XHR, prop);
      if (!desc || !desc.get) continue;
      Object.defineProperty(XHR, prop, {
        ...desc,
        get() {
          const value = desc.get.call(this);
          if (!this.__ytDebloatAd || this.readyState !== 4) return value;
          return typeof value === "string" ? scrub(value) : prune(value);
        },
      });
    }
  };
  patchRealm(window);

  // 4. YouTube grabs pristine fetch/JSON from a fresh same-origin iframe to dodge
  //    hooks like ours (uBO counters this with trusted-prevent-dom-bypass).
  //    Patch every iframe's realm the moment it's attached.
  const guardInsert = (proto, name) => {
    const orig = proto[name];
    proto[name] = function (...args) {
      const result = orig.apply(this, args);
      for (const node of args) {
        if (node instanceof HTMLIFrameElement) {
          try {
            const win = node.contentWindow;
            if (win && !win.__ytDebloat) {
              win.__ytDebloat = true;
              patchRealm(win);
            }
          } catch (_) { /* cross-origin iframe — not a bypass vector */ }
        }
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
