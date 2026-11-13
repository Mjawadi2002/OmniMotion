// Exports a palette from style.config.json as a web design system (CSS variables + markdown) so web skills
// (ui-ux-pro-max, taste-skill) use the SAME palette roles as the video skill. The tokens file stays the source of truth.
// Usage: node export-design-system.mjs [palette] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {contrast, ensureContrast, mix, resolvePalette} from '../shared/color.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(here, '..', 'style.config.json'), 'utf8'));
const name = process.argv[2] || 'tawelti';
const outDir = path.resolve(process.argv[3] || path.join(here, '..', '..', '..', '..', '..', 'design-system'));
const {roles: r, preset, pal} = resolvePalette(cfg, name);
const named = pal.named || {};

// Light web surfaces use the "paper" side of the palette where it exists; otherwise the dark stage roles.
const light = name === 'tawelti';
const bg = light ? named.paper || r.surface : r.background;
const fg = light ? named.ink || r.textOnSurface : r.text;
const card = light ? named.white || '#FFFFFF' : r.surface;
const mutedBg = light ? named.mintSoft || r.surfaceAlt : r.surfaceAlt;
const mutedFg = ensureContrast(light ? mix(fg, mutedBg, 0.32) : r.textMuted, mutedBg, 4.5).hex;
const ctaText = ensureContrast(r.textOnAccent, r.accent, 4.5).hex;
const onPrimary = ensureContrast(light ? named.cream || r.text : r.textOnAccent, r.primary, 4.5).hex;

const tokens = {
  '--color-primary': r.primary, '--color-on-primary': onPrimary,
  '--color-secondary': r.shape, '--color-on-secondary': ensureContrast(r.text, r.shape, 4.5).hex,
  '--color-accent': r.accent, '--color-on-accent': ctaText, '--color-accent-deep': r.accentDeep,
  '--color-background': bg, '--color-foreground': fg,
  '--color-card': card, '--color-card-foreground': fg,
  '--color-muted': mutedBg, '--color-muted-foreground': mutedFg,
  '--color-border': r.outline, '--color-destructive': r.negative, '--color-on-destructive': ensureContrast('#FFFFFF', r.negative, 4.5).hex,
  '--color-ring': r.accent, '--color-success': r.positive,
};
const px = (pct) => `${Math.round(pct * 1080)}px`; // outline: 4 px at the 1080 reference
const wpx = (pct) => `${Math.round(pct * 540)}px`; // shadows and radii are halved for web (a card is ~400 px wide, not 1000)
const style = {
  '--outline-width': px(preset.outlineWidthPctShort),
  '--shadow-card': preset.shadow.type === 'hard' ? `${wpx(preset.shadow.offsetXPctShort)} ${wpx(preset.shadow.offsetYPctShort)} 0 ${r.shadow}` : `0 0 ${wpx(preset.shadow.blurPctShort)} ${r.glow}66`,
  '--radius-card': wpx(preset.radiusPctShort.card), '--radius-panel': wpx(preset.radiusPctShort.panel), '--radius-chip': '999px',
  '--font-display': `"${preset.fonts.display}", "${preset.fonts.arabic}", system-ui, sans-serif`,
  '--font-body': `"${preset.fonts.body}", "${preset.fonts.arabic}", system-ui, sans-serif`,
  '--font-arabic': `"${preset.fonts.arabic}", "Tahoma", system-ui, sans-serif`,
  '--font-mono': `"${preset.fonts.mono}", ui-monospace, monospace`,
  '--ease-out': 'cubic-bezier(0.33, 1, 0.68, 1)', '--dur-hover': '220ms', '--dur-enter': '420ms',
};

const pairs = [['--color-foreground', '--color-background'], ['--color-card-foreground', '--color-card'], ['--color-on-primary', '--color-primary'], ['--color-on-accent', '--color-accent'], ['--color-muted-foreground', '--color-muted'], ['--color-muted-foreground', '--color-background'], ['--color-on-destructive', '--color-destructive']];
const rows = pairs.map(([a, b]) => `| ${a} on ${b} | ${tokens[a]} / ${tokens[b]} | ${contrast(tokens[a], tokens[b]).toFixed(2)}:1 | ${contrast(tokens[a], tokens[b]) >= 4.5 ? 'AA' : 'FAIL'} |`);

fs.mkdirSync(outDir, {recursive: true});
const css = `/* ${name} design system exported from edit-style/style.config.json. Do not edit by hand. */
:root {
${[...Object.entries(tokens), ...Object.entries(style)].map(([k, v]) => `  ${k}: ${v};`).join('\n')}
}
[dir="rtl"] { font-family: var(--font-arabic); }
@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
`;
fs.writeFileSync(path.join(outDir, `${name}.css`), css);
const md = `# ${name} web design system (from the video skill's tokens)

Single source of truth: \`video-studio/.claude/skills/edit-style/style.config.json\`. Re-export with \`node scripts/export-design-system.mjs ${name}\`.
These values **override** whatever palette ui-ux-pro-max or taste-skill suggests.

## Colors (CSS variables, names follow ui-ux-pro-max)
| Variable | Value |
|---|---|
${Object.entries(tokens).map(([k, v]) => `| \`${k}\` | \`${v}\` |`).join('\n')}

## Contrast (WCAG AA = 4.5:1)
| Pair | Colors | Ratio | Result |
|---|---|---|---|
${rows.join('\n')}

## Structure (the Tawelti look: thick dark outlines, hard offset shadows, pill chips, generous radii)
${Object.entries(style).map(([k, v]) => `- \`${k}\`: \`${v}\``).join('\n')}

## RTL / Arabic rules (from ui-ux-pro-max RTL notes)
- Set \`dir="rtl"\` and \`lang="ar"\` on the document or the section; use logical CSS (\`margin-inline-start\`, \`padding-inline\`, \`inset-inline-end\`, \`text-align: start\`), never left/right.
- Mirror directional icons (arrows, chevrons, progress, carousels) but not logos, media controls or numerals.
- Arabic uses ${preset.fonts.arabic} (weights 500/700/800); keep Latin words and numbers LTR inside RTL text (\`unicode-bidi: plaintext\`).
- Hard offset shadows flip direction in RTL (shadow-inline-end). Check hover motion paths and charts when a style is \`rtl_level: partial\`.
- Motion: 150-300 ms hover, 400 ms enter, ease-out; honour \`prefers-reduced-motion\` (included in the CSS).
`;
fs.writeFileSync(path.join(outDir, `${name}.md`), md);
console.log(`Wrote ${path.join(outDir, name + '.css')} and ${name}.md`);
console.log(rows.join('\n'));
