# Playback recovery verification — 2026-11-02

The alternate-params experiment was removed at the user's request. Current
code preserves `lactMilliseconds="3600000"`, does not set `params`, and does
not change the client identity. On enforcement it reuses a matching loaded
preview or makes one ordinary attested player request. It does not retry
indefinitely or use loadVideoById for playlists/known live streams.

Run regression checks with `node --test tests/enforcement.test.cjs`.

13 checks pass. They cover modal closure, the ads toggle, normal promises,
matching preview responses, bounded retries, actual decoded video frames,
navigation cleanup, stale video IDs/timestamps, wrapped get_watch requests,
and avoiding a playlist/live restart through loadVideoById.

## Safari observations

- Without alternate params, a normal manual retry of `n_phSNwrGfs` returned
  OK and decoded 1280×720 frames while retaining the original idle setting.
- Final automatic normal-request recovery, fresh reload of `n_phSNwrGfs`:
  OK, readyState 4, visible 1280×720; 1087 ms from recovery start to decoded
  frames. This is not total page navigation latency.
- Final automatic normal-request recovery, SPA navigation to `vDmjw-c_R2k`:
  OK, readyState 4, visible 1280×720; 1300 ms over the same interval.
- Reloading the original `vDmjw-c_R2k` tab at its saved position also recovered
  with the normal request: 2068 ms, OK, visible 1280×720; the user's pause was
  restored. SponsorBlock advanced past the sponsored segment.
- A control test with AdBlock Pro Video temporarily disabled still produced
  enforcement. Its checkbox was restored to its original enabled state.
- The bootstrap script text contained status OK while the global initial
  response later contained ERROR. Its first media URL was unchanged. This
  demonstrates a client-side replacement in that test; the precise callback
  responsible has not yet been isolated.

The active Safari copy is a temporary extension loaded from `extension/`.
The application bundle was also rebuilt and installed in ~/Applications.
AdBlock Pro and SponsorBlock were enabled during these observations.

## Limits

These are session observations, not a long-duration or cross-account test.
Live streams, playlist playback, embeds and Safari restart persistence were
not exercised in the browser. Playlist/live restart avoidance is unit-tested;
it is not evidence that blocked playlists or live streams recover.

The player methods are private YouTube behavior. A site change can invalidate
them. Failed recovery remains visible. Zero startup latency and prevention
of the detector itself are not established by these two timing samples.
