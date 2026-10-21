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

const version = browser.runtime.getManifest().version;
document.getElementById("version").textContent = `v${version}`;

// The auto-updater swaps the build behind Safari's back — say so once.
browser.storage.local.get("seenVersion").then(({ seenVersion }) => {
  if (seenVersion && seenVersion !== version) {
    const note = document.getElementById("updated");
    note.textContent = `Updated to v${version} — what's new →`;
    note.hidden = false;
  }
  browser.storage.local.set({ seenVersion: version });
});
