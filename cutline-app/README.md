# OmniMotion

Desktop app (Electron, React, Remotion) for the edit-style engine in `../video-studio`. Two modes: **Talking head** (one raw clip, Tech or Light look, optional pop-out head) and **Vlog** (a voice recording plus clips cut full screen to it).

## Run

Needs Node 20+, FFmpeg on the PATH, and the engine folder (`../video-studio`, changeable in Settings).

```bash
npm install
npm start        # builds the interface and opens the app
npm run dev      # hot reload: Vite on :5273 plus Electron
npm run dist     # unpacked Windows build in dist/ (not yet tried)
```

## Flow

1. **Projects**: New project, choose mode and look.
2. **Media**: drop footage, voice-over or narration, music, images, logos, extra video, a transcript, and reference videos. Files are copied into the project folder (`footage/`, `input/`, `output/`, `references/`); originals are never changed.
3. **Story**: transcribe (ElevenLabs key, or Whisper on this computer) and cut silences. Shows the transcript and, for vlogs, a contact sheet per clip.
4. **Plan**: automatic plan, **Plan with Claude**, or edit by hand. Every graphic is anchored to a word you say (click a word to pick it). A live Remotion preview plays the same composition that is rendered.
5. **Edit**: type a change in plain words ("remove the last graphic", "zoom in when I say Greece", "fix this caption word"). Claude revises the plan, the preview rebuilds, and every change has an Undo.
6. **Render**: renders, mixes to -14 LUFS (true peak under -1 dBTP), writes the video and an edit report to the project's `output/`.

## Looks

A look is colours, fonts and a picture grade on top of one of two layout families (dark stage or paper stage). Two are built in; make as many as you like in **Looks**: from a reference video (Claude studies frames and the measured colours), from a description in words, or from scratch. Every look is shown as a real preview of the composition, and 26 font families are available. A look is passed to the engine with `--look <file>`. New layouts or motion styles are not part of a look; they need engine code.

## Connections (Settings)

- **Transcription**: ElevenLabs (key kept in the OS secure storage) or Whisper (local, offline). If no ElevenLabs key exists, the engine falls back to Whisper.
- **Claude**: *Claude account* runs Claude Code signed in with the user's own Claude account (no key to manage); *API key* uses an Anthropic key; *Off* disables AI planning. There is no OAuth sign-in to claude.ai for third-party apps, so the account option goes through Claude Code.

## Layout

```
electron/   main process: IPC, project store, engine runner, media server, AI planning, reference library
src/        interface: screens, design tokens (styles/tokens.css), plan model, Remotion preview
src/engine  preview-side font loader (the composition itself is imported from the engine)
scripts/    dev.mjs, shot.mjs (capture screenshots of the built app for visual checks)
```

## Design

Tokens in `src/styles/tokens.css` (dark and light, semantic names only). Phosphor icons (one set, regular weight), Inter for UI, Space Grotesk for numbers, JetBrains Mono for timecodes, IBM Plex Sans Arabic for Arabic text. Accent colours match the editing brand: electric blue for actions, amber only for the current step. No emojis.

## Security

The window talks to the system only through a small preload bridge (context isolation on, sandbox on). Media reaches the window from a local server bound to 127.0.0.1 with a per-launch token, limited to the project, engine and app-data folders. API keys are encrypted with the OS keychain and never written into a project.
