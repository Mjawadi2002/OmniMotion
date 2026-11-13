// Synthesises the sound effects defined in style.config.json -> <outDir>/<name>.wav (44.1 kHz mono PCM16).
// Nothing is copied from reference videos: every sound is generated from the numeric parameters in the tokens file.
import fs from 'node:fs';
import path from 'node:path';

const SR = 44100;

const wav = (samples) => {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, 44 + i * 2));
  return buf;
};

const env = (i, n, attack, decay) => {
  const a = Math.max(1, Math.round((attack / 1000) * SR));
  const d = Math.max(1, Math.round((decay / 1000) * SR));
  const head = Math.min(1, i / a);
  const tail = Math.min(1, Math.max(0, (n - i) / d));
  return head * Math.pow(tail, 2);
};

const synth = (def) => {
  const n = Math.round((def.durationMs / 1000) * SR);
  const out = new Float32Array(n);
  if (def.type === 'tone') {
    const hs = def.harmonics || [1];
    for (let i = 0; i < n; i++) {
      let v = 0;
      hs.forEach((h, k) => (v += Math.sin((2 * Math.PI * def.freqHz * h * i) / SR) / (k + 1)));
      out[i] = (v / hs.length) * env(i, n, def.attackMs, def.decayMs);
    }
  } else if (def.type === 'sweep') {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const f = def.freqStartHz + (def.freqEndHz - def.freqStartHz) * (i / n);
      phase += (2 * Math.PI * f) / SR;
      out[i] = Math.sin(phase) * env(i, n, def.attackMs, def.decayMs);
    }
  } else if (def.type === 'noise') {
    // band-limited noise with a rising then falling envelope (one-pole HP + LP), deterministic seed
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    const lp = Math.exp((-2 * Math.PI * def.highHz) / SR);
    const hp = Math.exp((-2 * Math.PI * def.lowHz) / SR);
    let l = 0;
    let h = 0;
    for (let i = 0; i < n; i++) {
      const x = rnd();
      l = (1 - lp) * x + lp * l;
      h = (1 - hp) * l + hp * h;
      out[i] = (l - h) * env(i, n, def.attackMs, def.decayMs);
    }
  }
  else if (def.type === 'riser') {
    // noise through a low-pass whose cutoff sweeps up, rising amplitude: builds into a hit/title
    let seed = 777;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    let l = 0;
    let h = 0;
    const hp = Math.exp((-2 * Math.PI * def.lowHz) / SR);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const cut = def.highHzStart + (def.highHzEnd - def.highHzStart) * k * k;
      const lp = Math.exp((-2 * Math.PI * cut) / SR);
      l = (1 - lp) * rnd() + lp * l;
      h = (1 - hp) * l + hp * h;
      out[i] = (l - h) * Math.pow(k, 1.6) * env(i, n, 1, def.decayMs);
    }
  } else if (def.type === 'hit') {
    // pitched thump + a short noise burst
    let phase = 0;
    let seed = 4242;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const f = def.freqEndHz + (def.freqStartHz - def.freqEndHz) * Math.exp(-6 * k);
      phase += (2 * Math.PI * f) / SR;
      const body = Math.sin(phase) * Math.exp(-5 * k);
      const burst = rnd() * Math.exp(-28 * k) * def.noiseMix;
      out[i] = (body + burst) * env(i, n, def.attackMs, def.decayMs);
    }
  } else if (def.type === 'ticks') {
    // a run of tiny clicks (typewriter), deterministic jitter
    let seed = 99;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const tickN = Math.round((def.tickMs / 1000) * SR);
    let t = 0;
    while (t < n - tickN) {
      const f = def.freqHz * (0.85 + 0.3 * rnd());
      for (let i = 0; i < tickN; i++) out[t + i] += Math.sin((2 * Math.PI * f * i) / SR) * Math.pow(1 - i / tickN, 2.5);
      t += Math.round(((def.intervalMs * (1 + (rnd() - 0.5) * 2 * def.jitter)) / 1000) * SR);
    }
  }
  const g = Math.pow(10, def.gainDb / 20);
  // normalise to peak 1 then apply the gain stored in tokens at playback time (Remotion volume), keep file at -1 dBFS
  let peak = 0;
  out.forEach((v) => (peak = Math.max(peak, Math.abs(v))));
  const k = peak > 0 ? 0.89 / peak : 1;
  return Array.from(out, (v) => v * k);
};

export const makeSfx = (cfg, outDir) => {
  fs.mkdirSync(outDir, {recursive: true});
  for (const [name, def] of Object.entries(cfg.sound.sfx)) {
    fs.writeFileSync(path.join(outDir, `${name}.wav`), wav(synth(def)));
  }
  return Object.keys(cfg.sound.sfx);
};
