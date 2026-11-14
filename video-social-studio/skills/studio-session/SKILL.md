---
name: studio-session
description: "Plans and runs a talking-head or explainer video recording with OBS: writes the episode brief and slides, sets up OBS scenes for camera, slides and screen, runs a presenter view with notes that switches scenes and starts recording, marks fluffed takes so they are cut automatically, then makes a rough cut and YouTube chapters for the editor. Use when someone says 'help me record a video', 'set up my recording', 'prep my slides for a video', 'set up OBS', 'I want to film a YouTube video', 'make me a teleprompter', 'record with slides', 'plan my next episode', or 'I recorded it, now cut out the retakes'. Not for editing an existing clip (use video-edit), captions (use captions) or cutting shorts (use shorts-from-long)."
---

# Studio session

The half of video work that happens before the edit. She talks; you prepare everything around
her so recording is one sitting with no fiddling. Every step runs through the studio script:

```
node "scripts/studio.mjs" <command> [args]
```

The path is relative to this skill's folder. Episodes live in `~/Videos/Studio/<date>-<slug>/`
(override with `--dir` or `STUDIO_DIR`). The finishing steps belong to `video-edit`, `captions`,
`shorts-from-long` and `social-post-kit`, which drive `../video-engine/scripts/vid.mjs`.

## The loop

| Step | You (the agent) | She |
|---|---|---|
| 1 Prep | `new`, write `brief.md` and `slides.md` with her, `check` | Approves the hook, the slides and the notes; rewrites them in her own words |
| 2 Set up (once) | `doctor`, `obs <ep> --install` | Opens OBS once, frames the camera |
| 3 Record | `present <ep>` | Talks. Right arrow moves on, M marks a fluff, R starts and stops |
| 4 Finish | `finish <ep>`, then `pack <ep>` | Drops B-roll into `broll/` before, if any |
| 5 Publish | `shorts-from-long`, `social-post-kit` | Picks the thumbnail and title, uploads |

Before step 1, `study <url>` breaks down a video she wants to learn from: transcript, chapters,
contact sheets and measurements (words per minute, hook, chapter lengths, cuts per minute) in
`~/Videos/Studio/_study/<id>/`. `bench <urls.txt>` runs it over a list and writes one comparison
table; `--no-video` measures from captions only, which is light enough for a busy machine.

**House style.** If `~/Videos/Studio/_house/STYLE.md` exists, read it before prep and before
finish and follow it. When she gives a note on an edit ("the cut after 'first' is too quick"),
fix the edit and add the note to that file as a dated rule, so she never gives it twice.

Read `references/workflow.md` before step 2 the first time: tool choice, window layout, framing,
sound, and the publish checklist.

## Step 1: prep the episode

1. `studio.mjs new <slug> --title "<working title>"` creates `brief.md`, `slides.md` and the
   folders `raw/ broll/ edited/ publish/ obs/`.
2. Fill `brief.md` with her: who it is for, what they can do after, the hook, three title options.
3. Write `slides.md`. Slides are separated by a line with only `---`. Per slide:
   - `# Title` and `layout: talk | slide+cam | slide | screen+cam` (default `slide+cam`)
   - `- bullet` lines (one appears per key press), `[ ] item` lines (a checklist that ticks), or
     one `> quote` line (typed out on screen)
   - `Note:` speaker notes (shown large in the presenter, never on screen)
   - `B-roll:` shots to film or capture separately
   Keep on-screen text short: six words a bullet, four bullets a slide. The notes carry the words.
4. `studio.mjs check <ep>` lists the slides and writes `broll.md`. Fix anything it rejects.

Slides are a draft for her voice. Say so, and never put claims, numbers or names on a slide that
she has not given you or that you cannot source.

## Step 2: set up OBS (once per computer)

1. `studio.mjs doctor`: node, ffmpeg, OBS, cameras and mics. If OBS is missing, the doctor prints
   the install line; ask before installing.
2. `studio.mjs obs <ep> --install` (Windows) writes the four scenes (Talk, Slide + cam, Slide,
   Screen + cam), a Studio profile (1080p30, hardware encoder for her GPU, crash-safe MP4), turns
   on OBS's WebSocket with a new password saved as the `OBS_WS_PASSWORD` user variable, and skips
   the first-run wizard. It only fills in what is missing. On macOS, import the JSON it writes
   through OBS > Scene Collection > Import.
3. She opens OBS. On the first `present`, the script checks the camera, display and mic against
   OBS's own device lists and fixes them, so a wrong guess here is corrected automatically.

## Step 3: record

`studio.mjs present <ep>` starts a local page and connects to OBS. In a second terminal,
`studio.mjs windows` opens the presenter as its own window on the primary screen (`--screen N`
for another; `--dry-run` lists the screens).

- Presenter: `http://127.0.0.1:4466/`. She opens it on the screen nearest the camera lens.
- OBS shows the slides through the Deck browser source at `/program`.
- Keys: right arrow or space for the next build or slide, left to go back, **M** when she fluffs
  a line (then she restarts that slide or step), **R** to start or stop recording.
- Each slide's layout switches the OBS scene. Every change and mark is logged to
  `raw/session-*.jsonl`, and OBS records into `raw/`.

Without OBS control (`--no-obs`), she starts recording in OBS and presses R at the same moment.

Before the first real take, do a 10 second test and play it back: is she in frame, is the mic
level moving, is the room lit from the front.

## Step 3b: review the take

`studio.mjs review <ep>` right after recording, before cutting. It transcribes the take once
(cached next to the recording, using the speech model already downloaded) and writes
`edited/review.md`: words per minute against the 190 to 220 target, pauses, fluffs she marked,
**restarts she did not mark** ("most of you should, um, most of you should"), fillers, and the time
spent on each slide against its `Target N s`. It also writes `edited/takes.md`, the take as
timestamped phrases, which is the best view for choosing cuts and short clips. Read both to her in
two or three plain sentences: what went well, the one thing to change next take.

## Step 4: finish

`studio.mjs finish <ep>` does the whole edit in one cut, so chapters and B-roll stay in sync:

1. Removes every fluffed stretch (from the last slide change or mark up to each M press) and
   every pause over 0.6 s (`--no-pauses` to keep them, `--db -40` if her room is quiet and words
   get clipped).
2. Lays each file in `broll/` over the start of its slide: `05-closeup.mp4` plays at slide 5 for
   its own length (images 4 s), never past the next slide. The voice keeps running underneath.
3. Exports `edited/<slug>-youtube.mp4` (1080p, YouTube loudness), writes `publish/chapters.txt`
   and six thumbnail candidates in `publish/thumbs/`. `--captions` also writes the SRT (the first
   run needs `--download-model` and her yes, since it downloads the speech model).

Options: `--restarts` also cuts the unmarked restarts that `review` found (the later take stays);
`--music <file>` lays a music bed about 11 dB under the voice that ducks while she speaks and fades
out over the last 2 s (`--music-db -14` for quieter). Use music she owns or has a licence for.

Every cut gets a 30 ms audio fade so nothing pops, and still images get a slow push-in so every
shot moves. The delivered file is brought to -14 LUFS with peaks limited at -2 dBFS, measured
and corrected in up to three passes. A re-run never replaces an earlier render or captions she
corrected: it writes `-v2`, `-v3` and so on. `finish` also saves `edited/edl.json`, the list of what was kept and where B-roll sits.

Then `studio.mjs verify <ep>` before she watches: loudness and true peak of the delivered file,
length against the edit list, and frame strips around every cut and the first 2.5 s in
`edited/verify/`. Look at the strips; a pass on numbers alone is not a pass.

`--dry-run` first shows what will be cut and where the B-roll lands. `rough <ep>` cuts only the
retakes (add `--pauses` for pauses), when she wants to edit the rest by hand.

YouTube needs at least three chapters of 10 seconds or more; the script says when that is not met.

## Step 5: publish

`studio.mjs pack <ep>` writes `publish/youtube.md`: title options and hook from `brief.md`, the
chapters, sources and credit, and the upload checklist. Then `shorts-from-long` for clips and
`social-post-kit` for each platform's copy. She uploads and posts; you never publish for her.

## House rules

1. Her footage is never overwritten or deleted. Rough cuts go to `edited/`.
2. Test takes that show her face or screen are hers: tell her where they are, and remove only the
   ones you made and only when she agrees.
3. If OBS is open but nothing records, look for a dialog waiting in OBS (first-run wizard, update
   notice): it silently blocks recording.
4. Hardware encoders can take a few seconds to start. The presenter shows "recording" only once
   OBS confirms; wait for it before talking.
