// Listens to every sound effect in the library (or to the files given) and reports what is wrong with it: clipping, silent start or tail, DC offset.
//   node scripts/sfx-audit.mjs                 all of assets/cc0/sfx
//   node scripts/sfx-audit.mjs a.wav b.mp3     specific files (use this before adding a new sample to the library)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditFile} from './lib/sfx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '..', 'assets', 'cc0', 'sfx');
const files = process.argv.slice(2).length ? process.argv.slice(2).map((f) => path.resolve(f)) : fs.readdirSync(dir).filter((f) => /\.(wav|mp3|ogg|flac)$/i.test(f)).map((f) => path.join(dir, f));
let bad = 0;
for (const f of files) {
  const a = auditFile(f);
  const name = path.basename(f).padEnd(26);
  if (!a) {
    console.log(name, 'unreadable');
    bad++;
    continue;
  }
  const problems = a.flags.filter((x) => !/compensated|trimmed/.test(x));
  if (problems.length) bad++;
  console.log(name, `${String(Math.round(a.durationMs)).padStart(5)} ms long, starts at ${String(Math.round(a.onsetMs)).padStart(4)} ms, peak ${a.peakDb.toFixed(1).padStart(6)} dB`, a.flags.length ? '| ' + a.flags.join('; ') : '| clean');
}
console.log(`\n${files.length} files, ${bad} with a problem the engine cannot fix by itself.`);
