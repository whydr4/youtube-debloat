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
- 🔄 **Updates itself.** New release out? It's on your Mac by tomorrow. You don't lift a finger.

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

## Install

Debloat isn't in the App Store — Apple wants $99/year and a review queue for the privilege of blocking
YouTube ads, and we'd rather not. So you build it yourself. Sounds scary, takes one command.

**You need:** a Mac on macOS 12+, Safari, and **Xcode** (free). No Apple Developer account, no sign-ups.

### 1. Get Xcode

Install **Xcode** from the [App Store](https://apps.apple.com/app/xcode/id497799835). It's huge — go make tea.
**Open it once** and let it finish installing its components, then point the command-line tools at it:

```bash
sudo xcode-select -s /Applications/Xcode.app
```

### 2. Run the installer

```bash
curl -fsSL https://raw.githubusercontent.com/whydr4/youtube-debloat/main/scripts/install.sh | bash
```

Piping the internet into `bash` makes you twitchy? Good instinct.
[Read the script first](scripts/install.sh) — it's 90 lines — or do it the long way:

```bash
git clone https://github.com/whydr4/youtube-debloat.git && ./youtube-debloat/scripts/install.sh
```

Either way it grabs the **latest release**, builds it, drops `YouTube Debloat.app` into `~/Applications`,
opens it, and switches on auto-update. First build takes a minute or two.

### 3. Let Safari run it

1. **Safari → Settings → Advanced** → tick **"Show features for web developers"**.
2. **Safari → Settings → Developer** → tick **"Allow unsigned extensions"**.
3. **Safari → Settings → Extensions** → enable **Debloat for YouTube** → allow it on `youtube.com`.
4. Reload YouTube. Enjoy the silence.

> **The one annoying part:** a self-built extension is "unsigned" in Safari's eyes, and Safari
> **turns "Allow unsigned extensions" off every time it quits.** After restarting Safari, re-tick step 2.
> Annoying? Yes. Apple's rule, not ours. Got an Apple Developer account? Open
> `xcode/YouTube Debloat.xcodeproj`, pick your Team under *Signing & Capabilities*, build from Xcode, and
> the problem goes away.

### 4. Check that it's alive

Open YouTube, then **Develop → Show JavaScript Console** and look for:

```
[Debloat] hooks: main
```

- `main` / `fallback` — ads are being cut out of player responses. 👌
- `FAILED` / `blocked` — Safari wouldn't let the hooks into the page. Feed ads and Shorts are still gone,
  video ads get auto-skipped instead of never existing. Please [open an issue](https://github.com/whydr4/youtube-debloat/issues)
  with your macOS and Safari versions.

---

## Updates

You don't do anything. The installer sets up a tiny launchd job that wakes up **at every login and once a day**,
asks GitHub "is there a new release?", and if there is — rebuilds and reinstalls the app quietly in the background.
No resident process, no menu-bar icon, nothing running between checks.

- Only **releases** ship (`vX.Y.Z` tags). Random commits on `main` and pre-releases like `v2.0.0-beta` never reach you.
- Safari picks up the new build **on its next launch**. The toolbar popup then tells you once:
  *"Updated to v1.2.0 — what's new →"*.
- Log of every check: `~/Library/Logs/YouTube Debloat.log`.

Can't wait for tomorrow?

```bash
bash ~/Library/Application\ Support/YouTube\ Debloat/src/scripts/update.sh
```

Don't want auto-update at all? Reinstall without it:

```bash
curl -fsSL https://raw.githubusercontent.com/whydr4/youtube-debloat/main/scripts/install.sh | bash -s -- --no-auto-update
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/whydr4/youtube-debloat/main/scripts/install.sh | bash -s -- --uninstall
```

Removes the app, the updater and its build cache. No leftovers, no "are you sure you want to leave?" survey.

---

## FAQ

**Didn't the first video use to sit on a black screen for ~10 seconds?**
It did, and since 1.2.0 it doesn't. YouTube's streaming server holds the video back for most of the length of
the ad it planned for you — cut the ad out of the response and you still sit through the wait, just without the
ad. Turns out the server won't plan an ad for a viewer it thinks walked away an hour ago. So every player request
now tells it exactly that, there's no ad and no wait. The "Video paused. Continue watching?" prompt that comes
with being "idle" gets stripped too.
The very first video of a fresh page load is the stubborn one: it arrives baked into the HTML with the ad already
planned, so Debloat quietly reloads it once, the right way, and it starts clean. Live streams and playlists
skip that reload (it would lose your place in the playlist), so those can still make you wait the old way.

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
No. The extension has zero network code, zero analytics. The only thing it stores is the state of those three
switches, locally in Safari. The only thing that ever talks to the internet is the updater, and all it does is
`git ls-remote` against this repo once a day to see if there's a new tag. Read `extension/` and `scripts/` —
it's a handful of files.

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
  install.sh       ← installer: latest release + auto-update (also --uninstall)
  update.sh        ← what the daily launchd job runs
  build.sh         ← build your working copy (for hacking)
  make-icon-svg.py ← regenerates assets/*.svg
  make-icons.swift ← rasterises them into every PNG size
```

## Hacking on it

```bash
git clone https://github.com/whydr4/youtube-debloat.git
cd youtube-debloat
./scripts/build.sh --install
```

That builds **your working copy** straight into `~/Applications` — edit, rebuild, reload YouTube.
The updater leaves it alone until the next release comes out, then replaces it with that.
Hacking for a while? Turn auto-update off (see above).

### Cutting a release

1. Bump `version` in `extension/manifest.json` (that's what the "Updated to …" note shows).
2. Commit, tag, push: `git tag v1.2.0 && git push origin main v1.2.0`.
3. Write the notes on GitHub → *Releases* — that's where "what's new" links to.

The tag is what ships: within a day, every install with auto-update builds it.

## Contributing

YouTube ships redesigns faster than anyone can keep up with — that's where you come in.

- **Something leaks?** Right-click it → *Inspect Element*, find the element's tag name, add a selector to
  `hide.css`, rebuild, PR.
- **Video ad got through?** Open an issue with the video URL and the console output.
- Keep it small. Every line here should earn its place.

## License

[MIT](LICENSE). Not affiliated with, endorsed by, or remotely liked by YouTube or Google.
