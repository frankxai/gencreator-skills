// post.mjs: everything after the take. rough (cut retakes), finish (retakes + pauses in one cut,
// B-roll over its slide, YouTube export, captions, thumbnails), pack (YouTube description and
// title options), study (break down a reference video). Loaded by studio.mjs; no dependencies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

export function cutFilter(keep) {
  const parts = keep.map(([a, b], k) => `[0:v]trim=start=${sec(a)}:end=${sec(b)},setpts=PTS-STARTPTS[v${k}];[0:a]atrim=start=${sec(a)}:end=${sec(b)},asetpts=PTS-STARTPTS[a${k}]`);
  return `${parts.join(';')};${keep.map((_, k) => `[v${k}][a${k}]`).join('')}concat=n=${keep.length}:v=1:a=1[cv][ca]`;
}

// Overlays each B-roll input (input k+1) full frame over [cv] during its window; audio stays the voice.
export function brollFilter(plan, w = 1920, h = 1080) {
  if (!plan.length) return '[cv]null[v]';
  const chain = []; let last = 'cv';
  plan.forEach((b, k) => {
    chain.push(`[${k + 1}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,trim=duration=${sec(b.end - b.start)},setpts=PTS-STARTPTS+${sec(b.start)}/TB[b${k}]`);
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

// ---------- rough / finish ----------
export function cutTake(ep, opts) {
  const { sFile, events, vFile } = findTake(ep, opts);
  const slides = slidesOf(ep);
  const retakes = cutsFromLog(events);
  const quiet = opts.pauses ? pauses(vFile, opts.db ?? -35, opts.min ?? 0.6) : [];
  const cuts = mergeRanges([...retakes, ...quiet]);
  const dur = durationMs(vFile);
  const keep = keepRanges(cuts, dur);
  const total = keep.reduce((n, [a, b]) => n + b - a, 0);
  const ch = chapters(events, slides, cuts);
  fs.writeFileSync(path.join(ep, 'publish', 'chapters.txt'), `${ch.lines.join('\n')}\n`);
  const lost = r => r.reduce((n, [a, b]) => n + (Math.min(b, dur) - a), 0) / 1000;
  console.log(`${retakes.length} fluffed takes (${lost(retakes).toFixed(1)} s), ${quiet.length} pauses (${lost(quiet).toFixed(1)} s). ${(dur / 1000).toFixed(1)} s -> ${(total / 1000).toFixed(1)} s. Chapters ${ch.valid ? 'ready' : 'need at least 3 parts of 10 s+ for YouTube'}: publish/chapters.txt`);
  return { sFile, events, vFile, cuts, keep, total };
}

export function rough(ep, opts) {
  const t = cutTake(ep, opts);
  if (opts.dry) return console.log(JSON.stringify({ video: t.vFile, session: t.sFile, cuts: t.cuts, keep: t.keep }, null, 2));
  const out = path.join(ep, 'edited', `${slugOf(ep)}-rough.mp4`);
  encode(t.vFile, [], `${cutFilter(t.keep)};[cv]null[v]`, out);
  console.log(JSON.stringify({ rough: out, next: 'studio.mjs finish for the full pass, or vid.mjs for single steps' }, null, 2));
}

function encode(input, broll, filter, out) {
  const inputs = ['-i', input];
  for (const b of broll) inputs.push(...(b.image ? ['-loop', '1', '-t', sec(b.end - b.start + 500), '-i', b.file] : ['-i', b.file]));
  run('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'error', '-stats', ...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '[ca]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
}

export function finish(ep, opts) {
  const t = cutTake(ep, { ...opts, pauses: opts.pauses !== false });
  const bdir = path.join(ep, 'broll');
  const files = fs.existsSync(bdir) ? fs.readdirSync(bdir).filter(f => /\.(mp4|mov|mkv|webm|png|jpe?g|webp)$/i.test(f)).sort().map(f => path.join(bdir, f)) : [];
  const { plan, skipped } = brollPlan(files, slideStarts(t.events, t.cuts), t.total, durationMs);
  for (const s of skipped) console.warn(`studio: skipped B-roll ${path.basename(s)}: name it after a slide that was shown, e.g. 05-closeup.mp4`);
  for (const b of plan) console.log(`B-roll ${path.basename(b.file)} at ${sec(b.start)}-${sec(b.end)} s`);
  if (opts.dry) return console.log(JSON.stringify({ video: t.vFile, cuts: t.cuts, broll: plan }, null, 2));
  const slug = slugOf(ep);
  const cut = path.join(ep, 'edited', `${slug}-cut.mp4`);
  const final = path.join(ep, 'edited', `${slug}-youtube.mp4`);
  encode(t.vFile, plan, `${cutFilter(t.keep)};${brollFilter(plan)}`, cut);
  run('node', [VID, 'export', cut, '--preset', 'youtube', '--out', final]);
  const result = { final, chapters: path.join(ep, 'publish', 'chapters.txt') };
  if (opts.captions) {
    result.captions = path.join(ep, 'publish', `${slug}.srt`);
    run('node', [VID, 'captions', final, '--out', result.captions, ...(opts.downloadModel ? ['--download-model'] : [])]);
  }
  result.thumbs = path.join(ep, 'publish', 'thumbs');
  run('node', [VID, 'thumbs', final, '--count', '6', '--out', result.thumbs]);
  console.log(JSON.stringify({ ...result, next: 'studio.mjs pack for the YouTube text; shorts-from-long for clips' }, null, 2));
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
export function study(url, { out, every = 15 }) {
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
  yt(['-f', 'bv*[height<=480]+ba/b', '--merge-output-format', 'mp4', '-o', 'video.%(ext)s']);
  const vtt = findVtt();
  if (vtt) fs.writeFileSync(path.join(dir, 'transcript.md'), vttToParagraphs(fs.readFileSync(path.join(dir, vtt), 'utf8')));
  const info = fs.existsSync(path.join(dir, 'v.info.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'v.info.json'), 'utf8')) : {};
  const meta = { url, title: info.title, channel: info.channel, duration: info.duration_string, uploaded: info.upload_date, views: info.view_count, chapters: (info.chapters || []).map(c => [Math.round(c.start_time), c.title]) };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  const video = path.join(dir, 'video.mp4');
  if (fs.existsSync(video)) {
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vf', `fps=1/${every},scale=640:-1`, path.join(dir, 'frames', 't_%03d.jpg')]);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(dir, 'frames', 't_%03d.jpg'), '-vf', 'scale=400:-1,tile=4x4:padding=4', path.join(dir, 'sheet_%d.jpg')]);
  }
  const sheets = fs.readdirSync(dir).filter(f => /^sheet_\d+\.jpg$/.test(f));
  console.log(JSON.stringify({ study: dir, ...meta, transcript: Boolean(vtt), sheets: sheets.length, frameEvery: `${every}s`, next: 'Read transcript.md and the sheets in order; each sheet tile is one frame, left to right, top to bottom.' }, null, 2));
}
