const DEFAULTS = { ads: true, shorts: true, shortsRedirect: true };
const switches = document.querySelectorAll("input[data-key]");

browser.storage.local.get(DEFAULTS).then((settings) => {
  for (const input of switches) input.checked = settings[input.dataset.key] !== false;
});

for (const input of switches) {
  input.addEventListener("change", () => {
    browser.storage.local.set({ [input.dataset.key]: input.checked });
  });
}

document.getElementById("version").textContent = `v${browser.runtime.getManifest().version}`;
