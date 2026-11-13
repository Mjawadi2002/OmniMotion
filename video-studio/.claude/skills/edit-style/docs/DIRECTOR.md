# Director workflow (how Claude edits raw footage in the reference style)

Reference styles (the ONLY inspiration): refs 4 and 5 (light "paper" look, `--palette personal`) and ref 6 (dark navy "tech review" look, `--palette tech`, the one used most for Shorts / Reels / TikTok). Never copy their footage, music or sounds; only the design language.

## Folders (workspace `editing/`)
- `footage/` raw talking-head video (one clip per job), `input/` optional extras, `output/` deliverables, `references/` the three reference videos.
- In `input/`: videos (extra footage / b-roll to cut to), images (logos, screenshots), audio named `music-*` / `voiceover-*`, transcripts (`.srt/.vtt/.json` used as is, `.txt` is aligned to the speech). Say in chat what each file is for.

## Steps Claude follows
1. `node scripts/director.mjs --ingest-only` lists footage + inputs.
2. `node scripts/director.mjs --footage <clip> --prepare --cut-silence --match-source` transcribes (ElevenLabs Scribe, mixed Tunisian / French / English; cached), cuts silences only (pauses over ~0.35 s become ~0.12 s, never a word), prints the readable transcript with timestamps.
3. **Story analysis** (Claude, by reading the transcript): topic, hook, claims, numbers, named tools / places / people, lists, steps, before / after, CTA.
4. **Asset plan** (`<job>/assets_plan.json`, see below): decide which logos, screenshots and photos tell this story; they are fetched with their licences recorded.
5. **Edit plan** (`<job>/edit_plan.json`, schema in `PLAN_SCHEMA.md`): beats anchored to spoken WORDS (so they survive cuts).
6. `node scripts/director.mjs --footage <clip> --palette tech --plan <plan> --match-source` renders, mixes to -14 LUFS (true peak under -1 dBTP), writes `output/<name>_edited.mp4` and `<name>_edit_report.md`.
7. QC on real frames (hook, each beat, captions in Arabic / French / English, end), fix, re-render.

## Story to graphic: decision table
| Spoken content | Graphic (kind) | Asset |
|---|---|---|
| Hook, big claim, one key word | `slam` (serif caps, optional strike) over the head | none |
| Product / tool / brand name | `chip` (logo + name + price) or `image` window with the logo | `logo` (Simple Icons) or provided image |
| Website, app, repo, page shown | `image` window in browser chrome, `zoom`, amber `box` overlay on the part being discussed | `screenshot` of the public URL or provided image |
| Place, person, object | `image` window | `photo` (Commons, CC0 / PD / CC BY with attribution) or provided |
| Number, price, count | `stats` row (count-up, tone amber / white / green) or `stat` overlay | none |
| List of 2 to 5 things | `pills` stack, one pill per spoken item, appears on the word | none |
| Rating "x out of 10" | `ring` | none |
| Warning, catch, but | `sting` (caution tape) | none |
| Comment-keyword CTA | `cta` input box (slot `full`, centred over the head) | none |
| Before / after, A vs B | `compare` or two `chip`s with strike | none |
| Nothing visual to add | stay on the head, captions only (head visible about half of the video) | none |

Rules: graphic text only from the speech or provided files (validator + fact check), one idea per beat, a window never longer than ~2.5 s, change something on screen every ~2.5 s, no invented numbers, no copying reference visuals.

## Assets (`scripts/assets.mjs`)
`assets_plan.json` entries: `logo {slug}` (Simple Icons, CC0 set), `photo {query, orientation}` (Wikimedia Commons, only CC0 / public domain / CC BY / CC BY-SA, author + licence stored), `screenshot {url}` (public page, headless Chrome), `file {from}`. Results are cached in the job folder, listed in `assets_manifest.json` and in the edit report. Reference them in the plan by id (`"src": "athens"`).

## Brand (all in `style.config.json`)
- `tech` palette: navy `#060A1C`, panel `#101C4A`, electric blue `#3B5BFF` (progress bar, grid), amber `#FFD23F` (emphasis words, numbers, highlight boxes), white text, green `#35D07F`, red `#FF4D4D` (strikes). Light family `personal`: paper `#E6EDF4`, blue `#0284FF`, ink `#161616`.
- Type: Inter 800 captions / headings, Playfair Display (caps for slams, italic for entities in the light family), JetBrains Mono for UI text, IBM Plex Sans Arabic for Arabic. Latin words inside Arabic lines stay left-to-right.
- Captions: 1 to 3 words per chunk, words appear as spoken, emphasis (names, numbers, foreign terms) in amber; bottom over the head, top while a window is on screen.
- Layouts: `techHead` (head full screen), `techDemo` (no head, caption top, window, lower slot for pills / stats), `lightHead`, `lightSection`, `darkDemo`.
- Brand tag: `brandTag` in the plan (small caps top centre). Empty until the user gives their handle.

## Automatic parts (when the plan has no entry for them)
- Punch-in / zoom-out at every silence seam (`director.zoom` tokens), authored `zooms` in the plan for emphasis moments.
- Layout transitions rotate whip, flash, glitch, punch (`director.transitions.kinds`); set `transition` on a graphic or layout to force one.
- Baseline planner (used if no `edit_plan.json`): hook slam on the first strong term, count-up stats for spoken numbers, pill stack for comma lists of 3 to 5 items, a window card for capitalised names. Claude's own plan from the story analysis is preferred.
- Inputs: `input/` videos are copied as b-roll (use `kind: video` with the file name), images become assets by file name, `music-*` audio replaces the bed, `voiceover-*` becomes the master timeline (footage plays muted under it; silence cuts apply to the voice-over). With no footage at all, a voice-over plus images works (audio-only job).

## Motion graphics
- Every edit uses real animated 2D and 3D elements (`kind: "motion"`: clock, timeline, growth, rocket, target, bulb, bubbles, network, layers, cube, orbit, coin) where the story has something to illustrate: time, money, growth, tools, a goal, a conversation, a process. About one per 12 s of speech, scenes varied, in the colours of the look, anchored on the spoken words, above the speaker and clear of the captions. Plain text cards are for emphasis, not a substitute. Full guide: MOTION_GRAPHICS.md.

## Polish layer
- Fonts: `heading` kind (Inter 800, Cairo 800 for Arabic headings), `numeric` kind (Space Grotesk, tabular figures) for numbers; captions keep their own style.
- Depth: glass panels, glow behind numbers, slow grid drift, colour grade + soft tint + vignette on the head video per palette (`director.grade`).
- Transitions: whip, flash, glitch, punch, zoomthrough, slide. Sound events per graphic kind (`director.sfx`): hit on slams, thud on stings, tick per pill / number, ding on the ring. Sound is designed on every render (kit per look, curated and varied, levelled against the measured voice): see SOUND_DESIGN.md. Give the sounds clear moments to land on and do not open several windows within half a second; steer it with the optional top-level `sfx` of the plan.
- Pop-out head (light layouts): run with `--cutout`. `scripts/matte.py` cuts the person out locally with the U2-Net human model in `video-studio/models/` (about 0.6 s per frame, cached); the head rises above the card by `director.layouts.lightHead.head.pop`.
- Not done: beat-synced cuts (needs beat detection on the music).

## Vlog mode (narration mp3 + a pile of clips)
`node scripts/director.mjs --vlog --prepare --cut-silence --palette tech` then `... --vlog --plan edit_plan.json --palette tech`.
- Put the narration (mp3 / any audio) and every clip in `footage/` or `input/`. The narration is the master timeline (silences cut), the clips are cut to it full screen. Name a music file `music-...` if you also give one.
- `--prepare` makes a light working copy of each clip and a contact sheet (`<job>/contact/<clip>.png`, evenly spaced frames, times listed). Claude looks at every sheet, understands what each clip shows, and matches clips to what the voice says.
- Plan `shots`: `[{clip, from, srcStartMs, speed, fit, posX, zoom:[z0,z1], fx, ambientDb}]`. `clip` = clip id or file name, `from` = anchor on a spoken word, `fx` = `cut`, `zoom`, `whip`, `flash`, `glitch`, `punch`, `zoomthrough`, `slide`. Without `shots` an automatic baseline cuts every 2 to 3.5 s, clips in the order they were filmed. Each shot runs until the next starts; clip too short = slowed to at least 0.6x.
- Look: slow push-in or out on every shot, 180 ms crossfade, warm grade (`director.grade.vlog`), clip sound kept at `director.vlog.ambientDb` (-26 dB) under the voice, music ducking under speech, soft shade under the captions. Landscape clips fill the portrait frame with a slow pan (`fit: "cover"`, `posX: [0.3, 0.7]`) or sit over a blurred copy (`fit: "blur"`).
- Overlays work as usual with `mode: "vlog"`: `tag` (small glass pill, slot `top`, for place / time like "Morning"), `slam`, `stats`, `quote2`, `pills`. Text must be spoken or in `allowText`.
- Output is 1080x1920, 30 fps.

## Custom looks
`director.mjs --look <look.json>`: `{label, family: tech|light, roles: {...hex}, fonts: {display, heading, body, serif, numeric, arabic, arabicHeading}, grade: {tint, tintAlpha, contrast, saturate, brightness, vignette}}`. Roles and fonts are laid over the base palette of the family; the plan carries them as `plan.look` so the composition renders with them. Fonts must be in `fonts.registry` (26 families; add more with `npm install @fontsource/<name>` then `node scripts/register-fonts.mjs`).

## Known limits
The pop-out needs `--cutout` (slow, local model). 9:16 is native; other ratios crop to it. Logos need a Simple Icons slug or a provided image. Screenshots only for public pages.
