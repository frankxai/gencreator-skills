#!/usr/bin/env node
// studio.mjs: the pre-production and recording half of video-social-studio.
// new -> slides.md -> obs (scene collection) -> present (deck + presenter + OBS control + session log)
// -> rough (cut retakes, write chapters) -> hand the rough cut to vid.mjs for pauses, captions, exports.
// Needs node 22+ (global WebSocket) and ffmpeg on PATH. No npm dependencies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CANVAS = { w: 1920, h: 1080 };
// The camera picture-in-picture box. deck.html keeps slide content clear of it (see .layout-slidecam).
export const PIP = { w: 480, h: 270, margin: 40 };
export const LAYOUTS = { talk: 'Talk', 'slide+cam': 'Slide + cam', slide: 'Slide', 'screen+cam': 'Screen + cam' };

const die = (msg, code = 1) => { console.error(`studio: ${msg}`); process.exit(code); };

// ---------- slides.md ----------
// Slides are separated by a line holding only ---. Inside a slide:
//   # Title          layout: talk|slide+cam|slide|screen+cam
//   - bullet         (each bullet is one build step, revealed on the next key press)
//   [ ] item         (checklist; each tick is one build step)
//   > quote          (typed out on screen)
//   B-roll: ...      (goes to the B-roll list, never on screen)
//   Note: ...        (speaker notes; following lines continue the note)
export function parseSlides(md) {
  const blocks = md.replace(/\r\n/g, '\n').split(/^---\s*$/m).map(b => b.trim()).filter(Boolean);
  return blocks.map((block, i) => {
    const s = { i, title: '', layout: 'slide+cam', bullets: [], checks: [], quote: '', broll: [], notes: '' };
    let inNote = false;
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      let m;
      if (inNote && line && !/^(#|layout:|- |\[ \]|> |B-roll:)/i.test(line)) { s.notes += `\n${line}`; continue; }
      inNote = false;
      if ((m = line.match(/^#\s+(.+)/))) s.title = m[1];
      else if ((m = line.match(/^layout:\s*(\S+)/i))) s.layout = m[1].toLowerCase();
      else if ((m = line.match(/^-\s+(.+)/))) s.bullets.push(m[1]);
      else if ((m = line.match(/^\[ ?\]\s+(.+)/))) s.checks.push(m[1]);
      else if ((m = line.match(/^>\s?(.*)/))) s.quote = s.quote ? `${s.quote}\n${m[1]}` : m[1];
      else if ((m = line.match(/^B-roll:\s*(.+)/i))) s.broll.push(m[1]);
      else if ((m = line.match(/^Note:\s*(.*)/i))) { s.notes = m[1]; inNote = true; }
    }
    if (!LAYOUTS[s.layout]) throw new Error(`slide ${i + 1} ("${s.title}"): unknown layout "${s.layout}". Use one of: ${Object.keys(LAYOUTS).join(', ')}`);
    s.builds = s.bullets.length + s.checks.length;
    return s;
  });
}

// ---------- session log -> cuts and chapters ----------
// The log is JSON lines: {t: ms since recording started, type: 'slide'|'mark'|'record', ...}.
// A mark means "that last bit was a fluff, I am redoing it": the cut runs from the latest
// checkpoint (slide change, earlier mark, or recording start) up to the mark.
export function cutsFromLog(events) {
  const cuts = [];
  let checkpoint = 0;
  for (const e of events) {
    if (e.type === 'record' && e.state === 'started') checkpoint = e.t;
    else if (e.type === 'slide') checkpoint = e.t;
    else if (e.type === 'mark') { if (e.t > checkpoint) cuts.push([checkpoint, e.t]); checkpoint = e.t; }
  }
  return mergeRanges(cuts);
}

export function mergeRanges(ranges) {
  const out = [];
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function keepRanges(cuts, durationMs) {
  const keep = [];
  let at = 0;
  for (const [a, b] of cuts) { if (a > at) keep.push([at, Math.min(a, durationMs)]); at = Math.max(at, b); }
  if (at < durationMs) keep.push([at, durationMs]);
  return keep.filter(([a, b]) => b - a > 50);
}

// Map a time in the raw recording to the cut timeline.
export function shiftTime(t, cuts) {
  let removed = 0;
  for (const [a, b] of cuts) { if (t >= b) removed += b - a; else if (t > a) return a - removed; }
  return t - removed;
}

const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600); const mm = String(Math.floor(s / 60) % 60).padStart(h ? 2 : 1, '0'); const ss = String(s % 60).padStart(2, '0'); return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`; };

// YouTube chapter rules: the first starts at 0:00, at least three, each at least 10 seconds.
export function chapters(events, slides, cuts) {
  const raw = [];
  for (const e of events) if (e.type === 'slide' && e.build === 0) raw.push({ t: shiftTime(e.t, cuts), title: slides[e.i]?.title || `Part ${e.i + 1}` });
  const seen = []; for (const c of raw) if (!seen.length || seen[seen.length - 1].title !== c.title) seen.push(c);
  if (seen.length) seen[0].t = 0;
  // A part shorter than 10 s folds into its neighbour: the opening chapter always stays at 0:00,
  // and when a middle part is too short the later title takes its place.
  const kept = [];
  for (const c of seen) {
    const last = kept[kept.length - 1];
    if (!last || c.t - last.t >= 10000) kept.push({ ...c });
    else if (kept.length > 1) kept[kept.length - 1] = { ...c };
  }
  return { lines: kept.map(c => `${fmt(c.t)} ${c.title}`), valid: kept.length >= 3 };
}

export const readLog = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

// ---------- devices ----------
export function parseDshow(stderr) {
  const devices = []; let cur = null;
  for (const line of stderr.split('\n')) {
    let m;
    if ((m = line.match(/"([^"]+)" \((video|audio)\)/))) { cur = { name: m[1], kind: m[2] }; devices.push(cur); }
    // ffmpeg prefixes the device path with @device_pnp_; OBS wants the bare \\?\usb#... path.
    else if (cur && (m = line.match(/Alternative name "([^"]+)"/))) cur.path = m[1].replace(/^@device_pnp_/, '');
  }
  return devices;
}

function devices() {
  if (process.platform !== 'win32') return [];
  const r = spawnSync('ffmpeg', ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { encoding: 'utf8' });
  return parseDshow(r.stderr || '');
}

// Prefer an external webcam over a laptop's built-in one. A camera can also show up as a software
// twin (@device_sw_ path), and while another app holds it that twin may be the only entry, so keep
// every name and take the hardware path when both exist. present() corrects it against OBS's list.
export const pickCamera = (list, want) => {
  const byName = new Map();
  for (const d of list.filter(x => x.kind === 'video')) {
    const prev = byName.get(d.name);
    if (!prev || (/^@device_sw_/.test(prev.path || '') && !/^@device_sw_/.test(d.path || ''))) byName.set(d.name, d);
  }
  const v = [...byName.values()];
  if (want) return v.find(d => d.name.toLowerCase().includes(want.toLowerCase()));
  return v.find(d => /brio|c9\d\d|logitech|elgato|facecam|camo|cam link|obsbot|insta360/i.test(d.name)) || v.find(d => !/integrated|smart connect|virtual/i.test(d.name)) || v[0];
};

// ---------- OBS scene collection ----------
const uuid = () => crypto.randomUUID();
const item = (src, id, pos, size) => ({
  name: src.name, source_uuid: src.uuid, visible: true, locked: false, rot: 0, id,
  pos: { x: pos.x, y: pos.y }, scale: { x: 1, y: 1 }, align: 5,
  bounds_type: 2, bounds_align: 0, bounds: { x: size.w, y: size.h }, crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0,
  scale_filter: 'disable', blend_method: 'default', blend_type: 'normal', group_item_backup: false, private_settings: {},
});
const source = (id, name, settings, extra = {}) => ({ id, versioned_id: id, name, uuid: uuid(), settings, enabled: true, flags: 0, volume: 1, muted: false, mixers: 255, sync: 0, monitoring_type: 0, private_settings: {}, ...extra });

// win-dshow stores device ids as "<name>:<path>" with '#' and ':' inside the path escaped.
export const dshowId = cam => `${cam.name}:${cam.path.replace(/#/g, '#22').replace(/:/g, '#3A')}`;

export function obsCollection({ name, camera, port }) {
  const full = { x: 0, y: 0 }, fullSize = { w: CANVAS.w, h: CANVAS.h };
  const pipPos = { x: CANVAS.w - PIP.w - PIP.margin, y: CANVAS.h - PIP.h - PIP.margin };
  const cam = source('dshow_input', 'Camera', camera
    ? { video_device_id: dshowId(camera), res_type: 1, resolution: '1920x1080', active: true, deactivate_when_not_showing: false }
    : { res_type: 1, resolution: '1920x1080' });
  // A global audio device (Settings > Audio > Mic/Aux), so every scene records it.
  const mic = source('wasapi_input_capture', 'Mic/Aux', { device_id: 'default' }, {
    filters: MIC_FILTERS.map(([filterName, kind, settings]) => source(kind, filterName, settings)),
  });
  const deck = source('browser_source', 'Deck', { url: `http://127.0.0.1:${port}/program`, width: CANVAS.w, height: CANVAS.h, fps_custom: false, reroute_audio: false, restart_when_active: false, shutdown: false });
  const screen = source('monitor_capture', 'Screen', { capture_cursor: true });
  const scene = (sceneName, items) => source('scene', sceneName, { id_counter: items.length, custom_size: false, items: items.map((it, k) => item(it[0], k + 1, it[1], it[2])) });
  const scenes = [
    scene(LAYOUTS.talk, [[cam, full, fullSize]]),
    scene(LAYOUTS['slide+cam'], [[deck, full, fullSize], [cam, pipPos, PIP]]),
    scene(LAYOUTS.slide, [[deck, full, fullSize]]),
    scene(LAYOUTS['screen+cam'], [[screen, full, fullSize], [cam, pipPos, PIP]]),
  ];
  return {
    name, current_scene: LAYOUTS.talk, current_program_scene: LAYOUTS.talk,
    scene_order: scenes.map(s => ({ name: s.name })), sources: [cam, deck, screen, ...scenes], AuxAudioDevice1: mic,
    groups: [], quick_transitions: [], transitions: [], transition_duration: 300, current_transition: 'Fade',
    modules: {}, preview_locked: false, scaling_enabled: false, saved_projectors: [],
  };
}

// ---------- OBS first-time setup: profile, websocket, skip the wizard ----------
// Only fills in what is missing. Existing OBS settings are never overwritten.
export const encoderFor = gpu => (/nvidia|geforce|rtx/i.test(gpu) ? 'nvenc' : /arc|intel/i.test(gpu) ? 'qsv' : /amd|radeon/i.test(gpu) ? 'amd' : 'x264');

export const profileIni = encoder => `[General]
Name=Studio

[Video]
BaseCX=${CANVAS.w}
BaseCY=${CANVAS.h}
OutputCX=${CANVAS.w}
OutputCY=${CANVAS.h}
FPSType=0
FPSCommon=30

[Output]
Mode=Simple

[SimpleOutput]
RecFormat2=hybrid_mp4
RecQuality=Small
RecEncoder=${encoder}
RecAEncoder=aac

[Audio]
SampleRate=48000
ChannelSetup=Stereo
`;

function obsSetup(obsDir, gpu) {
  const done = [];
  const writeIfMissing = (file, text, what) => { if (fs.existsSync(file)) return; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); if (what) done.push(what); };
  const encoder = encoderFor(gpu);
  writeIfMissing(path.join(obsDir, 'basic', 'profiles', 'Studio', 'basic.ini'), profileIni(encoder), `profile "Studio" (1080p30, ${encoder} encoder, hybrid MP4)`);
  // In OBS, FirstRun=true means "the first run already happened": it suppresses the auto-config
  // wizard, which otherwise sits as a modal dialog and silently blocks StartRecord.
  const firstRun = '[General]\nFirstRun=true\n\n[Basic]\nProfile=Studio\nProfileDir=Studio\nSceneCollection=Studio\nSceneCollectionFile=Studio\n';
  if (!fs.existsSync(path.join(obsDir, 'global.ini')) && !fs.existsSync(path.join(obsDir, 'user.ini'))) {
    writeIfMissing(path.join(obsDir, 'user.ini'), firstRun, 'skipped the first-run wizard'); writeIfMissing(path.join(obsDir, 'global.ini'), firstRun, '');
  }
  const wsFile = path.join(obsDir, 'plugin_config', 'obs-websocket', 'config.json');
  const ws = fs.existsSync(wsFile) ? JSON.parse(fs.readFileSync(wsFile, 'utf8')) : {};
  if (!ws.server_enabled) {
    const password = ws.server_password || crypto.randomBytes(18).toString('base64url');
    fs.mkdirSync(path.dirname(wsFile), { recursive: true });
    fs.writeFileSync(wsFile, JSON.stringify({ ...ws, alerts_enabled: false, auth_required: true, first_load: false, server_enabled: true, server_port: ws.server_port || 4455, server_password: password }, null, 2));
    // The password goes to the user's environment, never to the console.
    if (process.platform === 'win32') spawnSync('setx', ['OBS_WS_PASSWORD', password], { stdio: 'ignore' });
    done.push('enabled the OBS WebSocket with a new password, saved as the OBS_WS_PASSWORD user variable (open a new terminal to pick it up)');
  }
  return { encoder, done };
}

const gpuName = () => (process.platform === 'win32'
  ? spawnSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name -join ";"'], { encoding: 'utf8' }).stdout.trim()
  : '');

// OBS's own device lists are the truth. Pick from them: the preferred camera's real (non-software)
// entry, and the primary display for screen capture.
export function chooseDevice(items, kind, want) {
  const real = items.filter(i => i.itemEnabled !== false && i.itemValue && i.itemValue !== 'DUMMY');
  if (kind === 'camera') {
    const hw = real.filter(i => !/@device_sw_/.test(i.itemValue));
    return (want && hw.find(i => i.itemName === want)) || pickCamera(hw.map(i => ({ name: i.itemName, kind: 'video', path: i.itemValue, item: i })))?.item || null;
  }
  return real.find(i => /primary/i.test(i.itemName)) || real[0] || null;
}

async function fitDevices(obs, cameraName) {
  const fixes = [];
  for (const [inputName, prop, kind] of [['Camera', 'video_device_id', 'camera'], ['Screen', 'monitor_id', 'screen']]) {
    const list = await obs.call('GetInputPropertiesListPropertyItems', { inputName, propertyName: prop });
    const cur = await obs.call('GetInputSettings', { inputName });
    if (!list.requestStatus?.result || !cur.requestStatus?.result) continue;
    const items = list.responseData.propertyItems;
    const now = cur.responseData.inputSettings[prop];
    const valid = items.some(i => i.itemValue === now && now !== 'DUMMY' && !/@device_sw_/.test(now));
    if (valid) continue;
    const pick = chooseDevice(items, kind, cameraName);
    if (!pick) { fixes.push(`${inputName}: none found, pick it in OBS`); continue; }
    await obs.call('SetInputSettings', { inputName, inputSettings: { [prop]: pick.itemValue } });
    fixes.push(`${inputName} -> ${pick.itemName}`);
  }
  return fixes;
}

// A recording without a mic is the one failure nobody notices until the edit. If OBS has no audio
// input at all, create one in every scene with the same filters the collection would have set.
export const MIC_FILTERS = [
  ['Noise suppression', 'noise_suppress_filter_v2', { method: 'rnnoise' }],
  ['Compressor', 'compressor_filter', { ratio: 4, threshold: -18, attack_time: 6, release_time: 60, output_gain: 0 }],
  ['Limiter', 'limiter_filter', { threshold: -3, release_time: 60 }],
];

async function ensureMic(obs) {
  const special = await obs.call('GetSpecialInputs');
  if (special.responseData?.mic1) return null;
  const inputs = (await obs.call('GetInputList', { inputKind: 'wasapi_input_capture' })).responseData?.inputs || [];
  if (inputs.length) return null;
  const scenes = Object.values(LAYOUTS);
  const made = await obs.call('CreateInput', { sceneName: scenes[0], inputName: 'Mic', inputKind: 'wasapi_input_capture', inputSettings: { device_id: 'default' } });
  if (!made.requestStatus?.result) return `Mic: could not add one (${made.requestStatus?.comment}). Add your mic in OBS before recording.`;
  for (const sceneName of scenes.slice(1)) await obs.call('CreateSceneItem', { sceneName, sourceName: 'Mic' });
  for (const [filterName, filterKind, filterSettings] of MIC_FILTERS) await obs.call('CreateSourceFilter', { sourceName: 'Mic', filterName, filterKind, filterSettings });
  return 'Mic added to every scene (Windows default microphone, noise suppression on)';
}

// ---------- OBS websocket (protocol v5, built into OBS 28+) ----------
export const obsAuth = (password, salt, challenge) => {
  const secret = crypto.createHash('sha256').update(password + salt).digest('base64');
  return crypto.createHash('sha256').update(secret + challenge).digest('base64');
};

export function connectObs(url, password, onEvent) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const timer = setTimeout(() => reject(new Error(`no answer from OBS at ${url}. In OBS: Tools > WebSocket Server Settings > Enable.`)), 5000);
    ws.onerror = () => { clearTimeout(timer); reject(new Error(`can't reach OBS at ${url}. Is OBS open with the WebSocket server enabled?`)); };
    ws.onmessage = msg => {
      const { op, d } = JSON.parse(msg.data);
      if (op === 0) {
        const auth = d.authentication;
        if (auth && !password) { clearTimeout(timer); return reject(new Error('OBS wants a WebSocket password. Set OBS_WS_PASSWORD (Tools > WebSocket Server Settings > Show Connect Info).')); }
        ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 64, ...(auth ? { authentication: obsAuth(password, auth.salt, auth.challenge) } : {}) } }));
      } else if (op === 2) {
        clearTimeout(timer);
        resolve({
          call: (requestType, requestData = {}) => new Promise(res => { const requestId = uuid(); pending.set(requestId, res); ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } })); }),
          close: () => ws.close(),
        });
      } else if (op === 7) { pending.get(d.requestId)?.(d); pending.delete(d.requestId); }
      else if (op === 5) onEvent(d);
    };
    ws.onclose = e => { if (e.code === 4009) { clearTimeout(timer); reject(new Error('OBS refused the WebSocket password.')); } };
  });
}

// ---------- episode kit ----------
const SLIDES_TEMPLATE = title => `# ${title}
layout: talk
Note: Cold open. Say the one sentence the viewer gets by the end. No "hey guys".
---
# The problem
layout: slide+cam
- What people get wrong today
- What it costs them
B-roll: screen recording of the problem happening
Note: One concrete example, ideally from your own week.
---
# The idea
layout: slide
> One line that carries the whole video.
Note: Pause after the line. Let it sit.
---
# How it works
layout: slide+cam
[ ] Step one
[ ] Step two
[ ] Step three
Note: Tick each step as you explain it.
---
# Demo
layout: screen+cam
B-roll: close-up of the result
Note: Show it working for real. If it breaks, keep it and explain.
---
# What to do next
layout: talk
Note: One call to action. Point to the next video.
`;

const BRIEF_TEMPLATE = (title, slug) => `# ${title}

Slug: ${slug}
Status: prep

## Who is this for and what do they get
- Viewer:
- After watching they can:

## Hook (first 15 seconds)

## Title and thumbnail options
1.
2.
3.

## Publish
- YouTube: long version, chapters from publish/chapters.txt
- Shorts / Reels / LinkedIn: cut with make-shorts, posts with post-kit
`;

function newEpisode(slug, { title, root }) {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) die('give a short slug in lowercase with dashes, e.g. studio.mjs new skill-packs --title "Which skill pack wins?"', 2);
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(root, `${date}-${slug}`);
  if (fs.existsSync(dir)) die(`${dir} already exists. Pick another slug or work in that folder.`);
  for (const d of ['raw', 'broll', 'edited', 'publish', 'obs']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const t = title || slug.replace(/-/g, ' ');
  fs.writeFileSync(path.join(dir, 'brief.md'), BRIEF_TEMPLATE(t, slug));
  fs.writeFileSync(path.join(dir, 'slides.md'), SLIDES_TEMPLATE(t));
  console.log(JSON.stringify({ episode: dir, next: 'Fill brief.md and slides.md, then: studio.mjs check <episode>' }, null, 2));
}

export const slidesOf = ep => {
  const f = path.join(ep, 'slides.md');
  if (!fs.existsSync(f)) die(`no slides.md in ${ep}. Run studio.mjs new first.`);
  try { return parseSlides(fs.readFileSync(f, 'utf8')); } catch (e) { die(e.message); }
};

function check(ep) {
  const slides = slidesOf(ep);
  const broll = slides.flatMap(s => s.broll.map(b => `- [ ] Slide ${s.i + 1} (${s.title}): ${b}`));
  fs.writeFileSync(path.join(ep, 'broll.md'), `# B-roll list\n\nDrop files into broll/ named after the slide number, e.g. 05-closeup.mp4.\n\n${broll.join('\n') || '- none planned'}\n`);
  for (const s of slides) console.log(`${String(s.i + 1).padStart(2)}  ${LAYOUTS[s.layout].padEnd(12)} ${s.title}${s.builds ? `  (${s.builds} builds)` : ''}${s.notes ? '' : '  [no notes]'}`);
  console.log(`\n${slides.length} slides, ${broll.length} B-roll shots -> broll.md`);
}

// ---------- present: deck server + OBS control + session log ----------
export function allowedPost(headers, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(headers.host)) return false;
  if (headers.origin && !hosts.some(h => headers.origin === `http://${h}`)) return false;
  return (headers['content-type'] || '').startsWith('application/json');
}

async function present(ep, { port, obsUrl, password, noObs, cameraName }) {
  const slides = slidesOf(ep);
  const state = { i: 0, build: 0, recording: false, obs: 'off', recordPath: null };
  let t0 = null, log = null;
  const clients = new Set();
  const now = () => (t0 === null ? 0 : Date.now() - t0);
  const write = e => { if (log) fs.appendFileSync(log, `${JSON.stringify({ t: now(), ...e })}\n`); };
  const push = () => { const msg = `data: ${JSON.stringify({ ...state, t: now() })}\n\n`; for (const c of clients) c.write(msg); };

  let obs = null;
  const startSession = () => { t0 = Date.now(); log = path.join(ep, 'raw', `session-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`); write({ type: 'record', state: 'started' }); write({ type: 'slide', i: state.i, build: 0 }); };
  const endSession = outputPath => { write({ type: 'record', state: 'stopped', outputPath }); state.recordPath = outputPath || null; log = null; t0 = null; };
  if (!noObs) {
    try {
      obs = await connectObs(obsUrl, password, ev => {
        if (ev.eventType !== 'RecordStateChanged') return;
        const s = ev.eventData.outputState;
        if (s === 'OBS_WEBSOCKET_OUTPUT_STARTED') { state.recording = true; startSession(); }
        if (s === 'OBS_WEBSOCKET_OUTPUT_STOPPED') { state.recording = false; endSession(ev.eventData.outputPath); }
        push();
      });
      state.obs = 'connected';
      const fixes = await fitDevices(obs, cameraName);
      const mic = await ensureMic(obs); if (mic) fixes.push(mic);
      if (fixes.length) console.log(`studio: set in OBS: ${fixes.join('; ')}`);
      const dir = path.resolve(ep, 'raw');
      const r = await obs.call('SetRecordDirectory', { recordDirectory: dir });
      if (!r.requestStatus?.result) console.warn(`studio: OBS kept its own recording folder; the file path is logged when recording stops.`);
    } catch (e) { console.warn(`studio: ${e.message} Continuing without OBS: start recording yourself and press R in the presenter at the same moment.`); }
  }
  const scene = () => obs?.call('SetCurrentProgramScene', { sceneName: LAYOUTS[slides[state.i].layout] });

  const page = fs.readFileSync(path.join(HERE, 'deck.html'), 'utf8');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/program')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page.replace('/*VIEW*/', JSON.stringify(url.pathname === '/' ? 'presenter' : 'program')).replace('/*SLIDES*/', JSON.stringify(slides).replace(/</g, '\\u003c')).replace('/*PIP*/', JSON.stringify(PIP)));
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      clients.add(res); req.on('close', () => clients.delete(res));
      return res.write(`data: ${JSON.stringify({ ...state, t: now() })}\n\n`);
    }
    if (req.method === 'POST') {
      // Only the presenter page may drive the recording: same host, same origin, JSON body.
      // A cross-site page cannot send application/json without a CORS preflight, which this
      // server never answers, and the Host check stops DNS rebinding.
      if (!allowedPost(req.headers, port)) { res.writeHead(403); return res.end(); }
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.writeHead(413); return res.end(); } }
      let a = {};
      try { a = body ? JSON.parse(body) : {}; } catch { res.writeHead(400); return res.end(); }
      if (url.pathname === '/go') {
        if (!Number.isInteger(a.i)) { res.writeHead(400); return res.end(); }
        const i = Math.max(0, Math.min(slides.length - 1, a.i)); const build = Math.max(0, Math.min(slides[i].builds, Number.isInteger(a.build) ? a.build : 0));
        const changed = i !== state.i; Object.assign(state, { i, build });
        write({ type: 'slide', i, build }); if (changed) await scene();
      } else if (url.pathname === '/mark') write({ type: 'mark' });
      else if (url.pathname === '/record') {
        if (obs) await obs.call(state.recording ? 'StopRecord' : 'StartRecord');
        else { state.recording = !state.recording; state.recording ? startSession() : endSession(null); }
      }
      push(); res.writeHead(204); return res.end();
    }
    res.writeHead(404); res.end();
  });
  server.listen(port, '127.0.0.1', async () => {
    await scene();
    console.log(`Presenter:  http://127.0.0.1:${port}/   (open this on your second screen or beside the camera)`);
    console.log(`OBS deck:   http://127.0.0.1:${port}/program   (already set in the Deck browser source)`);
    console.log(`OBS: ${state.obs}. Keys: right/space next, left back, M fluff (cut back to last checkpoint), R record. Ctrl+C to stop.`);
  });
  process.on('SIGINT', () => { obs?.close(); server.close(); process.exit(0); });
}

// ---------- windows: open the presenter on the screen nearest the camera ----------
// The webcam usually sits on the main monitor, so the default is the primary screen.
export function pickScreen(list, want) {
  if (want) return list[Number(want) - 1] || null;
  return list.find(s => s.primary) || list[0] || null;
}

function screens() {
  const ps = 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { "$($_.DeviceName)|$($_.Primary)|$($_.Bounds.X)|$($_.Bounds.Y)|$($_.Bounds.Width)|$($_.Bounds.Height)" }';
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  return (r.stdout || '').trim().split(/\r?\n/).filter(Boolean).map(l => { const [name, primary, x, y, w, h] = l.split('|'); return { name, primary: primary === 'True', x: +x, y: +y, w: +w, h: +h }; });
}

function openPresenter({ port, screen, dry }) {
  if (process.platform !== 'win32') die(`open http://127.0.0.1:${port}/ in your browser on the screen nearest the camera.`);
  const list = screens();
  const s = pickScreen(list, screen) || die(`no screen ${screen}. Screens: ${list.map((x, k) => `${k + 1}=${x.w}x${x.h}${x.primary ? ' (primary)' : ''}`).join(', ')}`);
  const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p)) || die('Edge not found; open the presenter URL in any browser.');
  // A separate small profile so the window opens where we ask, without touching her own browser.
  const profile = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'StudioPresenter');
  const args = [`--app=http://127.0.0.1:${port}/`, `--user-data-dir=${profile}`, `--window-position=${s.x},${s.y}`, `--window-size=${s.w},${s.h}`, '--no-first-run'];
  console.log(JSON.stringify({ screens: list.map((x, k) => `${k + 1}: ${x.w}x${x.h} at ${x.x},${x.y}${x.primary ? ' (primary)' : ''}`), presenterOn: list.indexOf(s) + 1, command: [edge, ...args].join(' ') }, null, 2));
  if (!dry) spawn(edge, args, { detached: true, stdio: 'ignore' }).unref();
}

// ---------- doctor ----------
function doctor() {
  const ok = bin => spawnSync(bin, ['-version'], { encoding: 'utf8' }).status === 0;
  const obsPaths = ['C:/Program Files/obs-studio/bin/64bit/obs64.exe', '/Applications/OBS.app'];
  const list = devices();
  const cam = pickCamera(list);
  console.log(JSON.stringify({
    node: process.versions.node, websocket: typeof WebSocket === 'function', ffmpeg: ok('ffmpeg'),
    obs: obsPaths.find(p => fs.existsSync(p)) || 'not found: winget install OBSProject.OBSStudio (Windows) or brew install --cask obs (macOS)',
    camera: cam?.name || 'none found', cameras: list.filter(d => d.kind === 'video').map(d => d.name), mics: list.filter(d => d.kind === 'audio').map(d => d.name),
  }, null, 2));
}

// ---------- cli ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
// Runs in a function, not at top level: post.mjs imports this module, so this module has to finish
// loading before post.mjs is awaited.
async function main() {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
  const has = n => argv.includes(`--${n}`);
  const pos = argv[1];
  const root = flag('dir', process.env.STUDIO_DIR || path.join(os.homedir(), 'Videos', 'Studio'));
  const port = Number(flag('port', 4466));
  const ep = () => { const p = pos && (fs.existsSync(pos) ? pos : path.join(root, pos)); if (!p || !fs.existsSync(p)) die(`can't find episode "${pos}". Give its folder path.`, 2); return path.resolve(p); };
  switch (argv[0]) {
    case 'doctor': doctor(); break;
    case 'devices': console.log(JSON.stringify(devices(), null, 2)); break;
    case 'new': newEpisode(pos, { title: flag('title'), root }); break;
    case 'check': check(ep()); break;
    case 'obs': {
      const e = ep(); const cam = pickCamera(devices(), flag('camera'));
      const name = flag('name', 'Studio');
      const json = JSON.stringify(obsCollection({ name, camera: cam, port }), null, 2);
      const out = path.join(e, 'obs', `${name}.json`); fs.writeFileSync(out, json);
      let installed = null, setup = null;
      if (has('install')) {
        if (!process.env.APPDATA) die('--install is for Windows. On macOS use OBS > Scene Collection > Import with the file above.');
        const obsDir = path.join(process.env.APPDATA, 'obs-studio');
        installed = path.join(obsDir, 'basic', 'scenes', `${name}.json`);
        if (fs.existsSync(installed) && !has('force')) die(`${installed} exists. Add --force to replace it.`);
        fs.mkdirSync(path.dirname(installed), { recursive: true }); fs.writeFileSync(installed, json);
        setup = obsSetup(obsDir, gpuName());
      }
      console.log(JSON.stringify({ collection: out, installed, camera: cam?.name || 'none: pick it in OBS', setup, next: installed ? 'Start OBS (it opens on the Studio profile and scenes), then studio.mjs present <episode>' : 'OBS > Scene Collection > Import, or rerun with --install' }, null, 2));
      break;
    }
    case 'present': present(ep(), { port, obsUrl: flag('obs', 'ws://127.0.0.1:4455'), password: process.env.OBS_WS_PASSWORD, noObs: has('no-obs'), cameraName: flag('camera') }); break;
    case 'windows': openPresenter({ port, screen: flag('screen'), dry: has('dry-run') }); break;
    case 'rough': case 'finish': case 'pack': case 'study': {
      const post = await import('./post.mjs');
      const opts = { session: flag('session'), video: flag('video'), dry: has('dry-run'), pauses: !has('no-pauses') && (argv[0] === 'finish' || has('pauses')), db: flag('db') ? Number(flag('db')) : undefined, min: flag('min') ? Number(flag('min')) : undefined, captions: has('captions'), downloadModel: has('download-model') };
      if (argv[0] === 'study') post.study(pos, { out: flag('out'), every: Number(flag('every', 15)) });
      else post[argv[0]](ep(), opts);
      break;
    }
    default:
      console.log(`studio.mjs <command>
  prep:    doctor | devices | new <slug> --title "..." | check <ep>
  record:  obs <ep> [--install] | present <ep> [--no-obs] | windows [--screen N] [--dry-run]
  after:   rough <ep> [--pauses] | finish <ep> [--captions] [--no-pauses] [--dry-run] | pack <ep>
  learn:   study <video-url> [--out dir] [--every 15]
Episodes live in ~/Videos/Studio (override with --dir or STUDIO_DIR).`);
      if (argv[0]) process.exit(2);
  }
}
if (isMain) main().catch(e => die(e.message));
