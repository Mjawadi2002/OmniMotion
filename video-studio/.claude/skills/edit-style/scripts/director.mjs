#!/usr/bin/env node
// Director: raw footage (+ optional inputs) -> finished short in the style of the two references (refs 4 and 5).
//
//   node .claude/skills/edit-style/scripts/director.mjs --ingest-only                 # list what is in footage/ and input/
//   node .claude/skills/edit-style/scripts/director.mjs --prepare                    # transcribe + cut, write transcript for Claude to read
//   node .claude/skills/edit-style/scripts/director.mjs --plan edit_plan.json        # resolve plan, render, mix, report
//
// Folders (relative to the workspace that contains video-studio/): footage/  input/  output/  references/
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {makeSfx} from './make-sfx.mjs';
import {analyzeMusic, pickMusicWindow} from './lib/musicPick.mjs';
import {buildSamples, chooseSfx, designSfx, loadSfxConfig, loudnessOf, soundReport} from './lib/sfx.mjs';
import {makeMusic} from './make-music.mjs';
import {ingest} from './lib/ingest.mjs';
import {fetchAssets} from './assets.mjs';
import {alignText} from './lib/align.mjs';
import {autoPlan, factCheck, resolvePlan} from './lib/directorPlan.mjs';
import {findFace} from './lib/faceFrame.mjs';
import {prepareClips} from './lib/vlogClips.mjs';
import {computeSegments, silences} from './lib/cut.mjs';
import {extractAudio, loadTranscriptFile, normalizePunctuation, readApiKey, transcribeElevenLabs, transcribeToWords} from './lib/transcribe.mjs';
import {resolvePalette} from '../shared/color.js';
import {shellArgs} from './lib/shellArgs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, '..');
const root = path.resolve(skillDir, '..', '..', '..'); // video-studio
const workspace = path.resolve(root, '..'); // editing
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
const footageDir = path.resolve(args['footage-dir'] || path.join(workspace, 'footage'));
const inputDir = path.resolve(args['input-dir'] || path.join(workspace, 'input'));
const outputDir = path.resolve(args['output-dir'] || path.join(workspace, 'output'));

const inv = ingest({footageDir, inputDir});
if (args['ingest-only'] || args.help) {
  console.log(JSON.stringify(inv, null, 2));
  if (args.help) console.log('\nOptions: --footage <file> --plan <edit_plan.json> --prepare --transcript <srt|json> --text <script.txt> --lang <code> --palette <name> --music on|off|<file> --music-level subtle|balanced|prominent --caption-style classic|clean|bold|boxed|highlight|pop|minimal --caption-colors text=#hex,accent=#hex,box=#hex,boxText=#hex --platform all|tiktok|reels|shorts|off --music-start <seconds> --sfx off|minimal|normal|rich|tech|soft|punchy --aspect 9:16|... --match-source --cut-silence|--no-cut --frames a-b --plan-only --out <file> --report <file> --name <job> --strict');
  process.exit(0);
}

// ---------------------------------------------------------------- source selection
const abs = (p) => (p ? path.resolve(p) : null);
// vlog mode: the narration (mp3 / any audio) is the master timeline, every video in footage/ and input/ is a clip to cut to
const VLOG = !!args.vlog;
let vlogClipFiles = [];
let vlogVoice = null;
if (VLOG) {
  vlogClipFiles = [...inv.footage.filter((f) => f.kind === 'video').map((f) => f.file), ...inv.inputs.videos.map((v) => v.file)];
  const auds = [...inv.footage.filter((f) => f.kind === 'audio'), ...inv.inputs.audio];
  const named = auds.find((a) => a.role === 'voiceover') || null;
  const notMusic = auds.filter((a) => a.role !== 'music');
  vlogVoice = abs(args.voiceover) || (named && named.file) || (notMusic.sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))[0] || {}).file || null;
  if (!vlogVoice) throw new Error('Vlog mode needs the narration: put the mp3 in footage/ or input/ (or pass --voiceover <file>).');
  if (!vlogClipFiles.length) throw new Error('Vlog mode needs video clips in footage/ or input/.');
}
let primary = VLOG ? vlogVoice : abs(args.footage) || abs(args.input);
if (!primary) {
  const vids = inv.footage.filter((f) => f.kind === 'video');
  if (vids.length === 1) primary = vids[0].file;
  else if (vids.length > 1) throw new Error(`Several clips in ${footageDir}; pick one with --footage <file>:\n${vids.map((v) => ' - ' + v.name).join('\n')}`);
  else {
    const sv = inv.inputs.videos[0] || inv.inputs.audio.find((a) => a.role === 'voiceover' || a.role === 'voiceover-or-music');
    if (!sv) throw new Error(`No footage in ${footageDir} and no video in ${inputDir}. Put the raw video in footage/ or pass --footage <file>.`);
    primary = sv.file;
  }
}
if (!fs.existsSync(primary)) throw new Error(`Footage not found: ${primary}`);
// a user look (--look <file.json>): colours, fonts and grade laid over the base palette of its family (tech = dark, light = paper)
let look = null;
if (args.look) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(args.look), 'utf8'));
  const hex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  look = {
    label: raw.label || raw.id || 'Custom look',
    family: raw.family === 'light' ? 'light' : 'tech',
    roles: Object.fromEntries(Object.entries(raw.roles || {}).filter(([, v]) => hex(v))),
    fonts: Object.fromEntries(Object.entries(raw.fonts || {}).filter(([, v]) => cfg.fonts.registry[v])),
    // the style studied from a reference video: transitions it uses, how long graphics stay, caption style (see the app's aistyle.mjs)
    style: raw.style && typeof raw.style === 'object' ? raw.style : undefined,
    sfx: raw.sfx && typeof raw.sfx === 'object' ? {kit: String(raw.sfx.kit || ''), density: String(raw.sfx.density || ''), gainDb: +raw.sfx.gainDb || 0} : undefined,
    grade: raw.grade && hex(raw.grade.tint) ? {contrast: +raw.grade.contrast || 1, saturate: +raw.grade.saturate || 1, brightness: +raw.grade.brightness || 1, tint: raw.grade.tint, tintAlpha: +raw.grade.tintAlpha || 0, vignette: +raw.grade.vignette || 0} : undefined,
  };
}
const palette = args.palette || (look ? (look.family === 'light' ? 'personal' : 'tech') : cfg.palette);
resolvePalette(cfg, palette);
const name = (args.name || (VLOG ? 'vlog-' + path.basename(primary, path.extname(primary)) : path.basename(primary, path.extname(primary)))).replace(/[^\w.-]+/g, '_').slice(0, 40);
const jobDir = path.join(process.env.OMNIMOTION_JOBS_DIR || path.join(root, '.edit-jobs'), `dir-${name}`);
const pub = path.join(jobDir, 'public');
fs.mkdirSync(path.join(pub, 'assets'), {recursive: true});

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', primary]).toString());
const vs = probe.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
const hasVideo = !!vs;
let durationMs = Math.round(parseFloat(probe.format.duration) * 1000);
const srcFps = vs ? (([a, b]) => (b ? a / b : a))(vs.r_frame_rate.split('/').map(Number)) : cfg.output.fps;
const even = (n) => Math.round(n / 2) * 2;
const [aw, ah] = cfg.output.aspects[args.aspect || cfg.output.defaultAspect];
const ss = Number(args['short-side'] || cfg.output.shortSide);
let width = aw <= ah ? even(ss) : even((ss * aw) / ah);
let height = aw <= ah ? even((ss * ah) / aw) : even(ss);
let fps = cfg.output.fps;
if (args['match-source'] && vs && !VLOG) {
  if (vs.height >= vs.width) {
    width = even(vs.width);
    height = even(vs.height);
  } else console.warn(`Source is landscape (${vs.width}x${vs.height}); the reference layouts are vertical, so the output stays ${width}x${height} and the picture is cropped to the head card.`);
  fps = Math.round(srcFps * 1000) / 1000;
}
// working copy for rendering: constant frame rate, every frame a keyframe (phone clips are often variable-rate and stall the frame-accurate seeker). The original is never touched.
if (hasVideo && (!fs.existsSync(path.join(pub, 'input.mp4')) || args['re-proxy'])) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', primary, '-vf', `fps=${fps}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-g', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', path.join(pub, 'input.mp4')], {stdio: 'inherit'});
}

// ---------------------------------------------------------------- inputs: images, b-roll, music, voice-over
const assets = {};
const used = {images: [], broll: [], music: null, voiceover: null, transcript: null};
const wantFile = (v) => (v && v !== true ? abs(v) : null);
for (const img of inv.inputs.images) {
  const base = path.basename(img.name, path.extname(img.name));
  fs.copyFileSync(img.file, path.join(pub, 'assets', img.name));
  assets[img.name] = `assets/${img.name}`;
  assets[base] = `assets/${img.name}`;
  used.images.push(img.name);
}
for (const v of inv.inputs.videos) {
  if (v.file === primary || VLOG) continue;
  const f = `broll-${v.name}`.replace(/[^\w.-]+/g, '_');
  fs.copyFileSync(v.file, path.join(pub, 'assets', f));
  assets[v.name] = `assets/${f}`;
  assets[path.basename(v.name, path.extname(v.name))] = `assets/${f}`;
  used.broll.push(v.name);
}
// person cut-out (pop-out head, light layouts): local U2-Net human segmentation on the working copy, cached in the job folder; opt-in (--cutout or plan.cutout) because it takes about 0.6 s per frame
let cutoutFile = null;
if (hasVideo && args.cutout) {
  const out = path.join(pub, 'head_cut.webm');
  const model = path.join(root, 'models', 'u2net_human_seg.onnx');
  if (!fs.existsSync(out)) {
    if (!fs.existsSync(model)) console.warn(`Cut-out skipped: model missing at ${model} (download u2net_human_seg.onnx from the rembg releases).`);
    else {
      console.log('Cutting the person out of every frame (local model, several minutes)...');
      execFileSync('python', [path.join(here, 'matte.py'), path.join(pub, 'input.mp4'), out, model], {stdio: 'inherit'});
    }
  }
  if (fs.existsSync(out)) cutoutFile = 'head_cut.webm';
}
// story-related assets that Claude listed in assets_plan.json (logos, photos, page screenshots): fetched once, cached in the job folder
const assetPlanFile = abs(args['assets-plan']) || path.join(jobDir, 'assets_plan.json');
let assetManifest = [];
if (fs.existsSync(assetPlanFile)) {
  const wanted = JSON.parse(fs.readFileSync(assetPlanFile, 'utf8'));
  const cache = path.join(jobDir, 'assets-cache', 'assets');
  const todo = wanted.filter((a) => !fs.existsSync(path.join(jobDir, 'assets-cache', 'assets_manifest.json')) || !JSON.parse(fs.readFileSync(path.join(jobDir, 'assets-cache', 'assets_manifest.json'), 'utf8')).some((m) => m.id === a.id && m.file));
  if (todo.length || args['refetch-assets']) {
    const old = fs.existsSync(path.join(jobDir, 'assets-cache', 'assets_manifest.json')) ? JSON.parse(fs.readFileSync(path.join(jobDir, 'assets-cache', 'assets_manifest.json'), 'utf8')).filter((m) => m.file && !todo.some((t) => t.id === m.id)) : [];
    const got = await fetchAssets({plan: args['refetch-assets'] ? wanted : todo, outDir: cache});
    assetManifest = [...old, ...got];
    fs.writeFileSync(path.join(jobDir, 'assets-cache', 'assets_manifest.json'), JSON.stringify(assetManifest, null, 2));
  } else assetManifest = JSON.parse(fs.readFileSync(path.join(jobDir, 'assets-cache', 'assets_manifest.json'), 'utf8'));
  for (const m of assetManifest) {
    if (!m.file) continue;
    fs.copyFileSync(path.join(cache, m.file), path.join(pub, 'assets', m.file));
    assets[m.id] = `assets/${m.file}`;
  }
}
let musicFile = wantFile(args.music) && fs.existsSync(wantFile(args.music)) ? wantFile(args.music) : null;
let voFile = VLOG ? primary : wantFile(args.voiceover);
for (const a of inv.inputs.audio) {
  if (a.role === 'music' && !musicFile) musicFile = a.file;
  if (a.role === 'voiceover' && !voFile) voFile = a.file;
  if (a.role === 'voiceover-or-music' || a.role === 'sfx-or-music') console.warn(`input/${a.name}: cannot tell if this is music or a voice-over. Rename it music-... or voiceover-..., or pass --music / --voiceover.`);
}
const media = {kind: hasVideo ? 'video' : 'audio', file: 'input.mp4'};
let vlogClips = null;
if (VLOG) {
  console.log(`Vlog: preparing ${vlogClipFiles.length} clip(s) (working copies + contact sheets)...`);
  vlogClips = prepareClips({files: vlogClipFiles, pub, jobDir, fps});
}
if (cutoutFile) media.cutout = cutoutFile;
if (voFile) {
  const f = `voiceover${path.extname(voFile)}`;
  fs.copyFileSync(voFile, path.join(pub, f));
  media.voiceover = f;
  used.voiceover = path.basename(voFile);
  // the voice-over is the master timeline: the footage plays under it (muted) and the cuts apply to the voice-over
  durationMs = Math.round(parseFloat(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', voFile]).toString()).format.duration) * 1000);
}

// ---------------------------------------------------------------- transcript: provided file > provided text aligned to the speech > ElevenLabs/Whisper
const jsonCache = path.join(jobDir, 'transcript.raw.json');
const sttSource = voFile || primary; // with a voice-over, the words come from the voice-over
let words;
let language = args.lang || 'auto';
const rawWords = async () => {
  if (args['words-cache'] && fs.existsSync(abs(args['words-cache']))) return JSON.parse(fs.readFileSync(abs(args['words-cache']), 'utf8'));
  if (fs.existsSync(jsonCache) && !args.retranscribe) return JSON.parse(fs.readFileSync(jsonCache, 'utf8'));
  const wav = path.join(jobDir, 'voice16k.wav');
  extractAudio(sttSource, wav);
  let engine = args.stt || cfg.transcription.engine;
  if (engine === 'elevenlabs' && !readApiKey(root, cfg.transcription.providers.elevenlabs.apiKeyEnv)) {
    console.warn('No ElevenLabs key found (.env / environment): falling back to local Whisper.');
    engine = 'whisper';
  }
  let w;
  if (engine === 'elevenlabs') {
    console.log('Transcribing with ElevenLabs Scribe (mixed Tunisian Arabic / French / English; the 16 kHz audio track is uploaded to ElevenLabs)...');
    const r = await transcribeElevenLabs({projectRoot: root, wavPath: wav, cfg, lang: args.lang, outDir: jobDir});
    w = r.words;
    fs.writeFileSync(path.join(jobDir, 'language.txt'), r.language || '');
  } else {
    console.log('Transcribing with Whisper.cpp...');
    w = (await transcribeToWords({projectRoot: root, wavPath: wav, cfg, lang: args.lang})).words;
  }
  fs.writeFileSync(jsonCache, JSON.stringify(w, null, 1));
  return w;
};
const transcriptArg = wantFile(args.transcript) || inv.inputs.transcripts.find((t) => t.forFootage || /transcript|subtitle|captions/i.test(t.name))?.file;
const textArg = wantFile(args.text);
if (transcriptArg && /\.(srt|json|vtt)$/i.test(transcriptArg)) {
  words = loadTranscriptFile(transcriptArg).words;
  used.transcript = path.basename(transcriptArg);
} else if (transcriptArg || textArg) {
  const f = textArg || transcriptArg;
  const audio = await rawWords();
  const r = alignText(fs.readFileSync(f, 'utf8'), audio, durationMs);
  words = r.words;
  used.transcript = `${path.basename(f)} (text aligned to the speech; ${r.unmatched.length} words had no direct audio match${r.unmatched.length ? ': ' + r.unmatched.slice(0, 8).join(' ') : ''})`;
} else {
  words = await rawWords();
}
words = normalizePunctuation(words, cfg);
// "Learning/Artificial" is two spoken words: split slash-joined tokens so anchors and captions can address each one
words = words.flatMap((w) => {
  const parts = w.text.split('/').filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => /\p{L}/u.test(p))) return [w];
  const total = parts.join('').length;
  let t = w.startMs;
  return parts.map((p) => {
    const d = Math.round(((w.endMs - w.startMs) * p.length) / total);
    const o = {...w, text: p, startMs: t, endMs: t + d};
    t += d;
    return o;
  });
});
words = words.map((w, i) => ({...w, srcIdx: i}));
// edits made in the editor: mis-heard words fixed by position, and parts of the speech removed (word ranges)
const earlyPlanFile = abs(args.plan) || (fs.existsSync(path.join(jobDir, 'edit_plan.json')) ? path.join(jobDir, 'edit_plan.json') : null);
let earlyEdit = {};
try {
  earlyEdit = earlyPlanFile ? JSON.parse(fs.readFileSync(earlyPlanFile, 'utf8')) : {};
} catch {
  earlyEdit = {};
}
for (const [k, text] of Object.entries(earlyEdit.wordFixes || {})) {
  const w = words[Number(k)];
  if (w && typeof text === 'string' && text.trim()) w.text = text.trim();
}
fs.writeFileSync(path.join(jobDir, 'transcript.words.json'), JSON.stringify(words, null, 1));

// ---------------------------------------------------------------- silence-only cuts
const sourceDurationMs = durationMs;
let cutInfo = null;
const wantCuts = !args['no-cut'] && (args['cut-silence'] || cfg.pacing.silence.enabled);
const userCuts = (earlyEdit.cuts || []).filter((c) => words[c.fromWord] && words[c.toWord] && c.toWord >= c.fromWord);
if (wantCuts || userCuts.length) {
  const sil = wantCuts ? silences(sttSource, cfg.pacing.silence.noiseDb, 0.15) : [];
  cutInfo = computeSegments({words, durationMs, fps, cfg, silenceList: sil, extraCuts: userCuts.map((c) => [words[c.fromWord].startMs, words[c.toWord].endMs])});
  console.log(`Silence cuts: ${cutInfo.cuts.length} removed, ${(cutInfo.removedMs / 1000).toFixed(2)} s; ${(durationMs / 1000).toFixed(2)} s -> ${(cutInfo.outDurationMs / 1000).toFixed(2)} s`);
  fs.writeFileSync(path.join(jobDir, 'cuts.json'), JSON.stringify({cuts: cutInfo.cuts, segments: cutInfo.segments}, null, 1));
  const removed = new Set();
  for (const c of userCuts) for (let i = c.fromWord; i <= c.toWord; i++) removed.add(i);
  words = cutInfo.retimed.filter((w) => !removed.has(w.srcIdx));
  durationMs = cutInfo.outDurationMs;
  if (media.voiceover) media.voSegments = cutInfo.segments;
  else media.segments = cutInfo.segments;
}
fs.writeFileSync(path.join(jobDir, 'transcript.retimed.json'), JSON.stringify(words, null, 1));

// the text Claude reads to author the plan: timestamps on the EDITED timeline
const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
const readable = [];
let line = [];
words.forEach((w, i) => {
  line.push(w.text);
  if (/[.!?;؟]$/.test(w.text) || line.length >= 12 || i === words.length - 1) {
    readable.push(`[${fmt(words[i - line.length + 1].startMs)}] ${line.join(' ')}`);
    line = [];
  }
});
fs.writeFileSync(path.join(jobDir, 'transcript.readable.txt'), readable.join('\n'));
const planFile = abs(args.plan) || (fs.existsSync(path.join(jobDir, 'edit_plan.json')) ? path.join(jobDir, 'edit_plan.json') : null);
if (args.prepare) {
  console.log(`\nPrepared. Edited length ${(durationMs / 1000).toFixed(1)} s, ${words.length} words.`);
  console.log(`Transcript for planning: ${path.join(jobDir, 'transcript.readable.txt')}\n`);
  console.log(readable.join('\n'));
  if (vlogClips) {
    console.log('\nClips (contact sheet = evenly spaced frames, left to right, top to bottom; sample times in ms):');
    for (const c of Object.values(vlogClips)) console.log(` - ${c.id}  ${c.name}  ${(c.durationMs / 1000).toFixed(1)} s  ${c.width}x${c.height} ${c.portrait ? 'portrait' : 'landscape'}${c.hasAudio ? ' audio' : ''}\n   sheet: ${c.sheet}\n   frames at: ${c.sampleTimesMs.join(', ')}`);
    fs.writeFileSync(path.join(jobDir, 'clips.json'), JSON.stringify(vlogClips, null, 1));
  }
  console.log(`\nInputs found: ${JSON.stringify(used)}`);
  console.log(`Write the plan to ${path.join(jobDir, 'edit_plan.json')} then run again with --plan.`);
  process.exit(0);
}

// ---------------------------------------------------------------- edit plan -> resolved plan
let edit;
if (planFile) {
  edit = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  console.log(`Plan: ${planFile}`);
} else {
  edit = VLOG ? {defaultMode: 'vlog', graphics: []} : autoPlan({cfg, words, durationMs, style: palette === 'tech' ? 'tech' : 'light'});
  fs.writeFileSync(path.join(jobDir, 'edit_plan.auto.json'), JSON.stringify(edit, null, 1));
  console.warn('No edit_plan.json: using the automatic baseline (numbers and named terms only). A hand-authored plan is much better, see docs/PLAN_SCHEMA.md.');
}
// a look studied from a reference sets the pacing: how long a graphic stays on screen
if (look && look.style && look.style.pacing && Number.isFinite(+look.style.pacing.graphicHoldMs)) cfg.director.pacing.graphicHoldMs = Math.min(5000, Math.max(1200, +look.style.pacing.graphicHoldMs));
const {plan, warnings} = resolvePlan({edit, words, durationMs, cfg, fps, width, height, palette, assets, seams: cutInfo ? cutInfo.seams : [], clips: vlogClips});
const facts = factCheck({edit, words, cfg, allow: edit.allowText || []});
plan.media = media;
// where the speaker's face is, so the head card frames it (see placement of the footage in remotion/director/DirectorMain.tsx)
if (media.kind === 'video' && !VLOG) {
  const face = findFace(path.join(pub, media.file), jobDir);
  if (face) {
    media.face = face;
    console.log(`Face: centre at ${Math.round(face.cx * 100)}% across, ${Math.round(face.cy * 100)}% down, ${Math.round(face.h * 100)}% of the frame tall (${face.frames} of ${face.of} frames).`);
  } else if (process.platform === 'win32') console.log('Face: none found clearly, so the head card keeps its fixed framing.');
}
plan.lang = language;
if (look) plan.look = {label: look.label, roles: look.roles, fonts: look.fonts, grade: look.grade};
// the reference's transitions, in the share it used them, on every change of layout the plan left without one
if (look && look.style && Array.isArray(look.style.transitions) && look.style.transitions.length) {
  const kinds = look.style.transitions.filter((k) => (cfg.director.transitions.kinds || []).includes(k));
  let k = 0;
  if (kinds.length) plan.layouts.forEach((l, i) => i > 0 && !l.transition && (l.transition = kinds[k++ % kinds.length]));
}
// the reference's caption style
if (look && look.style && look.style.captions) plan.captionStyle = {karaoke: look.style.captions.karaoke !== false, scale: Math.min(1.35, Math.max(0.85, +look.style.captions.scale || 1))};
// a caption style the user picked wins over the look's; the platform decides the safe zone (see captions.config.json and platforms.config.json)
if (args['caption-style'] && args['caption-style'] !== true && args['caption-style'] !== 'auto') plan.captionStyle = {preset: String(args['caption-style'])};
// --caption-colors text=#FFFFFF,accent=#FFD23F,box=#FFD23F,boxText=#111111: the user's colours for the caption style (any subset)
if (args['caption-colors'] && args['caption-colors'] !== true) {
  const colors = Object.fromEntries(String(args['caption-colors']).split(',').map((kv) => kv.split('=').map((x) => x.trim())).filter(([k, v]) => ['text', 'accent', 'box', 'boxText'].includes(k) && /^#[0-9a-fA-F]{6}$/.test(v || '')));
  if (Object.keys(colors).length) plan.captionStyle = {...(plan.captionStyle || {}), colors};
}
plan.safeZone = args.platform && args.platform !== true ? String(args.platform) : 'all';
// --music-gain <dB>: the user's own music volume on top of the level (Music in remotion/Effects.tsx caps it so the voice stays on top)
if (args['music-gain'] !== undefined && args['music-gain'] !== true && Number.isFinite(Number(args['music-gain']))) plan.musicGainDb = Math.max(-30, Math.min(12, Number(args['music-gain'])));
if (VLOG) plan.gradeName = edit.grade || 'vlog';
plan.brandTag = edit.brandTag || cfg.director.brandTag || '';
if (facts.length) {
  console.warn(`Fact check: ${facts.length} on-screen word(s) are not in the transcript:\n  ${facts.slice(0, 20).join('\n  ')}`);
  if (args.strict) process.exit(2);
}
for (const w of warnings) console.warn('Plan warning:', w);

// ---------------------------------------------------------------- music (own file > library bed > generated bed > none) and sound effects
const musicArg = args.music;
if (musicFile) {
  const f = `music${path.extname(musicFile)}`;
  fs.copyFileSync(musicFile, path.join(pub, f));
  plan.media.music = f;
  used.music = path.basename(musicFile);
} else if (musicArg !== 'off' && (musicArg === 'on' || musicArg === true || cfg.sound.music.enabled) && edit.music !== false) {
  const libId = cfg.sound.music.library?.[palette];
  const libFile = libId ? path.join(skillDir, 'assets', 'cc0', 'music', `${libId}.mp3`) : null;
  if (cfg.sound.music.source === 'library' && libFile && fs.existsSync(libFile)) {
    fs.copyFileSync(libFile, path.join(pub, 'music.mp3'));
    plan.media.music = 'music.mp3';
    try {
      plan.musicBpm = JSON.parse(fs.readFileSync(path.join(skillDir, 'assets', 'cc0', 'music', 'bpm.json'), 'utf8'))[libId] || null;
    } catch {
      plan.musicBpm = null;
    }
    used.music = `${libId} (CC0)`;
  } else {
    makeMusic(cfg, palette, plan.durationMs, path.join(pub, 'music.wav'));
    plan.media.music = 'music.wav';
    plan.musicBpm = (cfg.sound.music.generator[palette] || Object.values(cfg.sound.music.generator)[0]).bpm;
    used.music = 'generated bed';
  }
}
plan.musicEnabled = !!plan.media.music;
if (!plan.musicEnabled) plan.musicBpm = null;

// ---------------------------------------------------------------- the music: the best part of the track, levelled against the voice
// A track the user attached is analysed (tempo, beats, the energy of every bar) and the strongest stretch that fits the reel is cut out, starting on a downbeat.
// It is then brought to a fixed distance below the measured voice, and drops a little further while someone speaks (see Music in remotion/Effects.tsx).
// Levels: --music-level subtle | balanced | prominent (default: balanced for a track the user attached, subtle for the built-in bed). --music-start <seconds> forces the start.
if (plan.musicEnabled) {
  // below = LU under the voice in pauses, duck = dB lower while someone speaks. The voice always stays on top; balanced is clearly audible on a phone.
  const LEVELS = {subtle: {below: 16, duck: -8}, balanced: {below: 10, duck: -4}, prominent: {below: 7, duck: -3}};
  const levelName = LEVELS[args['music-level']] ? args['music-level'] : musicFile ? 'balanced' : 'subtle';
  const lvl = LEVELS[levelName];
  const lufsOf = (file, ss = null, tt = null) => {
    const seek = ss !== null ? ['-ss', ss.toFixed(3), '-t', tt.toFixed(3)] : [];
    const m = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...seek, '-i', file, '-vn', '-af', 'ebur128', '-f', 'null', '-'], {encoding: 'utf8'});
    const t = m.stderr || '';
    const x = t.slice(t.lastIndexOf('Summary:')).match(/I:\s+(-?[\d.]+)\s+LUFS/);
    return x ? parseFloat(x[1]) : null;
  };
  const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  const musicSrc = path.join(pub, plan.media.music);
  const wantMs = plan.durationMs + 1500;
  let analysis = null;
  let pick = null;
  try {
    analysis = analyzeMusic(musicSrc);
    pick = pickMusicWindow(analysis, wantMs, {fixedStartMs: args['music-start'] !== undefined && args['music-start'] !== true ? Number(args['music-start']) * 1000 : null});
  } catch (e) {
    console.warn(`Music: the track could not be analysed (${e.message}), so it is used from its start.`);
  }
  const cut = pick && !pick.whole;
  const ss = cut ? pick.startMs / 1000 : null;
  const tt = cut ? wantMs / 1000 : null;
  const voiceLufs = lufsOf(voFile || primary);
  const musicLufs = lufsOf(musicSrc, ss, tt);
  if (Number.isFinite(voiceLufs) && Number.isFinite(musicLufs)) {
    // the file is made at the loudest the user may ask for (2 LU under the voice) and the composition turns it down to the level (plan.musicHeadroomDb),
    // so the music volume slider only ever lowers it: the browser preview cannot play anything above full volume, and preview and render stay the same
    const headroom = Math.max(0, lvl.below - 2);
    const trimDb = Math.max(-60, Math.min(24, voiceLufs - lvl.below - musicLufs + headroom));
    const balanced = path.join(pub, 'music-balanced.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...(cut ? ['-ss', ss.toFixed(3), '-t', tt.toFixed(3)] : []), '-i', musicSrc, '-vn', '-af', `volume=${trimDb.toFixed(2)}dB,alimiter=limit=0.97`, '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', balanced]);
    plan.media.music = 'music-balanced.wav';
    plan.musicBalanced = true;
    plan.musicDuckDb = lvl.duck;
    plan.musicBelowLu = lvl.below;
    plan.musicHeadroomDb = headroom; // how far under the voice the bed sits in pauses (limits how far the user's music volume can raise it)
    if (analysis && analysis.confidence >= 1.15 && cut) plan.musicBpm = analysis.bpm; // the cut starts on a downbeat, so the beat pulse lines up with the music
    if (pick) plan.musicPick = {startMs: Math.round(pick.startMs), endMs: Math.round(pick.endMs), trackMs: Math.round(analysis.durationMs), bpm: analysis.bpm, whole: !!pick.whole, reason: pick.reason, level: levelName};
    console.log(`Music: ${used.music}${cut ? `, the part from ${fmt(pick.startMs)} to ${fmt(pick.endMs)} of ${fmt(analysis.durationMs)} (${pick.reason}; ${analysis.bpm} BPM)` : ''}; ${levelName} level: ${lvl.below} LU under the voice (voice ${voiceLufs} LUFS, music ${musicLufs} LUFS, change ${trimDb.toFixed(1)} dB), ${-lvl.duck} dB lower while someone speaks.`);
    used.music = `${used.music}${cut ? ` (${fmt(pick.startMs)} to ${fmt(pick.endMs)} of the track: ${pick.reason}, ${analysis.bpm} BPM)` : ''}, ${levelName} level (${lvl.below} LU under the voice, ${lvl.below - lvl.duck} LU while speaking)`;
  } else console.warn('Music: could not measure the loudness of the voice or the track, so the default level is used.');
}
// ---------------------------------------------------------------- sound design (kit for the look, curated moments, varied samples, levelled against the measured voice)
makeSfx(cfg, path.join(pub, 'sfx')); // the synthesised fallback for every sound type
const sfxCfg = loadSfxConfig(skillDir);
const sfxChoice = chooseSfx({arg: args.sfx, look, palette, edit, cfg: sfxCfg});
let sfxSkipped = [];
let sfxVoice = null;
plan.sfxMeta = {};
if (sfxChoice.off) plan.sfx = [];
else {
  const designed = designSfx({events: plan.sfx, durationMs: plan.durationMs, choice: sfxChoice, cfg: sfxCfg});
  plan.sfx = designed.sfx;
  sfxSkipped = designed.skipped;
  sfxVoice = loudnessOf(voFile || primary);
  plan.sfxMeta = buildSamples({sfx: plan.sfx, cfg: sfxCfg, styleCfg: cfg, skillDir, pub, voice: sfxVoice, choice: sfxChoice});
  plan.sfx = plan.sfx.filter((e) => plan.sfxMeta[e.v ? `${e.type}~${e.v}` : e.type]);
  console.log(`Sound: kit "${sfxChoice.kitName}", density "${sfxChoice.densityName}": ${plan.sfx.length} effects placed, ${sfxSkipped.length} moments left out${sfxVoice ? `; levelled against the voice (${sfxVoice.lufs} LUFS, peak ${sfxVoice.peakDb} dBFS)` : '; voice not measured, default levels'}.`);
}
fs.writeFileSync(path.join(jobDir, 'plan.json'), JSON.stringify(plan, null, 1));
console.log(`Plan: ${plan.layouts.length} layout beats, ${plan.graphics.length} windows, ${plan.titles.length} titles, ${plan.sections.length} sections, ${plan.chunks.length} caption chunks, ${plan.sfx.length} sfx, music: ${plan.media.music || 'none'}`);
if (args['plan-only']) process.exit(0);

// ---------------------------------------------------------------- render
fs.mkdirSync(outputDir, {recursive: true});
const out = path.resolve(args.out || path.join(outputDir, `${name}_edited.mp4`));
const rawOut = path.join(jobDir, 'render.mp4');
const entry = path.join(skillDir, 'remotion', 'index.ts');
const rArgs = ['remotion', 'render', entry, 'Director', rawOut, `--props=${path.join(jobDir, 'plan.json')}`, `--public-dir=${pub}`, '--codec=h264', `--crf=${cfg.output.crf}`, '--overwrite', '--image-format=png', '--pixel-format=yuv420p'];
if (args.frames) rArgs.push(`--frames=${args.frames}`);
rArgs.push(`--concurrency=${args.concurrency || cfg.output.renderConcurrency}`, `--timeout=${cfg.output.renderTimeoutMs}`, `--offthreadvideo-cache-size-in-bytes=${args['cache-bytes'] || cfg.output.offthreadCacheBytes}`, '--offthreadvideo-video-threads=1');
console.log('Rendering:', rArgs.join(' '));
const r = spawnSync('npx', shellArgs(rArgs), {cwd: root, stdio: 'inherit', shell: true});
if (r.status !== 0) {
  console.error('Render failed.');
  process.exit(r.status || 1);
}

// ---------------------------------------------------------------- loudness: two-pass loudnorm + faststart
const measure = (file) => {
  const m = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8'});
  const t = m.stderr || '';
  const sum = t.slice(t.lastIndexOf('Summary:'));
  const num = (re) => {
    const x = sum.match(re);
    return x ? parseFloat(x[1]) : null;
  };
  return {lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/)};
};
if (args['no-loudnorm'] || args.frames) fs.copyFileSync(rawOut, out);
else {
  const S = cfg.sound;
  const p1 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', rawOut, '-af', `loudnorm=I=${S.targetLufs}:TP=${S.truePeakDb}:LRA=11:print_format=json`, '-f', 'null', '-'], {encoding: 'utf8'});
  const js = (p1.stderr || '').match(/\{[\s\S]*?\}\s*$/);
  let filter = `loudnorm=I=${S.targetLufs}:TP=${S.truePeakDb}:LRA=11`;
  if (js) {
    const m = JSON.parse(js[0]);
    filter += `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', rawOut, '-c:v', 'copy', '-af', filter, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], {stdio: 'inherit'});
}
const loud = measure(out);
console.log(`\nDone: ${out}\nFinal loudness: ${loud.lufs} LUFS, LRA ${loud.lra}, true peak ${loud.truePeak} dBFS`);

// ---------------------------------------------------------------- report
const reportPath = abs(args.report) || path.join(outputDir, `${name}_edit_report.md`);
const sec = (ms) => `${(ms / 1000).toFixed(2)} s`;
const counts = plan.sfx.reduce((m, s) => ((m[s.type] = (m[s.type] || 0) + 1), m), {});
const md = [
  `# Edit report: ${path.basename(primary)}`,
  '',
  '## Result',
  `- Output: \`${out}\``,
  `- Format: ${width}x${height} @ ${fps} fps, H.264 CRF ${cfg.output.crf}, AAC 192 kbps 48 kHz, faststart`,
  `- Duration before: ${sec(sourceDurationMs)}; after: ${sec(durationMs)}${cutInfo ? ` (${cutInfo.cuts.length} silences shortened, ${sec(cutInfo.removedMs)} removed; words untouched)` : ''}`,
  `- Loudness: ${loud.lufs} LUFS integrated, LRA ${loud.lra} LU, true peak ${loud.truePeak} dBFS (target ${cfg.sound.targetLufs} LUFS, below ${cfg.sound.truePeakDb} dBTP)`,
  '',
  '## Style',
  `- Look: references 4 and 5 only. Palette **${palette}** (${cfg.palettes[palette].label}); type: Inter 800 headlines and captions, Playfair Display italic for highlighted words and names, JetBrains Mono for UI text, IBM Plex Sans Arabic for Arabic`,
  `- Transcript: ${used.transcript || `${args.stt || cfg.transcription.engine} (mixed Tunisian Arabic / French / English), ${words.length} words`}`,
  `- Inputs used: images ${used.images.join(', ') || 'none'}; extra video ${used.broll.join(', ') || 'none'}; music ${used.music || 'none'}; voice-over ${used.voiceover || 'none'}`,
  `- Sound effects: ${Object.entries(counts).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'} (details below)`,
  '',
  ...soundReport({sfx: plan.sfx, skipped: sfxSkipped, meta: plan.sfxMeta, choice: sfxChoice, voice: sfxVoice, cfg: sfxCfg}),
  '',
  `## Beats (${plan.graphics.length} windows)`,
  ...plan.graphics.map((g) => `- ${sec(g.startMs)} to ${sec(g.endMs)}: **${g.kind}** ${g.title || g.content.heading || g.content.value || ''}`.trim()),
  '',
  ...(plan.shots && plan.shots.length ? ['## Shots (vlog)', ...plan.shots.map((x) => `- ${sec(x.startMs)} to ${sec(x.endMs)}: ${x.clipId} from ${sec(x.srcStartMs)}${x.speed !== 1 ? ` at ${x.speed.toFixed(2)}x` : ''}${x.fx ? `, ${x.fx}` : ''}`), ''] : []),
  '## Titles and sections',
  ...plan.titles.map((t) => `- ${sec(t.startMs)}: title "${t.line1}" + highlight "${t.highlight || ''}"`),
  ...plan.sections.map((t) => `- ${sec(t.startMs)}: section "${t.line1} ${t.box || ''}"`),
  '',
  '## Assets fetched for the story',
  ...(assetManifest.length ? assetManifest.map((m) => (m.file ? `- ${m.id}: ${m.type}, ${m.license}${m.author ? ', by ' + m.author : ''}${m.attribution_required ? ' (attribution required)' : ''}, ${m.source}` : `- ${m.id}: FAILED, ${m.error}`)) : ['- none']),
  '',
  '## Warnings',
  ...(warnings.length || facts.length ? [...warnings, ...facts].map((x) => `- ${x}`) : ['- none']),
  '',
];
fs.mkdirSync(path.dirname(reportPath), {recursive: true});
fs.writeFileSync(reportPath, md.join('\n'));
console.log(`Report: ${reportPath}`);
