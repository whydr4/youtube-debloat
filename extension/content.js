// Isolated-world content script: safety net for ads that slip through
// inject.js, plus Shorts cleanup that CSS alone can't express.
(() => {
  if (window.top !== window && !location.pathname.startsWith("/embed/")) return;

  // ───────── Хуки, вырезающие рекламу из ответов плеера ─────────
  // Обычно inject.js уже отработал в мире страницы (world: MAIN).
  // Если Safari это не поддержал — подгружаем его как ресурс расширения.
  const root = document.documentElement;
  if (!root.dataset.ytDebloatHooks) {
    const s = document.createElement("script");
    s.src = browser.runtime.getURL("inject.js");
    s.onload = () => {
      s.remove();
      console.info(`[Debloat] hooks: ${root.dataset.ytDebloatHooks || "FAILED — only auto-skip is active"}`);
    };
    s.onerror = () => console.warn("[Debloat] hooks: blocked — only auto-skip is active");
    (document.head || root).appendChild(s);
  } else {
    console.info(`[Debloat] hooks: ${root.dataset.ytDebloatHooks}`);
  }

  // ───────── Shorts: /shorts/ID → обычный плеер ─────────
  const redirectShorts = () => {
    const m = location.pathname.match(/^\/shorts\/([\w-]{6,})/);
    if (m) location.replace(`/watch?v=${m[1]}${location.search.replace(/^\?/, "&")}`);
  };
  redirectShorts();
  // YouTube — SPA, переходы без перезагрузки страницы
  document.addEventListener("yt-navigate-start", redirectShorts);
  document.addEventListener("yt-navigate-finish", redirectShorts);

  // Чипы-фильтры и вкладки с текстом «Shorts» — по CSS текст не матчится
  const hideShortsByText = () => {
    document
      .querySelectorAll("yt-chip-cloud-chip-renderer, chip-shape, yt-tab-shape, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer")
      .forEach((el) => {
        if (el.dataset.ytDebloat) return;
        if (el.textContent.trim() === "Shorts") {
          el.style.setProperty("display", "none", "important");
          el.dataset.ytDebloat = "1";
        }
      });
  };

  // ───────── Реклама в плеере: страховочный автоскип ─────────
  const skipAd = () => {
    const player = document.querySelector(".html5-video-player.ad-showing, .html5-video-player.ad-interrupting");
    if (!player) return;
    const video = player.querySelector("video");
    if (video) {
      video.muted = true;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration;
      }
    }
    player
      .querySelectorAll(".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button")
      .forEach((btn) => btn.click());
  };

  // После выхода из рекламы возвращаем звук, если глушили мы
  let wasAd = false;
  const restoreSound = () => {
    const player = document.querySelector(".html5-video-player");
    if (!player) return;
    const isAd = player.classList.contains("ad-showing");
    if (wasAd && !isAd) {
      const video = player.querySelector("video");
      if (video) video.muted = false;
    }
    wasAd = isAd;
  };

  // Попап анти-адблока скрыт в CSS, но он успевает поставить видео на паузу
  const dismissEnforcement = () => {
    const popup = document.querySelector("ytd-enforcement-message-view-model");
    if (!popup || popup.dataset.ytDebloat) return;
    popup.dataset.ytDebloat = "1";
    document.querySelector("tp-yt-iron-overlay-backdrop")?.remove();
    const video = document.querySelector(".html5-video-player video");
    if (video && video.paused) video.play().catch(() => {});
  };

  const tick = () => {
    skipAd();
    restoreSound();
    dismissEnforcement();
    hideShortsByText();
  };

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      tick();
    });
  });

  const start = () => {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    tick();
  };

  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
