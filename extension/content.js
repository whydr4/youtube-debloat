// Isolated-world content script: settings, safety net for ads that slip
// through inject.js, plus Shorts cleanup that CSS alone can't express.
(() => {
  if (window.top !== window && !location.pathname.startsWith("/embed/")) return;

  const root = document.documentElement;

  // ───────── Настройки ─────────
  // Зеркалим их в data-атрибуты <html>: hide.css и inject.js читают оттуда.
  const DEFAULTS = { ads: true, shorts: true, shortsRedirect: true };
  const settings = { ...DEFAULTS };

  const applySettings = () => {
    root.dataset.ytdAds = settings.ads ? "on" : "off";
    root.dataset.ytdShorts = settings.shorts ? "on" : "off";
    if (!settings.shorts) {
      // Вернуть элементы, которые мы спрятали инлайн-стилем
      document.querySelectorAll("[data-yt-debloat]").forEach((el) => {
        el.style.removeProperty("display");
        delete el.dataset.ytDebloat;
      });
    }
  };
  applySettings();

  const storage = browser.storage.local;
  storage.get(DEFAULTS).then((stored) => {
    Object.assign(settings, stored);
    applySettings();
    redirectShorts();
    schedule();
  }).catch(() => {});
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key in changes) if (key in DEFAULTS) settings[key] = changes[key].newValue;
    applySettings();
    redirectShorts();
    schedule();
  });

  // ───────── Хуки, вырезающие рекламу из ответов плеера ─────────
  // Обычно inject.js уже отработал в мире страницы (world: MAIN).
  // Если Safari это не поддержал — подгружаем его как ресурс расширения.
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
    if (!settings.shortsRedirect) return;
    const m = location.pathname.match(/^\/shorts\/([\w-]{6,})/);
    if (m) location.replace(`/watch?v=${m[1]}${location.search.replace(/^\?/, "&")}`);
  };
  redirectShorts();
  // YouTube — SPA, переходы без перезагрузки страницы
  document.addEventListener("yt-navigate-start", redirectShorts);
  document.addEventListener("yt-navigate-finish", () => { redirectShorts(); watchPlayer(); schedule(); });

  // Чипы-фильтры и вкладки с текстом «Shorts» — по CSS текст не матчится
  const TEXT_TARGETS = "yt-chip-cloud-chip-renderer, chip-shape, yt-tab-shape, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer";
  const hideShortsByText = () => {
    if (!settings.shorts) return;
    for (const el of document.querySelectorAll(TEXT_TARGETS)) {
      if (el.dataset.ytDebloat) continue;
      if (el.textContent.trim() === "Shorts") {
        el.style.setProperty("display", "none", "important");
        el.dataset.ytDebloat = "1";
      }
    }
  };

  // ───────── Реклама в плеере: страховочный автоскип ─────────
  // Слушаем только атрибут class самого плеера, а не всего документа:
  // YouTube переключает классы сотни раз в минуту, и общий наблюдатель
  // на атрибутах заставлял нас обходить DOM на каждом кадре.
  let player = null;
  let wasAd = false;
  const playerObserver = new MutationObserver(() => onPlayerClass());

  const onPlayerClass = () => {
    if (!player) return;
    const isAd = player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
    if (isAd && settings.ads) {
      const video = player.querySelector("video");
      if (video) {
        video.muted = true;
        if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration;
      }
      player
        .querySelectorAll(".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button")
        .forEach((btn) => btn.click());
    }
    // После выхода из рекламы возвращаем звук, если глушили мы
    if (wasAd && !isAd) {
      const video = player.querySelector("video");
      if (video) video.muted = false;
    }
    wasAd = isAd;
  };

  const watchPlayer = () => {
    const found = document.querySelector(".html5-video-player");
    if (found === player) return;
    playerObserver.disconnect();
    player = found;
    wasAd = false;
    if (!player) return;
    playerObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
    onPlayerClass();
  };

  // Попап анти-адблока скрыт в CSS, но он успевает поставить видео на паузу
  const dismissEnforcement = () => {
    if (!settings.ads) return;
    const popup = document.querySelector("ytd-enforcement-message-view-model");
    if (!popup || popup.dataset.ytDebloat) return;
    popup.dataset.ytDebloat = "1";
    document.querySelector("tp-yt-iron-overlay-backdrop")?.remove();
    const video = player && player.querySelector("video");
    if (video && video.paused) video.play().catch(() => {});
  };

  // ───────── Один дешёвый проход на структурные изменения DOM ─────────
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!player || !player.isConnected) watchPlayer();
      dismissEnforcement();
      hideShortsByText();
    });
  };

  const domObserver = new MutationObserver(schedule);
  const start = () => {
    domObserver.observe(root, { childList: true, subtree: true });
    watchPlayer();
    schedule();
  };

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
