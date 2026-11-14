import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseSlides, cutsFromLog, keepRanges, shiftTime, chapters, mergeRanges, obsCollection, obsAuth, parseDshow, pickCamera, dshowId, chooseDevice, allowedPost, LAYOUTS, PIP } from './studio.mjs';

const MD = `# Hook
layout: talk
Note: Open on face.
Keep it short.
---
# Three steps
[ ] One
[ ] Two
B-roll: close-up of the keyboard
---
# The line
layout: slide
> Ceremony should match the stakes.
---
# Bullets
- a
- b
- c
`;

test('parseSlides reads layouts, builds, multi-line notes and B-roll', () => {
  const s = parseSlides(MD);
  assert.equal(s.length, 4);
  assert.equal(s[0].layout, 'talk');
  assert.equal(s[0].notes, 'Open on face.\nKeep it short.');
  assert.equal(s[1].layout, 'slide+cam', 'default layout');
  assert.deepEqual(s[1].checks, ['One', 'Two']);
  assert.equal(s[1].builds, 2);
  assert.deepEqual(s[1].broll, ['close-up of the keyboard']);
  assert.equal(s[2].quote, 'Ceremony should match the stakes.');
  assert.equal(s[3].builds, 3);
});

test('parseSlides rejects an unknown layout with the slide named', () => {
  assert.throws(() => parseSlides('# X\nlayout: pip'), /slide 1 \("X"\): unknown layout "pip"/);
});

test('parseSlides tolerates CRLF line endings', () => {
  assert.equal(parseSlides(MD.replace(/\n/g, '\r\n')).length, 4);
});

test('a mark cuts back to the latest checkpoint', () => {
  const log = [
    { t: 0, type: 'record', state: 'started' }, { t: 0, type: 'slide', i: 0, build: 0 },
    { t: 9000, type: 'slide', i: 1, build: 0 }, { t: 15000, type: 'mark' }, // fluffed 9-15 s
    { t: 22000, type: 'slide', i: 1, build: 1 }, { t: 30000, type: 'slide', i: 2, build: 0 },
    { t: 34000, type: 'mark' }, { t: 36000, type: 'mark' }, // two fluffs in a row: 30-34, 34-36
  ];
  assert.deepEqual(cutsFromLog(log), [[9000, 15000], [30000, 36000]], 'a build step is a checkpoint too; back-to-back marks merge');
});

test('mergeRanges joins overlapping and touching ranges', () => {
  assert.deepEqual(mergeRanges([[5, 8], [0, 2], [2, 3], [7, 10]]), [[0, 3], [5, 10]]);
});

test('keepRanges is the complement of cuts and drops slivers', () => {
  assert.deepEqual(keepRanges([[9000, 15000], [30000, 36000]], 40000), [[0, 9000], [15000, 30000], [36000, 40000]]);
  assert.deepEqual(keepRanges([[0, 5000]], 5020), [], 'a 20 ms tail is a sliver');
});

test('shiftTime maps raw times onto the cut timeline', () => {
  const cuts = [[9000, 15000], [30000, 36000]];
  assert.equal(shiftTime(5000, cuts), 5000);
  assert.equal(shiftTime(12000, cuts), 9000, 'inside a cut lands on the cut point');
  assert.equal(shiftTime(20000, cuts), 14000);
  assert.equal(shiftTime(38000, cuts), 26000);
});

test('chapters start at 0:00, follow slide titles, skip builds and short parts', () => {
  const slides = parseSlides(MD);
  const log = [
    { t: 0, type: 'record', state: 'started' }, { t: 1500, type: 'slide', i: 0, build: 0 },
    { t: 20000, type: 'slide', i: 1, build: 0 }, { t: 25000, type: 'slide', i: 1, build: 1 },
    { t: 70000, type: 'slide', i: 2, build: 0 }, { t: 75000, type: 'slide', i: 3, build: 0 },
    { t: 140000, type: 'slide', i: 3, build: 1 },
  ];
  const ch = chapters(log, slides, []);
  assert.deepEqual(ch.lines, ['0:00 Hook', '0:20 Three steps', '1:15 Bullets'], '"The line" lasted 5 s, so it folds away');
  assert.equal(ch.valid, true);
});

test('chapters keep 0:00 when the opening parts are short', () => {
  const slides = parseSlides(MD);
  const log = [
    { t: 0, type: 'slide', i: 0, build: 0 }, { t: 2800, type: 'slide', i: 1, build: 0 },
    { t: 7300, type: 'slide', i: 2, build: 0 }, { t: 13400, type: 'slide', i: 3, build: 0 },
  ];
  assert.deepEqual(chapters(log, slides, []).lines, ['0:00 Hook', '0:13 Bullets']);
});

test('chapters shift with cuts and report when YouTube would reject them', () => {
  const slides = parseSlides(MD);
  const log = [{ t: 0, type: 'slide', i: 0, build: 0 }, { t: 60000, type: 'slide', i: 1, build: 0 }];
  const ch = chapters(log, slides, [[10000, 30000]]);
  assert.deepEqual(ch.lines, ['0:00 Hook', '0:40 Three steps']);
  assert.equal(ch.valid, false);
});

test('obsCollection builds four scenes with the camera boxed clear of the deck', () => {
  const cam = { name: 'Logitech BRIO', path: '\\\\?\\usb#vid_046d&pid_085e#{65e8773d}\\global' };
  const c = obsCollection({ name: 'Studio', camera: cam, port: 4466 });
  const scenes = c.sources.filter(s => s.id === 'scene');
  assert.deepEqual(scenes.map(s => s.name), Object.values(LAYOUTS));
  assert.deepEqual(c.scene_order.map(s => s.name), Object.values(LAYOUTS));
  const byName = Object.fromEntries(c.sources.map(s => [s.name, s]));
  assert.equal(byName.Camera.settings.video_device_id, 'Logitech BRIO:\\\\?\\usb#22vid_046d&pid_085e#22{65e8773d}\\global');
  assert.equal(byName.Deck.settings.url, 'http://127.0.0.1:4466/program');
  const pip = byName['Slide + cam'].settings.items.find(i => i.name === 'Camera');
  assert.deepEqual(pip.bounds, { x: PIP.w, y: PIP.h });
  assert.equal(pip.pos.x + PIP.w + PIP.margin, 1920);
  for (const s of scenes) for (const it of s.settings.items) assert.ok(c.sources.some(src => src.uuid === it.source_uuid), `${s.name}/${it.name} points at a real source`);
  assert.ok(!c.sources.some(s => s.id === 'wasapi_input_capture'), 'an unplaced mic source would be dropped by OBS');
  assert.equal(c.AuxAudioDevice1.id, 'wasapi_input_capture', 'the mic is the global Mic/Aux device');
  assert.deepEqual(c.AuxAudioDevice1.filters.map(f => f.id), ['noise_suppress_filter_v2', 'compressor_filter', 'limiter_filter']);
});

test('dshowId matches what OBS itself lists for a USB webcam', () => {
  const ffmpegPath = '\\\\?\\usb#vid_046d&pid_085e&mi_00#9&9890aed&0&0000#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\\global';
  const obsListed = 'Logitech BRIO:\\\\?\\usb#22vid_046d&pid_085e&mi_00#229&9890aed&0&0000#22{65e8773d-8f56-11d0-a3b9-00a0c9223196}\\global';
  assert.equal(dshowId({ name: 'Logitech BRIO', path: ffmpegPath }), obsListed);
});

test('chooseDevice skips the software twin and picks the primary display', () => {
  const cams = [
    { itemName: 'Integrated Camera', itemValue: 'Integrated Camera:\\\\?\\usb#22a' },
    { itemName: 'Logitech BRIO', itemValue: 'Logitech BRIO:\\\\?\\usb#22b' },
    { itemName: 'Logitech BRIO', itemValue: 'Logitech BRIO:@device_sw_{860BB310}\\{A3FC}' },
  ];
  assert.equal(chooseDevice(cams, 'camera').itemValue, 'Logitech BRIO:\\\\?\\usb#22b');
  assert.equal(chooseDevice(cams, 'camera', 'Integrated Camera').itemName, 'Integrated Camera');
  const screens = [
    { itemName: '[Select a display to capture]', itemValue: 'DUMMY' },
    { itemName: ': 2880x1800 @ 1920,0', itemValue: 'A' },
    { itemName: '32G3WG3-: 1920x1080 @ 0,0 (Primary Monitor)', itemValue: 'B' },
  ];
  assert.equal(chooseDevice(screens, 'screen').itemValue, 'B');
  assert.equal(chooseDevice([{ itemName: 'x', itemValue: 'DUMMY' }], 'screen'), null);
});

test('allowedPost lets only the presenter page drive recording', () => {
  const ok = { host: '127.0.0.1:4466', origin: 'http://127.0.0.1:4466', 'content-type': 'application/json' };
  assert.equal(allowedPost(ok, 4466), true);
  assert.equal(allowedPost({ ...ok, origin: undefined }, 4466), true, 'same-origin fetches may omit Origin');
  assert.equal(allowedPost({ ...ok, origin: 'https://evil.example' }, 4466), false, 'cross-site page');
  assert.equal(allowedPost({ ...ok, host: 'evil.example:4466' }, 4466), false, 'DNS rebinding');
  assert.equal(allowedPost({ ...ok, 'content-type': 'text/plain' }, 4466), false, 'simple cross-site form post');
});

test('obsAuth follows the obs-websocket v5 recipe', () => {
  const b64 = s => crypto.createHash('sha256').update(s).digest('base64');
  assert.equal(obsAuth('pw', 'salt', 'chal'), b64(b64('pwsalt') + 'chal'));
});

test('parseDshow and pickCamera prefer an external webcam', () => {
  const err = `[in#0 @ 0] "Integrated Camera" (video)
[in#0 @ 0]   Alternative name "@device_pnp_a"
[in#0 @ 0] "Logitech BRIO" (video)
[in#0 @ 0]   Alternative name "@device_pnp_\\\\?\\usb#vid_046d&pid_085e#{65e8773d}\\global"
[in#0 @ 0] "Microphone (Logitech BRIO)" (audio)
[in#0 @ 0]   Alternative name "@device_cm_c"`;
  const list = parseDshow(err);
  assert.equal(list.length, 3);
  assert.equal(pickCamera(list).name, 'Logitech BRIO');
  assert.equal(pickCamera(list, 'integrated').path, 'a', 'the @device_pnp_ prefix is stripped');
  assert.equal(pickCamera(list).path, '\\\\?\\usb#vid_046d&pid_085e#{65e8773d}\\global', 'OBS needs the bare device path');
  assert.equal(list[2].path, '@device_cm_c', 'audio ids are left alone');
  assert.equal(pickCamera([{ name: 'Integrated Camera', kind: 'video' }]).name, 'Integrated Camera', 'falls back to whatever exists');
  const busy = [
    { name: 'Smart Connect Camera', kind: 'video', path: '\\\\?\\root#camera' },
    { name: 'Logitech BRIO', kind: 'video', path: '@device_sw_{860B}\\{A3FC}' },
  ];
  assert.equal(pickCamera(busy).name, 'Logitech BRIO', 'a camera held by OBS lists only its software twin; still pick it by name');
  const both = [{ name: 'Logitech BRIO', kind: 'video', path: '@device_sw_x' }, { name: 'Logitech BRIO', kind: 'video', path: '\\\\?\\usb#b' }];
  assert.equal(pickCamera(both).path, '\\\\?\\usb#b', 'hardware path wins when both exist');
});
