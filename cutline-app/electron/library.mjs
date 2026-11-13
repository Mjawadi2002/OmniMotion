// Reference library: the style references the engine was designed from, plus any the user adds.
// For each video: a contact sheet and the dominant colours (measured from the frames, not guessed).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {enginePaths} from './paths.mjs';
import {cacheDir, getSettings, listLibrary, newId, saveLibrary} from './store.mjs';
import {probe} from './media.mjs';

const run = promisify(execFile);

const kmeans = (px, k = 5, iters = 12) => {
  if (!px.length) return [];
  let cs = Array.from({length: k}, (_, i) => px[Math.floor((i + 0.5) * (px.length / k))].slice());
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < iters; it++) {
    px.forEach((p, i) => {
      let b = 0;
      let bd = Infinity;
      cs.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          b = j;
        }
      });
      assign[i] = b;
    });
    cs = cs.map((c, j) => {
      const m = px.filter((_, i) => assign[i] === j);
      if (!m.length) return c;
      return [0, 1, 2].map((ch) => Math.round(m.reduce((a, p) => a + p[ch], 0) / m.length));
    });
  }
  const counts = cs.map((_, j) => assign.filter((a) => a === j).length);
  return cs.map((c, j) => ({c, n: counts[j]})).sort((a, b) => b.n - a.n);
};
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

export const describeRef = async (file, mediaUrl) => {
  const st = fs.statSync(file);
  const key = crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
  const sheet = path.join(cacheDir(), `ref-${key}.jpg`);
  const meta = path.join(cacheDir(), `ref-${key}.json`);
  if (fs.existsSync(meta) && fs.existsSync(sheet)) return {...JSON.parse(fs.readFileSync(meta, 'utf8')), sheetUrl: mediaUrl(sheet), sheet};
  const info = await probe(file);
  const dur = (info.durationMs || 30000) / 1000;
  const n = 8;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=${n}/${dur.toFixed(3)},scale=150:-2,tile=${n}x1`, '-frames:v', '1', '-q:v', '5', sheet], {windowsHide: true});
  const {stdout} = await run('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=${n}/${dur.toFixed(3)},scale=32:32`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true});
  const px = [];
  for (let i = 0; i + 2 < stdout.length; i += 3 * 2) px.push([stdout[i], stdout[i + 1], stdout[i + 2]]);
  const groups = kmeans(px, 6);
  const palette = [];
  for (const g of groups) {
    if (palette.every((p) => Math.abs(p.c[0] - g.c[0]) + Math.abs(p.c[1] - g.c[1]) + Math.abs(p.c[2] - g.c[2]) > 60)) palette.push(g);
  }
  const out = {durationMs: info.durationMs, width: info.width, height: info.height, palette: palette.slice(0, 5).map((g) => ({hex: hex(g.c), share: Math.round((g.n / px.length) * 100)}))};
  fs.writeFileSync(meta, JSON.stringify(out));
  return {...out, sheetUrl: mediaUrl(sheet), sheet};
};

export const listReferences = async (mediaUrl) => {
  const e = enginePaths(getSettings().enginePath);
  const items = [];
  const builtinDir = path.join(e.root, '..', 'references');
  if (fs.existsSync(builtinDir)) {
    for (const f of fs.readdirSync(builtinDir)) {
      if (!/\.(mp4|mov|m4v|webm)$/i.test(f)) continue;
      items.push({id: `builtin-${crypto.createHash('sha1').update(f).digest('hex').slice(0, 8)}`, name: f.replace(/\.(mp4|mov|m4v|webm)$/i, '').slice(0, 80), path: path.join(builtinDir, f), builtin: true});
    }
  }
  for (const it of listLibrary()) if (fs.existsSync(it.path)) items.push({...it, builtin: false});
  const out = [];
  for (const it of items) {
    try {
      out.push({...it, ...(await describeRef(it.path, mediaUrl))});
    } catch (err) {
      out.push({...it, error: String(err.message).slice(0, 120)});
    }
  }
  return out;
};

export const addReference = (file) => {
  const items = listLibrary();
  const it = {id: newId(), name: path.basename(file).replace(/\.[^.]+$/, ''), path: file, addedAt: Date.now()};
  items.push(it);
  saveLibrary(items);
  return it;
};
export const removeReference = (id) => saveLibrary(listLibrary().filter((x) => x.id !== id));
