const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function page() {
  const listeners = new Map();
  const root = { dataset: { ytdAds: 'on' } };
  let plays = 0;
  const video = { paused: true, play() { plays++; return Promise.resolve(); } };
  const dialog = { opened: true, closes: 0, close() { this.opened = false; this.closes++; } };
  const popup = { closest: () => dialog };
  const elements = new Map();
  const watch = { dataset: {}, removeAttribute() {} };
  const context = {
    document: {
      documentElement: root,
      currentScript: null,
      addEventListener: (name, fn) => listeners.set(name, fn),
      querySelectorAll: () => [popup],
      querySelector: (selector) => selector === 'ytd-watch-flexy' ? watch : video,
      getElementById: (id) => elements.get(id),
    },
    location: { pathname: '/watch', search: '?v=matching-video&t=1m2s' },
    URLSearchParams,
    JSON: { parse: JSON.parse, stringify: JSON.stringify },
    XMLHttpRequest: class {}, Node: class {}, Element: class {},
    fetch: async (input, init) => {
      context.lastRequest = { input, init };
      return { body: null };
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(path.join(__dirname, '../extension/inject.js'), 'utf8'), context);
  return { context, root, dialog, video, watch, elements, navigate: listeners.get('yt-navigate-start'), recover: listeners.get('yt-debloat-recover-player'), dismiss: listeners.get('yt-debloat-dismiss-enforcement'), plays: () => plays };
}

test('closes the modal through its page API and resumes paused playback', () => {
  const p = page();
  p.dismiss();
  assert.equal(p.dialog.opened, false);
  assert.equal(p.dialog.closes, 1);
  assert.equal(p.plays(), 1);
  // Subsequent DOM changes must not undo a manual pause.
  p.dismiss();
  assert.equal(p.plays(), 1);
  // YouTube can reuse the same dialog for a later warning.
  p.dialog.opened = true;
  p.dismiss();
  assert.equal(p.dialog.closes, 2);
});

test('leaves dialogs alone with ad blocking off', () => {
  const p = page();
  p.root.dataset.ytdAds = 'off';
  p.dismiss();
  assert.equal(p.dialog.opened, true);
  assert.equal(p.plays(), 0);
});

test('closing a warning does not start already playing media again', () => {
  const p = page();
  p.video.paused = false;
  p.dismiss();
  assert.equal(p.dialog.opened, false);
  assert.equal(p.plays(), 0);
});

test('ad-block probe callback is suppressed while ordinary promises still work', async () => {
  const p = page();
  assert.equal(await vm.runInContext('Promise.resolve(7).then(v => v + 1)', p.context), 8);
  assert.equal(await vm.runInContext('Promise.reject(7).then(undefined, v => v + 1)', p.context), 8);
  assert.equal(await vm.runInContext('Promise.resolve().then(function onAbnormalityDetected() { throw new Error("probe ran"); })', p.context), undefined);
  p.root.dataset.ytdAds = 'off';
  assert.equal(await vm.runInContext('Promise.resolve().then(function onAbnormalityDetected() { return 9; })', p.context), 9);
});

function recoveryPage() {
  const p = page();
  const loads = [];
  const status = { status: 'ERROR', errorScreen: { enforcementMessageViewModel: {} } };
  const response = {
    playabilityStatus: { status: 'OK' },
    videoDetails: { videoId: 'matching-video' },
    streamingData: { formats: [] },
  };
  p.elements.set('movie_player', {
    querySelector: () => null,
    getPlayerResponse: () => ({ playabilityStatus: status, videoDetails: response.videoDetails }),
    getCurrentTime: () => 0,
    loadVideoByPlayerVars: (vars) => loads.push(vars),
  });
  p.elements.set('inline-preview-player', { getPlayerResponse: () => response });
  return { ...p, loads, status, response };
}

test('recovers enforcement from the matching preview once and preserves the timestamp', () => {
  const p = recoveryPage();
  p.recover();
  p.recover();
  assert.equal(p.loads.length, 1);
  assert.equal(p.loads[0].video_id, 'matching-video');
  assert.equal(p.loads[0].start, 62);
  assert.deepEqual(JSON.parse(p.loads[0].player_response), p.response);
});

test('does not use another video, a failed preview, or recover ordinary errors', () => {
  const p = recoveryPage();
  p.response.videoDetails.videoId = 'recommendation';
  p.recover();
  p.response.videoDetails.videoId = 'matching-video';
  p.response.playabilityStatus.status = 'ERROR';
  p.recover();
  p.response.playabilityStatus.status = 'OK';
  p.status.errorScreen = { playerErrorMessageRenderer: {} };
  p.recover();
  assert.equal(p.loads.length, 0);
});

test('does not recover with ad blocking off and retains playlist context when enabled', () => {
  const p = recoveryPage();
  p.root.dataset.ytdAds = 'off';
  p.recover();
  assert.equal(p.loads.length, 0);
  p.root.dataset.ytdAds = 'on';
  p.context.location.search += '&list=playlist-id&index=3';
  p.recover();
  assert.equal(p.loads[0].list, 'playlist-id');
  assert.equal(p.loads[0].index, '3');
});

test('without a preview, one normal retry keeps request params and the original idle setting', async () => {
  const p = recoveryPage();
  p.elements.delete('inline-preview-player');
  const retries = [];
  const player = p.elements.get('movie_player');
  player.loadVideoById = (...args) => retries.push(args);
  p.recover();
  p.recover();
  assert.deepEqual(retries, [['matching-video', 62]]);
  assert.equal(p.root.dataset.ytDebloatRecoveryMode, 'normal-request');
  const request = { videoId: 'matching-video', context: { client: { clientName: 'WEB' } },
    playbackContext: { contentPlaybackContext: {} }, attestationRequest: { unchanged: true } };
  await p.context.fetch('/youtubei/v1/player', { body: JSON.stringify(request) });
  const sent = JSON.parse(p.context.lastRequest.init.body);
  assert.equal(sent.params, undefined);
  assert.equal(sent.playbackContext.contentPlaybackContext.lactMilliseconds, '3600000');
  assert.deepEqual(sent.context, request.context);
  assert.deepEqual(sent.attestationRequest, request.attestationRequest);
  request.videoId = 'other-video';
  await p.context.fetch('/youtubei/v1/player', { body: JSON.stringify(request) });
  assert.equal(JSON.parse(p.context.lastRequest.init.body).params, undefined);
});

test('reveals recovered video only after decoded frames and clears the marker on a new error', () => {
  const p = recoveryPage();
  const player = p.elements.get('movie_player');
  const media = { readyState: 0, videoWidth: 0 };
  player.querySelector = () => media;
  p.recover();
  p.status.status = 'OK';
  p.recover();
  assert.equal(p.watch.dataset.ytDebloatRecovered, undefined);
  media.readyState = 4;
  media.videoWidth = 1280;
  p.recover();
  assert.equal(p.watch.dataset.ytDebloatRecovered, 'matching-video');
  p.status.status = 'ERROR';
  p.recover();
  assert.equal(p.watch.dataset.ytDebloatRecovered, undefined);
});

test('old decoded frames and OK response cannot reveal a different video', () => {
  const p = recoveryPage();
  const player = p.elements.get('movie_player');
  player.querySelector = () => ({ readyState: 4, videoWidth: 1280 });
  p.recover();
  p.status.status = 'OK';
  p.response.videoDetails.videoId = 'previous-video';
  p.recover();
  assert.equal(p.watch.dataset.ytDebloatRecovered, undefined);
});

test('navigation clears recovery UI and permits preview recovery on the next visit', async () => {
  const p = recoveryPage();
  p.recover();
  p.watch.dataset.ytDebloatRecovered = 'matching-video';
  p.navigate();
  assert.equal(p.watch.dataset.ytDebloatRecovered, undefined);
  const body = JSON.stringify({ videoId: 'matching-video', playbackContext: { contentPlaybackContext: {} } });
  await p.context.fetch('/youtubei/v1/player', { body });
  assert.equal(JSON.parse(p.context.lastRequest.init.body).params, undefined);
  p.recover();
  assert.equal(p.loads.length, 2);
});

test('fallback does not discard playlists or restart live streams', () => {
  const p = recoveryPage();
  p.elements.delete('inline-preview-player');
  let retries = 0;
  p.elements.get('movie_player').loadVideoById = () => retries++;
  p.context.location.search += '&list=playlist-id';
  p.recover();
  p.context.location.search = '?v=matching-video';
  p.response.videoDetails.isLive = true;
  p.recover();
  assert.equal(retries, 0);
});

test('wrapped get_watch keeps its params and the original idle setting', async () => {
  const p = recoveryPage();
  p.elements.delete('inline-preview-player');
  const player = p.elements.get('movie_player');
  player.getVideoData = () => ({ video_id: 'previous-video' });
  player.getCurrentTime = () => 900;
  let start;
  player.loadVideoById = (_, seconds) => { start = seconds; };
  p.recover();
  assert.equal(start, 62);
  const request = { playerRequest: { videoId: 'matching-video', params: 'original-params', playbackContext: { contentPlaybackContext: {} } } };
  await p.context.fetch('/youtubei/v1/get_watch', { body: JSON.stringify(request) });
  const sent = JSON.parse(p.context.lastRequest.init.body).playerRequest;
  assert.equal(sent.params, 'original-params');
  assert.equal(sent.playbackContext.contentPlaybackContext.lactMilliseconds, '3600000');
  p.root.dataset.ytdAds = 'off';
  const body = JSON.stringify(request);
  await p.context.fetch('/youtubei/v1/get_watch', { body });
  assert.equal(p.context.lastRequest.init.body, body);
});
