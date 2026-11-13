# edit-style (Remotion skill)

Restyles a new clip into the reverse-engineered house style. Full spec: `SKILL.md`. Evidence: `../../../../EDITING_STYLE_GUIDE.md`.

## Quick start (from the `video-studio` folder)

```bash
# personal brand (cyan / near-black), talking head or educational
node .claude/skills/edit-style/scripts/run.mjs --input "C:/path/clip.mp4" --palette personal --assets "C:/path/logos"

# Tawelti product brand (deep green / orange / cream), same input, no other change
node .claude/skills/edit-style/scripts/run.mjs --input "C:/path/clip.mp4" --palette tawelti
```

Results land in `out/clip-personal.mp4` and `out/clip-tawelti.mp4`. The edit decision list is in `.edit-jobs/<name>-<palette>/plan.json`.

## More examples

```bash
# audio only (graphics + captions on a graphic-only layout)
node .claude/skills/edit-style/scripts/run.mjs --input voice.wav --palette tawelti --lang ar

# a plain script, no audio (synthetic timing)
node .claude/skills/edit-style/scripts/run.mjs --input script.txt --palette personal --lang en

# 16:9 and 1:1 (derived layouts)
node .claude/skills/edit-style/scripts/run.mjs --input clip.mp4 --palette personal --aspect 16:9
node .claude/skills/edit-style/scripts/run.mjs --input clip.mp4 --palette tawelti --aspect 1:1 --short-side 1080

# reuse a corrected transcript, plan only (no render), quick 5-second preview
node .claude/skills/edit-style/scripts/run.mjs --input clip.mp4 --transcript fixed.srt --plan-only
node .claude/skills/edit-style/scripts/run.mjs --input clip.mp4 --palette personal --frames 0-149 --short-side 720
```

## Requirements (already installed in this project)

Node 18+, FFmpeg on PATH, Whisper.cpp + a model in `whisper.cpp/` (`small` multilingual), `@fontsource/{poppins,cairo,outfit,inter,jetbrains-mono}` for offline fonts. Remotion downloads its own headless Chrome on first render.

## Layout of the skill

```
style.config.json      all style values (palettes, presets, layouts, captions, animations, rules, sounds, pacing)
remotion/              components: Stage, Head, Captions, Graphics, Effects, Main, Root, core, fonts
scripts/run.mjs        CLI pipeline
scripts/lib/           transcribe.mjs, plan.mjs
scripts/make-sfx.mjs   synthesises tick / ding / whoosh / pop from the tokens
scripts/verify-contrast.mjs   WCAG audit of both palettes
shared/                color.js, text.js (used by scripts and by the Remotion bundle)
```

## Adding a palette

Copy a block in `palettes`, set `preset` (`soft` or `chunky`) and fill every role. Run `verify-contrast.mjs`. Nothing else changes.

## Transcription with ElevenLabs Scribe (optional)

Better accuracy on dialects than the local Whisper model. The 16 kHz mono audio track is uploaded to ElevenLabs.
Put the key in `video-studio/.env` (git-ignored) as `ELEVENLABS_API_KEY=...`, or export it in the shell, then:

```bash
node .claude/skills/edit-style/scripts/run.mjs --input clip.mp4 --palette personal --stt elevenlabs
```

The full text is saved to `.edit-jobs/<name>-<palette>/transcript.txt` and the raw response to `transcript.elevenlabs.json`
(reusable later with `--transcript`). Settings (model, granularity) live in `style.config.json -> transcription.providers.elevenlabs`.

## Music, transitions and sound effects (enhancement)

- Transition variants rotate per graphic (`blurFade`, `zoomBlur`, `slideUp`; `flashCut` for section title cards).
- Spoken ordinals ("the first is X ...") become typed "Number N" cards with the topic below; a head-less `demo` layout with a blurred backdrop is used for screenshot/link cards.
- SFX: tick, swish, whoosh, riser, hit, typing, ding, pop (synthesised). Music: original synthesised bed per palette, ducked under speech.

```bash
node .claude/skills/edit-style/scripts/run.mjs --input clip.mp4 --palette tawelti --music off      # no music
node .claude/skills/edit-style/scripts/run.mjs --input clip.mp4 --palette personal --music "C:/music/bed.mp3"   # your own track
```

Tune levels and rules in `style.config.json -> sound` and `animations.swapVariants`.
