#!/usr/bin/env node
// edit-style runner: new input (video | audio | script .txt) + optional assets folder + palette  ->  styled video.
// Usage: node .claude/skills/edit-style/scripts/run.mjs --input <file> --palette personal|tawelti [options]
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {makeSfx} from './make-sfx.mjs';
import {makeMusic} from './make-music.mjs';
import {buildPlan} from './lib/plan.mjs';
import {extractAudio, loadTranscriptFile, normalizePunctuation, readApiKey, transcribeElevenLabs, transcribeToWords, wordsFromScript} from './lib/transcribe.mjs';
import {resolvePalette} from '../shared/color.js';
import {computeSegments, silences} from './lib/cut.mjs';
import {shellArgs} from './lib/shellArgs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, '..');
const root = path.resolve(skillDir, '..', '..', '..'); // <project>/.claude/skills/edit-style -> <project>
const cfg = JSON.parse(fs.readFileSync(path.join(skillDir, 'style.config.json'), 'utf8'));

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const [k, v] = a.slice(2).split('=');
  if (v !== undefined) args[k] = v;
  else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
  else args[k] = true;
}

if (args.help || !args.input) {
  console.log(`edit-style  --input <video|audio|script.txt> [--palette ${Object.keys(cfg.palettes).join('|')}] [--assets <dir>]
            [--lang auto|ar|en|fr|...] [--aspect 9:16|16:9|1:1|4:5] [--short-side 1080] [--out file.mp4]
            [--cut-silence] [--match-source] [--report <file.md>] [--stt whisper|elevenlabs] [--music on|off|<file>] [--transcript words.json|whisper.json|elevenlabs.json|file.srt] [--name job-name] [--frames 0-120] [--plan-only] [--no-loudnorm]`);
  process.exit(args.help ? 0 : 1);
}

const palette = args.palette || cfg.palette;
resolvePalette(cfg, palette); // throws on unknown palette
const input = path.resolve(args.input);
if (!fs.existsSync(input)) throw new Error(`Input not found: ${input}`);

const name = args.name || path.basename(input, path.extname(input)).replace(/[^\w.-]+/g, '_').slice(0, 40);
const jobDir = path.join(process.env.OMNIMOTION_JOBS_DIR || path.join(root, '.edit-jobs'), `${name}-${palette}`);
const pub = path.join(jobDir, 'public');
fs.mkdirSync(path.join(pub, 'assets'), {recursive: true});

// ---------- output size ----------
const [aw, ah] = cfg.output.aspects[args.aspect || cfg.output.defaultAspect];
const ss = Number(args['short-side'] || cfg.output.shortSide);
const even = (n) => Math.round(n / 2) * 2;
let width = aw <= ah ? even(ss) : even((ss * aw) / ah);
let height = aw <= ah ? even((ss * ah) / aw) : even(ss);
let fps = cfg.output.fps;
let srcInfo = null;

// ---------- input type ----------
const ext = path.extname(input).toLowerCase();
const isScript = ['.txt', '.md'].includes(ext);
let media = {kind: 'none', file: null};
let durationMs = 0;
if (!isScript) {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input]).toString());
  const hasVideo = probe.streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  durationMs = Math.round(parseFloat(probe.format.duration) * 1000);
  const vs = probe.streams.find((x) => x.codec_type === 'video');
  const as = probe.streams.find((x) => x.codec_type === 'audio');
  if (vs) {
    const [fn, fd] = vs.r_frame_rate.split('/').map(Number);
    srcInfo = {width: vs.width, height: vs.height, fps: fd ? fn / fd : fn, codec: vs.codec_name, audio: as ? `${as.codec_name} ${as.sample_rate} Hz ${as.channels}ch` : 'none', durationMs};
    if (args['match-source']) {
      width = even(vs.width);
      height = even(vs.height);
      fps = Math.round(srcInfo.fps * 1000) / 1000;
    }
  }
  const file = `input${ext}`;
  fs.copyFileSync(input, path.join(pub, file));
  media = {kind: hasVideo ? 'video' : 'audio', file};
}

// ---------- assets ----------
const assets = [];
if (args.assets) {
  const dir = path.resolve(args.assets);
  for (const f of fs.readdirSync(dir)) {
    const e = path.extname(f).slice(1).toLowerCase();
    const base = path.basename(f, path.extname(f));
    if (cfg.visuals.image.extensions.includes(e)) {
      fs.copyFileSync(path.join(dir, f), path.join(pub, 'assets', f));
      assets.push({base, file: f, publicPath: `assets/${f}`});
    } else if (new RegExp('^' + cfg.sound.music.fileGlob.replace('.', '\\.').replace('*', '.*') + '$').test(f)) {
      fs.copyFileSync(path.join(dir, f), path.join(pub, f));
      media.music = f;
    }
  }
}

// ---------- transcript ----------
let words;
let language = args.lang || 'auto';
if (args.transcript) {
  words = loadTranscriptFile(path.resolve(args.transcript)).words;
} else if (isScript) {
  words = wordsFromScript(fs.readFileSync(input, 'utf8'), cfg);
  durationMs = words[words.length - 1].endMs + 800;
} else {
  const wav = path.join(jobDir, 'voice16k.wav');
  extractAudio(input, wav);
  let engine = args.stt || cfg.transcription.engine;
  if (engine === 'elevenlabs' && !readApiKey(root, cfg.transcription.providers.elevenlabs.apiKeyEnv)) {
    console.warn('No ElevenLabs key found (.env / environment): falling back to local Whisper.');
    engine = 'whisper';
  }
  if (engine === 'elevenlabs') {
    console.log('Transcribing with ElevenLabs Scribe (the 16 kHz mono audio track is uploaded to ElevenLabs)...');
    const r = await transcribeElevenLabs({projectRoot: root, wavPath: wav, cfg, lang: args.lang, outDir: jobDir});
    words = r.words;
    language = args.lang || cfg.transcription.languageAliases[r.language] || r.language || 'auto';
    console.log(`ElevenLabs: ${words.length} words, language ${r.language}. Full text: ${path.join(jobDir, 'transcript.txt')}`);
  } else {
    console.log('Transcribing with Whisper.cpp (this can take a minute)...');
    const r = await transcribeToWords({projectRoot: root, wavPath: wav, cfg, lang: args.lang});
    words = r.words;
    console.log(`Whisper model: ${r.model}, detected language: ${r.language}`);
  }
}
words = normalizePunctuation(words, cfg);
fs.writeFileSync(path.join(jobDir, 'transcript.words.json'), JSON.stringify(words, null, 1));

// ---------- silence-only cuts (owner brief): shorten pauses, never touch words ----------
const sourceDurationMs = durationMs;
let cutInfo = null;
if ((args['cut-silence'] || cfg.pacing.silence.enabled) && !isScript) {
  const sil = silences(input, cfg.pacing.silence.noiseDb, 0.15);
  cutInfo = computeSegments({words, durationMs, fps, cfg, silenceList: sil});
  console.log(`Silence cuts: ${cutInfo.cuts.length} removed, ${(cutInfo.removedMs / 1000).toFixed(2)} s; ${(durationMs / 1000).toFixed(2)} s -> ${(cutInfo.outDurationMs / 1000).toFixed(2)} s`);
  fs.writeFileSync(path.join(jobDir, 'transcript.retimed.json'), JSON.stringify(cutInfo.retimed, null, 1));
  fs.writeFileSync(path.join(jobDir, 'cuts.json'), JSON.stringify({cuts: cutInfo.cuts, segments: cutInfo.segments}, null, 1));
  words = cutInfo.retimed;
  durationMs = cutInfo.outDurationMs;
  media.segments = cutInfo.segments;
}
const unsureWords = words.filter((w) => typeof w.conf === 'number' && w.conf < cfg.transcription.unsureConfidence).map((w) => ({text: w.text, atMs: w.startMs, conf: w.conf}));

// ---------- plan ----------
const plan = buildPlan({cfg, words, durationMs, palette, lang: language, assets, media, width, height, fps, cuts: cutInfo ? cutInfo.seams : []});
fs.writeFileSync(path.join(jobDir, 'plan.json'), JSON.stringify(plan, null, 1));
// ---------- music bed: own file (--music <file> or assets/music.*), generated bed (default from tokens), or none ----------
const musicArg = args.music;
if (musicArg && !['on', 'off', true].includes(musicArg) && fs.existsSync(path.resolve(String(musicArg)))) {
  const f = `music${path.extname(String(musicArg))}`;
  fs.copyFileSync(path.resolve(String(musicArg)), path.join(pub, f));
  plan.media.music = f;
} else if (!plan.media.music && musicArg !== 'off' && (musicArg === 'on' || musicArg === true || cfg.sound.music.enabled)) {
  const libId = cfg.sound.music.library?.[palette];
  const libFile = libId ? path.join(skillDir, 'assets', 'cc0', 'music', `${libId}.mp3`) : null;
  if (cfg.sound.music.source === 'library' && libFile && fs.existsSync(libFile) && args['music-source'] !== 'generated') {
    fs.copyFileSync(libFile, path.join(pub, 'music.mp3'));
    plan.media.music = 'music.mp3';
    try {
      plan.musicBpm = JSON.parse(fs.readFileSync(path.join(skillDir, 'assets', 'cc0', 'music', 'bpm.json'), 'utf8'))[libId] || null;
    } catch {
      plan.musicBpm = null;
    }
    plan.musicCredit = `${libId} (CC0, see assets/cc0/THIRD_PARTY.md)`;
  } else {
    makeMusic(cfg, palette, plan.durationMs, path.join(pub, 'music.wav'));
    plan.media.music = 'music.wav';
  }
}
plan.musicEnabled = !!plan.media.music && musicArg !== 'off';
if (plan.musicEnabled && plan.media.music === 'music.wav') plan.musicBpm = (cfg.sound.music.generator[palette] || Object.values(cfg.sound.music.generator)[0]).bpm;
if (!plan.musicEnabled) plan.musicBpm = null;

// sound effects: synthesised fallbacks first, then real CC0 samples override any type that has a library file
makeSfx(cfg, path.join(pub, 'sfx'));
plan.sfxMeta = {};
for (const [type, def] of Object.entries(cfg.sound.library || {})) {
  const f = path.join(skillDir, 'assets', 'cc0', 'sfx', `${def.file}.wav`);
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, path.join(pub, 'sfx', `${type}.wav`));
    plan.sfxMeta[type] = {durationMs: def.durationMs, gainDb: def.gainDb, tailMs: def.tailMs, source: def.file};
  }
}
fs.writeFileSync(path.join(jobDir, 'plan.json'), JSON.stringify(plan, null, 1));
console.log('Plan:', JSON.stringify(plan.stats), 'music:', plan.media.music || 'none');
if (args['plan-only']) {
  console.log(`Plan written to ${path.join(jobDir, 'plan.json')}`);
  process.exit(0);
}

// ---------- render ----------
const outDir = path.join(root, 'out');
fs.mkdirSync(outDir, {recursive: true});
const out = path.resolve(args.out || path.join(outDir, `${name}-${palette}.mp4`));
const rawOut = path.join(jobDir, 'render.mp4');
const entry = path.join(skillDir, 'remotion', 'index.ts');
const rArgs = ['remotion', 'render', entry, 'Main', rawOut, `--props=${path.join(jobDir, 'plan.json')}`, `--public-dir=${pub}`, '--codec=h264', `--crf=${cfg.output.crf}`, '--overwrite'];
if (args.frames) rArgs.push(`--frames=${args.frames}`);
rArgs.push(`--concurrency=${args.concurrency || cfg.output.renderConcurrency}`, `--timeout=${cfg.output.renderTimeoutMs}`, `--offthreadvideo-cache-size-in-bytes=${cfg.output.offthreadCacheBytes}`);
console.log('Rendering:', rArgs.join(' '));
const r = spawnSync('npx', shellArgs(rArgs), {cwd: root, stdio: 'inherit', shell: true});
if (r.status !== 0) {
  console.error('Render failed.');
  process.exit(r.status || 1);
}

// ---------- loudness (two-pass loudnorm to the tokens target) + faststart ----------
const measure = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8'});
  const t = r.stderr || '';
  const sum = t.slice(t.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = sum.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  return {lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/)};
};
if (args['no-loudnorm'] || args.frames) {
  fs.copyFileSync(rawOut, out);
} else {
  const S = cfg.sound;
  const pass1 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', rawOut, '-af', `loudnorm=I=${S.targetLufs}:TP=${S.truePeakDb}:LRA=11:print_format=json`, '-f', 'null', '-'], {encoding: 'utf8'});
  const js = (pass1.stderr || '').match(/\{[\s\S]*?\}\s*$/);
  let filter = `loudnorm=I=${S.targetLufs}:TP=${S.truePeakDb}:LRA=11`;
  if (js) {
    const m = JSON.parse(js[0]);
    filter += `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', rawOut, '-c:v', 'copy', '-af', filter, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], {stdio: 'inherit'});
}
const finalLoud = measure(out);
console.log(`\nDone: ${out}`);
console.log(`Final loudness: ${finalLoud.lufs} LUFS, LRA ${finalLoud.lra}, true peak ${finalLoud.truePeak} dBFS`);

// ---------- edit report ----------
if (args.report) {
  const fmt = (ms) => `${(ms / 1000).toFixed(2)} s`;
  const counts = (arr) => arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
  const vis = plan.visuals.map((v) => `- ${fmt(v.startMs)} to ${fmt(v.endMs)}: **${v.component}** (${v.variant})${v.data?.text ? ` "${v.data.text}"` : v.data?.value ? ` "${v.data.value}"` : v.data?.topic ? ` "${v.data.label.replace('{n}', v.data.n)} / ${v.data.topic}"` : v.data?.items ? ` [${v.data.items.map((x) => x.text).join(', ')}]` : ''}`);
  const lines = [
    `# Edit report: ${path.basename(input)}`,
    '',
    '## Result',
    `- Output: \`${out}\``,
    `- Source: ${srcInfo ? `${srcInfo.width}x${srcInfo.height} @ ${srcInfo.fps} fps, ${srcInfo.codec}, audio ${srcInfo.audio}` : 'n/a'}`,
    `- Output format: ${width}x${height} @ ${fps} fps, H.264 CRF ${cfg.output.crf}, AAC 192 kbps 48 kHz, faststart`,
    `- Duration before: ${fmt(sourceDurationMs)}`,
    `- Duration after: ${fmt(durationMs)}${cutInfo ? ` (removed ${fmt(cutInfo.removedMs)} of silence, ${((cutInfo.removedMs / sourceDurationMs) * 100).toFixed(1)}%)` : ''}`,
    `- Silence cuts: ${cutInfo ? cutInfo.cuts.length : 0} (pauses > ${cfg.pacing.silence.minPauseMs} ms shortened to about ${cfg.pacing.silence.keepGapMs} ms; words untouched; ${cfg.pacing.silence.crossfadeFrames}-frame audio fades at each seam)`,
    `- Loudness: ${finalLoud.lufs} LUFS integrated, LRA ${finalLoud.lra} LU, true peak ${finalLoud.truePeak} dBFS (target ${cfg.sound.targetLufs} LUFS, below ${cfg.sound.truePeakDb} dBTP)`,
    '',
    '## Style',
    `- Palette: **${palette}** (${cfg.palettes[palette].label}), preset ${cfg.palettes[palette].preset}`,
    `- Language: ${plan.lang}${plan.rtl ? ' (right-to-left captions, Latin words kept left-to-right)' : ''}`,
    `- Transcription: ${args.transcript ? 'provided file' : (args.stt || cfg.transcription.engine)}; ${plan.stats.words} words, ${plan.stats.pages} caption pages`,
    `- Music: ${plan.media.music ? (plan.media.music === 'music.wav' ? 'original generated ambient bed (royalty-free by construction)' : plan.musicCredit || plan.media.music) : 'none'}${plan.musicBpm ? `, ${plan.musicBpm} bpm` : ''}`,
    `- Sound effects: ${Object.entries(counts(plan.sfx.map((x) => x.type))).map(([k, v]) => `${k} x${v}`).join(', ')} (${Object.keys(plan.sfxMeta || {}).length ? 'real CC0 samples, see assets/cc0/THIRD_PARTY.md' : 'synthesised'})`,
    '',
    '## Opening title card',
    plan.hook ? `- Title: ${plan.hook.lines.map((l) => l.map((w) => w.text).join(' ')).join(' / ')}\n- Subtitle: ${plan.hook.subtitle}\n- Tags: ${plan.hook.tags.join(', ') || 'none'}` : '- none',
    '',
    `## Motion graphics (${plan.visuals.length})`,
    ...vis,
    '',
    '## Layout and transition changes',
    ...plan.layouts.map((l) => `- ${fmt(l.startMs)}: layout **${l.layout}**`),
    `- Graphic transition variants used: ${Object.entries(counts(plan.visuals.map((v) => v.variant))).map(([k, v]) => `${k} x${v}`).join(', ')}`,
    `- Punch-in shots (jump-cut hiding): ${plan.shots.length}, scales ${[...new Set(plan.shots.map((x) => x.scale))].join(', ')}`,
    '',
    '## Words I was unsure about',
    unsureWords.length ? unsureWords.map((w) => `- ${fmt(w.atMs)} (edited timeline): "${w.text}" (confidence ${w.conf})`).join('\n') : '- none flagged by the recogniser',
    '',
  ];
  fs.mkdirSync(path.dirname(path.resolve(args.report)), {recursive: true});
  fs.writeFileSync(path.resolve(args.report), lines.join('\n'));
  console.log(`Report: ${path.resolve(args.report)}`);
}
