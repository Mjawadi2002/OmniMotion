// Where the speaker's face is in the footage, so every layout can frame it: the head card of the light looks crops around the face (head and hair inside the
// card) instead of at a fixed height, and punch-ins zoom toward the face. Faces are found with the detector built into Windows (faces.ps1, nothing to install)
// on a few frames spread over the clip; the median box is kept. Elsewhere, or when no face is found, the layouts keep their fixed framing.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const r3 = (x) => Math.round(x * 1000) / 1000;

const durationOf = (file) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8', windowsHide: true});
  return parseFloat(r.stdout) || 0;
};

// returns {cx, cy, w, h} as fractions of the frame (the face box: forehead to chin), the frame's aspect (width / height), and how many frames agreed; null when unknown
export const findFace = (file, cacheDir, samples = 9) => {
  if (process.platform !== 'win32' || !fs.existsSync(file)) return null;
  const st = fs.statSync(file);
  const cacheFile = path.join(cacheDir, 'face.json');
  const stamp = `${st.size}|${Math.round(st.mtimeMs)}`;
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (c.stamp === stamp) return c.face;
  } catch {
    // not measured yet
  }
  const dir = path.join(cacheDir, 'face-frames');
  fs.mkdirSync(dir, {recursive: true});
  let face = null;
  try {
    const dur = durationOf(file);
    const frames = [];
    for (let i = 0; i < samples; i++) {
      const t = dur > 0 ? (dur * (i + 0.5)) / samples : i;
      const out = path.join(dir, `f${i}.jpg`);
      try {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', out], {windowsHide: true, stdio: 'ignore'});
        if (fs.existsSync(out)) frames.push(out);
      } catch {
        // past the end
      }
    }
    if (frames.length) {
      const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'faces.ps1'), ...frames], {encoding: 'utf8', windowsHide: true, timeout: 60000});
      const boxes = [];
      for (const line of (r.stdout || '').split(/\r?\n/)) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const o = JSON.parse(line);
          if (!o.faces || !o.faces.length || !o.w || !o.h) continue;
          // the speaker is the biggest face in the frame
          const b = [...o.faces].sort((a, c) => c.w * c.h - a.w * a.h)[0];
          boxes.push({cx: (b.x + b.w / 2) / o.w, cy: (b.y + b.h / 2) / o.h, w: b.w / o.w, h: b.h / o.h, aspect: o.w / o.h});
        } catch {
          // a line that is not a result
        }
      }
      // at least a third of the frames must agree, so a face on a poster or a passer-by does not move the framing
      if (boxes.length >= Math.max(2, Math.ceil(frames.length / 3))) {
        face = {cx: r3(median(boxes.map((b) => b.cx))), cy: r3(median(boxes.map((b) => b.cy))), w: r3(median(boxes.map((b) => b.w))), h: r3(median(boxes.map((b) => b.h))), aspect: r3(median(boxes.map((b) => b.aspect))), frames: boxes.length, of: frames.length};
      }
    }
  } catch {
    face = null;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
  try {
    fs.writeFileSync(cacheFile, JSON.stringify({stamp, face}, null, 1));
  } catch {
    // read-only job folder: measured again next time
  }
  return face;
};
