// Generates an ORIGINAL ambient music bed (pad + bass + soft kick/hat/arp) from sound.music.generator.<palette> in the tokens file.
// Deterministic, royalty-free by construction, never derived from any reference audio. Output: 44.1 kHz mono PCM16 WAV.
import fs from 'node:fs';

const SR = 44100;

const writeWav = (file, samples) => {
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
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-1, Math.min(1, samples[i])) * 32767, 44 + i * 2);
  fs.writeFileSync(file, buf);
};

export const makeMusic = (cfg, palette, durationMs, outFile) => {
  const g = cfg.sound.music.generator[palette] || Object.values(cfg.sound.music.generator)[0];
  const n = Math.ceil(((durationMs + 1500) / 1000) * SR);
  const out = new Float32Array(n);
  const beat = (60 / g.bpm) * SR;
  const bar = beat * 4;
  const chordLen = bar * g.barsPerChord;
  const midi = (semi) => g.tonicHz * Math.pow(2, semi / 12);
  let seed = 2024;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

  // ----- pad: detuned additive saws, per-chord attack/release envelope, then a one-pole low-pass -----
  const att = (g.padAttackMs / 1000) * SR;
  const rel = (g.padReleaseMs / 1000) * SR;
  const nChords = Math.ceil(n / chordLen);
  for (let c = 0; c < nChords; c++) {
    const chord = g.chords[c % g.chords.length];
    const start = c * chordLen;
    const len = chordLen + rel; // overlap into the next chord for a smooth release
    for (const tone of chord.tones) {
      const f0 = midi(chord.root + tone + 12);
      for (const det of [-g.detuneCents, g.detuneCents]) {
        const f = f0 * Math.pow(2, det / 1200);
        for (let i = 0; i < len && start + i < n; i++) {
          const t = i / SR;
          let v = 0;
          for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
          const e = Math.min(1, i / att) * Math.min(1, Math.max(0, (len - i) / rel));
          out[start + i] += v * e * g.padGain * 0.05;
        }
      }
    }
    // bass: sine on the chord root, two octaves below the pad
    const fb = midi(chord.root);
    for (let i = 0; i < len && start + i < n; i++) {
      const e = Math.min(1, i / (att * 0.5)) * Math.min(1, Math.max(0, (len - i) / rel));
      out[start + i] += Math.sin(2 * Math.PI * fb * (i / SR)) * e * g.bassGain * 0.25;
    }
  }
  // soft low-pass on the harmonic bed
  const lp = Math.exp((-2 * Math.PI * g.lowpassHz) / SR);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = (1 - lp) * out[i] + lp * y;
    out[i] = y;
  }

  // ----- rhythm layer (after the low-pass so it keeps its edge) -----
  const addKick = (pos) => {
    const k = g.kick;
    const len = (k.ms / 1000) * SR;
    let ph = 0;
    for (let i = 0; i < len && pos + i < n; i++) {
      const x = i / len;
      const f = k.freqEndHz + (k.freqStartHz - k.freqEndHz) * Math.exp(-7 * x);
      ph += (2 * Math.PI * f) / SR;
      out[pos + i] += Math.sin(ph) * Math.exp(-5 * x) * k.gain * 0.5;
    }
  };
  const addHat = (pos) => {
    const len = (g.hat.ms / 1000) * SR;
    let p = 0;
    for (let i = 0; i < len && pos + i < n; i++) {
      const x = rnd();
      const hp = x - p; // crude high-pass
      p = x;
      out[pos + i] += hp * Math.pow(1 - i / len, 2) * g.hat.gain * 0.5;
    }
  };
  const addArp = (pos, freq) => {
    const len = (g.arp.decayMs / 1000) * SR;
    for (let i = 0; i < len && pos + i < n; i++) {
      const x = i / len;
      out[pos + i] += (Math.sin(2 * Math.PI * freq * (i / SR)) + 0.3 * Math.sin(4 * Math.PI * freq * (i / SR))) * Math.exp(-5 * x) * Math.min(1, i / 60) * g.arp.gain * 0.25;
    }
  };
  const totalBeats = Math.floor(n / beat);
  for (let b = 0; b < totalBeats; b++) {
    const pos = Math.round(b * beat);
    const chord = g.chords[Math.floor(pos / chordLen) % g.chords.length];
    if (g.kick.enabled && b % 4 === 0) addKick(pos);
    if (g.kick.enabled && b % 4 === 2) addKick(pos);
    if (g.hat.enabled) for (let s = 0; s < 1; s += g.hat.everyBeats) if (b % 2 === 1 || g.hat.everyBeats < 1) addHat(Math.round(pos + s * beat + (g.hat.everyBeats < 1 ? beat * 0.5 : 0)));
    if (g.arp.enabled) {
      const tones = chord.tones;
      for (let s = 0; s < 1; s += g.arp.everyBeats) {
        const idx = (b * Math.round(1 / g.arp.everyBeats) + Math.round(s / g.arp.everyBeats)) % tones.length;
        addArp(Math.round(pos + s * beat), midi(chord.root + tones[idx] + 12 * (g.arp.octave + 1)));
      }
    }
  }

  // normalise to -3 dBFS peak; level vs voice is applied by the Music component from the tokens
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? 0.708 / peak : 1;
  for (let i = 0; i < n; i++) out[i] *= k;
  writeWav(outFile, out);
  return outFile;
};
