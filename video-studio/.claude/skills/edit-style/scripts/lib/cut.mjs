// Silence-only cutting. Words are never cut: pauses longer than silence.minPauseMs are shortened to ~silence.keepGapMs,
// and only where FFmpeg also confirms the audio is quiet. Output is a list of keep-segments (in source frames) that the
// Remotion composition plays back-to-back, with 2-frame audio fades at every seam, plus the retimed word list.
import {spawnSync} from 'node:child_process';

// ffmpeg writes silencedetect to stderr, so read it through spawnSync.
export const silences = (file, noiseDb, minSec = 0.12) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', `silencedetect=noise=${noiseDb}dB:d=${minSec}`, '-f', 'null', '-'], {encoding: 'utf8'});
  const out = [];
  let start = null;
  for (const line of (r.stderr || '').split(/\r?\n/)) {
    const a = line.match(/silence_start:\s*(-?[\d.]+)/);
    const b = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (a) start = Math.max(0, parseFloat(a[1]));
    if (b && start !== null) {
      out.push([Math.round(start * 1000), Math.round(parseFloat(b[1]) * 1000)]);
      start = null;
    }
  }
  if (start !== null) out.push([Math.round(start * 1000), Infinity]);
  return out;
};

const intersect = (a0, a1, list) => {
  const res = [];
  for (const [s, e] of list) {
    const x0 = Math.max(a0, s);
    const x1 = Math.min(a1, e);
    if (x1 > x0) res.push([x0, x1]);
  }
  return res;
};

export const computeSegments = ({words, durationMs, fps, cfg, silenceList, extraCuts = []}) => {
  const S = cfg.pacing.silence;
  const f2ms = (f) => (f * 1000) / fps;
  const ms2f = (ms) => Math.round((ms * fps) / 1000);
  const margin = f2ms(S.marginFrames);
  const half = Math.max(S.keepGapMs / 2, margin);
  const cuts = []; // [startMs, endMs] removed, source time
  const consider = (gapStart, gapEnd, isEdge) => {
    if (gapEnd - gapStart <= S.minPauseMs) return;
    const a = gapStart + half;
    const b = gapEnd - half;
    if (b - a < f2ms(2)) return;
    for (const [x0, x1] of intersect(a, b, silenceList)) {
      const s = ms2f(x0);
      const e = ms2f(x1);
      if (e - s >= 2) cuts.push([f2ms(s), f2ms(e)]);
    }
  };
  // leading, between words, trailing
  consider(0, words[0].startMs, true);
  for (let i = 0; i < words.length - 1; i++) consider(words[i].endMs, words[i + 1].startMs, false);
  consider(words[words.length - 1].endMs, durationMs, true);

  // parts the user removed in the editor (source ms), merged with the silence cuts
  for (const [s0, e0] of extraCuts) {
    const s1 = f2ms(ms2f(Math.max(0, s0)));
    const e1 = f2ms(ms2f(Math.min(durationMs, e0)));
    if (e1 > s1) cuts.push([s1, e1]);
  }
  cuts.sort((a, b) => a[0] - b[0]);
  for (let i = cuts.length - 1; i > 0; i--) {
    if (cuts[i][0] <= cuts[i - 1][1]) {
      cuts[i - 1][1] = Math.max(cuts[i - 1][1], cuts[i][1]);
      cuts.splice(i, 1);
    }
  }

  // keep segments = complement of cuts
  const keeps = [];
  let cur = 0;
  for (const [s, e] of cuts) {
    if (s > cur) keeps.push([cur, s]);
    cur = e;
  }
  if (cur < durationMs) keeps.push([cur, durationMs]);

  const segments = [];
  let out = 0;
  for (const [s, e] of keeps) {
    const srcStartF = ms2f(s);
    const durF = Math.max(1, ms2f(e) - srcStartF);
    segments.push({srcStartF, durF, outStartF: out, srcStartMs: Math.round(f2ms(srcStartF)), srcEndMs: Math.round(f2ms(srcStartF + durF)), outStartMs: Math.round(f2ms(out))});
    out += durF;
  }
  const outDurationMs = Math.round(f2ms(out));

  const mapMs = (t) => {
    const f = ms2f(t);
    for (const sg of segments) {
      if (f >= sg.srcStartF && f <= sg.srcStartF + sg.durF) return Math.round(f2ms(sg.outStartF + (f - sg.srcStartF)));
    }
    // inside a removed region: snap to the nearest seam (should not happen for words)
    let best = segments[0];
    let bd = Infinity;
    for (const sg of segments) {
      const d = Math.min(Math.abs(f - sg.srcStartF), Math.abs(f - (sg.srcStartF + sg.durF)));
      if (d < bd) {
        bd = d;
        best = sg;
      }
    }
    return Math.round(f2ms(best.outStartF));
  };
  const retimed = words.map((w) => ({...w, startMs: mapMs(w.startMs), endMs: Math.max(mapMs(w.endMs), mapMs(w.startMs) + 40)}));
  const seams = segments.slice(1).map((sg) => sg.outStartMs);
  const removedMs = cuts.reduce((a, [s, e]) => a + (e - s), 0);
  return {segments, retimed, seams, outDurationMs, removedMs: Math.round(removedMs), cuts: cuts.map(([s, e]) => [Math.round(s), Math.round(e)])};
};
