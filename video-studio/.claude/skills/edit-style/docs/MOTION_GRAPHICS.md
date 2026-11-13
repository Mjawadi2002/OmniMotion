# Motion graphics (`kind: "motion"`)

Real animated 2D and 3D elements that illustrate the story. They are drawn in the colour roles of whatever look is in use (any built-in look, any look made from a reference), timed to the spoken words, and placed where they never touch the captions. Every edit should use them: a talking head with only text cards is a flat edit.

```json
{"id": "m1", "kind": "motion", "from": {"at": "five years"}, "to": {"after": 3500},
 "content": {"scene": "clock", "value": 5, "unit": "years"}}
```

Fields in `content` (all optional except `scene`): `label` (one short caption under the scene), `value` + `unit` / `prefix` / `suffix` / `symbol` (a number that counts up), `items`: `[{"label": "...", "at": {"at": "spoken words"}}]` (the pieces of the scene, each appearing on its own spoken word).

## Choose the scene by what the words MEAN

| Scene | Dimension | Use when the speech is about | Content |
|---|---|---|---|
| `clock` | 2D | time passing, years, months, waiting, deadlines | `value`, `unit` ("5", "years") |
| `timeline` | 2D | a journey, before and after, milestones, steps in time | `items` = the stages; optional `value`, `unit` |
| `growth` | 2D | growth, results improving, percentages, "x3" | `value`, `prefix: "x"` or `suffix: "%"`, `label` |
| `rocket` | 2D | launching, starting, taking off, fast progress | `value` / `label` |
| `target` | 2D | a goal, precision, aiming, "100%" | `value`, `suffix`, `label` |
| `bulb` | 2D | an idea, insight, realisation, learning | `label` |
| `bubbles` | 2D | conversations, messages, clients, asking | `items` = the messages as spoken (3 or 4) |
| `network` | 2D | connections, platforms, community, systems, AI | `items` = node names (up to 9) |
| `layers` | 3D | levels, a stack, building up, parts of a system | `items` = the layers, bottom to top (3 to 5) |
| `cube` | 3D | a set of things, features, categories, a toolbox | `items` (up to 6, repeated on the faces) |
| `orbit` | 3D | an ecosystem, tools around one core, everything connected | `items` (up to 6), optional `value` + `unit` |
| `coin` | 3D | money, price, income, salary, profit | `value`, `symbol` ("$", "€", "DT"), `label` |

## Rules
- **Only spoken words.** `label`, `unit`, `items[].label` and `symbol` must be words the speaker said (or listed in `allowText`); a number must be a number the speaker said. The shapes themselves carry no text.
- **Where it goes.** With no `slot` and no `mode` a motion graphic sits in the free area above the speaker (the speaker stays visible and the captions stay clear). Do not give it a demo `mode`. Use `slot: "full"` only for a deliberate takeover.
- **How often.** At least one motion graphic per 12 seconds of speech whenever the story has something to illustrate (time, money, growth, a list of tools, a goal, a conversation, a process). Vary the scenes; do not use the same scene twice in a row.
- **How long.** 2.5 to 4.5 seconds. Start it on the word that triggers it, anchor each item on its own word so the pieces appear as they are said.
- **No duplicates.** Do not show the same fact as a motion graphic and as a `stat`, `pills` or `chip` at the same time. Do not open two graphics in the same area together.
- **Captions.** The engine moves any graphic off the caption line automatically (above it when there is room, shrunk or below it otherwise), but plan so that two graphics never compete for the same place.
- **Looks and references.** Nothing in a look needs to change for motion graphics: they use the look's `background`, `text`, `primary` and `accent` roles, so they follow every look, reference and edit.
