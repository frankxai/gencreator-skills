# Video Social Studio

Your own video assistant and social media manager, inside Claude. Tell it what you want in plain
words ("cut the pauses", "add captions", "make three shorts from this", "write the Instagram
post") and it does the work on your computer.

**Keep the editor you already use.** Export from CapCut, Opus Clip, Descript or your phone as
usual, then hand the file to Claude: `/post-kit` writes the post for every platform, captions
come out as an `.srt` you can import anywhere, and `/make-shorts` finds extra clips in videos you
have already posted. Use the editing commands only when they save you time.

**What stays on your computer:** the video and audio files. Cutting, captioning and exporting all
run locally with ffmpeg; nothing is uploaded to a video service. **What Claude sees:** the text
of your captions or transcript and the notes you give it, because that is how it writes your
posts and picks your best moments. Treat it like any other message you send to Claude.

## What it does

| You say | It does |
|---|---|
| "Help me record a video" | Writes the brief and slides with you, sets up OBS scenes for camera, slides and screen, runs a presenter with your notes that switches scenes and records, cuts the takes you mark as fluffed, and writes YouTube chapters |
| "Clean up this video" | Removes long pauses (jump cuts), evens out the volume, keeps your original safe |
| "Add captions" | Transcribes your speech locally, lets you fix names, burns in bold readable captions |
| "Make it vertical for Reels" | Reframes to 9:16 and exports at the right size and loudness for Reels, TikTok, Shorts, LinkedIn or X |
| "Turn this into shorts" | Finds the strongest 15–60 second moments, asks which you like, then cuts, captions and exports each one |
| "Write the posts" | Hook, caption, hashtags, alt text and a posting checklist for each platform, in your voice |
| "Plan my week" | A simple content calendar from one long video, plus a 15-minute Friday review |

## Set up once (10 minutes)

1. **Install ffmpeg**, the free video engine it uses.
   - Windows: open Terminal and run `winget install Gyan.FFmpeg`
   - Mac: install [Homebrew](https://brew.sh), then run `brew install ffmpeg whisper-cpp` (the second one powers captions)
   - Linux: `sudo apt install ffmpeg`, plus [whisper.cpp](https://github.com/ggml-org/whisper.cpp) for captions
2. **Add the plugin in Claude Code:**
   ```
   /plugin marketplace add frankxai/gencreator-skills
   /plugin install video-social-studio@gencreator-skills
   ```
3. **Say hi:** open a folder with your videos and type `/edit-video`. The first thing it does is
   check your setup and tell you, in plain words, if anything is missing.

The first time you ask for captions it offers to download a speech model once (about 150 MB).

**Using Codex, Gemini CLI, Cursor or another agent?** The skills work there too. They share one
engine, `video-engine`, so install it with the ones you want:

```
npx skills add frankxai/gencreator-skills -s video-engine -s video-edit -s captions -s shorts-from-long -s platform-specs -s social-post-kit
```

The slash commands and the video-editor agent are Claude Code only; in other agents, describe
what you want.

**Using Claude Desktop chat instead of Claude Code?** Installing the plugin in Claude Code does
not add it to Desktop chat; the two have separate tool settings. The plugin ships a small local
tool server (`mcp/server.mjs`) you can add to Claude Desktop yourself, under Settings, Developer,
local tool servers (command `node`, argument: the full path to `mcp/server.mjs`). Then ask "check
my video setup" to confirm it works.

## Commands

- `/record-video` to plan and record an episode with slides and OBS
- `/edit-video` for everyday edits
- `/make-shorts` to turn one long video into several shorts
- `/post-kit` for per-platform post copy
- `/plan-week` for the week's content plan

You can also just describe what you want; you don't need the commands.

## What it runs and connects to

- **Runs:** `ffmpeg` and `ffprobe` on your computer, plus `whisper-cli` (whisper.cpp) for
  captions when your ffmpeg has no built-in captioning. The plugin's own code is two readable
  Node.js files, `skills/video-engine/scripts/vid.mjs` and the tool server `mcp/server.mjs`, each
  with a test file.
  Nothing is minified and nothing is installed from a package registry.
- **For recording:** OBS Studio (free, installed by you), driven by
  `skills/studio-session/scripts/studio.mjs` through OBS's built-in WebSocket on your own computer.
  The presenter page is served on `127.0.0.1` only. `studio.mjs obs --install` adds a Studio scene
  collection and profile to OBS, turns on its WebSocket with a new password stored as the
  `OBS_WS_PASSWORD` user variable, and leaves every existing OBS setting alone.
- **Connects to:** one place, once, and only after you say yes: the speech model for captions is
  downloaded from `huggingface.co/ggerganov/whisper.cpp` into `~/.cache/video-social-studio/`.
  Nothing else goes over the network.
- **Sends:** nothing. Your videos, transcripts and posts stay on your computer. It never posts to
  a social account; you copy the post text and upload the video yourself.

## Good to know

- Every edit is saved as a new file in an `edited/` folder. Your original is never changed, and
  an earlier edit or a caption file you corrected is never replaced unless you say so.
- Captions are clean static text (bold, clean or minimal), not word-by-word animated captions.
- Reframing is a centered crop or a blurred-background fit. It does not track your face yet, so
  keep yourself near the middle of the frame when filming for vertical.
- It never promises reach or invents numbers. Posting times are suggestions to test, not rules.

Part of [GenCreator Skills](https://github.com/frankxai/gencreator-skills) by GenCreator.
