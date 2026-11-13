#!/usr/bin/env node
// Animated short story from a voiceover MP3. Usage:
//   node .claude/skills/edit-style/scripts/story.mjs --audio input/voice.mp3 [--palette personal] [--formats 9x16,16x9]
//        [--out-dir output] [--name claude_edits_your_videos] [--frames a-b] [--transcript words.json] [--plan-only]
// Word timings come from Whisper; the on-screen text is the story script in the tokens file; gags are cued to words.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {makeSfx} from './make-sfx.mjs';
import {makeMusic} from './make-music.mjs';
import {buildPlan} from './lib/plan.mjs';
import {extractAudio, loadTranscriptFile, transcribeToWords} from './lib/transcribe.mjs';
import {resolvePalette} from '../shared/color.js';
import {shellArgs} from './lib/shellArgs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, '..');
const root = path.resolve(skillDir, '..', '..', '..');
const cfg = JSON.parse(fs.readFileSync(path.join(skillDir, 'style.config.json'), 'utf8'));
const S = cfg.story;

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
  else args[k] = true;
}
if (!args.audio) {
  console.log('usage: story.mjs --audio <voice.mp3> [--palette personal|tawelti] [--formats 9x16,16x9] [--out-dir dir] [--frames a-b] [--transcript words.json] [--plan-only]');
  process.exit(1);
}
const palette = args.palette || 'personalAurora'; // the animated story film keeps its own look (the main palette is now the reference-based one)
resolvePalette(cfg, palette);
const audio = path.resolve(args.audio);
const name = args.name || 'claude_edits_your_videos';
const outDir = path.resolve(args['out-dir'] || path.join(root, '..', 'output'));
const jobBase = path.join(process.env.OMNIMOTION_JOBS_DIR || path.join(root, '.edit-jobs'), `story-${palette}`);
fs.mkdirSync(jobBase, {recursive: true});

// ---------- 1. duration check ----------
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', audio]).toString());
const audioMs = Math.round(parseFloat(probe.format.duration) * 1000);
console.log(`Voiceover: ${(audioMs / 1000).toFixed(2)} s`);
if ((audioMs < S.minDurationMs || audioMs > S.maxDurationMs) && !args.force) {
  console.error(`The voiceover is ${(audioMs / 1000).toFixed(1)} s, outside ${S.minDurationMs / 1000} to ${S.maxDurationMs / 1000} s. Stopping so you can decide (use --force to continue).`);
  process.exit(2);
}

// ---------- 2. word timings (Whisper) ----------
let wWords;
if (args.transcript) wWords = loadTranscriptFile(path.resolve(args.transcript)).words;
else {
  const wav = path.join(jobBase, 'voice16k.wav');
  extractAudio(audio, wav);
  const r = await transcribeToWords({projectRoot: root, wavPath: wav, cfg, lang: 'en'});
  wWords = r.words;
}
fs.writeFileSync(path.join(jobBase, 'whisper.words.json'), JSON.stringify(wWords, null, 1));

// ---------- 3. align the script to the recognised words (timings from the audio, text from the script) ----------
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
const lev = (a, b) => {
  const d = Array.from({length: a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const sTok = S.script.join(' ').split(/\s+/).filter(Boolean);
const wTok = wWords.map((w) => norm(w.text));
const cost = (a, b) => {
  const x = norm(a);
  if (x === b) return 0;
  return lev(x, b) <= Math.max(1, Math.floor(Math.max(x.length, b.length) / 3)) ? 0.35 : 1.2;
};
const n = sTok.length;
const m = wTok.length;
const dp = Array.from({length: n + 1}, () => new Float32Array(m + 1));
for (let i = 1; i <= n; i++) dp[i][0] = i * 0.9;
for (let j = 1; j <= m; j++) dp[0][j] = j * 0.9;
for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) dp[i][j] = Math.min(dp[i - 1][j - 1] + cost(sTok[i - 1], wTok[j - 1]), dp[i - 1][j] + 0.9, dp[i][j - 1] + 0.9);
const match = new Array(n).fill(-1);
{
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const c = cost(sTok[i - 1], wTok[j - 1]);
    if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + c)) < 1e-4 && c < 1.2) {
      match[i - 1] = j - 1;
      i--;
      j--;
    } else if (Math.abs(dp[i][j] - (dp[i - 1][j] + 0.9)) < 1e-4) i--;
    else j--;
  }
}
const storyWords = sTok.map((text, i) => (match[i] >= 0 ? {text, startMs: wWords[match[i]].startMs, endMs: wWords[match[i]].endMs, matched: true} : {text, matched: false}));
for (let i = 0; i < n; i++) {
  if (storyWords[i].matched) continue;
  let p = i - 1;
  while (p >= 0 && !storyWords[p].matched) p--;
  let q = i + 1;
  while (q < n && !storyWords[q].matched) q++;
  const a = p >= 0 ? storyWords[p].endMs : 0;
  const b = q < n ? storyWords[q].startMs : audioMs;
  const span = q - p;
  storyWords[i].startMs = Math.round(a + ((b - a) * (i - p)) / span);
  storyWords[i].endMs = Math.round(a + ((b - a) * (i - p + 1)) / span);
}
const unmatched = storyWords.filter((w) => !w.matched).map((w) => w.text);
console.log(`Script words: ${n}, recognised words: ${m}, script words without a recognised twin: ${unmatched.length}${unmatched.length ? ' (' + unmatched.join(' ') + ')' : ''}`);

// ---------- 4. cues: words found in the transcript ----------
const cues = {};
const counts = {};
for (const w of storyWords) {
  const k = norm(w.text);
  counts[k] = (counts[k] || 0) + 1;
  for (const c of S.cues) if (c.word && norm(c.word) === k && (c.n || 1) === counts[k]) cues[c.id] = w.startMs;
}
const durationMs = Math.min(S.maxDurationMs, audioMs + S.durationTailMs);
for (const c of S.cues) {
  if (c.atMs !== undefined) cues[c.id] = c.atMs;
  if (c.endMs !== undefined) cues[c.id] = durationMs;
  if (cues[c.id] === undefined) throw new Error(`Cue "${c.id}" (${c.word}) not found in the transcript`);
}

// ---------- 5. sound events from the story rules ----------
const sfx = [];
for (const ev of S.sfxEvents) {
  const at = cues[ev.cue] + (ev.offsetMs || 0);
  if (ev.sfx === 'popWords') {
    storyWords.filter((w) => w.startMs >= cues[ev.fromCue] - 40 && w.startMs <= cues[ev.toCue] + 40).forEach((w) => sfx.push({type: 'popWords', atMs: w.startMs - 30}));
  } else if (ev.every) {
    for (let t = cues[ev.cue]; t < cues[ev.until]; t += ev.every) sfx.push({type: ev.sfx, atMs: t});
  } else if (ev.repeatMs) {
    ev.repeatMs.forEach((o) => sfx.push({type: ev.sfx, atMs: at + o}));
  } else sfx.push({type: ev.sfx, atMs: at});
}
sfx.sort((a, b) => a.atMs - b.atMs);

// ---------- 6. one plan per format ----------
const FORMATS = {'9x16': [1080, 1920], '16x9': [1920, 1080]};
const wanted = String(args.formats || '9x16,16x9').split(',');
const fps = cfg.output.fps;
const loudness = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8'});
  const sum = (r.stderr || '').slice((r.stderr || '').lastIndexOf('Summary:'));
  const num = (re) => (sum.match(re) ? parseFloat(sum.match(re)[1]) : null);
  return {lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), tp: num(/Peak:\s+(-?[\d.]+) dBFS/)};
};
const results = [];
for (const f of wanted) {
  const [width, height] = FORMATS[f];
  const job = path.join(jobBase, f);
  const pub = path.join(job, 'public');
  fs.mkdirSync(path.join(pub, 'sfx'), {recursive: true});
  fs.copyFileSync(audio, path.join(pub, 'voice.mp3'));
  const base = buildPlan({cfg, words: storyWords.map(({text, startMs, endMs}) => ({text, startMs, endMs})), durationMs, palette, lang: 'en', assets: [], media: {kind: 'audio', file: 'voice.mp3'}, width, height, fps});
  const plan = {
    palette, fps, width, height, durationMs,
    media: {kind: 'audio', file: 'voice.mp3', music: 'music.wav'},
    musicEnabled: true,
    musicBpm: (cfg.sound.music.generator[palette] || Object.values(cfg.sound.music.generator)[0]).bpm,
    hook: null,
    pages: base.pages,
    visuals: [], layouts: [{startMs: 0, endMs: durationMs, layout: 'graphicOnly'}], shots: [{startMs: 0, endMs: durationMs, scale: 1}], badges: [],
    cues, storyWords, sfx, sfxMeta: {},
  };
  makeSfx(cfg, path.join(pub, 'sfx'));
  makeMusic(cfg, palette, durationMs, path.join(pub, 'music.wav'));
  fs.writeFileSync(path.join(job, 'plan.json'), JSON.stringify(plan, null, 1));
  console.log(`[${f}] plan written: ${plan.pages.length} caption pages, ${sfx.length} sound events, ${(durationMs / 1000).toFixed(2)} s`);
  if (args['plan-only']) continue;

  const raw = path.join(job, 'render.mp4');
  const entry = path.join(skillDir, 'remotion', 'index.ts');
  const rArgs = ['remotion', 'render', entry, 'Story', raw, `--props=${path.join(job, 'plan.json')}`, `--public-dir=${pub}`, '--codec=h264', `--crf=${cfg.output.crf}`, '--image-format=png', '--pixel-format=yuv420p', '--overwrite', `--concurrency=${args.concurrency || cfg.output.renderConcurrency}`, `--timeout=${cfg.output.renderTimeoutMs}`];
  if (args.frames) rArgs.push(`--frames=${args.frames}`);
  console.log(`[${f}] rendering ${width}x${height}...`);
  const r = spawnSync('npx', shellArgs(rArgs), {cwd: root, stdio: 'inherit', shell: true});
  if (r.status !== 0) {
    console.error(`[${f}] render failed`);
    process.exit(r.status || 1);
  }
  fs.mkdirSync(outDir, {recursive: true});
  const out = path.join(outDir, `${name}_${f}.mp4`);
  if (args.frames) {
    fs.copyFileSync(raw, args.out ? path.resolve(String(args.out).replace('{f}', f)) : path.join(job, `partial_${f}.mp4`));
    continue;
  }
  const t = cfg.sound;
  const p1 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', raw, '-af', `loudnorm=I=${t.targetLufs}:TP=${t.truePeakDb}:LRA=11:print_format=json`, '-f', 'null', '-'], {encoding: 'utf8'});
  const js = (p1.stderr || '').match(/\{[\s\S]*?\}\s*$/);
  let filter = `loudnorm=I=${t.targetLufs}:TP=${t.truePeakDb}:LRA=11`;
  if (js) {
    const mm = JSON.parse(js[0]);
    filter += `:measured_I=${mm.input_i}:measured_TP=${mm.input_tp}:measured_LRA=${mm.input_lra}:measured_thresh=${mm.input_thresh}:offset=${mm.target_offset}:linear=true`;
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-c:v', 'copy', '-af', filter, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], {stdio: 'inherit'});
  const L = loudness(out);
  results.push({f, out, ...L});
  console.log(`[${f}] done: ${out}  ${L.lufs} LUFS, true peak ${L.tp} dBFS`);
}
fs.writeFileSync(path.join(jobBase, 'results.json'), JSON.stringify({cues, results, unmatched}, null, 1));
