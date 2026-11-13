// Deep analysis of a style reference: what a person sees when they study an edit frame by frame.
// Measured locally (no AI): every cut and how it happens (hard cut, flash, dissolve, whip / motion), graphics that appear over the footage (where, how big, how long),
// the caption rhythm, zoom punch-ins, how much the picture moves, the music tempo and whether the cuts land on the beat.
// It also prepares the pictures Claude studies next: an overview, the frames on both sides of each transition, each graphic at its peak,
// and frame-by-frame strips of the biggest animations, so Claude can read the motion graphics, the components, the animations and the effects.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {cacheDir, getSettings} from './store.mjs';
import {enginePaths} from './paths.mjs';
import {probe} from './media.mjs';

const run = promisify(execFile);
const FPS = 12;
const MAX_SEC = 150;
const GX = 6;
const GY = 10;

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// low-resolution frames: enough to measure change, brightness and colour
const readFrames = async (file, W, H) => {
  const {stdout} = await run('ffmpeg', ['-v', 'error', '-t', String(MAX_SEC), '-i', file, '-an', '-vf', `fps=${FPS},scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {encoding: 'buffer', maxBuffer: 1 << 30, windowsHide: true});
  const size = W * H * 3;
  const frames = [];
  for (let o = 0; o + size <= stdout.length; o += size) frames.push(stdout.subarray(o, o + size));
  return frames;
};

const frameStats = (frames, W, H) => {
  const n = frames.length;
  const luma = frames.map((f) => {
    const l = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) l[i] = (0.299 * f[i * 3] + 0.587 * f[i * 3 + 1] + 0.114 * f[i * 3 + 2]) / 255;
    return l;
  });
  const hist = frames.map((f) => {
    const h = new Float32Array(64);
    for (let i = 0; i < W * H; i++) h[((f[i * 3] >> 6) << 4) | ((f[i * 3 + 1] >> 6) << 2) | (f[i * 3 + 2] >> 6)]++;
    for (let k = 0; k < 64; k++) h[k] /= W * H;
    return h;
  });
  const out = [];
  for (let t = 0; t < n; t++) {
    const mean = luma[t].reduce((a, v) => a + v, 0) / (W * H);
    if (t === 0) {
      out.push({mean, diff: 0, hd: 0, cellShare: 0, cells: []});
      continue;
    }
    let diff = 0;
    const cw = W / GX;
    const ch = H / GY;
    const cellSum = new Float32Array(GX * GY);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const d = Math.abs(luma[t][i] - luma[t - 1][i]);
        diff += d;
        cellSum[Math.min(GY - 1, Math.floor(y / ch)) * GX + Math.min(GX - 1, Math.floor(x / cw))] += d;
      }
    }
    diff /= W * H;
    const per = (W * H) / (GX * GY);
    const cells = [];
    for (let c = 0; c < GX * GY; c++) if (cellSum[c] / per > 0.05) cells.push(c);
    let hd = 0;
    for (let k = 0; k < 64; k++) hd += Math.abs(hist[t][k] - hist[t - 1][k]);
    out.push({mean, diff, hd: hd / 2, cellShare: cells.length / (GX * GY), cells});
  }
  return out;
};

// cuts and the way each one happens
const findTransitions = (st) => {
  const n = st.length;
  const hdMed = median(st.map((s) => s.hd)) || 0.02;
  const cuts = [];
  for (let t = 1; t < n - 1; t++) {
    const s = st[t];
    const isPeak = s.hd >= st[t - 1].hd && s.hd >= st[t + 1].hd;
    if (!isPeak || s.hd < Math.max(0.3, hdMed * 6)) continue;
    if (cuts.length && t - cuts[cuts.length - 1].f < 3) continue;
    // flash: the picture goes much brighter around the cut
    const around = [st[Math.max(0, t - 3)].mean, st[Math.min(n - 1, t + 3)].mean];
    const peakL = Math.max(st[t].mean, st[t - 1].mean, st[Math.min(n - 1, t + 1)].mean);
    let type = 'cut';
    if (peakL - Math.max(...around) > 0.16) type = 'flash';
    else {
      // whip / fast motion: the whole frame is moving hard on both sides of the cut
      const moving = [t - 2, t - 1, t + 1, t + 2].filter((k) => k > 0 && k < n && st[k].cellShare > 0.75 && st[k].diff > 0.07).length;
      if (moving >= 3) type = 'whip';
    }
    cuts.push({f: t, ms: Math.round((t / FPS) * 1000), type, strength: round(s.hd)});
  }
  // dissolves: several frames in a row of moderate change with no single jump
  for (let t = 1; t < n - 6; t++) {
    const win = st.slice(t, t + 6);
    if (win.every((s) => s.hd > 0.05 && s.hd < 0.3 && s.cellShare > 0.6) && win.reduce((a, s) => a + s.hd, 0) > 0.75 && !cuts.some((c) => Math.abs(c.f - t) < 8)) {
      cuts.push({f: t + 3, ms: Math.round(((t + 3) / FPS) * 1000), type: 'dissolve', strength: round(win.reduce((a, s) => a + s.hd, 0))});
      t += 8;
    }
  }
  return cuts.sort((a, b) => a.f - b.f);
};

// graphics and text that appear over the footage: change confined to part of the frame while the rest stays still
const findOverlays = (st, cuts) => {
  const nearCut = (t) => cuts.some((c) => Math.abs(c.f - t) <= 2);
  const events = [];
  let cur = null;
  for (let t = 1; t < st.length; t++) {
    const s = st[t];
    const local = !nearCut(t) && s.cellShare > 0.02 && s.cellShare < 0.45 && s.diff > 0.004;
    if (local) {
      if (cur && t - cur.last <= 2) {
        cur.last = t;
        s.cells.forEach((c) => cur.cells.add(c));
        cur.peak = Math.max(cur.peak, s.cellShare);
      } else {
        if (cur) events.push(cur);
        cur = {first: t, last: t, cells: new Set(s.cells), peak: s.cellShare};
      }
    }
  }
  if (cur) events.push(cur);
  return events.map((e) => {
    const xs = [...e.cells].map((c) => c % GX);
    const ys = [...e.cells].map((c) => Math.floor(c / GX));
    const box = {x: Math.min(...xs) / GX, y: Math.min(...ys) / GY, w: (Math.max(...xs) - Math.min(...xs) + 1) / GX, h: (Math.max(...ys) - Math.min(...ys) + 1) / GY};
    const cy = box.y + box.h / 2;
    return {startMs: Math.round((e.first / FPS) * 1000), durMs: Math.round(((e.last - e.first + 1) / FPS) * 1000), box: {x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h)}, area: round(box.w * box.h), zone: cy < 0.36 ? 'top' : cy > 0.64 ? 'bottom' : 'middle', peakFrame: Math.round((e.first + e.last) / 2)};
  });
};

// captions: small changes that keep coming back in the same horizontal band every fraction of a second
const findCaptions = (events) => {
  const small = events.filter((e) => e.area <= 0.2 && e.box.h <= 0.2 && e.durMs <= 1200);
  const bands = {};
  for (const e of small) {
    const k = Math.round((e.box.y + e.box.h / 2) * 10);
    (bands[k] = bands[k] || []).push(e);
  }
  const best = Object.entries(bands).sort((a, b) => b[1].length - a[1].length)[0];
  if (!best || best[1].length < 8) return null;
  const list = best[1].sort((a, b) => a.startMs - b.startMs);
  const gaps = list.slice(1).map((e, i) => e.startMs - list[i].startMs);
  const cadence = median(gaps);
  if (cadence > 2000) return null;
  return {cy: round(Number(best[0]) / 10), cadenceMs: cadence, changes: list.length};
};

// a sheet of frames taken at given times
const sheet = async (file, times, cols, out, width = 220) => {
  if (!times.length) return null;
  const dir = `${out}.d`;
  fs.mkdirSync(dir, {recursive: true});
  let i = 0;
  for (const ms of times) {
    i++;
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', (Math.max(0, ms) / 1000).toFixed(3), '-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', path.join(dir, `f_${String(i).padStart(3, '0')}.jpg`)], {windowsHide: true}).catch(() => {});
  }
  const rows = Math.ceil(times.length / cols);
  await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, 'f_%03d.jpg'), '-vf', `tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', '-q:v', '4', out], {windowsHide: true}).catch(() => {});
  fs.rmSync(dir, {recursive: true, force: true});
  return fs.existsSync(out) ? out : null;
};

const audioFacts = async (file, cuts, key) => {
  try {
    const wav = path.join(cacheDir(), `refaudio-${key}.wav`);
    await run('ffmpeg', ['-v', 'error', '-y', '-t', String(MAX_SEC), '-i', file, '-vn', '-ac', '1', '-ar', '22050', wav], {windowsHide: true});
    const lib = path.join(enginePaths(getSettings().enginePath).skill, 'scripts', 'lib', 'musicPick.mjs');
    const {analyzeMusic} = await import(pathToFileURL(lib).href);
    const an = analyzeMusic(wav);
    fs.rmSync(wav, {force: true});
    const beats = [];
    for (const b of an.bars) for (let i = 0; i < 4; i++) beats.push(b.startMs + i * an.beatMs);
    const onBeat = cuts.filter((c) => beats.some((b) => Math.abs(b - c.ms) <= 90)).length;
    return {bpm: an.bpm, beatConfidence: round(an.confidence), cutsOnBeat: cuts.length ? round(onBeat / cuts.length) : null, steadyBeat: an.confidence >= 1.4};
  } catch {
    return null;
  }
};

// the full analysis, cached per file
export const analyzeReference = async (file, log = () => {}) => {
  const st0 = fs.statSync(file);
  const key = crypto.createHash('sha1').update(`deep3|${file}|${st0.size}|${st0.mtimeMs}`).digest('hex').slice(0, 16);
  const base = path.join(cacheDir(), `refdeep-${key}`);
  if (fs.existsSync(`${base}.json`)) {
    const cached = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
    if (Object.values(cached.images || {}).every((p) => !p || fs.existsSync(p))) {
      log('Using the analysis made earlier for this video');
      return cached;
    }
  }
  const info = await probe(file);
  const portrait = (info.height || 16) >= (info.width || 9);
  const W = portrait ? 72 : 128;
  const H = portrait ? 128 : 72;
  log('Reading the video frame by frame');
  const frames = await readFrames(file, W, H);
  const durMs = Math.min(info.durationMs || frames.length * (1000 / FPS), MAX_SEC * 1000);
  const st = frameStats(frames, W, H);
  const min = Math.max(0.1, durMs / 60000);

  const cuts = findTransitions(st);
  log(`Found ${cuts.length} transitions (${Object.entries(cuts.reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {})).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})`);
  const events = findOverlays(st, cuts);
  const captions = findCaptions(events);
  const graphics = events.filter((e) => e.area >= 0.08 && e.durMs >= 350 && !(captions && Math.abs(e.box.y + e.box.h / 2 - captions.cy) < 0.1 && e.area <= 0.25));
  log(`Found ${graphics.length} graphic moments over the footage${captions ? `, and captions changing every ${captions.cadenceMs} ms at ${Math.round(captions.cy * 100)}% height` : ''}`);
  // zoom punch-ins: the whole frame changes at once but the colours stay the same (same shot, new framing)
  const punches = st.map((s, t) => ({s, t})).filter(({s, t}) => t > 0 && s.cellShare > 0.85 && s.diff > 0.06 && s.hd < 0.12 && !cuts.some((c) => Math.abs(c.f - t) <= 2)).map(({t}) => Math.round((t / FPS) * 1000));
  const punchIns = punches.filter((ms, i) => !i || ms - punches[i - 1] > 400);
  if (punchIns.length) log(`Found ${punchIns.length} zoom punch-ins or reframes`);
  const motionPerSec = [];
  for (let s = 0; s < durMs / 1000; s++) {
    const seg = st.slice(s * FPS, (s + 1) * FPS);
    motionPerSec.push(round(seg.reduce((a, x) => a + x.diff, 0) / Math.max(1, seg.length), 3));
  }
  const shots = [0, ...cuts.map((c) => c.ms), durMs].map((v, i, a) => (i ? v - a[i - 1] : null)).filter((v) => v);
  log('Listening to the music and timing the cuts against the beat');
  const audio = await audioFacts(file, cuts, key);

  // what Claude will look at
  log('Preparing the frames for Claude: overview, transitions, graphics and animation strips');
  const overview = await sheet(file, Array.from({length: 12}, (_, i) => ((i + 0.5) * durMs) / 12), 6, `${base}-overview.jpg`);
  const tr = cuts.slice(0, 8);
  const transitions = await sheet(file, tr.flatMap((c) => [c.ms - 170, c.ms - 40, c.ms + 90, c.ms + 250]), 8, `${base}-transitions.jpg`, 180);
  const topGraphics = [...graphics].sort((a, b) => b.area * b.durMs - a.area * a.durMs).slice(0, 12).sort((a, b) => a.startMs - b.startMs);
  const graphicsSheet = await sheet(file, topGraphics.map((e) => (e.peakFrame / FPS) * 1000), 6, `${base}-graphics.jpg`);
  const strips = {};
  const animated = [...graphics].sort((a, b) => b.area - a.area).slice(0, 2);
  for (let k = 0; k < animated.length; k++) strips[`animation${k + 1}`] = await sheet(file, Array.from({length: 8}, (_, i) => animated[k].startMs - 120 + i * 84), 8, `${base}-anim${k + 1}.jpg`, 170);
  if (tr[0]) strips.transitionStrip = await sheet(file, Array.from({length: 8}, (_, i) => tr[0].ms - 330 + i * 84), 8, `${base}-trans1.jpg`, 170);

  const facts = {
    durationSec: round(durMs / 1000, 1),
    format: `${info.width}x${info.height}${portrait ? ' (vertical)' : ''}`,
    cutsPerMinute: round(cuts.length / min, 1),
    averageShotSec: round(median(shots) / 1000, 1),
    transitionTypes: cuts.reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {}),
    transitions: cuts.slice(0, 40).map((c) => ({atSec: round(c.ms / 1000, 2), type: c.type})),
    graphicsPerMinute: round(graphics.length / min, 1),
    graphicZones: graphics.reduce((m, e) => ((m[e.zone] = (m[e.zone] || 0) + 1), m), {}),
    averageGraphicSec: round(median(graphics.map((e) => e.durMs)) / 1000, 1),
    graphics: graphics.slice(0, 40).map((e) => ({atSec: round(e.startMs / 1000, 2), forSec: round(e.durMs / 1000, 1), zone: e.zone, box: e.box})),
    captions,
    punchInsPerMinute: round(punchIns.length / min, 1),
    motionLevel: round(median(motionPerSec), 3),
    audio,
  };
  const result = {
    facts,
    images: {overview, transitions, graphics: graphicsSheet, ...strips},
    imageNotes: {
      overview: '12 frames spread evenly over the video, left to right, top to bottom',
      transitions: `for each of the first ${tr.length} transitions, 4 frames: just before, the moment, just after, settled (one transition per row half, in order: ${tr.map((c) => `${round(c.ms / 1000, 1)}s ${c.type}`).join(', ')})`,
      graphics: `the ${topGraphics.length} largest moments where something appears over the footage, at their peak, in time order (${topGraphics.map((e) => `${round(e.startMs / 1000, 1)}s ${e.zone}`).join(', ')})`,
      animation1: animated[0] ? `8 consecutive frames (84 ms apart) of the biggest graphic animation, starting at ${round(animated[0].startMs / 1000, 1)}s: shows how it enters` : undefined,
      animation2: animated[1] ? `8 consecutive frames of the second biggest graphic animation, starting at ${round(animated[1].startMs / 1000, 1)}s` : undefined,
      transitionStrip: tr[0] ? `8 consecutive frames (84 ms apart) through the transition at ${round(tr[0].ms / 1000, 1)}s` : undefined,
    },
  };
  result.base = base;
  fs.writeFileSync(`${base}.json`, JSON.stringify(result, null, 1));
  return result;
};
