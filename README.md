<p align="center">
  <picture>
    <source srcset="extension/icons/icon-128-dark.png" media="(prefers-color-scheme: dark)">
    <img src="extension/icons/icon-128.png" width="96" alt="">
  </picture>
</p>

<h1 align="center">YouTube Debloat</h1>

<p align="center">
  <b>No ads. No Shorts. No subscription to get rid of either.</b><br>
  A tiny Safari extension that gives YouTube back to people who came to watch videos.
</p>

---

You opened YouTube to watch *one* video. You got a 15-second unskippable ad for a mobile game,
a mid-roll for a VPN, a promoted shelf, a merch carousel, a "banner" about Premium,
and a wall of vertical slop engineered to eat the next 40 minutes of your life.

**YouTube Debloat deletes all of that.** Before it loads, before it plays, before it gets a chance.

- 🚫 **Video ads** — pre-rolls, mid-rolls, bumpers. Cut out of the player's data, not "skipped".
- 🧱 **Feed & page ads** — promoted videos, banners, masthead, merch shelves, companion ads, sponsored cards.
- ✂️ **Shorts. All of them.** Shelves, feed items, search results, sidebar entry, channel tab, filter chip.
- ↪️ **`/shorts/…` links** quietly open in the normal player — with a seek bar, like a civilized video.
- 🙈 **The "ad blockers are not allowed" nag** — hidden, and your video keeps playing.
- 🎛️ **Three switches** in the toolbar button — ads, Shorts, Shorts redirect. That's the whole settings screen.

No account. No telemetry. No "Pro" tier. No remote filter lists. About 400 lines of code you can read over coffee.

---

## How it works

YouTube's ads aren't separate files you can block by URL — they're instructions buried inside the same
JSON that tells the player what to play. So Debloat doesn't play whack-a-mole with network requests.
It edits the instructions.

| Layer | What it does |
|---|---|
| **1. Response surgery** (`inject.js`) | Runs in the page before YouTube's own code. Hooks `JSON.parse`, `fetch`, `XMLHttpRequest` and the inline `ytInitialPlayerResponse`, and renames `adPlacements`, `adSlots`, `playerAds` → `no_ads`. Fetch bodies are rewritten *as they stream* — YouTube never waits on us. The player gets a valid response with nothing to schedule. |
| **2. Iframe bypass guard** | YouTube likes to pull a *clean* `fetch` out of a fresh hidden iframe to dodge hooks like ours. Every iframe gets patched the moment it's attached to the page. |
| **3. Auto-skip safety net** (`content.js`) | If an ad ever slips through, it's muted, fast-forwarded to the end and its skip button is clicked — in the same animation frame it appears. Watches only the player's `class`, not the whole page, so it costs nothing while you watch. |
| **4. CSS guillotine** (`hide.css`) | Feed ads and every Shorts surface get `display: none`. Modern `:has()` selectors, no layout jank. |
| **5. Stream filter** (`inject.js`) | YouTube's media protocol (SABR/UMP) carries commands next to the video bytes. The one that pops the "Something went wrong" toast is dropped in flight; the bytes go through untouched. |

---

## Install (build from source)

You need **macOS**, **Safari**, and **Xcode** (free from the App Store). No Apple Developer account required.

```bash
git clone https://github.com/whydr4/youtube-debloat.git
cd youtube-debloat
./scripts/build.sh --install
```

This builds `YouTube Debloat.app`, copies it to `~/Applications` and launches it.
Then let Safari run it:

1. **Safari → Settings → Advanced** → tick **"Show features for web developers"**.
2. **Safari → Settings → Developer** → tick **"Allow unsigned extensions"**.
3. **Safari → Settings → Extensions** → enable **Debloat for YouTube** → allow it on `youtube.com`.
4. Reload YouTube. Enjoy the silence.

> **Heads-up:** a locally built (ad-hoc signed) extension is "unsigned" in Safari's eyes, and Safari
> **turns "Allow unsigned extensions" off every time it quits.** After restarting Safari, re-tick
> step 2. Annoying? Yes. Apple's rule, not ours.
> If you have an Apple Developer account, open `xcode/YouTube Debloat.xcodeproj`,
> pick your Team under *Signing & Capabilities*, and build from Xcode instead.

Only want the app in `./dist` without installing? Run `./scripts/build.sh`.

### Check that it's alive

Open YouTube, then **Develop → Show JavaScript Console** and look for:

```
[Debloat] hooks: main
```

- `main` / `fallback` — ads are being cut out of player responses. 👌
- `FAILED` / `blocked` — Safari wouldn't let the hooks into the page. Feed ads and Shorts are still gone,
  video ads get auto-skipped instead of never existing. Please [open an issue](https://github.com/whydr4/youtube-debloat/issues)
  with your macOS and Safari versions.

---

## FAQ

**Why does the first video of a session take ~10 seconds to start?**
Because YouTube wanted to show you a pre-roll. Since 2025 its streaming server holds the video back for
exactly the length of the ad it didn't get to play — a signed, server-side timer that no client-side trick
can skip (we tried: resending the request just gets another "wait"). Without Debloat you'd watch a 10-second
ad; with it you watch a 10-second spinner, minus the toast. Later videos in the same tab start instantly.

**Will YouTube break this?**
Probably — sooner or later. YouTube changes its markup and ad delivery constantly, and Google has been
testing *server-side ad insertion* (ads stitched straight into the video stream). If that ever ships
for everyone, no client-side blocker — this one, uBlock, AdGuard, anything — can surgically remove them.
Until then: when something leaks, open an issue or send a PR with a fixed selector. Most fixes are one line.

**Why not just use uBlock Origin Lite / AdGuard / Wipr?**
If they work for you — great, use them. Debloat is for people who want **one job done well**:
no filter-list subscriptions, no dashboard, no background process phoning anywhere, and the whole thing
small enough to audit yourself. And killing Shorts usually means digging for extra filter lists — here it's the default.

**Can I keep Shorts and only block ads (or vice versa)?**
Yes. Click the Debloat button in Safari's toolbar on youtube.com — three switches: *Block ads*,
*Hide Shorts*, *Open Shorts as videos*. Changes apply immediately, no reload.

**Does it collect anything?**
No. There's no network code, no analytics. The only thing stored is the state of those three switches,
locally in Safari. Read `extension/` — it's a handful of files.

**Is this legal?**
Blocking content in your own browser is your business. It does break YouTube's Terms of Service,
which may be a hint about how much YouTube likes the idea. Use at your own risk.

**Does it work on iPhone / iPad?**
Not yet. The extension code is portable — an iOS target is a solid first PR.

---

## Project layout

```
extension/         ← the actual extension (edit these)
  manifest.json
  inject.js        ← response surgery, runs in the page
  content.js       ← settings, auto-skip, Shorts redirect, nag killer
  hide.css         ← everything that gets display:none
  popup/           ← the toolbar menu (three switches)
  icons/
assets/            ← icon sources (SVG)
xcode/             ← Safari app wrapper (references ../extension, no copies)
scripts/
  build.sh         ← one-command build
  make-icon-svg.py ← regenerates assets/*.svg
  make-icons.swift ← rasterises them into every PNG size
```

## Contributing

YouTube ships redesigns faster than anyone can keep up with — that's where you come in.

- **Something leaks?** Right-click it → *Inspect Element*, find the element's tag name, add a selector to
  `hide.css`, rebuild, PR.
- **Video ad got through?** Open an issue with the video URL and the console output.
- Keep it small. Every line here should earn its place.

## License

[MIT](LICENSE). Not affiliated with, endorsed by, or remotely liked by YouTube or Google.
