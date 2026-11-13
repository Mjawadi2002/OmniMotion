// Music intelligence: listens to a track and finds the part of it that suits the reel.
//   analyzeMusic(file)               -> tempo, beat grid, bars and the energy of every bar
//   pickMusicWindow(analysis, ms)    -> the best stretch of the track for a video of that length, starting on a downbeat
// The best part is the loud, dense, steady section (the chorus / drop), not the intro: it is scored on its energy, its steadiness, and how hard it hits at the start
// (a start right after a quieter build lands like a drop under the hook). Everything is computed locally from the audio.
import {spawnSync} from 'node:child_process';

const SR = 11025;
const N = 512;
const HOP = 256;
const FPS = SR / HOP; // analysis frames per second

const decodeMono = (file) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 1 << 29});
  if (r.status !== 0 || !r.stdout || r.stdout.length < N * 8) throw new Error('The music file could not be read.');
  const n = Math.floor(r.stdout.length / 4);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + n * 4));
};

// in-place radix-2 FFT
const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
};

const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const std = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) * (v - m))));
};
const percentile = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
};

export const analyzeMusic = (file) => {
  const x = decodeMono(file);
  const frames = Math.floor((x.length - N) / HOP);
  const win = Float32Array.from({length: N}, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const prev = new Float32Array(N / 2);
  const flux = new Float32Array(frames);
  const level = new Float32Array(frames); // loudness of each frame in dB
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = x[f * HOP + i];
      e += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    level[f] = 10 * Math.log10(e / N + 1e-10);
    fft(re, im);
    let fl = 0;
    for (let k = 1; k < N / 2; k++) {
      const m = Math.log1p(Math.hypot(re[k], im[k]) * 8);
      fl += Math.max(0, m - prev[k]);
      prev[k] = m;
    }
    flux[f] = fl;
  }
  // onset strength: flux with its local average removed
  const w = Math.round(FPS * 0.5);
  const onset = new Float32Array(frames);
  let run = 0;
  for (let f = 0; f < frames; f++) {
    run += flux[f];
    if (f >= 2 * w) run -= flux[f - 2 * w];
    const avg = run / Math.min(f + 1, 2 * w);
    onset[f] = Math.max(0, flux[f] - avg);
  }
  const at = (pos) => {
    if (pos < 0 || pos >= frames - 1) return 0;
    const i = Math.floor(pos);
    return onset[i] + (onset[i + 1] - onset[i]) * (pos - i);
  };

  // tempo and phase: the beat comb that collects the most onset strength (with a mild preference for 90 to 140 BPM)
  let best = {score: -1, bpm: 0, phase: 0};
  const scores = [];
  for (let bpm = 70; bpm <= 180; bpm += 0.25) {
    const period = (60 / bpm) * FPS;
    const prior = Math.exp(-Math.pow(Math.log2(bpm / 112), 2) / (2 * 0.55 * 0.55));
    let top = {s: -1, ph: 0};
    for (let ph = 0; ph < period; ph += 0.5) {
      let s = 0;
      let cnt = 0;
      for (let p = ph; p < frames - 1; p += period) {
        s += at(p) + 0.35 * at(p + period / 2);
        cnt++;
      }
      s /= Math.max(1, cnt);
      if (s > top.s) top = {s, ph};
    }
    const sc = top.s * (0.6 + 0.4 * prior);
    scores.push(top.s);
    if (sc > best.score) best = {score: sc, bpm, phase: top.ph, raw: top.s};
  }
  const meanOnset = mean(Array.from(onset));
  const confidence = best.raw / Math.max(1e-6, meanOnset); // how much stronger the beat positions are than an average moment
  const period = (60 / best.bpm) * FPS;

  // beats, downbeats (the beat of every four that carries the most onset strength), bars
  const beats = [];
  for (let p = best.phase, i = 0; p < frames - 1; p += period, i++) beats.push({i, f: p});
  const accent = [0, 0, 0, 0];
  beats.forEach((b) => (accent[b.i % 4] += at(b.f)));
  const down = accent.indexOf(Math.max(...accent));
  const bars = [];
  for (let j = 0; j < beats.length; j++) {
    if (beats[j].i % 4 !== down) continue;
    const startF = beats[j].f;
    const endF = Math.min(frames, startF + period * 4);
    if (endF - startF < period * 3.5) continue;
    let e = 0;
    let c = 0;
    for (let f = Math.floor(startF); f < Math.floor(endF); f++) {
      e += Math.pow(10, level[f] / 10);
      c++;
    }
    bars.push({startMs: (startF / FPS) * 1000, energy: 10 * Math.log10(e / Math.max(1, c) + 1e-10)});
  }
  return {durationMs: (x.length / SR) * 1000, bpm: Math.round(best.bpm * 10) / 10, confidence, barMs: ((period * 4) / FPS) * 1000, beatMs: (period / FPS) * 1000, bars};
};

// The best window of the track for a video of lengthMs. fixedStartMs forces a start (the user's choice).
export const pickMusicWindow = (an, lengthMs, {fixedStartMs = null} = {}) => {
  if (an.durationMs <= lengthMs + 500) return {startMs: 0, endMs: an.durationMs, whole: true, reason: 'the track is as short as the video, so all of it is used'};
  if (fixedStartMs !== null) {
    const s = Math.max(0, Math.min(an.durationMs - lengthMs, fixedStartMs));
    return {startMs: s, endMs: s + lengthMs, reason: 'the start you chose'};
  }
  const bars = an.bars;
  const nb = Math.ceil(lengthMs / an.barMs);
  if (bars.length < nb + 3 || an.confidence < 1.15) {
    // no steady beat to hang on to: the loudest stretch, found on a one-second grid
    const step = 1000;
    let bestStart = 0;
    let bestScore = -1e9;
    for (let s = 0; s + lengthMs <= an.durationMs; s += step) {
      const inside = bars.filter((b) => b.startMs >= s && b.startMs < s + lengthMs).map((b) => b.energy);
      const sc = inside.length ? mean(inside) : -1e9;
      if (sc > bestScore) {
        bestScore = sc;
        bestStart = s;
      }
    }
    return {startMs: bestStart, endMs: bestStart + lengthMs, reason: 'the loudest part (the beat was not steady enough to align to)'};
  }
  const energies = bars.map((b) => b.energy);
  const lo = percentile(energies, 0.1);
  const hi = percentile(energies, 0.9);
  const norm = (e) => Math.min(1, Math.max(0, (e - lo) / Math.max(0.5, hi - lo)));
  let best = null;
  for (let j = 0; j + nb <= bars.length; j++) {
    const startMs = bars[j].startMs;
    if (startMs + lengthMs > an.durationMs) break;
    const win = bars.slice(j, j + nb).map((b) => norm(b.energy));
    const level = mean(win);
    const steady = 1 - Math.min(1, std(win) / 0.35);
    // how hard the start hits: the first two bars against the two before them (a build into a drop scores high; a start at the very top of the track has no build)
    const first = mean(win.slice(0, 2));
    const before = j >= 2 ? mean(bars.slice(j - 2, j).map((b) => norm(b.energy))) : first;
    const hit = Math.min(1, Math.max(0, (first - before) / 0.5));
    // the opening seconds must not be a quiet intro
    const opening = mean(win.slice(0, 2));
    const score = 0.55 * level + 0.2 * steady + 0.15 * hit + 0.1 * opening;
    if (!best || score > best.score) best = {score, startMs, level, steady, hit, bar: j};
  }
  const reason = `the strongest ${Math.round(lengthMs / 1000)} s: ${best.hit > 0.4 ? 'it opens with a drop after a build, ' : ''}${best.level > 0.7 ? 'high energy' : 'steady energy'} throughout, starting on a downbeat`;
  return {startMs: best.startMs, endMs: best.startMs + lengthMs, score: Math.round(best.score * 100) / 100, reason};
};
