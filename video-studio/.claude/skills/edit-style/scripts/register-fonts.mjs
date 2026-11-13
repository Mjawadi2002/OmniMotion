#!/usr/bin/env node
// Registers installed @fontsource packages in style.config.json (fonts.registry) and writes the font catalogue used by the app's look editor.
// Usage: node scripts/register-fonts.mjs   (after `npm install @fontsource/<name>` in video-studio)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.resolve(here, '..');
const root = path.resolve(skill, '..', '..', '..');
const cfgFile = path.join(skill, 'style.config.json');
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));

// family -> [package, kind]
const FAMILIES = {
  Inter: ['inter', 'sans'],
  Poppins: ['poppins', 'sans'],
  Outfit: ['outfit', 'sans'],
  Montserrat: ['montserrat', 'sans'],
  Sora: ['sora', 'sans'],
  Manrope: ['manrope', 'sans'],
  'DM Sans': ['dm-sans', 'sans'],
  Archivo: ['archivo', 'sans'],
  'Space Grotesk': ['space-grotesk', 'sans'],
  'Bricolage Grotesque': ['bricolage-grotesque', 'sans'],
  Anton: ['anton', 'display'],
  'Bebas Neue': ['bebas-neue', 'display'],
  Oswald: ['oswald', 'display'],
  'Barlow Condensed': ['barlow-condensed', 'display'],
  Syne: ['syne', 'display'],
  'Playfair Display': ['playfair-display', 'serif'],
  Fraunces: ['fraunces', 'serif'],
  Lora: ['lora', 'serif'],
  'DM Serif Display': ['dm-serif-display', 'serif'],
  'JetBrains Mono': ['jetbrains-mono', 'mono'],
  'IBM Plex Sans Arabic': ['ibm-plex-sans-arabic', 'arabic'],
  Cairo: ['cairo', 'arabic'],
  Tajawal: ['tajawal', 'arabic'],
  Almarai: ['almarai', 'arabic'],
  'Noto Kufi Arabic': ['noto-kufi-arabic', 'arabic'],
  'El Messiri': ['el-messiri', 'arabic'],
};

const catalog = [];
for (const [family, [pkg, kind]] of Object.entries(FAMILIES)) {
  const dir = path.join(root, 'node_modules', '@fontsource', pkg, 'files');
  if (!fs.existsSync(dir)) {
    console.warn(`skip ${family}: ${pkg} not installed`);
    continue;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.woff2'));
  const subsets = [];
  for (const s of ['latin', 'arabic']) if (files.some((f) => f.includes(`-${s}-`))) subsets.push(s);
  if (kind === 'arabic') subsets.splice(0, subsets.length, ...['arabic', 'latin'].filter((s) => subsets.includes(s)));
  const weights = [];
  for (const w of [400, 500, 600, 700, 800]) if (files.some((f) => new RegExp(`-(latin|arabic)-${w}-normal\\.woff2$`).test(f))) weights.push(w);
  const styles = ['normal'];
  if (files.some((f) => /-latin-\d+-italic\.woff2$/.test(f)) && kind === 'serif') styles.push('italic');
  if (!weights.length) {
    console.warn(`skip ${family}: no usable weights`);
    continue;
  }
  cfg.fonts.registry[family] = {package: pkg, weights, subsets, ...(styles.length > 1 ? {styles} : {})};
  catalog.push({family, kind, weights: weights.join(', ')});
}
cfg.fonts.catalog = catalog;
fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
console.log(`${catalog.length} families registered`);
for (const c of catalog) console.log(`  ${c.family} (${c.kind}) weights ${c.weights}`);
