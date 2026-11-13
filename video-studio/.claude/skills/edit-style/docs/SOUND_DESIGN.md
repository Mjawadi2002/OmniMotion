# Sound design

Every edit gets sound effects, and they are designed, not sprinkled. The engine does the work (scripts/lib/sfx.mjs, settings in `sfx.config.json`); the plan only has to give it good visual moments.

## What happens on every render

1. **Find the moments.** Each visual event proposes a sound: a window opening, a number or pill popping in, a checklist item, an item struck out, a section title, a layout change, a transition between clips (vlog), and the occasional emphasized word. Plain cuts get nothing.
2. **Choose the kit for the look.** The kit sets the character of the sounds:
   - `tech`: crisp and digital (clicks, pops, fast swishes). Default for dark / tech looks.
   - `soft`: warm and gentle (soft pops, airy slides, bell-like accents). Default for light / personal looks.
   - `punchy`: bigger whooshes and hits, for bold, fast looks.
   - `minimal`: very few, quiet accents.
   Order of authority: the user's `--sfx` choice, the look's own `sfx` setting, the plan's `sfx`, then the palette of the look.
3. **Keep the strongest, spread them out.** Never two sounds closer than the gap (500 ms normally); when two collide the stronger one stays. Never more than the density allows per minute. "Less is better than cluttered": a moment that does not need a sound is left empty, and the report says why.
4. **Vary.** The same sound never plays twice in a row with the same sample (pop, select, hit, whoosh, swish and tick have alternates).
5. **Listen.** Every sample that is used is analysed: peak, clipping, silent start, silent tail, DC offset. A silent start is skipped so the audible start lands exactly on the event's frame; a silent tail is cut and the end is faded so nothing clicks. `node scripts/sfx-audit.mjs` runs the same analysis over the whole library, and over any new file before it is added.
6. **Level against the voice.** The voice's true peak is measured (from the voice-over, or the footage). Each effect's peak is placed about 8 dB under it (adjusted per sound type: sustained whooshes lower than clicks) and never closer than 6 dB. Footage recorded quietly gets quieter effects; the voice is always on top. The music bed is levelled the same way (see the music section of the director).
7. **Report.** The edit report lists every sound placed (time, why, sound, sample, license, peak level against the voice) and every moment left out with the reason.

## Density
- `minimal`: only the strong sounds (hits, whooshes, transitions, pops); no ticks and no emphasis sounds.
- `normal`: everything, with an emphasis tick at most every 9 s.
- `rich`: more accents, an emphasis tick every 4.5 s.

## Steering it
- Command line: `--sfx off | minimal | normal | rich | tech | soft | punchy` (a kit name picks the kit, a density name picks the density).
- A look (`look.json`): `"sfx": {"kit": "soft", "density": "minimal", "gainDb": -1}`. The look study sets it from the feel of a reference video.
- The plan: `"sfx": {"kit": "...", "density": "..."}` at the top level. Use it only when the story needs it (a calm, serious piece: `minimal`; a fast list-style piece: `rich`).

## Writing a plan that sounds good
- Sound follows the visuals, so give the sounds something to land on: one clear window, number or title per idea, anchored to the spoken word, not three things opening within half a second (only the strongest of those would get a sound).
- Do not stack a graphic exactly on a section title or a slam: the stronger sound wins and the other is silent.
- In vlogs, vary the transitions between clips (`whip`, `slide`, `punch`, `zoomthrough`, `flash`, `glitch`); each has its own sound, and plain cuts stay quiet.

## Sources and licenses
Only CC0 / MIT / Apache-2.0 samples are used, each listed in `assets/cc0/THIRD_PARTY.md` (Kenney, OpenGameArt and sounds synthesised for the library). Where no real sample exists for a sound type, the engine synthesises one from the numbers in `style.config.json` (`sound.sfx`). To add a sample: run `node scripts/sfx-audit.mjs <file>`, fix what it reports, put the file in `assets/cc0/sfx/`, add a row to THIRD_PARTY.md with its license, then reference it in `style.config.json` (`sound.library`) or as an alternate in `sfx.config.json` (`variants`).

## Music
A track the user attaches is always used (it wins over the built-in bed). The engine listens to it (scripts/lib/musicPick.mjs): tempo, beat grid, and the energy of every bar. It cuts out the strongest stretch that fits the reel (the chorus or drop, not the intro), starting on a downbeat, and sets the plan's `musicBpm` so the beat pulse lines up. The cut is then levelled against the measured voice and drops a little further while someone speaks. Levels: `--music-level subtle | balanced | prominent` (default: balanced for the user's own track, subtle for the built-in bed); `--music-start <seconds>` forces the start. The report says which part of the track was used and why. Plans do not need to say anything about music.
