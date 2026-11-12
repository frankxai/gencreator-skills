// post.mjs: everything after the take. rough (cut retakes), finish (retakes + pauses in one cut,
// B-roll over its slide, YouTube export, captions, thumbnails), pack (YouTube description and
// title options), study (break down a reference video). Loaded by studio.mjs; no dependencies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLog, cutsFromLog, mergeRanges, keepRanges, shiftTime, chapters, slidesOf } from './studio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VID = path.join(HERE, '..', '..', 'video-engine', 'scripts', 'vid.mjs');
const IMAGE = /\.(png|jpe?g|webp)$/i;
const BROLL_IMAGE_MS = 4000;
const die = (msg, code = 1) => { console.error(`studio: ${msg}`); process.exit(code); };
const quote = a => (/[\s"]/.test(a) ? `"${a}"` : a);

export const run = (bin, args, { quiet } = {}) => {
  console.log(`> ${bin} ${args.map(quote).join(' ')}`);
  const r = spawnSync(bin, args, { stdio: quiet ? ['ignore', 'ignore', 'pipe'] : 'inherit', encoding: 'utf8' });
  if (r.status !== 0) die(`${bin} failed (exit ${r.status}).${r.stderr ? `\n${r.stderr.slice(-800)}` : ''}`);
  return r;
};
export const durationMs = f => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' });
  const d = parseFloat(r.stdout); if (!d) die(`can't read the length of ${f}.`); return Math.round(d * 1000);
};

// ---------- pure helpers (tested) ----------

// ffmpeg silencedetect output -> pause ranges in ms, shrunk by pad on both sides so words keep
// their breath. Pauses shorter than the padding leave nothing to cut.
export function parseSilence(stderr, pad = 120) {
  const out = []; let start = null;
  for (const line of stderr.split('\n')) {
    let m;
    if ((m = line.match(/silence_start:\s*(-?[\d.]+)/))) start = Math.max(0, parseFloat(m[1]) * 1000);
    else if ((m = line.match(/silence_end:\s*([\d.]+)/)) && start !== null) {
      const a = Math.round(start + pad), b = Math.round(parseFloat(m[1]) * 1000 - pad);
      if (b > a) out.push([a, b]); start = null;
    }
  }
  return out;
}

// When each slide first appeared, on the cut timeline.
export function slideStarts(events, cuts) {
  const starts = new Map();
  for (const e of events) if (e.type === 'slide' && e.build === 0 && !starts.has(e.i)) starts.set(e.i, shiftTime(e.t, cuts));
  return starts;
}

// B-roll files are named after the slide number they belong to: 05-closeup.mp4 plays at the start
// of slide 5, for its own length (images: 4 s), never past the next slide or the end.
export function brollPlan(files, starts, totalMs, durOf) {
  const times = [...starts.values()].sort((a, b) => a - b);
  const plan = []; const skipped = [];
  for (const file of files) {
    const n = parseInt(path.basename(file), 10);
    const start = starts.get(n - 1);
    if (!n || start === undefined) { skipped.push(file); continue; }
    const next = times.find(t => t > start) ?? totalMs;
    const len = IMAGE.test(file) ? BROLL_IMAGE_MS : durOf(file);
    const end = Math.min(start + len, next, totalMs);
    if (end - start >= 500) plan.push({ file, start, end, image: IMAGE.test(file) });
  }
  return { plan: plan.sort((a, b) => a.start - b.start), skipped };
}

const sec = ms => (ms / 1000).toFixed(3);

// A 30 ms fade at both edges of every kept piece, so no cut pops (rule from browser-use/video-use).
// One pass over the source keeps picture and voice frame-exact; joining separately encoded pieces
// drifts lip sync by about a frame (measured in nateherkai/herk-edit-kit).
export const FADE_MS = 30;
export function cutFilter(keep) {
  const parts = keep.map(([a, b], k) => {
    const d = (b - a) / 1000, f = FADE_MS / 1000;
    const fades = d > 4 * f ? `,afade=t=in:st=0:d=${f},afade=t=out:st=${(d - f).toFixed(3)}:d=${f}` : '';
    return `[0:v]trim=start=${sec(a)}:end=${sec(b)},setpts=PTS-STARTPTS[v${k}];[0:a]atrim=start=${sec(a)}:end=${sec(b)},asetpts=PTS-STARTPTS${fades}[a${k}]`;
  });
  return `${parts.join(';')};${keep.map((_, k) => `[v${k}][a${k}]`).join('')}concat=n=${keep.length}:v=1:a=1[cv][ca]`;
}

// Every shot moves: a still image gets a slow 8% push-in over its window.
const PUSH_IN = 0.08;
const FPS = 30;

// Overlays each B-roll input (input k+1) full frame over [cv] during its window; audio stays the voice.
export function brollFilter(plan, w = 1920, h = 1080) {
  if (!plan.length) return '[cv]null[v]';
  const chain = []; let last = 'cv';
  plan.forEach((b, k) => {
    const frames = Math.max(1, Math.round(((b.end - b.start) / 1000) * FPS));
    const fit = b.image
      ? `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=z='1+${PUSH_IN}*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`
      : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    chain.push(`[${k + 1}:v]${fit},setsar=1,trim=duration=${sec(b.end - b.start)},setpts=PTS-STARTPTS+${sec(b.start)}/TB[b${k}]`);
    const out = k === plan.length - 1 ? 'v' : `o${k}`;
    chain.push(`[${last}][b${k}]overlay=enable='between(t,${sec(b.start)},${sec(b.end)})':eof_action=pass[${out}]`);
    last = out;
  });
  return chain.join(';');
}

// WebVTT auto-captions repeat each line as it scrolls; keep each line once, in ~20 s paragraphs.
export function vttToParagraphs(vtt, every = 20) {
  const lines = []; let last = '';
  for (const block of vtt.replace(/\r\n/g, '\n').split(/\n\n+/)) {
    const m = block.match(/^(\d\d):(\d\d):(\d\d)\.\d+ -->/m); if (!m) continue;
    const text = block.split('\n').slice(1).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean).pop() || '';
    if (!text || text === last) continue; last = text;
    lines.push([+m[1] * 3600 + +m[2] * 60 + +m[3], text]);
  }
  const paras = []; let cur = null;
  for (const [s, t] of lines) { if (!cur || s - cur.s >= every) { cur = { s, t: [] }; paras.push(cur); } cur.t.push(t); }
  const f = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return paras.map(p => `[${f(p.s)}] ${p.t.join(' ')}`).join('\n\n');
}

// brief.md sections by heading.
export function briefSections(md) {
  const out = {}; let key = null;
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(/^##\s+(.+)/);
    if (m) { key = m[1].trim().toLowerCase(); out[key] = []; } else if (key) out[key].push(line);
  }
  for (const k of Object.keys(out)) out[k] = out[k].join('\n').trim();
  return out;
}

// ---------- words: what was said, when ----------
const FILLERS = new Set(['um', 'uh', 'erm', 'er', 'ah', 'hmm', 'mm']);
const norm = w => w.toLowerCase().replace(/[^a-z0-9']/g, '');

// ffmpeg's whisper filter with max_len=1 writes one JSON line per word (start/end in ms);
// punctuation arrives as its own token and is folded into the word before it.
export function parseWords(jsonl) {
  const words = [];
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const text = String(o.text || '').trim();
    if (!text) continue;
    if (!/[a-z0-9]/i.test(text)) { if (words.length) words[words.length - 1].w += text; continue; }
    words.push({ w: text, s: Math.round(o.start), e: Math.round(Math.max(o.end, o.start)) });
  }
  return words;
}

// Phrases: words joined until a gap of gapMs or more. The reading view of a take.
export function packPhrases(words, gapMs = 500) {
  const out = []; let cur = null;
  for (const x of words) {
    if (!cur || x.s - cur.e >= gapMs) { cur = { s: x.s, e: x.e, words: [] }; out.push(cur); }
    cur.words.push(x.w); cur.e = Math.max(cur.e, x.e);
  }
  return out.map(p => ({ s: p.s, e: p.e, text: p.words.join(' ') }));
}

// A restart: the same two or more words said again within a few words, like "most of you
// should, um, most of you should". The first attempt (and any filler before the retry) is cut,
// the later take is kept.
export function findRestarts(words, { minRun = 2, window = 8 } = {}) {
  const t = words.map(x => norm(x.w));
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (!t[i] || FILLERS.has(t[i])) continue;
    for (let j = i + minRun; j <= Math.min(i + window, t.length - minRun); j++) {
      let k = 0;
      while (j + k < t.length && i + k < j && t[i + k] === t[j + k] && t[i + k]) k++;
      if (k >= minRun) { out.push({ cut: [words[i].s, words[j].s], said: words.slice(i, j).map(x => x.w).join(' '), kept: words.slice(j, j + k).map(x => x.w).join(' ') }); i = j - 1; break; }
    }
  }
  return out;
}

export const fillerWords = words => words.filter(x => FILLERS.has(norm(x.w))).map(x => ({ at: x.s, w: x.w }));

export function wordsPerMinute(words, pauses = []) {
  if (!words.length) return null;
  const span = words[words.length - 1].e - words[0].s;
  const quiet = pauses.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, words[words.length - 1].e) - Math.max(a, words[0].s)), 0);
  const talk = span - quiet;
  return talk > 0 ? Math.round(words.filter(x => !FILLERS.has(norm(x.w))).length / (talk / 60000)) : null;
}

function modelPath() {
  const dir = process.env.VSS_CACHE || path.join(os.homedir(), '.cache', 'video-social-studio');
  return ['small', 'base', 'tiny'].map(m => path.join(dir, `ggml-${m}.bin`)).find(f => fs.existsSync(f)) || null;
}

// Transcribes once per recording and caches the words next to it.
async function wordsFor(video) {
  const cache = video.replace(/\.[^.]+$/, '.words.jsonl');
  if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs > fs.statSync(video).mtimeMs) return parseWords(fs.readFileSync(cache, 'utf8'));
  const model = modelPath();
  if (!model) die('no speech model yet. Run `vid.mjs captions <file> --download-model` once (it asks first), then retry.');
  const { filterPath } = await import(pathToFileURL(VID).href);
  if (fs.existsSync(cache)) fs.rmSync(cache);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vn', '-af', `whisper=model=${filterPath(model)}:language=auto:queue=10:format=json:max_len=1:destination=${filterPath(cache)}`, '-f', 'null', '-']);
  return parseWords(fs.readFileSync(cache, 'utf8'));
}

// "Target 90 s" in a slide's notes is the planned length of that slide.
export const targetSec = notes => { const m = /target\s+(\d+)\s*s\b/i.exec(notes || ''); return m ? Number(m[1]) : null; };

// ---------- take lookup ----------
function findTake(ep, { session, video }) {
  const raw = path.join(ep, 'raw');
  const sessions = fs.readdirSync(raw).filter(f => /^session-.*\.jsonl$/.test(f)).sort();
  const sFile = session || (sessions.length ? path.join(raw, sessions[sessions.length - 1]) : die('no session log in raw/. Record with studio.mjs present first.'));
  const events = readLog(sFile);
  const logged = events.find(e => e.type === 'record' && e.outputPath)?.outputPath;
  const vids = fs.readdirSync(raw).filter(f => /\.(mkv|mp4|mov)$/i.test(f)).map(f => path.join(raw, f)).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  const vFile = video || (logged && fs.existsSync(logged) ? logged : vids[vids.length - 1]) || die('no recording found. Pass --video <file>.');
  return { sFile, events, vFile };
}

function pauses(vFile, db, minSec) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', vFile, '-af', `silencedetect=noise=${db}dB:d=${minSec}`, '-f', 'null', '-'], { encoding: 'utf8' });
  return parseSilence(r.stderr || '');
}

const slugOf = ep => path.basename(ep).replace(/^\d{4}-\d{2}-\d{2}-/, '');

// '' for the first render, then '-v2', '-v3' ...
export function nextVersion(dir, base, ext, exists = f => fs.existsSync(f)) {
  if (!exists(path.join(dir, `${base}${ext}`))) return '';
  for (let n = 2; ; n++) if (!exists(path.join(dir, `${base}-v${n}${ext}`))) return `-v${n}`;
}

// ---------- rough / finish ----------
export async function cutTake(ep, opts) {
  const { sFile, events, vFile } = findTake(ep, opts);
  const slides = slidesOf(ep);
  const retakes = cutsFromLog(events);
  const quiet = opts.pauses ? pauses(vFile, opts.db ?? -35, opts.min ?? 0.6) : [];
  const restarts = opts.restarts ? findRestarts(await wordsFor(vFile)) : [];
  for (const r of restarts) console.log(`restart cut at ${sec(r.cut[0])} s: "${r.said}" -> keeps "${r.kept}"`);
  const cuts = mergeRanges([...retakes, ...quiet, ...restarts.map(r => r.cut)]);
  const dur = durationMs(vFile);
  const keep = keepRanges(cuts, dur);
  const total = keep.reduce((n, [a, b]) => n + b - a, 0);
  const ch = chapters(events, slides, cuts);
  fs.writeFileSync(path.join(ep, 'publish', 'chapters.txt'), `${ch.lines.join('\n')}\n`);
  const lost = r => r.reduce((n, [a, b]) => n + (Math.min(b, dur) - a), 0) / 1000;
  console.log(`${retakes.length} fluffed takes (${lost(retakes).toFixed(1)} s), ${quiet.length} pauses (${lost(quiet).toFixed(1)} s). ${(dur / 1000).toFixed(1)} s -> ${(total / 1000).toFixed(1)} s. Chapters ${ch.valid ? 'ready' : 'need at least 3 parts of 10 s+ for YouTube'}: publish/chapters.txt`);
  return { sFile, events, vFile, cuts, keep, total };
}

export async function rough(ep, opts) {
  const t = await cutTake(ep, opts);
  if (opts.dry) return console.log(JSON.stringify({ video: t.vFile, session: t.sFile, cuts: t.cuts, keep: t.keep }, null, 2));
  const out = path.join(ep, 'edited', `${slugOf(ep)}-rough.mp4`);
  encode(t.vFile, [], `${cutFilter(t.keep)};[cv]null[v]`, out);
  console.log(JSON.stringify({ rough: out, next: 'studio.mjs finish for the full pass, or vid.mjs for single steps' }, null, 2));
}

// Music bed: looped to length, about 11 dB under the voice, ducked further while the voice speaks,
// faded out over the last 2 s (herk-edit-kit playbook: bed 9 to 14 dB under, ducked under speech).
export const MUSIC_DB = -11;
export function musicFilter(inputIndex, totalMs, db = MUSIC_DB) {
  const d = sec(totalMs), fadeStart = Math.max(0, totalMs - 2000) / 1000;
  return `[ca]asplit=2[voice][key];[${inputIndex}:a]atrim=duration=${d},asetpts=PTS-STARTPTS,volume=${db}dB,afade=t=out:st=${fadeStart.toFixed(3)}:d=2[bed];[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[duck];[voice][duck]amix=inputs=2:duration=first:normalize=0[mix]`;
}

function encode(input, broll, filter, out, { music } = {}) {
  const inputs = ['-i', input];
  for (const b of broll) inputs.push('-i', b.file); // zoompan turns a single image into its own frames
  if (music) inputs.push('-stream_loop', '-1', '-i', music);
  run('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'error', '-stats', ...inputs, '-filter_complex', filter, '-map', '[v]', '-map', music ? '[mix]' : '[ca]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
}

// Two-pass loudness: measure, then correct with the measured values. A single loudnorm pass
// undershoots on short or peaky material (it measured -17.2 LUFS against a -14 target in testing).
export const TARGET = { lufs: -14, tp: -1.5, lra: 11 };
export function parseLoudnormJson(stderr) {
  const m = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!m) return null;
  const j = JSON.parse(m[0]);
  return { i: j.input_i, tp: j.input_tp, lra: j.input_lra, thresh: j.input_thresh, offset: j.target_offset };
}
// Second pass the way mastering does it: the measured gain to the target, then a peak limiter at
// -2 dBFS so the louder result cannot clip. loudnorm's own linear mode refuses gain that would
// break the peak ceiling, which left peaky speech 2.6 LU short in testing.
const LIMIT_DB = -2;
export const loudnessSecondPass = (m, t = TARGET) => {
  const gain = (t.lufs - Number(m.i)).toFixed(2);
  const limit = Math.pow(10, LIMIT_DB / 20).toFixed(4);
  return `volume=${gain}dB,alimiter=limit=${limit}:attack=5:release=50:level=false`;
};

const measureLoudness = file => parseLoudnormJson(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', `loudnorm=I=${TARGET.lufs}:TP=${TARGET.tp}:LRA=${TARGET.lra}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '');
const LOUDNESS_PASSES = 3;
const LOUDNESS_TOLERANCE = 0.5;

// Each pass renders from the untouched export with the gain corrected by what the last pass
// measured, so the limiter's give-back is made up without stacking re-encodes.
function normalizeLoudness(file) {
  const first = measureLoudness(file);
  if (!first) { console.warn('studio: could not measure loudness; left as exported.'); return; }
  const pristine = file.replace(/\.mp4$/, '.pre.mp4');
  fs.renameSync(file, pristine);
  let measured = first, gainBase = { ...first };
  for (let pass = 1; pass <= LOUDNESS_PASSES; pass++) {
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', pristine, '-c:v', 'copy', '-af', loudnessSecondPass(gainBase), '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', file], { quiet: true });
    measured = measureLoudness(file) || measured;
    const off = TARGET.lufs - Number(measured.i);
    if (Math.abs(off) <= LOUDNESS_TOLERANCE) break;
    gainBase = { ...gainBase, i: Number(gainBase.i) - off };
  }
  fs.rmSync(pristine);
  console.log(`loudness: ${first.i} LUFS as exported, ${measured.i} LUFS delivered (target ${TARGET.lufs}, peaks limited at ${LIMIT_DB} dBFS)`);
}

export async function finish(ep, opts) {
  if (opts.music && !fs.existsSync(opts.music)) die(`can't find the music file ${opts.music}.`);
  const t = await cutTake(ep, { ...opts, pauses: opts.pauses !== false });
  const bdir = path.join(ep, 'broll');
  const files = fs.existsSync(bdir) ? fs.readdirSync(bdir).filter(f => /\.(mp4|mov|mkv|webm|png|jpe?g|webp)$/i.test(f)).sort().map(f => path.join(bdir, f)) : [];
  const { plan, skipped } = brollPlan(files, slideStarts(t.events, t.cuts), t.total, durationMs);
  for (const s of skipped) console.warn(`studio: skipped B-roll ${path.basename(s)}: name it after a slide that was shown, e.g. 05-closeup.mp4`);
  for (const b of plan) console.log(`B-roll ${path.basename(b.file)} at ${sec(b.start)}-${sec(b.end)} s`);
  if (opts.dry) return console.log(JSON.stringify({ video: t.vFile, cuts: t.cuts, broll: plan }, null, 2));
  const slug = slugOf(ep);
  const cut = path.join(ep, 'edited', `${slug}-cut.mp4`);
  // A re-run never replaces an earlier render or captions she corrected: it writes the next version.
  const v = nextVersion(path.join(ep, 'edited'), `${slug}-youtube`, '.mp4');
  const final = path.join(ep, 'edited', `${slug}-youtube${v}.mp4`);
  const audio = opts.music ? `;${musicFilter(1 + plan.length, t.total, opts.musicDb ?? MUSIC_DB)}` : '';
  encode(t.vFile, plan, `${cutFilter(t.keep)};${brollFilter(plan)}${audio}`, cut, { music: opts.music });
  run('node', [VID, 'export', cut, '--preset', 'youtube', '--out', final]);
  normalizeLoudness(final);
  // The edit decision list: what was kept and where B-roll sits, for verify and for a re-edit.
  fs.writeFileSync(path.join(ep, 'edited', 'edl.json'), JSON.stringify({ source: t.vFile, session: t.sFile, cuts: t.cuts, keep: t.keep, totalMs: t.total, broll: plan, final }, null, 2));
  const result = { final, chapters: path.join(ep, 'publish', 'chapters.txt') };
  if (opts.captions) {
    result.captions = path.join(ep, 'publish', `${slug}${v}.srt`);
    run('node', [VID, 'captions', final, '--out', result.captions, ...(opts.downloadModel ? ['--download-model'] : [])]);
  }
  result.thumbs = path.join(ep, 'publish', `thumbs${v}`);
  run('node', [VID, 'thumbs', final, '--count', '6', '--out', result.thumbs]);
  console.log(JSON.stringify({ ...result, next: 'studio.mjs pack for the YouTube text; shorts-from-long for clips' }, null, 2));
}

// ---------- verify: check the delivered file before anyone watches it ----------
// Cut points on the output timeline: where each kept piece ends and the next begins.
export function joinPoints(keep) {
  const out = []; let at = 0;
  for (const [a, b] of keep.slice(0, -1)) { at += b - a; out.push(at); }
  return out;
}

export function parseEbur128(stderr) {
  const block = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = re => { const m = block.match(re); return m ? parseFloat(m[1]) : null; };
  return { lufs: num(/I:\s*(-?[\d.]+) LUFS/), truePeak: num(/Peak:\s*(-?[\d.]+) dBFS/), lra: num(/LRA:\s*(-?[\d.]+) LU/) };
}

export function loudnessVerdict({ lufs, truePeak }) {
  const issues = [];
  if (lufs === null) issues.push('could not measure loudness');
  else if (lufs < -15.5 || lufs > -12.5) issues.push(`loudness ${lufs} LUFS is outside -14 +/- 1.5`);
  if (truePeak !== null && truePeak > -1) issues.push(`true peak ${truePeak} dBFS is above -1 (may clip after upload)`);
  return issues;
}

export function verify(ep) {
  const edlFile = path.join(ep, 'edited', 'edl.json');
  if (!fs.existsSync(edlFile)) die('no edited/edl.json. Run studio.mjs finish first.');
  const edl = JSON.parse(fs.readFileSync(edlFile, 'utf8'));
  if (!fs.existsSync(edl.final)) die(`can't find ${edl.final}.`);
  const dir = path.join(ep, 'edited', 'verify');
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', edl.final, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const loud = parseEbur128(r.stderr || '');
  const issues = loudnessVerdict(loud);
  const dur = durationMs(edl.final);
  if (Math.abs(dur - edl.totalMs) > 500) issues.push(`length ${dur} ms differs from the edit list (${edl.totalMs} ms)`);
  // Frame strips: 4 frames around each cut, and the first 2.5 s, to look at rather than trust.
  const strip = (name, times) => {
    const tiles = times.filter(t => t >= 0 && t < dur).map((t, k) => {
      const f = path.join(dir, `${name}-${k}.jpg`);
      spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', sec(t), '-i', edl.final, '-frames:v', '1', '-vf', 'scale=480:-1', f]);
      return f;
    }).filter(f => fs.existsSync(f));
    if (!tiles.length) return null;
    const out = path.join(dir, `${name}.jpg`);
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...tiles.flatMap(f => ['-i', f]), '-filter_complex', `${tiles.map((_, k) => `[${k}]`).join('')}hstack=inputs=${tiles.length}`, out]);
    for (const f of tiles) fs.rmSync(f);
    return out;
  };
  const strips = [strip('first-2.5s', [0, 800, 1600, 2400])];
  joinPoints(edl.keep).forEach((t, k) => strips.push(strip(`cut-${String(k + 1).padStart(2, '0')}`, [t - 500, t - 80, t + 80, t + 500])));
  const report = { final: edl.final, lengthMs: dur, ...loud, cuts: edl.keep.length - 1, broll: edl.broll.length, strips: strips.filter(Boolean), issues, verdict: issues.length ? 'check' : 'pass' };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

// ---------- review: coach the take before cutting ----------
export const PACE = { low: 190, high: 220 };

// Seconds spent on each slide, from the session log, against the slide's "Target N s".
export function slideTimes(events, slides, endMs) {
  const starts = events.filter(e => e.type === 'slide' && e.build === 0);
  return slides.map((s, i) => {
    const mine = starts.filter(e => e.i === i);
    let spent = 0;
    for (const e of mine) {
      const next = events.find(x => x.t > e.t && ((x.type === 'slide' && x.i !== i) || (x.type === 'record' && x.state === 'stopped')));
      spent += (next ? next.t : endMs) - e.t;
    }
    return { slide: i + 1, title: s.title, seconds: Math.round(spent / 1000), target: targetSec(s.notes) };
  });
}

export function paceNote(wpm) {
  if (wpm === null) return 'no speech found';
  if (wpm < PACE.low) return `${wpm} words/min: slower than the ${PACE.low}-${PACE.high} target. Fine if it is deliberate; tighten pauses in the cut.`;
  if (wpm > PACE.high) return `${wpm} words/min: faster than the ${PACE.low}-${PACE.high} target. Leave a beat after key lines.`;
  return `${wpm} words/min: on target (${PACE.low}-${PACE.high}).`;
}

export async function review(ep, opts) {
  const { events, vFile } = findTake(ep, opts);
  const slides = slidesOf(ep);
  const words = await wordsFor(vFile);
  const quiet = pauses(vFile, -35, 0.6);
  const dur = durationMs(vFile);
  const wpm = wordsPerMinute(words, quiet);
  const restarts = findRestarts(words);
  const fillers = fillerWords(words);
  const marks = events.filter(e => e.type === 'mark').length;
  const times = slideTimes(events, slides, dur);
  const pauseSec = quiet.reduce((n, [a, b]) => n + b - a, 0) / 1000;
  const fmt = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const md = `# Take review: ${slugOf(ep)}

Recording ${fmt(dur)}, ${words.length} words. Machine transcript (whisper ${path.basename(modelPath() || '')}), so names and timings can be off by a word.

## Pace
- ${paceNote(wpm)}
- ${quiet.length} pauses over 0.6 s, ${pauseSec.toFixed(1)} s in total (finish removes them).

## Fluffs
- ${marks} marked with M (finish cuts them).
- ${restarts.length} unmarked restart${restarts.length === 1 ? '' : 's'} found${restarts.length ? ' (finish --restarts cuts them, keeping the later take):' : '.'}
${restarts.map(r => `  - ${fmt(r.cut[0])} "${r.said}" -> keeps "${r.kept}"`).join('\n')}
- ${fillers.length} fillers (${[...new Set(fillers.map(f => norm(f.w)))].join(', ') || 'none'}). Left in: cutting a filler inside a phrase clips the words around it.

## Slides
| # | Slide | Spent | Target |
|---:|---|---:|---:|
${times.map(t => `| ${t.slide} | ${t.title} | ${t.seconds ? `${t.seconds} s` : 'skipped'} | ${t.target ? `${t.target} s` : ''} |`).join('\n')}
`;
  fs.writeFileSync(path.join(ep, 'edited', 'review.md'), md);
  fs.writeFileSync(path.join(ep, 'edited', 'takes.md'), packPhrases(words).map(p => `[${fmt(p.s)}-${fmt(p.e)}] ${p.text}`).join('\n'));
  console.log(md);
  return { wpm, restarts, fillers, marks, times };
}

// ---------- pack: the YouTube upload text ----------
export function pack(ep) {
  const brief = briefSections(fs.readFileSync(path.join(ep, 'brief.md'), 'utf8'));
  const chFile = path.join(ep, 'publish', 'chapters.txt');
  const chapterText = fs.existsSync(chFile) ? fs.readFileSync(chFile, 'utf8').trim() : '';
  const titles = (brief['title and thumbnail options'] || '').split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
  const hook = (brief['hook (first 15 seconds)'] || '').replace(/^"|"$/g, '');
  const credits = brief['source and credit'] || '';
  const thumbs = path.join(ep, 'publish', 'thumbs');
  const md = `# YouTube upload: ${slugOf(ep)}

Draft for review. Rewrite in your own voice; check every claim and link before publishing.

## Title options
${titles.length ? titles.map((t, k) => `${k + 1}. ${t}`).join('\n') : '- (add title options to brief.md)'}

## Description
${hook || '(add the hook to brief.md)'}

${chapterText ? `Chapters\n${chapterText}` : '(run studio.mjs finish to write chapters)'}
${credits ? `\nSources and credit\n${credits}` : ''}

## Thumbnail
${fs.existsSync(thumbs) ? `Candidates in publish/thumbs/. Pick one face frame and add three to five words.` : 'Run studio.mjs finish to extract candidates.'}

## Upload checklist
- [ ] Upload edited/${slugOf(ep)}-youtube.mp4 as Private or Unlisted
- [ ] Title, description (chapters start at 0:00), thumbnail
- [ ] Subtitles: upload publish/${slugOf(ep)}.srt if it exists
- [ ] Watch it through once, then publish
- [ ] Shorts with shorts-from-long, posts with social-post-kit
`;
  const out = path.join(ep, 'publish', 'youtube.md');
  fs.writeFileSync(out, md);
  console.log(JSON.stringify({ youtube: out, titles: titles.length, chapters: chapterText ? chapterText.split('\n').length : 0 }, null, 2));
}

// ---------- study: break down a reference video ----------
const HOOK_SEC = 15;

// Speech numbers from the WebVTT captions: words per minute, the hook, talk time.
export function speechStats(vtt) {
  const cues = []; let last = '';
  for (const block of vtt.replace(/\r\n/g, '\n').split(/\n\n+/)) {
    const m = block.match(/^(\d\d):(\d\d):(\d\d)\.(\d+) --> (\d\d):(\d\d):(\d\d)/m); if (!m) continue;
    const text = block.split('\n').slice(1).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean).pop() || '';
    if (!text || text === last) continue; last = text;
    cues.push({ s: +m[1] * 3600 + +m[2] * 60 + +m[3], e: +m[5] * 3600 + +m[6] * 60 + +m[7], text });
  }
  const words = cues.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0);
  const span = cues.length ? cues[cues.length - 1].e - cues[0].s : 0;
  return {
    words, speechSec: span, wpm: span ? Math.round(words / (span / 60)) : null,
    hook: cues.filter(c => c.s < HOOK_SEC).map(c => c.text).join(' '),
    firstWordSec: cues[0]?.s ?? null,
  };
}

export function chapterStats(chapters, durationSec) {
  if (!chapters?.length) return { count: 0, medianSec: null, firstAfterIntroSec: null };
  const lens = chapters.map((c, k) => (chapters[k + 1]?.[0] ?? durationSec) - c[0]).sort((a, b) => a - b);
  return { count: chapters.length, medianSec: lens[Math.floor(lens.length / 2)], firstAfterIntroSec: chapters[1]?.[0] ?? null };
}

// Hard cuts per minute from scene changes, on a small copy of the picture to stay light.
function cutsPerMinute(video, durationSec) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-an', '-vf', "scale=320:-2,select='gt(scene,0.32)',showinfo", '-f', 'null', '-'], { encoding: 'utf8' });
  const n = ((r.stderr || '').match(/\bpts_time:/g) || []).length;
  return durationSec ? +(n / (durationSec / 60)).toFixed(1) : null;
}

export function study(url, { out, every = 15, noVideo = false }) {
  if (!/^https:\/\//.test(url || '')) die('give a full https:// video URL.', 2);
  if (spawnSync('uvx', ['--version'], { encoding: 'utf8' }).status !== 0) die('study needs uv (it runs yt-dlp without installing it). Install: winget install astral-sh.uv');
  const id = (url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1] || url.replace(/\W+/g, '-').slice(-40);
  const dir = path.resolve(out || path.join(os.homedir(), 'Videos', 'Studio', '_study', id));
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
  const yt = args => spawnSync('uvx', ['yt-dlp', '--js-runtimes', 'node', '--no-progress', '--ignore-errors', ...args, url], { cwd: dir, stdio: 'inherit' });
  // One caption track per request: YouTube rate-limits (HTTP 429) a second track fetched right
  // after the first, and a failed track must not cost the metadata.
  const findVtt = () => fs.readdirSync(dir).find(f => f.endsWith('.vtt'));
  yt(['--skip-download', '--write-info-json', '--write-auto-subs', '--write-subs', '--sub-langs', 'en-orig', '--sub-format', 'vtt', '-o', 'v.%(ext)s']);
  if (!findVtt()) yt(['--skip-download', '--write-auto-subs', '--write-subs', '--sub-langs', 'en', '--sub-format', 'vtt', '--sleep-subtitles', '5', '-o', 'v.%(ext)s']);
  if (!noVideo) yt(['-f', 'bv*[height<=480]+ba/b', '--merge-output-format', 'mp4', '-o', 'video.%(ext)s']);
  const vtt = findVtt();
  const vttText = vtt ? fs.readFileSync(path.join(dir, vtt), 'utf8') : '';
  if (vtt) fs.writeFileSync(path.join(dir, 'transcript.md'), vttToParagraphs(vttText));
  const info = fs.existsSync(path.join(dir, 'v.info.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'v.info.json'), 'utf8')) : {};
  const meta = { url, title: info.title, channel: info.channel, duration: info.duration_string, durationSec: info.duration, uploaded: info.upload_date, views: info.view_count, chapters: (info.chapters || []).map(c => [Math.round(c.start_time), c.title]) };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  const video = path.join(dir, 'video.mp4');
  const metrics = { speech: vtt ? speechStats(vttText) : null, chapters: chapterStats(meta.chapters, meta.durationSec), cutsPerMin: null };
  if (fs.existsSync(video)) {
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vf', `fps=1/${every},scale=640:-1`, path.join(dir, 'frames', 't_%03d.jpg')]);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(dir, 'frames', 't_%03d.jpg'), '-vf', 'scale=400:-1,tile=4x4:padding=4', path.join(dir, 'sheet_%d.jpg')]);
    metrics.cutsPerMin = cutsPerMinute(video, meta.durationSec);
  }
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  const sheets = fs.readdirSync(dir).filter(f => /^sheet_\d+\.jpg$/.test(f));
  console.log(JSON.stringify({ study: dir, title: meta.title, views: meta.views, transcript: Boolean(vtt), sheets: sheets.length, metrics }, null, 2));
  return { dir, meta, metrics };
}

// ---------- bench: compare many reference videos ----------
export function benchTable(rows) {
  const head = '| Views | Length | Words/min | First word | Chapters | Median chapter | Cuts/min | Title | Hook (first 15 s) |\n|---:|---:|---:|---:|---:|---:|---:|---|---|';
  const f = v => (v === null || v === undefined ? '' : v);
  const body = rows.map(({ meta: m, metrics: x }) => `| ${f(m.views?.toLocaleString('en-US'))} | ${f(m.duration)} | ${f(x.speech?.wpm)} | ${x.speech?.firstWordSec != null ? `${x.speech.firstWordSec}s` : ''} | ${x.chapters.count} | ${x.chapters.medianSec != null ? `${Math.round(x.chapters.medianSec)}s` : ''} | ${f(x.cutsPerMin)} | ${(m.title || '').replace(/\|/g, '/')} | ${(x.speech?.hook || '').replace(/\|/g, '/').slice(0, 160)} |`);
  const nums = k => rows.map(k).filter(v => typeof v === 'number').sort((a, b) => a - b);
  const median = a => (a.length ? a[Math.floor(a.length / 2)] : null);
  const summary = { videos: rows.length, medianWpm: median(nums(r => r.metrics.speech?.wpm)), medianCutsPerMin: median(nums(r => r.metrics.cutsPerMin)), withChapters: rows.filter(r => r.metrics.chapters.count).length };
  return { md: `${head}\n${body.join('\n')}`, summary };
}

export function bench(listFile, { out, noVideo }) {
  if (!listFile || !fs.existsSync(listFile)) die('give a text file with one video URL per line.', 2);
  const urls = fs.readFileSync(listFile, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => /^https:\/\//.test(l));
  const root = path.resolve(out || path.join(os.homedir(), 'Videos', 'Studio', '_study'));
  const rows = urls.map(u => study(u, { noVideo, out: undefined, every: 30 })).filter(r => r.meta.title);
  const { md, summary } = benchTable(rows);
  const file = path.join(root, `benchmark-${new Date().toISOString().slice(0, 10)}.md`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(file, `# Reference benchmark\n\n${summary.videos} videos. Median ${summary.medianWpm ?? '?'} words/min${summary.medianCutsPerMin != null ? `, ${summary.medianCutsPerMin} cuts/min` : ''}; ${summary.withChapters} use chapters.\n${noVideo ? '\nCaptions and metadata only (run without --no-video for cuts per minute).\n' : ''}\n${md}\n`);
  console.log(JSON.stringify({ benchmark: file, ...summary }, null, 2));
}
