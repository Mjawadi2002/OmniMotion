// Builds a look with Claude: from a reference video (it looks at frames and the measured colours) or from a description in words.
import fs from 'node:fs';
import {getSettings} from './store.mjs';
import {claudeRun, extractJson, viaApi} from './ai.mjs';
import {cleanSfx, lookMeta} from './looks.mjs';
import {cacheDir} from './store.mjs';

const NL = String.fromCharCode(10);
const HEX = /^#[0-9a-fA-F]{6}$/;

export const lookWithAi = async ({sheetPath, palette, description, name, run = null}) => {
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider === 'off') throw new Error('AI is switched off in Settings. Choose Claude account or an API key there to build looks from references.');
  const meta = lookMeta();
  const fonts = meta.catalog.map((c) => `${c.family} (${c.kind})`).join(', ');
  const rolesTech = meta.groups.tech.flatMap((g) => g.roles.map((r) => r[0]));
  const rolesLight = meta.groups.light.flatMap((g) => g.roles.map((r) => r[0]));
  const prompt = [
    'You design a "look" for the OmniMotion short-video editor: colours, fonts and a grade laid over one of two layout families.',
    '',
    'FAMILIES',
    '- "tech": dark stage with a faint grid and a thin progress bar, the speaker full screen, white bold captions with an emphasis colour, glass panels, serif caps word slams.',
    '- "light": paper stage, the speaker in a rounded card at the bottom, a bold title with a highlighted word in a coloured box, white window cards.',
    'Pick the family closest to the reference or description. The layout (where things sit and how they move) cannot change; only colours, fonts and grade can.',
    '',
    `COLOUR ROLES (hex #RRGGBB only). tech: ${rolesTech.join(', ')}. light: ${rolesLight.join(', ')}.`,
    'Base values you may start from:',
    `tech = ${JSON.stringify(meta.base.tech)}`,
    `light = ${JSON.stringify(meta.base.light)}`,
    'Keep text readable: text on background and text on accent need strong contrast.',
    '',
    `FONTS (choose only from this list): ${fonts}`,
    'Return fonts as {"display": caption and headline face, "serif": accent face used for names and slams, "numeric": number face, "arabic": Arabic face}. Match the typography you see; say plainly when nothing in the list is a close match.',
    '',
    'GRADE (applied to the speaker footage): {"tint": "#RRGGBB", "tintAlpha": 0 to 0.15, "contrast": 0.95 to 1.15, "saturate": 0.9 to 1.2, "brightness": 1, "vignette": 0 to 0.5}.',
    '',
    sheetPath ? `REFERENCE: look at the image file ${sheetPath} (frames of the reference video, left to right). Measured dominant colours: ${JSON.stringify(palette || [])}. Use these measured colours for the roles wherever they fit; do not invent unrelated colours.` : '',
    description ? `DESCRIPTION FROM THE USER: ${description}` : '',
    name ? `Name it: ${name}` : '',
    '',
    'SOUND: choose the sound-effect character that fits the look. kit: "tech" (crisp digital clicks and pops, for dark, techy, fast looks), "soft" (warm, gentle, airy slides, for light, personal, calm looks), "punchy" (bigger whooshes and hits, for energetic, bold looks) or "minimal" (very few, quiet accents). density: "minimal", "normal" or "rich" (how many effects; judge it from how busy and fast the reference feels).',
    'OUTPUT: only one JSON object, no code fences:',
    '{"label": "short name", "family": "tech" or "light", "roles": {...}, "fonts": {...}, "grade": {...}, "sfx": {"kit": "tech|soft|punchy|minimal", "density": "minimal|normal|rich"}, "summary": "one sentence describing the look", "notes": "two or three plain sentences: what you matched, and what from the reference the editor cannot reproduce (layout, motion, effects)"}',
  ].join(NL);
  run?.step('design', 'active');
  if (provider === 'api') run?.log('Waiting for the Anthropic API (an API key gives no live output)');
  const text = provider === 'api' ? await viaApi(prompt, sheetPath ? [sheetPath] : []) : await claudeRun(prompt, cacheDir(), 600000, [], run);
  run?.step('design', 'done');
  run?.step('check', 'active');
  const out = extractJson(text);
  const family = out.family === 'light' ? 'light' : 'tech';
  const roles = Object.fromEntries(Object.entries(out.roles || {}).filter(([, v]) => HEX.test(v)));
  const registry = new Set(meta.catalog.map((c) => c.family));
  const f = out.fonts || {};
  const fonts2 = {};
  if (registry.has(f.display)) Object.assign(fonts2, {display: f.display, heading: f.display, body: f.display});
  if (registry.has(f.serif)) fonts2.serif = f.serif;
  if (registry.has(f.numeric)) fonts2.numeric = f.numeric;
  if (registry.has(f.arabic)) Object.assign(fonts2, {arabic: f.arabic, arabicHeading: f.arabic});
  const g = out.grade;
  const grade = g && HEX.test(g.tint) ? {tint: g.tint, tintAlpha: Math.min(0.2, +g.tintAlpha || 0), contrast: +g.contrast || 1, saturate: +g.saturate || 1, brightness: +g.brightness || 1, vignette: Math.min(0.6, +g.vignette || 0)} : undefined;
  run?.step('check', 'done');
  return {label: String(out.label || name || 'New look').slice(0, 60), family, roles, fonts: fonts2, grade, sfx: cleanSfx(out.sfx), summary: String(out.summary || ''), notes: String(out.notes || '')};
};

export const sheetExists = (p) => !!p && fs.existsSync(p);
