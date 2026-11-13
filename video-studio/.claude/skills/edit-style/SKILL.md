---
name: edit-style
description: Turn a talking-head video, an audio clip or a plain script into a short-form vertical video edited in a reverse-engineered house style — one-line word-highlight captions, auto-chosen graphics (counters, keyword cards, checklists, link/logo cards, CTA pill), jump-cut punch-ins, hook title, quiet UI sounds, -14 LUFS — with two switchable brand palettes ("personal" or "tawelti"). Use when the user asks to edit, caption, "style", or package a new clip like the reference videos, in any language including Arabic (RTL) and any aspect ratio.
---

> **Current workflow = the Director.** For raw footage (and optional `input/` extras) use `scripts/director.mjs` and read `docs/DIRECTOR.md` (story analysis, asset plan, edit plan, decision table) and `docs/PLAN_SCHEMA.md`. Palettes: `tech` (dark, reference 6, default for Shorts / Reels / TikTok) and `personal` (light, references 4 and 5). The older `run.mjs` flow below is the automatic baseline; the animated story film uses `--palette personalAurora`.

# edit-style

One tokens file (`style.config.json`) drives everything. Components and scripts contain no colors, fonts, sizes, positions, durations or text of their own.

## Input / output contract

**Input**
| Flag | Meaning |
|---|---|
| `--input <file>` (required) | video (`.mp4/.mov/...`), audio (`.wav/.mp3/...`) or script (`.txt/.md`) |
| `--palette personal\|tawelti` | brand palette (default = `palette` in the tokens file). Palettes are never mixed |
| `--assets <dir>` | optional folder: images named after a word the speaker says (`notion.png`) become logo cards; `music.*` becomes an optional ducked music bed (only if `sound.music.enabled`) |
| `--lang auto\|ar\|en\|fr\|...` | Whisper language (default auto) |
| `--aspect 9:16\|16:9\|1:1\|4:5`, `--short-side 1080` | output size |
| `--stt elevenlabs\|whisper` | speech-to-text engine (default `elevenlabs`, key in `video-studio/.env`, falls back to local Whisper if no key) |
| `--music on\|off\|<file>` | music bed: generated original bed (default from tokens), none, or your own file |
| `--transcript <file>` | skip transcription: our words JSON, ElevenLabs/whisper.cpp JSON or `.srt` |
| `--out`, `--name`, `--frames a-b`, `--plan-only`, `--no-loudnorm` | misc |

**Output**: `out/<name>-<palette>.mp4` (H.264 + AAC, loudness -14 LUFS / -1 dBTP), plus `.edit-jobs/<name>-<palette>/plan.json` (the full edit decision list) and `transcript.words.json`.

## Workflow

1. **Probe** the input (ffprobe): video / audio / script, duration.
2. **Transcribe** with Whisper.cpp through `@remotion/install-whisper-cpp` (model/version from tokens `transcription`), word-level timestamps. A script input gets synthetic timing (`transcription.scriptMode`).
3. **Plan** (`scripts/lib/plan.mjs`, pure function of transcript + tokens + assets):
   - caption pages (`captions.paging`), emphasis words (numbers, foreign-script words, CAPS),
   - hook title from the first sentence (`hook`),
   - section title cards from spread-out spoken ordinals, `demo` layout (blurred head backdrop) around screenshots/link cards, rotating transition variants,
   - graphics chosen from the **decision table** in `visuals.rules` (CTA, URL, enumeration, number, asset name, foreign term; fallback keyword card for idle gaps, head-only beats every Nth gap),
   - layout timeline (default layout of the palette, `full` for head-only beats and for the CTA ending),
   - shots: digital jump-cut punch-ins snapped to pauses (`pacing`),
   - sound events from `sound.rules`.
4. **Synthesise SFX and the music bed** from `sound.sfx` / `sound.music.generator` (`scripts/make-sfx.mjs`, `scripts/make-music.mjs`), never from reference audio.
5. **Render** with Remotion (`remotion/index.ts`, composition `Main`, props = plan.json, public dir = the job folder).
6. **Loudness-normalise** with ffmpeg `loudnorm`.

Run:

```bash
node .claude/skills/edit-style/scripts/run.mjs --input <clip> --palette personal --assets <folder>
node .claude/skills/edit-style/scripts/run.mjs --input <clip> --palette tawelti
node .claude/skills/edit-style/scripts/verify-contrast.mjs        # WCAG audit of both palettes
npx remotion studio .claude/skills/edit-style/remotion/index.ts   # live preview (Main composition)
```


## Motion graphics generated from the speech (v3)

The planner reads the transcript and generates real, animated, palette-driven graphics (all token-driven, RTL-aware, English/French/Arabic):

| Spoken content | Component | Animation |
|---|---|---|
| Numbers | `StatCounter` | count-up, glow / hard shadow per palette |
| Percentages ("85%") | `PercentRing` | gradient ring fills to the value while the number counts |
| Lists / "first, second, third" within a few seconds / comma lists | `Checklist` -> `FlowSteps` (3+ items) | numbered nodes pop in as each item is spoken, connecting line draws between them |
| Spread-out ordinals ("the first is X", "the second is Y") | `SectionTitle` + `StepBadge` (n/N pill) | typed "Number N", flash cut, riser + hit sounds, counter pill pops each step |
| Quoted phrases and idle gaps | `KeyPhrase` | marker sweep behind the phrase, wavy underline draws, arrow draws itself |
| Foreign terms, rare words | `KeywordCard` | bar draws, arrow accent, rotating transition variants |
| URLs, calls to action | `LinkCard`, `CtaPill` | pop with spring, CTA pill with chat icon |
| Asset names (logos, screenshots) | `ImageCard` in a head-less `demo` layout (blurred backdrop) | zoom-blur in |

Sounds are **real CC0 samples** (`assets/cc0/sfx`, music in `assets/cc0/music`, sources in `assets/cc0/THIRD_PARTY.md`) mapped per event in `sound.library`; the synthesised sounds remain as fallbacks. Music default is a CC0 bed per palette (`sound.music.library`), ducked under speech; `--music-source generated` uses the original synthesised bed, `--music off` none.

Web export: `node scripts/export-design-system.mjs tawelti` writes `design-system/tawelti.css|md` so the web skills (ui-ux-pro-max, taste-skill) use the same palette roles.

## Where to change what

| To change | Edit (only) |
|---|---|
| A brand color | `palettes.<name>.roles.<role>` — restyles every element |
| Switch palette | `--palette` flag or top-level `palette` |
| Outline / shadow / radii / font pairing per palette | `presets.soft` / `presets.chunky` |
| Fonts available | `fonts.registry` (+ `npm i @fontsource/<name>`) |
| Positions of head / graphics / captions | `layouts.<orientation>.<layout>` (fractions of the frame) |
| Caption size, paging, states | `captions` |
| Animation durations / easing | `animations` (ms, bezier) |
| Decision table (what graphic for what speech) | `visuals.rules`, `lexicons`, `patterns` |
| Pacing (shot length, punch-in scales) | `pacing` |
| Sounds and their levels | `sound.sfx`, `sound.rules` |

## Rules for edits to this skill

- **No hardcoding.** No raw hex, font name, pixel size, duration, timestamp or user-facing text inside `remotion/` or `scripts/`. Add a token instead. `grep -rnE "#[0-9a-fA-F]{6}" remotion scripts` must stay empty.
- Roles, never colors: components ask the theme for `accent`, `captionBg`, `outline`...
- Verify contrast after any palette edit: `verify-contrast.mjs` (auto-fixes non-brand text roles, fails on brand roles).
- Layout values are fractions of width/height; sizes are fractions of the short side, so any aspect ratio works. Only 9:16 was measured; 1:1 and 16:9 are derived.
- RTL: direction is detected from the dominant script of the transcript (`fonts.scripts`, `fonts.rtlScripts`).

## Known limits

- No subject matting (the "pop-out" hair above the card in ref1).
- Graphics are generic components, not bespoke app mock-ups.
- Whisper `small` is imperfect on Tunisian dialect; pass `--transcript` with a corrected file when quality matters.
- Evidence and confidence for every number: `EDITING_STYLE_GUIDE.md`.
