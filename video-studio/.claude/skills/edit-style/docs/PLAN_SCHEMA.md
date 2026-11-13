# edit_plan.json

Top-level keys: `brandTag` (small caps tag, top centre), `allowText` (extra on-screen words that are translations of spoken ones), `captionEmphasis` (extra words to colour), `defaultMode` (`techHead` or `lightHead`, used between graphics), `music` (false = no bed), `titles`, `sections`, `graphics`.

A graphic: `{id, mode, slot, kind, from, to, title, zoom, large, badge:{n,total}, content, overlays}`.

Anchors (`from`, `to`, `at`, `until`): `"start"`, `"end"`, `{"ms": 1234}`, `{"at": "spoken words", "n": 2, "end": true, "lead": -200}` (n-th occurrence of the words, `end` = end of the phrase, `lead` in ms), `{"after": 2400}` (relative to the beat start).

Modes: `techHead`, `techDemo`, `lightHead`, `lightSection`, `darkDemo`, `fullHead`.
Slots: `window` (default), `main`, `lower`, `stats`, `top`, `mid`, `full`, `tile`.

Titles: `{from, to, line1, highlight, stickers:[...]}` (light family). Sections: `{from, line1, box}`.

Kinds and `content`:
- `image` / `video`: `{src, fit, startAtMs}` (src = asset id or input file name)
- `browser`: `{heading, selection, selectAt, lines, button, kicker, dark}` (mock page built only from spoken words)
- `terminal`: `{lines:[{type:"cmd|out", text, at}], prompt}`
- `list`: `{rows:[{name, value, strikeAt}]}`; `logos`: `{tiles:[{name, image, strikeAt, bg}]}` (`bg`: tile colour, for white or light logos); `steps`: `{items:[{text, at}]}`
- `pills`: `{items:[{text, icon, at}]}` (icons: check, bolt, star, spark, cash, coin, face, cursor)
- `stats`: `{items:[{value, label, tone, at}]}` (tone amber, white, green, red, blue); `stat`: `{value, label, prefix, suffix}`
- `chip`: `{name, price, sub, strike, strikeAt}`; `slam`: `{text, tone, strike, strikeAt}` (tone blue, amber, ink)
- `flow`: `{steps:[{text, at}]}` vertical timeline with a line that draws itself
- `split`: `{a:{label,text}, b:{label,text}, bAt, strikeAt, same}` before / after panels (`same: true`: both are true together, nothing is struck out)
- `chart`: `{type:"bars|line", data:[{label,value,display}], highlight}` (use only numbers the speaker says)
- `quote2`: `{text}` glass quote with a big quote mark; `place`: `{name}` map pin for a spoken place (abstract map, no real map data)
- `sting`: `{text}`; `ring`: `{value, of, label}`; `cta`: `{keyword, line}`; `compare`: `{leftLabel, leftValue, rightLabel, rightValue, rightAt}`; `quote`: `{text}`

Overlays (positions are fractions of the content area): `box {x,y,w,h,at}` amber highlight, `callout` red ring, `pill {text,tone,at}`, `stat {value,label,at}`, `sticker {name,at}`.

Fact check: every visible word must be in the transcript, in `allowText`, or come from a provided file; digits are free. `--strict` fails the run otherwise.

Extra per-graphic fields: `tone` (`money`, `warn`, `good`, `cool`: swaps the accent colour for that graphic), `device` (`phone` draws a phone frame, slot `phone`), content `pan` (`down`, `up`: a tall screenshot scrolls) and `zoom` (slow push-in), `support` on `stats` (small line under the numbers). Slots added: `phone`, `wide`.
Top level: `grade` (name of a colour grade in `director.grade`, default = palette), `zooms`, `autoZoom`, `cutout` is switched on from the command line (`--cutout`).

Vlog plans (`--vlog`): top-level `defaultMode: "vlog"`, `grade` (default `vlog`), `clipOrder` (clip ids for the automatic baseline), and `shots`: `[{clip, from, srcStartMs, speed, fit, posX, zoom, fx, ambientDb}]` (see DIRECTOR.md). Graphics use `mode: "vlog"` with slots `top`, `mid`, `lower`, `full`, `main`; extra kind `tag`: `{text, tone}`.

Editor corrections (written by the Cutline app's Edit mode): `wordFixes`: `{"<word index>": "correct word"}` replaces a mis-heard word everywhere (captions, anchors); indexes are positions in `transcript.words.json` (`srcIdx`). `cuts`: `[{"fromWord": i, "toWord": j}]` removes that stretch of speech (word indexes, inclusive) from the video; only for parts the user explicitly asked to remove.

Optional top-level `sfx`: `{"kit": "tech" | "soft" | "punchy" | "minimal", "density": "minimal" | "normal" | "rich"}`. Leave it out unless the story needs it: by default the kit follows the look and the density is normal. Sound effects are placed automatically on the visuals; see SOUND_DESIGN.md.

Motion graphics: `{"kind": "motion", "from": ..., "to": ..., "content": {"scene": "clock|timeline|growth|rocket|target|bulb|bubbles|network|layers|cube|orbit|coin", "label"?, "value"?, "unit"?, "prefix"?, "suffix"?, "symbol"?, "items"?: [{"label", "at"?}]}}`. Animated 2D / 3D elements in the look's colours, placed above the speaker and clear of the captions. Use them in every edit, chosen by what the words mean; the full guide and the rules are in MOTION_GRAPHICS.md.
