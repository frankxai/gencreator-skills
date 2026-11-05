---
name: music-production
description: AI music generation pipeline for creators using Suno AI and compatible tools. Engineers detailed prompts, manages style consistency across tracks, and documents production decisions. Use when creating music for content, brand identity, products, or creative projects.
---

# Music Production

Engineer precise prompts for AI music generation — consistent style, not random output.

## Pipeline

1. **Define** — purpose, mood, audience
2. **Style load** — pull music config from `creator-memory/music.md`
3. **Prompt engineer** — build the Suno (or compatible) prompt
4. **Document** — log output for style consistency

## Music Purpose Framework

Before engineering a prompt, establish intent:
- What transformation should the music facilitate? (energy, focus, relaxation, inspiration)
- Who is the listener, and what state are they in?
- What state should they be in after?
- Use case: background, content underscore, intro/outro, standalone, atmospheric?

## Suno Prompt Formula

```
[Genre/Style], [Tempo], [Key instruments], [Vocal style], [Mood], [Special elements]
```

| Component | Examples |
|-----------|---------|
| Genre/Style | lo-fi hip hop, cinematic orchestral, dark ambient, future bass, neo-soul |
| Tempo | slow, mid-tempo, uptempo, driving, laid-back, pulsing |
| Key instruments | piano, synth pads, acoustic guitar, 808s, strings, brass, choir |
| Vocal style | no vocals, ethereal female vocals, deep narrator, spoken word |
| Mood | melancholic, triumphant, mysterious, uplifting, meditative, euphoric |
| Special elements | layered textures, build and drop, minimal, lush reverb, distorted |

**Example prompts:**

*Focus/productivity:*
```
Lo-fi hip hop, slow mid-tempo, warm piano melodies over dusty drums, mellow bass,
no vocals, nostalgic and focused mood, vinyl crackle, smooth and unobtrusive
```

*Epic cinematic intro:*
```
Cinematic orchestral, building tempo, full strings and brass, choir in final section,
no main vocals, triumphant and expansive, dramatic crescendo, Hollywood film score style
```

*Brand intro jingle (10-20 sec):*
```
Electronic pop, upbeat, bright synth lead, punchy kick, no vocals,
optimistic and forward-moving, modern and clean, memorable 4-bar hook, intro/logo placement
```

## Style Consistency

To maintain consistent sound across tracks:
1. Document successful prompts in `creator-memory/music.md`
2. Note which elements create the desired sound
3. Use same core descriptors across related tracks, vary only mood/energy
4. Mark "anchor tracks" — reference tracks that define the style

**Style anchor format:**
```markdown
## Style Anchor: [Track Name]
- Core genre: [genre]
- Essential elements: [list]
- Avoid: [list]
- Use for: [context]
- Prompt: [full prompt]
```

## Categories for Creators

| Category | Best for | Elements |
|----------|---------|----------|
| Lo-fi study | Productivity content | Warm piano, dusty drums, vinyl |
| Cinematic orchestral | High-production video intros | Strings, brass, choir, building |
| Dark ambient | Introspective content | Drones, reverb, minimal, mysterious |
| Future bass | Energetic tutorials, hype | Synth leads, wobble bass, punchy drums |
| Neo-soul | Lifestyle, warm brand feel | Soulful vocals, jazz chords, groove |
| Minimal electronic | Clean product videos | Sparse, precise, modern, functional |
| Acoustic indie | Personal content | Guitar, soft percussion, intimate |

## Track Documentation

```markdown
## Track: [Title]
- Date: [YYYY-MM-DD]
- Use case: [context]
- Prompt: [full prompt]
- Score (1-10): [rating]
- Keep: [yes/no]
- Notes: [what worked, what didn't]
```

## Output Format

Deliver:
1. **Prompt** — ready to paste into Suno or compatible tool
2. **Purpose alignment** — confirm it fits the use case
3. **Style notes** — what elements drive the desired sound
4. **Variations** — 2 alternative prompts for different energy levels

## Current craft and production integration

Checked 2026-10-01. Use the public [music fundamentals](https://github.com/frankxai/agentic-music-producer-os/blob/18dc9bee02001befb3a2a3bd7747b78f798dff13/docs/MUSIC-FUNDAMENTALS.md), [provider register](https://github.com/frankxai/agentic-music-producer-os/blob/18dc9bee02001befb3a2a3bd7747b78f798dff13/docs/PROVIDER-CAPABILITIES.md) and [factory contract](https://github.com/frankxai/agentic-music-producer-os/blob/18dc9bee02001befb3a2a3bd7747b78f798dff13/docs/MUSIC-FACTORY-CONTRACT.md). They cover harmony/voice leading, groove, motif, prosody, hooks, form, vocals, arrangement, low end, mixing, measured delivery, provenance and durable jobs. Load only the modules needed for this task.

Keep local artist/persona canon, identity, preferences and account entitlements scoped to this project. Shared craft does not assign a singer or overwrite canon. Select the current account-visible Suno model (documented baseline v6); no official public Suno generation API was verified. Lyria, Eleven Music and fal MiniMax Music 3 have separate documented API routes and constraints. A skill or MCP tool is not a connected generation account.

Preserve approved lyrics across adapters. Prepare, authorize/reserve, submit, reconcile, archive, listen, measure, attest rights and stage release separately. Bind receipts to exact contract/asset hashes. Never infer audio quality, measured BPM, playback, rights or publication from a text review or completed job. Unknown paid submissions remain held for reconciliation; no blind rerender.
