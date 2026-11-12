import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSilence, slideStarts, brollPlan, cutFilter, brollFilter, vttToParagraphs, briefSections, joinPoints, parseEbur128, loudnessVerdict, speechStats, chapterStats, benchTable } from './post.mjs';
import { pickScreen } from './studio.mjs';

test('parseSilence pads pauses and drops ones shorter than the padding', () => {
  const err = `[silencedetect @ 0] silence_start: 8.05
[silencedetect @ 0] silence_end: 10.02 | silence_duration: 1.97
[silencedetect @ 0] silence_start: 15
[silencedetect @ 0] silence_end: 15.2 | silence_duration: 0.2
[silencedetect @ 0] silence_start: -0.01
[silencedetect @ 0] silence_end: 1 | silence_duration: 1.01`;
  assert.deepEqual(parseSilence(err), [[8170, 9900], [120, 880]]);
});

test('slideStarts keeps the first appearance of each slide on the cut timeline', () => {
  const ev = [
    { t: 0, type: 'slide', i: 0, build: 0 }, { t: 9000, type: 'slide', i: 1, build: 0 },
    { t: 12000, type: 'slide', i: 1, build: 1 }, { t: 20000, type: 'slide', i: 2, build: 0 },
    { t: 25000, type: 'slide', i: 1, build: 0 }, // went back later: not a new start
  ];
  assert.deepEqual([...slideStarts(ev, [[2000, 5000]])], [[0, 0], [1, 6000], [2, 17000]]);
});

test('brollPlan maps NN-name files to slides, caps at the next slide and the end', () => {
  const starts = new Map([[0, 0], [1, 6000], [2, 17000]]);
  const durs = { 'b/02-desk.mp4': 20000, 'b/03-short.mp4': 3000, 'b/09-none.mp4': 5000, 'b/notes.mp4': 1000 };
  const { plan, skipped } = brollPlan(Object.keys(durs).concat('b/01-logo.png'), starts, 19000, f => durs[f]);
  assert.deepEqual(plan, [
    { file: 'b/01-logo.png', start: 0, end: 4000, image: true },
    { file: 'b/02-desk.mp4', start: 6000, end: 17000, image: false },
    { file: 'b/03-short.mp4', start: 17000, end: 19000, image: false },
  ]);
  assert.deepEqual(skipped, ['b/09-none.mp4', 'b/notes.mp4']);
});

test('cutFilter concatenates kept ranges into [cv][ca]', () => {
  const f = cutFilter([[0, 1500], [3000, 4000]]);
  assert.match(f, /\[0:v\]trim=start=0\.000:end=1\.500/);
  assert.match(f, /\[0:a\]atrim=start=3\.000:end=4\.000/);
  assert.match(f, /\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2:v=1:a=1\[cv\]\[ca\]$/);
});

test('brollFilter chains overlays and ends in [v]', () => {
  assert.equal(brollFilter([]), '[cv]null[v]');
  const f = brollFilter([{ start: 6000, end: 9000 }, { start: 17000, end: 19000 }]);
  assert.match(f, /\[1:v\].*setpts=PTS-STARTPTS\+6\.000\/TB\[b0\]/);
  assert.match(f, /\[cv\]\[b0\]overlay=enable='between\(t,6\.000,9\.000\)':eof_action=pass\[o0\]/);
  assert.match(f, /\[o0\]\[b1\]overlay=.*\[v\]$/);
});

test('vttToParagraphs drops rolling duplicates and groups by time', () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
<c>hello</c> there

00:00:02.000 --> 00:00:04.000
hello there

00:00:25.000 --> 00:00:27.000
second part`;
  assert.equal(vttToParagraphs(vtt), '[00:01] hello there\n\n[00:25] second part');
});

test('briefSections reads headings case-insensitively', () => {
  const s = briefSections('# T\n\n## Hook (first 15 seconds)\n"Say it."\n\n## Title and thumbnail options\n1. A\n2. B\n');
  assert.equal(s['hook (first 15 seconds)'], '"Say it."');
  assert.equal(s['title and thumbnail options'], '1. A\n2. B');
});

test('cutFilter fades 30 ms at both edges of each piece, skipping pieces too short to fade', () => {
  const f = cutFilter([[0, 2000], [3000, 3100]]);
  assert.match(f, /\[0:a\]atrim=start=0\.000:end=2\.000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0\.03,afade=t=out:st=1\.970:d=0\.03\[a0\]/);
  assert.match(f, /atrim=start=3\.000:end=3\.100,asetpts=PTS-STARTPTS\[a1\]/, 'a 100 ms piece is too short for two fades');
});

test('brollFilter pushes in on images and leaves video clips as they are', () => {
  const f = brollFilter([{ start: 0, end: 4000, image: true }, { start: 6000, end: 9000, image: false }]);
  assert.match(f, /\[1:v\].*zoompan=z='1\+0\.08\*on\/120'.*d=120:s=1920x1080:fps=30/);
  assert.doesNotMatch(f.split(';').find(s => s.startsWith('[2:v]')), /zoompan/);
});

test('joinPoints gives the cut times on the output timeline', () => {
  assert.deepEqual(joinPoints([[0, 5000], [8000, 10000], [12000, 15000]]), [5000, 7000]);
  assert.deepEqual(joinPoints([[0, 5000]]), []);
});

test('parseEbur128 reads the summary and loudnessVerdict flags what YouTube will change', () => {
  const err = `[Parsed_ebur128_0 @ x] t: 1 M: -20 S: -20 I: -30.0 LUFS
[Parsed_ebur128_0 @ x] Summary:

  Integrated loudness:
    I:         -14.2 LUFS
    Threshold: -24.3 LUFS

  Loudness range:
    LRA:         5.1 LU

  True peak:
    Peak:       -1.4 dBFS`;
  const l = parseEbur128(err);
  assert.deepEqual(l, { lufs: -14.2, truePeak: -1.4, lra: 5.1 });
  assert.deepEqual(loudnessVerdict(l), []);
  assert.equal(loudnessVerdict({ lufs: -19, truePeak: -0.2 }).length, 2);
});

test('speechStats measures words per minute and the 15 s hook', () => {
  const vtt = `WEBVTT

00:00:00.500 --> 00:00:04.000
Claude Code skills are overrated

00:00:04.000 --> 00:00:10.000
here is what I use instead

00:00:16.000 --> 00:00:30.500
three skills only`;
  const s = speechStats(vtt);
  assert.equal(s.words, 14);
  assert.equal(s.firstWordSec, 0);
  assert.equal(s.hook, 'Claude Code skills are overrated here is what I use instead');
  assert.equal(s.wpm, 28);
});

test('chapterStats and benchTable summarise a set of videos', () => {
  assert.deepEqual(chapterStats([[0, 'Intro'], [45, 'A'], [300, 'B']], 600), { count: 3, medianSec: 255, firstAfterIntroSec: 45 });
  assert.deepEqual(chapterStats([], 600), { count: 0, medianSec: null, firstAfterIntroSec: null });
  const rows = [
    { meta: { views: 1000, duration: '10:00', title: 'A | B' }, metrics: { speech: { wpm: 170, hook: 'h', firstWordSec: 0 }, chapters: { count: 3, medianSec: 120 }, cutsPerMin: 8 } },
    { meta: { views: 50, duration: '5:00', title: 'C' }, metrics: { speech: null, chapters: { count: 0, medianSec: null }, cutsPerMin: null } },
  ];
  const { md, summary } = benchTable(rows);
  assert.match(md, /\| 1,000 \| 10:00 \| 170 \| 0s \| 3 \| 120s \| 8 \| A \/ B \| h \|/);
  assert.deepEqual(summary, { videos: 2, medianWpm: 170, medianCutsPerMin: 8, withChapters: 1 });
});

test('pickScreen defaults to the primary screen, or the one asked for', () => {
  const list = [{ name: 'a', primary: false }, { name: 'b', primary: true }];
  assert.equal(pickScreen(list).name, 'b');
  assert.equal(pickScreen(list, '1').name, 'a');
  assert.equal(pickScreen(list, '5'), null);
});
