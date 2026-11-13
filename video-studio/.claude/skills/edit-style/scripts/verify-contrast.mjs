// Usage: node verify-contrast.mjs [palette]   -> prints WCAG contrast for every caption/text pair of each palette.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolvePalette} from '../shared/color.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(here, '..', 'style.config.json'), 'utf8'));
const only = process.argv[2];
let failed = 0;
for (const name of Object.keys(cfg.palettes)) {
  if (only && only !== name) continue;
  const {report} = resolvePalette(cfg, name);
  console.log(`\n== palette: ${name}`);
  for (const r of report) {
    const mark = r.status === 'pass' ? 'PASS ' : r.status === 'fixed' ? 'FIXED' : 'FAIL ';
    if (mark === 'FAIL ') failed++;
    console.log(`${mark} ${r.fg.padEnd(16)} on ${r.bg.padEnd(14)} ${String(r.ratio).padStart(5)}:1 (min ${r.min}, ${r.size})${r.from ? `  ${r.from} -> ${r.to}` : ''}${mark === 'FAIL ' ? '  ' + r.status : ''}`);
  }
}
if (failed) {
  console.error(`\n${failed} pair(s) fail WCAG AA`);
  process.exit(1);
}
console.log('\nAll pairs meet WCAG AA for their text size.');
