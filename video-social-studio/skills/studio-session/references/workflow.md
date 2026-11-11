# Studio workflow reference

Checked 2026-11. Product features change; confirm prices on the vendor's own page before
recommending a paid plan.

## Which recording tool

| Situation | Use | Why |
|---|---|---|
| Solo talking head, slides, screen demos | **OBS Studio** (free) | Records on her machine at full quality, hardware encoding, scenes this skill drives |
| Interview with a remote guest | **Riverside** | Records each person locally on their own device as separate tracks, so a bad connection does not ruin the file. Paid plans; a small free allowance |
| Quick explainer from a doc, no camera needed | **Google Vids** | Free screen and webcam recorder (Chrome extension), generated clips, direct YouTube export. AI avatars and some editing are paid-tier only |
| Editing by deleting words from a transcript | Descript | Optional. This pack's captions, pause cutting and shorts cover the common cases locally |

Default: OBS for everything she records alone, Riverside only when a guest joins. Do not run two
recorders on one camera; Windows gives the camera to one app at a time.

## Window layout

- **Camera screen** (the one directly under or beside the lens): the presenter page, full screen.
  Notes sit close to the lens, so her eyes stay near the camera.
- **Second screen:** OBS, to glance at the preview, the REC light and the mic meter.
- **Third screen, if there is one:** the app being demonstrated. The Screen + cam scene captures
  the primary display; change it in the Screen source if the demo lives elsewhere.
- Turn on Do Not Disturb (Windows: Focus) and close chat apps before recording; notifications
  land in screen captures.

## Camera, light and sound

- Lens at eye level, about an arm's length away, head and shoulders filling most of the frame.
  A webcam on the monitor's top edge looking down from far back makes her small and the room big.
- Light from the front: face a window or put a soft lamp behind the screen. Avoid a bright
  window behind her.
- Webcam microphones pick up the room. A USB microphone 15 to 20 cm from the mouth is the
  biggest single upgrade. The OBS scenes already add noise suppression, a compressor and a
  limiter to whatever mic Windows uses as default.
- Record a 10 second test and play it back every session.

## Slides and B-roll

- On-screen text: a title and at most four short lines. The notes carry the full sentences.
- `layout: talk` for openings, stories and calls to action; `slide+cam` to explain; `slide` for one
  line that needs to land; `screen+cam` for demos.
- B-roll is planned in `slides.md` with `B-roll:` lines and collected in `broll.md`. Sources, in
  order of trust: her own screen recordings (OBS Screen scene), her own phone clips, licensed stock,
  generated clips. Generated footage needs a note of the tool and prompt, and must not show real
  people or brands that did not agree.
- Drop B-roll files into `broll/` named after the slide number (`05-closeup.mp4`).

## Publish checklist

1. Rough cut (`studio.mjs rough`), then `video-edit`: pauses, loudness, `export --preset youtube`.
2. `captions` for the SRT; upload it to YouTube as a subtitle file rather than burning it into the
   long version.
3. Chapters from `publish/chapters.txt` go in the description (first line `0:00`).
4. Thumbnail: `vid.mjs thumbs` gives candidates; a face plus three to five words reads at phone size.
5. Upload as private or unlisted, watch it through once, then publish.
6. `shorts-from-long` for two or three clips, `social-post-kit` for each platform's text.
7. She posts. The agent prepares files and text and never publishes for her.
