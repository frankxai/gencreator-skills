import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSilence, slideStarts, brollPlan, cutFilter, brollFilter, vttToParagraphs, briefSections } from './post.mjs';
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

test('pickScreen defaults to the primary screen, or the one asked for', () => {
  const list = [{ name: 'a', primary: false }, { name: 'b', primary: true }];
  assert.equal(pickScreen(list).name, 'b');
  assert.equal(pickScreen(list, '1').name, 'a');
  assert.equal(pickScreen(list, '5'), null);
});
