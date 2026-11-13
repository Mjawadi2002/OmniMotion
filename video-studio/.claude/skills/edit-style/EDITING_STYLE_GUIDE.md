# Editing style guide (references 4, 5 and 6 only)

The earlier guide (first two reference videos reverse-engineered with the old cyan/green palettes) is retired. This guide is the design language of the three reference videos in `references/`. All values live in `style.config.json`; nothing here is hardcoded in components.

## Shared rules (all three)
- 9:16, the speaker stays visible about half of the time; the picture changes every ~2.5 s (window, zoom, layout, caption style).
- Captions: 1 to 3 words, bold sans, words appear as they are spoken, emphasis words (names, numbers, foreign terms) in the accent colour. No full-sentence subtitles.
- On-screen text is spoken text. Windows show real material (screenshots, logos, photos, the user's own images or clips) or mock cards made only of spoken words.
- Pauses are cut (silence only), jump cuts are hidden with punch-in zooms that alternate in and out.
- Sound: soft UI sounds on every on-screen event (pop, swish, tick, whoosh on layout change), quiet music bed, speech at -14 LUFS.

## Tech look (reference 6, `--palette tech`, the default for Shorts, Reels, TikTok)
- Stage: navy `#060A1C` with a faint blue grid and a bottom glow; 0.4% high blue progress bar across the top; small spaced caps brand tag top centre (amber).
- Hook: head full screen, price/brand chip at the top (logo mark, name, price with red strike), huge serif caps word slam in the middle (white serif, or blue bold sans with white outline for the key word), caption at the bottom.
- Demo: head hidden, caption moves to the top (about 10% from the top, larger), browser-chrome window at 17% to 59% of the height with the real screenshot, slow zoom and an amber highlight box over the value being discussed; the lower zone holds glass pills (icon + text, one per spoken item) or a row of big count-up numbers (amber, white, green) with small caps labels.
- Stings: caution tape "THE CATCH" for a warning; ring counter for "x out of 10"; outro keyword box (type the comment word, send arrow) with "FOLLOW FOR MORE".
- Colours: navy, panel `#101C4A`, electric blue `#3B5BFF`, amber `#FFD23F`, white, green `#35D07F`, red `#FF4D4D`.

## Light look (references 4 and 5, `--palette personal`)
- Stage: light paper `#E6EDF4` with fine dot texture; head in a rounded card at the bottom with a blue outline; title block at the top (bold sans line + blue box with an italic serif highlight word + pixel stickers); white browser window between title and head; dark blurred-backdrop demo mode when the window gets the full stage; section cards ("Number Five") typed on a white stage; n/N badge on windows.
- Colours: paper, white, ink `#161616`, electric blue `#0284FF`, red strike `#F2604B`.

## Typography (both looks)
Inter 800 for headings and captions, Playfair Display (caps for slams, italic for highlighted names in the light look), JetBrains Mono for UI and terminal text, IBM Plex Sans Arabic 600/700 for Arabic. Arabic emphasis is colour only (no italics). Latin words inside Arabic lines stay left-to-right; French accents and apostrophes are kept as spoken.

## Motion
Windows pop in (260 ms, scale 0.94, blur 10 to 0), leave faster (180 ms). Layout changes take 260 ms with a rotating effect: whip, flash, glitch, punch. Zoom: punch-in ramps (240 ms) at silence seams, alternating 1.0 / 1.12 / 1.0 / 1.16, plus authored emphasis zooms (`zooms` in the plan). Slow drift on the head video between beats.
