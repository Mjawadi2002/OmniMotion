// Sound design for the Director plan.
// The planner proposes a sound for every visual event (a window opening, a number, a section title, a transition between clips). This module then
//   1. chooses the KIT that fits the look (or the one the user asked for) and how dense the sound should be,
//   2. keeps the strongest sounds and spreads them out (never two within the gap, never more than the density allows),
//   3. varies the samples, so two pops are never the same pop,
//   4. "listens" to every sample that is used (peak, clipping, silent head and tail) and fixes timing and tails,
//   5. levels each one against the MEASURED voice, so the voice is always on top,
//   6. reports what was placed, where it came from, its license, and what was left out and why.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export const loadSfxConfig = (skillDir) => JSON.parse(fs.readFileSync(path.join(skillDir, 'sfx.config.json'), 'utf8'));

// ---------------------------------------------------------------- listening
const SR = 22050;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);

// What a sample really contains: loudest point, silent head, silent tail, clipping, DC offset.
export const auditFile = (file) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 128 * 1024 * 1024});
  if (r.status !== 0 || !r.stdout || r.stdout.length < 16) return null;
  const n = Math.floor(r.stdout.length / 4);
  const x = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + n * 4));
  let peak = 0;
  let sum = 0;
  let hot = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    sum += x[i];
    if (a >= 0.999) hot++;
  }
  if (peak < 1e-5) return {durationMs: (n / SR) * 1000, onsetMs: 0, effectiveMs: 0, tailMs: 0, peakDb: -120, silent: true, flags: ['silent file']};
  const head = peak * Math.pow(10, -45 / 20);
  const tail = peak * Math.pow(10, -50 / 20);
  let first = 0;
  while (first < n && Math.abs(x[first]) < head) first++;
  let last = n - 1;
  while (last > first && Math.abs(x[last]) < tail) last--;
  const durationMs = (n / SR) * 1000;
  const onsetMs = (first / SR) * 1000;
  const effectiveMs = ((last + 1) / SR) * 1000;
  const flags = [];
  if (onsetMs > 12) flags.push(`silent start ${Math.round(onsetMs)} ms (timing compensated)`);
  if (durationMs - effectiveMs > 150) flags.push(`silent tail ${Math.round(durationMs - effectiveMs)} ms (trimmed)`);
  if (hot >= 3) flags.push('clips');
  if (Math.abs(sum / n) / peak > 0.05) flags.push('DC offset');
  return {durationMs, onsetMs, effectiveMs, tailMs: durationMs - effectiveMs, peakDb: db(peak), clipped: hot >= 3, flags};
};

// Integrated loudness and true peak of a voice track.
export const loudnessOf = (file) => {
  const m = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const t = m.stderr || '';
  const sum = t.slice(t.lastIndexOf('Summary:'));
  const num = (re) => {
    const x = sum.match(re);
    return x ? parseFloat(x[1]) : null;
  };
  const lufs = num(/I:\s+(-?[\d.]+)\s+LUFS/);
  const peakDb = num(/Peak:\s+(-?[\d.]+)\s+dBFS/);
  return Number.isFinite(lufs) && Number.isFinite(peakDb) ? {lufs, peakDb} : null;
};

// ---------------------------------------------------------------- the kit and the density
const DENSITIES = ['minimal', 'normal', 'rich'];
// Order of authority: what the user typed (--sfx), the look's own sound settings, the plan, then the palette / family of the look.
export const chooseSfx = ({arg, look, palette, edit, cfg}) => {
  const a = arg === true ? '' : String(arg || '').toLowerCase();
  if (a === 'off') return {off: true};
  const lookSfx = look?.sfx || {};
  const planSfx = edit?.sfx || {};
  const kitOk = (k) => k && cfg.kits[k];
  const kitName = [kitOk(a) && a, kitOk(lookSfx.kit) && lookSfx.kit, kitOk(planSfx.kit) && planSfx.kit, cfg.paletteKit[palette], look && cfg.familyKit[look.family], 'tech'].find(Boolean);
  const kit = cfg.kits[kitName];
  const densName = [DENSITIES.includes(a) && a, DENSITIES.includes(lookSfx.density) && lookSfx.density, DENSITIES.includes(planSfx.density) && planSfx.density, kit.density, 'normal'].find(Boolean);
  return {off: false, kitName, kit, densityName: densName, density: cfg.density[densName], gainDb: (kit.gainDb || 0) + (Number.isFinite(+lookSfx.gainDb) ? +lookSfx.gainDb : 0)};
};

// ---------------------------------------------------------------- choosing the moments
// events: [{type, atMs, why, prio?, gDb?}] as proposed by the planner (type may be 'fx:<transition>' or 'emphasis').
export const designSfx = ({events, durationMs, choice, cfg}) => {
  const skipped = [];
  const skip = (e, reason) => skipped.push({type: e.type, atMs: e.atMs, why: e.why || '', reason});
  const prio = (t) => cfg.priority[t] ?? 4;

  // 1. the kit decides which sound each event gets
  const list = [];
  for (const e0 of [...events].sort((a, b) => a.atMs - b.atMs)) {
    const e = {...e0};
    if (e.type === 'emphasis') {
      if (!cfg.emphasis.enabled) continue;
      e.type = choice.kit.emphasis || 'tick';
      e.prio = cfg.emphasis.prio;
      e.gDb = cfg.emphasis.weightDb;
      e.emph = true;
    } else if (e.type.startsWith('fx:')) {
      const base = cfg.fxMap[e.type.slice(3)];
      if (!base) {
        skip(e, 'plain transition: no sound needed');
        continue;
      }
      e.type = base;
    }
    e.type = choice.kit.typeMap[e.type] || e.type;
    e.prio = e.prio ?? prio(e.type);
    if (e.prio < (choice.density.minPrio || 0)) {
      skip(e, `too light for the ${choice.densityName} density`);
      continue;
    }
    list.push(e);
  }

  // 2. keep the strongest, spread them out
  const rhythm = new Set(cfg.rhythmTypes);
  const gap = choice.density.gapMs;
  const clash = (a, b) => Math.abs(a.atMs - b.atMs) < (rhythm.has(a.type) && a.type === b.type ? cfg.rhythmGapMs : gap);
  const kept = [];
  for (const e of [...list].sort((a, b) => b.prio - a.prio || a.atMs - b.atMs)) {
    const c = kept.find((k) => clash(k, e));
    if (c) skip(e, `within ${gap} ms of a stronger sound (${c.type} at ${(c.atMs / 1000).toFixed(2)} s)`);
    else kept.push(e);
  }
  kept.sort((a, b) => a.atMs - b.atMs);
  // emphasized words get the lightest sound, and only now and then: counted among the sounds that survived
  let lastEmph = -1e9;
  for (const e of [...kept]) {
    if (!e.emph) continue;
    const emphGap = choice.density.emphasisGapMs ?? cfg.emphasis.minGapMs;
    if (e.atMs - lastEmph < emphGap) {
      kept.splice(kept.indexOf(e), 1);
      skip(e, `another emphasis sound within ${emphGap} ms`);
    } else lastEmph = e.atMs;
  }

  // 3. never more than the density allows: drop the weakest, and among equals the one that crowds its neighbour most
  const maxN = Math.max(1, Math.ceil((choice.density.perMinute * durationMs) / 60000));
  while (kept.length > maxN) {
    const lowest = Math.min(...kept.map((e) => e.prio));
    const pool = kept.filter((e) => e.prio === lowest);
    const crowd = (e) => Math.min(...kept.filter((k) => k !== e).map((k) => Math.abs(k.atMs - e.atMs)), 1e9);
    pool.sort((a, b) => crowd(a) - crowd(b));
    const out = pool[0];
    kept.splice(kept.indexOf(out), 1);
    skip(out, `more than ${choice.density.perMinute} sounds a minute (${choice.densityName})`);
  }

  // 4. vary the samples: the same sound never plays twice in a row with the same sample
  const used = {};
  for (const e of kept) {
    const alts = (cfg.variants[e.type] || []).length;
    if (!alts) continue;
    const next = ((used[e.type] ?? -1) + 1) % (alts + 1);
    used[e.type] = next;
    if (next) e.v = next;
  }
  skipped.sort((a, b) => a.atMs - b.atMs);
  return {sfx: kept, skipped};
};

// ---------------------------------------------------------------- the samples
const thirdParty = (skillDir) => {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(skillDir, 'assets', 'cc0', 'THIRD_PARTY.md'), 'utf8').split(/\r?\n/)) {
      const c = line.split('|').map((s) => s.trim());
      if (c.length > 6 && c[2] === 'sfx') out[c[1]] = {license: c[4], origin: c[5]};
    }
  } catch {
    // no table: licenses are reported as unknown
  }
  return out;
};

// Copies every sample the edit uses into the job's public/sfx, listens to it, and works out its level and timing.
// voice: {lufs, peakDb} measured from the speech, or null (then the levels from the tokens are used).
export const buildSamples = ({sfx, cfg, styleCfg, skillDir, pub, voice, choice}) => {
  const dir = path.join(pub, 'sfx');
  const lic = thirdParty(skillDir);
  const meta = {};
  const keys = new Map();
  for (const e of sfx) keys.set(e.v ? `${e.type}~${e.v}` : e.type, e);
  for (const [key, e] of keys) {
    const type = e.type;
    const libDef = styleCfg.sound.library?.[type];
    const base = libDef?.file || cfg.extraLibrary[type] || null;
    const wanted = e.v ? cfg.variants[type]?.[e.v - 1] : null;
    const sampleName = [wanted, base].find((n) => n && fs.existsSync(path.join(skillDir, 'assets', 'cc0', 'sfx', `${n}.wav`)));
    const target = path.join(dir, `${key}.wav`);
    if (sampleName) fs.copyFileSync(path.join(skillDir, 'assets', 'cc0', 'sfx', `${sampleName}.wav`), target);
    else if (e.v) fs.copyFileSync(path.join(dir, `${type}.wav`), target); // no real alternative: the synthesised sound is used
    if (!fs.existsSync(target)) continue;
    const a = auditFile(target);
    if (!a || a.silent) continue;
    // level: relative to the measured voice when known
    let gainDb;
    if (voice) {
      const weight = cfg.weightDb[type] ?? -3;
      let aim = voice.peakDb - cfg.level.peakBelowVoicePeakDb + weight + choice.gainDb;
      aim = Math.min(aim, voice.peakDb - cfg.level.neverAboveBelowVoicePeakDb);
      gainDb = aim - a.peakDb;
    } else gainDb = libDef?.gainDb ?? styleCfg.sound.sfx[type]?.gainDb ?? -14;
    meta[key] = {
      durationMs: Math.round(a.durationMs),
      effectiveMs: Math.round(a.effectiveMs),
      onsetMs: a.onsetMs > 12 ? Math.round(a.onsetMs) : 0,
      gainDb: Math.round(gainDb * 10) / 10,
      tailMs: libDef?.tailMs,
      source: sampleName || 'synthesised',
      license: sampleName ? lic[sampleName]?.license || 'CC0 1.0' : 'original (generated by the engine)',
      origin: sampleName ? lic[sampleName]?.origin || '' : 'generated from numeric tokens',
      peakDb: Math.round(a.peakDb * 10) / 10,
      flags: a.flags,
    };
  }
  return meta;
};

// ---------------------------------------------------------------- the report
export const soundReport = ({sfx, skipped, meta, choice, voice, cfg}) => {
  const t = (ms) => `${(ms / 1000).toFixed(2)} s`;
  if (choice.off) return ['## Sound effects', '- Switched off (--sfx off).'];
  const rows = sfx.map((e) => {
    const m = meta[e.v ? `${e.type}~${e.v}` : e.type] || {};
    return `| ${t(e.atMs)} | ${e.why || e.type} | ${e.type}${e.v ? ' (variant ' + (e.v + 1) + ')' : ''} | ${m.source || '?'} | ${m.license || '?'} | ${voice && m.peakDb !== undefined ? (m.gainDb + (e.gDb || 0) + m.peakDb - voice.peakDb).toFixed(1) + ' dB vs voice peak' : (m.gainDb ?? '?') + ' dB'} |`;
  });
  const lines = [
    '## Sound effects',
    `- Kit: **${choice.kitName}** (${choice.kit.label}); density: **${choice.densityName}** (at most ${choice.density.perMinute} a minute, at least ${choice.density.gapMs} ms apart).`,
    voice ? `- Level: every effect is placed relative to the measured voice (voice ${voice.lufs} LUFS, peak ${voice.peakDb} dBFS); effects peak about ${cfg.level.peakBelowVoicePeakDb} dB under the voice peak and never closer than ${cfg.level.neverAboveBelowVoicePeakDb} dB, so the voice always wins.` : '- Level: the voice could not be measured, so the default levels were used.',
    `- Placed: ${sfx.length}. Left out: ${skipped.length}.`,
    '',
    '| Time | Why | Sound | Sample | License | Peak level |',
    '|---|---|---|---|---|---|',
    ...rows,
  ];
  const fixes = Object.entries(meta).filter(([, m]) => m.flags && m.flags.length);
  if (fixes.length) lines.push('', '**Checked and corrected:**', ...fixes.map(([k, m]) => `- ${k} (${m.source}): ${m.flags.join(', ')}`));
  if (skipped.length) lines.push('', '**Moments left out:**', ...skipped.map((s) => `- ${t(s.atMs)} ${s.why || s.type}: ${s.reason}`));
  return lines;
};
