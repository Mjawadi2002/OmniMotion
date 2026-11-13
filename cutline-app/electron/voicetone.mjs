// How the voice sounds, measured from the audio (Claude cannot listen, so it reads these numbers): pitch and how much it moves, loudness and how
// much it changes, speaking pace, pauses, and how the first seconds compare with the rest. Pitch is found by autocorrelation on voiced frames.
import {spawnSync} from 'node:child_process';

const SR = 16000;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))] : 0;
};
const std = (a) => {
  if (!a.length) return 0;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
};
const r1 = (x) => Math.round(x * 10) / 10;

const decode = (file, maxSec = 180) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-t', String(maxSec), '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 1 << 29, windowsHide: true});
  if (r.status !== 0 || !r.stdout || r.stdout.length < 4000) return null;
  const n = Math.floor(r.stdout.length / 4);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + n * 4));
};

// pitch of one frame (Hz) or 0 when it is not clearly voiced
const pitchOf = (x, start, len) => {
  const minLag = Math.floor(SR / 400);
  const maxLag = Math.floor(SR / 70);
  let e0 = 0;
  for (let i = 0; i < len; i++) e0 += x[start + i] * x[start + i];
  if (e0 <= 0) return 0;
  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    let e1 = 0;
    for (let i = 0; i < len - lag; i++) {
      c += x[start + i] * x[start + i + lag];
      e1 += x[start + i + lag] * x[start + i + lag];
    }
    const nc = c / Math.sqrt(e0 * e1 + 1e-12);
    if (nc > best) {
      best = nc;
      bestLag = lag;
    }
  }
  return best > 0.55 && bestLag ? SR / bestLag : 0;
};

// words: [{text, startMs, endMs}] from the transcript (for pace and pauses); events: audio events tagged by the transcriber (laughter, music, applause)
export const voiceFeatures = (file, words = [], events = []) => {
  const x = decode(file);
  if (!x) return null;
  const hop = Math.floor(SR * 0.02);
  const win = Math.floor(SR * 0.04);
  const frames = [];
  for (let s = 0; s + win < x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < win; i++) e += x[s + i] * x[s + i];
    frames.push({t: s / SR, db: 10 * Math.log10(e / win + 1e-12), s});
  }
  const loudFloor = pct(frames.map((f) => f.db), 0.3) + 6;
  const voiced = [];
  for (let k = 0; k < frames.length; k += 2) {
    const f = frames[k];
    if (f.db < loudFloor) continue;
    const hz = pitchOf(x, f.s, win);
    if (hz) voiced.push({t: f.t, hz, db: f.db});
  }
  const semis = voiced.map((v) => 12 * Math.log2(v.hz / 100));
  const f0 = median(voiced.map((v) => v.hz));
  const pitchRange = pct(semis, 0.9) - pct(semis, 0.1);
  const pitchVar = std(semis);
  const loudVar = std(voiced.map((v) => v.db));

  // pace and pauses from the transcript
  const speech = words.filter((w) => w.endMs > w.startMs);
  let wpm = null;
  let pauseShare = null;
  let longPauses = 0;
  if (speech.length > 3) {
    const span = (speech[speech.length - 1].endMs - speech[0].startMs) / 60000;
    wpm = Math.round(speech.length / Math.max(0.05, span));
    let gaps = 0;
    for (let i = 1; i < speech.length; i++) {
      const g = speech[i].startMs - speech[i - 1].endMs;
      if (g > 350) {
        gaps += g;
        if (g > 700) longPauses++;
      }
    }
    pauseShare = Math.round((gaps / (span * 60000)) * 100);
  }
  // the first 3 seconds against the rest: louder or more animated openings hook better
  const first = voiced.filter((v) => v.t < 3);
  const rest = voiced.filter((v) => v.t >= 3);
  const firstLift = first.length && rest.length ? r1(median(first.map((v) => v.db)) - median(rest.map((v) => v.db))) : null;
  const firstWords = speech.filter((w) => w.startMs < 3000).length;

  const label = {
    pitch: !voiced.length ? 'unknown' : pitchVar < 1.6 ? 'flat, monotone' : pitchVar < 3 ? 'moderately expressive' : 'very expressive, lots of melody',
    energy: loudVar < 3 ? 'steady' : loudVar < 6 ? 'varied' : 'very dynamic (big swings in loudness)',
    pace: wpm === null ? 'unknown' : wpm < 120 ? 'slow' : wpm < 165 ? 'conversational' : wpm < 200 ? 'fast' : 'very fast',
  };
  return {
    voicedSeconds: r1(voiced.length * 0.04),
    medianPitchHz: Math.round(f0),
    pitchRangeSemitones: r1(pitchRange),
    pitchVariationSemitones: r1(pitchVar),
    loudnessVariationDb: r1(loudVar),
    wordsPerMinute: wpm,
    pauseSharePercent: pauseShare,
    longPauses,
    wordsInFirst3s: firstWords,
    first3sLouderByDb: firstLift,
    audioEvents: events.slice(0, 30),
    labels: label,
    note: 'Measured from the audio. Words per minute are counted on the transcript (Arabic and French words are longer or shorter than English ones, so compare within a language).',
  };
};
