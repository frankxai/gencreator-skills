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

## Stream Deck (optional)

So her hands stay off the keyboard on camera. In the Stream Deck app, with the presenter window
focused while recording:

| Button | Action | Setting |
|---|---|---|
| Next | System > Hotkey | Right arrow |
| Back | System > Hotkey | Left arrow |
| Fluffed it | System > Hotkey | M |
| Record | System > Hotkey | R (the presenter tells OBS; do not also use the OBS Record button, or the log loses its start) |

The OBS plugin's own buttons (scene switch, mute mic) are fine alongside these.

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

## Open-source editing kits (checked 2026-11-12)

| Kit | Licence | What to take from it |
|---|---|---|
| browser-use/video-use | MIT | 30 ms fades at every cut, cut padding 30 to 200 ms, self-check at every cut boundary, a per-project memory file. Word-level cuts need an ElevenLabs key |
| nateherkai/herk-edit-kit | not stated | Its editing playbook: measured pacing for reels, B-roll and caption rules, and the habit of turning every note into a rule. Read for ideas; the code has no licence to reuse |
| OpenMontageInc/OpenMontage | AGPL-3.0 | Starts from a reference video, then generates footage. Suits explainers made from stock or generated clips more than a talking head. AGPL: do not copy code into this pack |
| heygen-com/hyperframes | see repo | HTML to video for title cards, lower thirds and animated callouts |
| m-bain/whisperX | see repo | Word-level timestamps, the base for cutting filler words exactly |
| WyattBlue/auto-editor | see repo | Automatic silence cutting; `finish` already does this in the same pass as retakes |

The two kits disagree on rendering: video-use extracts each piece and joins them, herk-edit-kit
measured a one-frame lip-sync drift at half the joins doing that. `finish` cuts in one pass.

## Publish checklist

1. `studio.mjs finish <ep> --captions`: retakes, pauses, B-roll, YouTube export, chapters, SRT,
   thumbnail candidates.
2. `studio.mjs pack <ep>`: `publish/youtube.md` with titles, description and chapters. Upload the
   SRT as a subtitle file rather than burning it into the long version.
3. Chapters go in the description (first line `0:00`).
4. Thumbnail: pick from `publish/thumbs/`; a face plus three to five words reads at phone size.
5. Upload as private or unlisted, watch it through once, then publish.
6. `shorts-from-long` for two or three clips, `social-post-kit` for each platform's text.
7. She posts. The agent prepares files and text and never publishes for her.
