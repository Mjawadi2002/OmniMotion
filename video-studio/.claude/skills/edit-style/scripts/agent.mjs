// Agent build: Claude writes a bespoke Remotion composition that recreates a reference's edit on the user's footage.
// This script does everything around Claude's work, deterministically:
//   setup   build the workspace (silence-cut 1080x1920 footage, words, timeline, reference study frames, footage frames, brief, example)
//   stills  bundle Claude's composition and render check frames + a contact sheet (prints a compile error and exits 2 when it does not build)
//   render  render the composition, mix voice + music + sound effects to -14 LUFS, write the video and a short report
// usage:
//   node agent.mjs setup  --job <jobDir> --footage <clip> --reference <video> [--input-dir <dir>] [--notes <text>] [--analysis <md>]
//   node agent.mjs stills --job <jobDir> [--times 1.5,4,9] [--count 16] [--out <dir>]
//   node agent.mjs render --job <jobDir> --out <file.mp4> [--music <file>|off] [--concurrency 2]
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, '..');
const root = path.resolve(skillDir, '..', '..', '..');
const tpl = path.join(skillDir, 'agent');
const cc0 = path.join(skillDir, 'assets', 'cc0');

const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const k = rest[i].slice(2);
    const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    args[k] = v;
  }
}
const die = (msg, code = 1) => {
  console.error(msg);
  process.exit(code);
};
if (!args.job) die('Missing --job <jobDir>');
const jobDir = path.resolve(args.job);
const ws = path.join(jobDir, 'agent');
const ff = (a, opts = {}) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...a], {encoding: 'utf8', maxBuffer: 1 << 26, ...opts});
  if (r.status !== 0) die(`ffmpeg failed: ${(r.stderr || '').slice(-600)}`);
  return r;
};
const probe = (file) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_type:stream_side_data=rotation', '-of', 'json', file], {encoding: 'utf8'});
  const j = JSON.parse(r.stdout || '{}');
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
  const rot = Math.abs(Number(((v.side_data_list || [])[0] || {}).rotation || 0));
  const portrait = rot === 90 || rot === 270 ? v.width > v.height : v.height > v.width;
  return {duration: Number(j.format?.duration || 0), width: v.width, height: v.height, rot, portrait, hasVideo: !!v.width};
};
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1));
const SAFE = {x: [60, 1020], y: [230, 1500], bottom: 1500, right: 950};

// the reference, studied: contact sheets (2 fps), full-size stills (every 2.5 s and after each cut), the scene changes
const studyReference = (reference) => {
  const ref = probe(reference);
  const refDur = Math.min(ref.duration, 180);
  // --fast: fewer pictures for Claude to read (4 sheets and 16 stills spread over the whole reference): every picture stays in its context,
  // so a long reference with dozens of frames slows every step of the build
  const fast = !!args.fast;
  const refDir = path.join(ws, 'reference');
  fs.mkdirSync(refDir, {recursive: true});
  // a new study replaces the previous one (frames from an earlier build would otherwise pile up and be read too)
  for (const f of fs.readdirSync(refDir)) if (/^(still-|sheet-)/.test(f)) fs.rmSync(path.join(refDir, f), {force: true});
  console.log(`Studying the reference (${refDur.toFixed(1)} s)${fast ? ', fast: 4 sheets and 16 frames' : ''}...`);
  const per = 30; // frames per sheet (6 x 5), 15 s
  const allSheets = Math.ceil((refDur * 2) / per);
  const pickEven = (n, max) => (n <= max ? Array.from({length: n}, (_, i) => i) : Array.from({length: max}, (_, i) => Math.round((i * (n - 1)) / (max - 1))));
  const sheetIdx = fast ? pickEven(allSheets, 4) : pickEven(allSheets, allSheets);
  const sheets = sheetIdx.length;
  sheetIdx.forEach((k, j) => ff(['-ss', String(k * 15), '-t', '15', '-i', reference, '-vf', 'fps=2,scale=300:-2,tile=6x5:padding=4:color=white', '-frames:v', '1', path.join(ws, 'reference', `sheet-${String(j + 1).padStart(2, '0')}.png`)]));
  const sc = spawnSync('ffmpeg', ['-hide_banner', '-t', String(refDur), '-i', reference, '-vf', "select='gt(scene,0.28)',showinfo", '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 26});
  const cutsAt = [...(sc.stderr || '').matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1]));
  const stillAt = new Set();
  for (let t = 0.6; t < refDur; t += 2.5) stillAt.add(Math.round(t * 10) / 10);
  cutsAt.forEach((t) => stillAt.add(Math.round((t + 0.25) * 10) / 10));
  const allStills = [...stillAt].filter((t) => t < refDur - 0.1).sort((a, b) => a - b);
  const stills = fast ? pickEven(allStills.length, 16).map((i) => allStills[i]) : allStills.slice(0, 60);
  for (const t of stills) ff(['-ss', String(t), '-i', reference, '-frames:v', '1', '-vf', 'scale=720:-2', path.join(ws, 'reference', `still-${t.toFixed(1).padStart(5, '0')}s.png`)]);
  fs.writeFileSync(
    path.join(ws, 'reference', 'frames.md'),
    `# Reference frames\n\nDuration ${refDur.toFixed(1)} s, ${ref.width}x${ref.height}.\n\n` +
      sheetIdx.map((k, j) => `- sheet-${String(j + 1).padStart(2, '0')}.png: ${k * 15} s to ${Math.min(refDur, (k + 1) * 15).toFixed(1)} s, 2 frames a second, 6 per row`).join('\n') +
      `\n\nScene changes (cuts, layout changes, big graphic changes) at: ${cutsAt.map((t) => t.toFixed(2) + ' s').join(', ') || 'none detected'}\n`,
  );
  if (args.analysis && fs.existsSync(args.analysis)) fs.copyFileSync(args.analysis, path.join(ws, 'reference', 'analysis.md'));

  return {sheets, stills};
};

// ---------------------------------------------------------------- setup
const setup = () => {
  const footage = args.footage && path.resolve(args.footage);
  const reference = args.reference && path.resolve(args.reference);
  if (!footage || !fs.existsSync(footage)) die(`Footage not found: ${footage}`);
  if (!reference || !fs.existsSync(reference)) die(`Reference not found: ${reference}`);
  const cutsFile = path.join(jobDir, 'cuts.json');
  const wordsFile = path.join(jobDir, 'transcript.retimed.json');
  if (!fs.existsSync(wordsFile)) die('The footage is not prepared yet (no transcript). Run the Story step first.');
  fs.mkdirSync(path.join(ws, 'public', 'inputs'), {recursive: true});
  for (const d of ['reference', 'footage', 'stills']) {
    fs.rmSync(path.join(ws, d), {recursive: true, force: true});
    fs.mkdirSync(path.join(ws, d), {recursive: true});
  }

  // 1. the silence-cut footage, upright 1080x1920 (cover), and the voice as wav for the mix
  const src = probe(footage);
  const cuts = fs.existsSync(cutsFile) ? JSON.parse(fs.readFileSync(cutsFile, 'utf8')) : null;
  let segs = cuts && cuts.segments && cuts.segments.length ? cuts.segments.map((s) => [s.srcStartMs / 1000, s.srcEndMs / 1000]) : [[0, src.duration]];
  segs = segs.filter(([a, b]) => b - a > 0.15);
  const fc = [];
  let labels = '';
  segs.forEach(([a, b], i) => {
    const d = b - a;
    fc.push(`[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1[v${i}]`);
    fc.push(`[0:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, d - 0.015).toFixed(3)}:d=0.015[a${i}]`);
    labels += `[v${i}][a${i}]`;
  });
  fc.push(`${labels}concat=n=${segs.length}:v=1:a=1[v][a]`);
  const fcFile = path.join(ws, 'cut.filter.txt');
  fs.writeFileSync(fcFile, fc.join(';'));
  console.log(`Cutting the footage (${segs.length} parts)...`);
  ff(['-i', footage, '-/filter_complex', fcFile, '-map', '[v]', '-c:v', 'libx264', '-crf', '17', '-preset', 'fast', '-g', '15', '-pix_fmt', 'yuv420p', '-an', path.join(ws, 'public', 'cut.mp4'), '-map', '[a]', '-c:a', 'pcm_s16le', path.join(ws, 'voice.wav')]);
  const videoMs = Math.round(probe(path.join(ws, 'public', 'cut.mp4')).duration * 1000);

  // 2. words, transcript and timeline
  const words = JSON.parse(fs.readFileSync(wordsFile, 'utf8')).map((w) => ({t: String(w.text).trim(), s: Math.round(w.startMs), e: Math.round(w.endMs)}));
  writeJson(path.join(ws, 'words.json'), words);
  const lines = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(w);
    if (/[.!?]$/.test(w.t) || cur.length >= 14 || i === words.length - 1) {
      lines.push(`[${cur[0].s} ms] ${cur.map((x) => x.t).join(' ')}`);
      cur = [];
    }
  });
  fs.writeFileSync(path.join(ws, 'transcript.txt'), lines.join('\n') + '\n');
  let seams = [0];
  if (cuts && cuts.segments) seams = cuts.segments.map((s) => s.outStartMs).filter((x) => x < videoMs);
  writeJson(path.join(ws, 'timeline.json'), {videoMs, seams, width: 1080, height: 1920, fps: 30, safe: SAFE});

  const {sheets, stills} = studyReference(reference);

  // 4. the footage after cuts, and where the face is
  for (let t = 1; t < videoMs / 1000; t += Math.max(4, videoMs / 1000 / 8)) ff(['-ss', t.toFixed(2), '-i', path.join(ws, 'public', 'cut.mp4'), '-frames:v', '1', '-vf', 'scale=540:-2', path.join(ws, 'footage', `still-${t.toFixed(1).padStart(5, '0')}s.png`)]);
  const faceFile = path.join(jobDir, 'face.json');
  let faceMd = 'Face position not measured: look at the footage stills (1080x1920 frame, stills are half size).\n';
  if (fs.existsSync(faceFile)) {
    try {
      const f = JSON.parse(fs.readFileSync(faceFile, 'utf8'));
      if (f && f.cx) faceMd = `In the full 1080x1920 frame the face centre is at about x ${Math.round(f.cx * 1080)}, y ${Math.round(f.cy * 1920)} px; the face box is about ${Math.round(f.h * 1920)} px tall. (Measured on the source; check the stills.)\n`;
    } catch {
      // keep the default
    }
  }
  fs.writeFileSync(path.join(ws, 'footage', 'face.md'), faceMd);

  // 5. the user's images
  const inputs = [];
  if (args['input-dir'] && fs.existsSync(args['input-dir'])) {
    for (const f of fs.readdirSync(args['input-dir'])) {
      if (/\.(png|jpe?g|webp|svg|gif)$/i.test(f)) {
        fs.copyFileSync(path.join(args['input-dir'], f), path.join(ws, 'public', 'inputs', f));
        inputs.push(f);
      }
    }
  }

  // 6. brief, example and entry
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const fonts = Object.keys(pkg.dependencies || {}).filter((d) => d.startsWith('@fontsource/')).map((d) => d.replace('@fontsource/', ''));
  const sounds = fs.readdirSync(path.join(cc0, 'sfx')).filter((f) => f.endsWith('.wav')).map((f) => f.replace(/\.wav$/, ''));
  const music = fs.readdirSync(path.join(cc0, 'music')).filter((f) => f.endsWith('.mp3')).map((f) => f.replace(/\.mp3$/, ''));
  if (args.music && args.music !== 'off' && fs.existsSync(args.music)) music.unshift('user-track (the track the user attached: prefer it)');
  let brief = fs.readFileSync(path.join(tpl, 'BRIEF.template.md'), 'utf8');
  const notes = String(args.notes && args.notes !== true ? args.notes : '').trim() || 'none given: recreate the reference as closely as possible.';
  brief = brief
    .replace('{{NOTES}}', notes)
    .replace('{{FONTS}}', fonts.join(', '))
    .replace('{{SOUNDS}}', sounds.join(', '))
    .replace('{{MUSIC}}', music.join(', '))
    .replace('{{SAFE_X}}', `${SAFE.x[0]}..${SAFE.x[1]}`)
    .replace('{{SAFE_Y}}', `${SAFE.y[0]}..${SAFE.y[1]}`)
    .replace('{{SAFE_BOTTOM}}', String(SAFE.bottom))
    .replace('{{SAFE_RIGHT}}', String(SAFE.right));
  if (inputs.length) brief += `\n## The user's files\n\n${inputs.map((f) => `- \`inputs/${f}\``).join('\n')}\n\nUse them where the speech mentions them (look at each one first).\n`;
  fs.writeFileSync(path.join(ws, 'BRIEF.md'), brief);
  for (const f of ['EXAMPLE.tsx', 'Root.tsx', 'index.ts', 'beats.ts']) fs.copyFileSync(path.join(tpl, f), path.join(ws, f));
  if (!fs.existsSync(path.join(ws, 'beats.json'))) writeJson(path.join(ws, 'beats.json'), {beats: []});
  if (!fs.existsSync(path.join(ws, 'Composition.tsx')))
    fs.writeFileSync(path.join(ws, 'Composition.tsx'), `// Write the composition here (see BRIEF.md).\nimport React from 'react';\nimport {AbsoluteFill} from 'remotion';\nexport const TOTAL_MS = ${videoMs};\nexport const Composition: React.FC = () => <AbsoluteFill style={{background: '#000'}} />;\n`);
  if (!fs.existsSync(path.join(ws, 'sfx.json'))) writeJson(path.join(ws, 'sfx.json'), []);
  if (!fs.existsSync(path.join(ws, 'audio.json'))) writeJson(path.join(ws, 'audio.json'), {music: 'none', musicDb: -21});
  writeJson(path.join(ws, 'tsconfig.json'), {compilerOptions: {jsx: 'react-jsx', resolveJsonModule: true, esModuleInterop: true, strict: false, module: 'esnext', moduleResolution: 'bundler', target: 'es2020', skipLibCheck: true}});
  console.log(`Workspace ready: ${ws}`);
  console.log(`Edited length ${(videoMs / 1000).toFixed(1)} s, ${words.length} words, ${sheets} reference sheets, ${stills.length} reference stills.`);
};


// ---------------------------------------------------------------- setup for a motion graphics video (no footage: a voice-over and its words)
const ASPECTS = {
  '9:16': {width: 1080, height: 1920, safe: {x: [60, 1020], y: [230, 1500], bottom: 1500, right: 950}, capMin: 54, note: 'Vertical (Reels, TikTok, Shorts): captions never below y 1500; nothing important right of x 950 below y 1100 (the like and comment buttons).'},
  '16:9': {width: 1920, height: 1080, safe: {x: [96, 1824], y: [54, 1026], bottom: 980, right: 1824}, capMin: 44, note: 'Horizontal (YouTube): keep a 5% margin on every side; captions sit in the lower third, never below y 980.'},
};
const setupMotion = () => {
  const voice = args.voice && path.resolve(args.voice);
  if (!voice || !fs.existsSync(voice)) die(`Voice-over not found: ${voice}`);
  if (!args.words || !fs.existsSync(args.words)) die('Missing --words (the voice-over word times).');
  if (!args.brief || !fs.existsSync(args.brief)) die('Missing --brief (the idea, script and choices).');
  const A = ASPECTS[args.aspect] || ASPECTS['9:16'];
  const brief = JSON.parse(fs.readFileSync(args.brief, 'utf8'));
  fs.mkdirSync(path.join(ws, 'public', 'inputs'), {recursive: true});
  for (const d of ['reference', 'stills', 'footage']) {
    fs.rmSync(path.join(ws, d), {recursive: true, force: true});
    fs.mkdirSync(path.join(ws, d), {recursive: true});
  }
  ff(['-i', voice, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', path.join(ws, 'voice.wav')]);
  const voiceMs = Math.round(probe(path.join(ws, 'voice.wav')).duration * 1000);
  const raw = JSON.parse(fs.readFileSync(args.words, 'utf8'));
  const words = raw.map((w) => ({t: String(w.t ?? w.text).trim(), s: Math.round(w.s ?? w.startMs), e: Math.round(w.e ?? w.endMs)})).filter((w) => w.t);
  writeJson(path.join(ws, 'words.json'), words);
  const lines = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(w);
    if (/[.!?]$/.test(w.t) || cur.length >= 14 || i === words.length - 1) {
      lines.push(`[${cur[0].s} ms] ${cur.map((x) => x.t).join(' ')}`);
      cur = [];
    }
  });
  fs.writeFileSync(path.join(ws, 'transcript.txt'), lines.join('\n') + '\n');
  writeJson(path.join(ws, 'timeline.json'), {videoMs: voiceMs, seams: [0], width: A.width, height: A.height, fps: 30, safe: A.safe});
  const scriptLines = Array.isArray(brief.script) ? brief.script : [];
  fs.writeFileSync(path.join(ws, 'script.md'), `# ${brief.title || 'Script'}\n\n${scriptLines.map((l, i) => `${i + 1}. ${l.line}${l.purpose ? `  _(${l.purpose})_` : ''}`).join('\n')}\n`);

  let refNote = 'none: invent the look from the style direction and the onetake looks.';
  if (args.reference && fs.existsSync(args.reference)) {
    const {sheets, stills} = studyReference(path.resolve(args.reference));
    refNote = `studied in reference/ (${sheets} sheets, ${stills.length} stills). Recreate its design language and motion feel for this script.`;
    if (args.analysis && fs.existsSync(args.analysis)) fs.copyFileSync(args.analysis, path.join(ws, 'reference', 'analysis.md'));
  }
  // onetake: method and move library (noncommercial licence, kept with the files)
  const ot = path.join(tpl, 'onetake');
  fs.rmSync(path.join(ws, 'onetake'), {recursive: true, force: true});
  fs.mkdirSync(path.join(ws, 'onetake', 'references'), {recursive: true});
  for (const f of ['LICENSE', 'NOTICE.md', 'SKILL.md', 'looks.json']) fs.copyFileSync(path.join(ot, f), path.join(ws, 'onetake', f));
  fs.copyFileSync(path.join(ot, 'motion.js'), path.join(ws, 'onetake', 'motion.cjs'));
  for (const f of fs.readdirSync(path.join(ot, 'references'))) fs.copyFileSync(path.join(ot, 'references', f), path.join(ws, 'onetake', 'references', f));

  const inputs = [];
  if (args['input-dir'] && fs.existsSync(args['input-dir'])) {
    for (const f of fs.readdirSync(args['input-dir'])) {
      if (/\.(png|jpe?g|webp|svg|gif)$/i.test(f)) {
        fs.copyFileSync(path.join(args['input-dir'], f), path.join(ws, 'public', 'inputs', f));
        inputs.push(f);
      }
    }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const fonts = Object.keys(pkg.dependencies || {}).filter((d) => d.startsWith('@fontsource/')).map((d) => d.replace('@fontsource/', ''));
  const sounds = fs.readdirSync(path.join(cc0, 'sfx')).filter((f) => f.endsWith('.wav')).map((f) => f.replace(/\.wav$/, ''));
  const music = fs.readdirSync(path.join(cc0, 'music')).filter((f) => f.endsWith('.mp3')).map((f) => f.replace(/\.mp3$/, ''));
  if (args.music && args.music !== 'off' && fs.existsSync(args.music)) music.unshift('user-track (the track the user attached: prefer it)');
  const fill = (v, d) => (String(v || '').trim() ? String(v).trim() : d);
  let md = fs.readFileSync(path.join(tpl, 'BRIEF.motion.template.md'), 'utf8');
  const rep = {
    WIDTH: A.width, HEIGHT: A.height, ASPECT: args.aspect || '9:16', LENGTH: `${brief.lengthS || 30} s`, VOICE_S: (voiceMs / 1000).toFixed(1),
    IDEA: fill(brief.idea, '(see script.md)'), UNDERSTANDING: fill(brief.understanding, '(see script.md)'), STYLE: fill(brief.style, 'none given: choose what explains the idea best.'),
    CAPTIONS: fill(brief.captions, 'clean, bold, readable; the spoken word highlighted in the accent colour.'), REFERENCE: refNote,
    CAP_MIN: A.capMin, SAFE_X: `${A.safe.x[0]}..${A.safe.x[1]}`, SAFE_Y: `${A.safe.y[0]}..${A.safe.y[1]}`, SAFE_NOTE: A.note,
    FONTS: fonts.join(', '), MUSIC: music.join(', '), SOUNDS: sounds.join(', '),
  };
  for (const [k, v] of Object.entries(rep)) md = md.split(`{{${k}}}`).join(String(v));
  if (inputs.length) md += `\n## The user's files\n\n${inputs.map((f) => `- \`inputs/${f}\``).join('\n')}\n\nUse them where the script mentions them (look at each one first).\n`;
  fs.writeFileSync(path.join(ws, 'BRIEF.md'), md);
  for (const f of ['EXAMPLE.tsx', 'Root.tsx', 'index.ts', 'beats.ts']) fs.copyFileSync(path.join(tpl, f), path.join(ws, f));
  if (!fs.existsSync(path.join(ws, 'beats.json'))) writeJson(path.join(ws, 'beats.json'), {beats: []});
  if (!fs.existsSync(path.join(ws, 'Composition.tsx')))
    fs.writeFileSync(path.join(ws, 'Composition.tsx'), `// Write the composition here (see BRIEF.md).\nimport React from 'react';\nimport {AbsoluteFill} from 'remotion';\nexport const TOTAL_MS = ${voiceMs + 1000};\nexport const Composition: React.FC = () => <AbsoluteFill style={{background: '#000'}} />;\n`);
  if (!fs.existsSync(path.join(ws, 'sfx.json'))) writeJson(path.join(ws, 'sfx.json'), []);
  if (!fs.existsSync(path.join(ws, 'audio.json'))) writeJson(path.join(ws, 'audio.json'), {music: 'none', musicDb: -21});
  writeJson(path.join(ws, 'tsconfig.json'), {compilerOptions: {jsx: 'react-jsx', resolveJsonModule: true, esModuleInterop: true, allowJs: true, strict: false, module: 'esnext', moduleResolution: 'bundler', target: 'es2020', skipLibCheck: true}});
  console.log(`Workspace ready: ${ws}`);
  console.log(`Motion graphics ${A.width}x${A.height}, voice ${(voiceMs / 1000).toFixed(1)} s, ${words.length} words.`);
};

// ---------------------------------------------------------------- bundling (shared by stills and render)
const req = createRequire(path.join(root, 'package.json'));
const loadRemotion = async () => {
  const bundler = await import(pathToFileURL(req.resolve('@remotion/bundler')).href);
  const renderer = await import(pathToFileURL(req.resolve('@remotion/renderer')).href);
  return {bundle: bundler.bundle || bundler.default?.bundle, renderer: renderer.default && !renderer.renderStill ? renderer.default : renderer};
};
const bundleWs = async (bundle) => {
  const nm = path.join(root, 'node_modules');
  try {
    return await bundle({
      entryPoint: path.join(ws, 'index.ts'),
      publicDir: path.join(ws, 'public'),
      webpackOverride: (c) => ({...c, resolve: {...c.resolve, modules: [...((c.resolve && c.resolve.modules) || ['node_modules']), nm]}, resolveLoader: {...(c.resolveLoader || {}), modules: [...(((c.resolveLoader || {}).modules) || ['node_modules']), nm]}}),
    });
  } catch (e) {
    die(`COMPILE ERROR\n${String(e && (e.stack || e.message || e)).slice(0, 3000)}`, 2);
  }
};

// ---------------------------------------------------------------- stills
const stills = async () => {
  const {bundle, renderer} = await loadRemotion();
  const tl = JSON.parse(fs.readFileSync(path.join(ws, 'timeline.json'), 'utf8'));
  const outDir = path.resolve(args.out || path.join(ws, 'stills'));
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});
  console.log('Building the composition...');
  const serveUrl = await bundleWs(bundle);
  let comp;
  try {
    comp = await renderer.selectComposition({serveUrl, id: 'Agent', inputProps: {}});
  } catch (e) {
    die(`COMPILE ERROR\n${String(e && (e.stack || e.message || e)).slice(0, 3000)}`, 2);
  }
  const totalS = comp.durationInFrames / 30;
  let times = args.times ? String(args.times).split(',').map(Number).filter((x) => x >= 0) : [];
  if (!times.length) {
    const n = Number(args.count || 16);
    times = Array.from({length: n}, (_, i) => Math.round(((i + 0.5) / n) * totalS * 10) / 10);
    times.push(Math.max(0, totalS - 0.4));
  }
  const files = [];
  for (const [i, t] of times.entries()) {
    const frame = Math.min(comp.durationInFrames - 1, Math.round(t * 30));
    const file = path.join(outDir, `frame-${String(i).padStart(2, '0')}-${(frame / 30).toFixed(1)}s.png`);
    try {
      await renderer.renderStill({composition: comp, serveUrl, output: file, frame, scale: 960 / Math.max(comp.width, comp.height), inputProps: {}});
    } catch (e) {
      die(`RENDER ERROR at ${(frame / 30).toFixed(1)} s\n${String(e && (e.stack || e.message || e)).slice(0, 3000)}`, 2);
    }
    files.push(file);
    console.log(`still ${i + 1}/${times.length}: ${(frame / 30).toFixed(1)} s`);
  }
  // contact sheet, 6 per row
  const list = path.join(outDir, 'list.txt');
  fs.writeFileSync(list, files.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  const rows = Math.ceil(files.length / 6);
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=${comp.width > comp.height ? 400 : 270}:-2,tile=${comp.width > comp.height ? 4 : 6}x${Math.ceil(files.length / (comp.width > comp.height ? 4 : 6))}:padding=4:color=white`, '-frames:v', '1', path.join(outDir, 'sheet.png')]);
  fs.rmSync(list, {force: true});
  console.log(`STILLS ${outDir}`);
  console.log(`Composition length ${totalS.toFixed(1)} s (video ${(tl.videoMs / 1000).toFixed(1)} s).`);
};

// ---------------------------------------------------------------- the sound: voice (+ silence after), music bed ducked under the voice, sound effects
// Used by the render (then mastered to -14 LUFS in two passes) and by the live preview (so what you hear while editing is the final mix).
// The user's own track comes from --music, or from music.json written by the app when the build started.
const mixSound = (totalS, premix) => {
  const audio = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(ws, 'audio.json'), 'utf8'));
    } catch {
      return {music: 'none'};
    }
  })();
  const musicArg = args.music || (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(ws, 'music.json'), 'utf8')).path || null;
    } catch {
      return null;
    }
  })();
  const userTrack = musicArg && musicArg !== 'off' && fs.existsSync(musicArg) ? musicArg : null;
  let sfx = [];
  try {
    sfx = JSON.parse(fs.readFileSync(path.join(ws, 'sfx.json'), 'utf8'));
  } catch {
    sfx = [];
  }
  const sounds = new Set(fs.readdirSync(path.join(cc0, 'sfx')).map((f) => f.replace(/\.wav$/, '')));
  let beatsById = new Map();
  try {
    beatsById = new Map((JSON.parse(fs.readFileSync(path.join(ws, 'beats.json'), 'utf8')).beats || []).map((b) => [b.id, b]));
  } catch {
    // no timeline
  }
  sfx = (Array.isArray(sfx) ? sfx : [])
    .map((e) => (e && e.beat && beatsById.has(e.beat) ? {...e, ms: beatsById.get(e.beat).startMs + (Number(e.offsetMs) || 0)} : e))
    .filter((e) => e && sounds.has(e.sound) && e.ms >= 0 && e.ms < totalS * 1000)
    .sort((a, b) => a.ms - b.ms);
  const spaced = [];
  for (const e of sfx) if (!spaced.length || e.ms - spaced[spaced.length - 1].ms >= 200) spaced.push(e);
  let musicFile = null;
  if (userTrack && /user/i.test(String(audio.music))) musicFile = userTrack;
  else if (audio.music && audio.music !== 'none' && fs.existsSync(path.join(cc0, 'music', `${audio.music}.mp3`))) musicFile = path.join(cc0, 'music', `${audio.music}.mp3`);
  if (musicArg === 'off') musicFile = null;
  const inputs = ['-i', path.join(ws, 'voice.wav')];
  const fc = [`[0:a]aresample=48000,pan=stereo|c0=c0|c1=c0,highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=140,loudnorm=I=-16:TP=-2:LRA=8,apad=whole_dur=${totalS.toFixed(2)}[vo]`];
  let mixIns = '[vo]';
  let n = 1;
  if (musicFile) {
    inputs.push('-stream_loop', '-1', '-i', musicFile);
    const db = Math.max(-30, Math.min(-12, Number(audio.musicDb) || -21));
    fc.push('[vo]asplit=2[vmain][vsc]');
    fc.push(`[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${totalS.toFixed(2)},volume=${db}dB,afade=t=in:d=1,afade=t=out:st=${Math.max(0, totalS - 1.5).toFixed(2)}:d=1.5[mus]`);
    fc.push('[mus][vsc]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=400[mduck]');
    mixIns = '[vmain][mduck]';
    n = 2;
  }
  const base = inputs.filter((x) => x === '-i').length;
  spaced.forEach((e, i) => {
    inputs.push('-i', path.join(cc0, 'sfx', `${e.sound}.wav`));
    const db = Math.max(-20, Math.min(-4, Number(e.db) || -12));
    fc.push(`[${base + i}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${db}dB,adelay=${Math.round(e.ms)}|${Math.round(e.ms)}[s${i}]`);
  });
  if (spaced.length) {
    fc.push(`${spaced.map((_, i) => `[s${i}]`).join('')}amix=inputs=${spaced.length}:normalize=0:duration=longest,volume=-4dB[sfx]`);
    mixIns += '[sfx]';
    n += 1;
  }
  fc.push(`${mixIns}amix=inputs=${n}:normalize=0:duration=first,atrim=0:${totalS.toFixed(2)}[mix]`);
  const afc = path.join(ws, 'audio.filter.txt');
  fs.writeFileSync(afc, fc.join(';'));
  ff([...inputs, '-/filter_complex', afc, '-map', '[mix]', '-c:a', 'pcm_s24le', premix]);
  ff([...inputs, '-/filter_complex', afc, '-map', '[mix]', '-c:a', 'pcm_s24le', premix]);
  return {audio, musicFile, spaced};
};

// ---------------------------------------------------------------- render + mix
const render = async () => {
  const out = path.resolve(args.out || path.join(jobDir, 'agent_edit.mp4'));
  const {bundle, renderer} = await loadRemotion();
  console.log('Building the composition...');
  const serveUrl = await bundleWs(bundle);
  const comp = await renderer.selectComposition({serveUrl, id: 'Agent', inputProps: {}});
  const visual = path.join(ws, 'visual.mp4');
  let last = -1;
  await renderer.renderMedia({
    composition: comp,
    serveUrl,
    codec: 'h264',
    crf: 17,
    outputLocation: visual,
    muted: true,
    concurrency: Number(args.concurrency || 2),
    inputProps: {},
    onProgress: ({progress}) => {
      const p = Math.floor(progress * 100);
      if (p !== last && p % 2 === 0) console.log(`Rendering ${p}%`);
      last = p;
    },
  });
  const totalS = comp.durationInFrames / 30;

  // sound: the shared mix, then two-pass loudnorm to -14 LUFS, true peak -1.5 dBTP
  console.log('Mixing the sound...');
  const premix = path.join(ws, 'premix.wav');
  const {audio, musicFile, spaced} = mixSound(totalS, premix);
  const m1 = spawnSync('ffmpeg', ['-hide_banner', '-i', premix, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json', '-f', 'null', '-'], {encoding: 'utf8'});
  const j = JSON.parse((m1.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/) || ['{}'])[0]);
  const ln = j.input_i ? `loudnorm=I=-14:TP=-1.5:LRA=9:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true` : 'loudnorm=I=-14:TP=-1.5:LRA=9';
  fs.mkdirSync(path.dirname(out), {recursive: true});
  ff(['-i', visual, '-i', premix, '-map', '0:v', '-map', '1:a', '-af', `${ln},aresample=48000`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-maxrate', '25M', '-bufsize', '50M', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out]);
  const m2 = spawnSync('ffmpeg', ['-hide_banner', '-i', out, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], {encoding: 'utf8'});
  const k = JSON.parse((m2.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/) || ['{}'])[0]);
  const report = out.replace(/\.mp4$/, '_report.md');
  fs.writeFileSync(
    report,
    `# Agent build report\n\n- Output: ${out}\n- ${comp.width}x${comp.height}, 30 fps, ${totalS.toFixed(1)} s\n- Loudness: ${k.input_i} LUFS integrated, true peak ${k.input_tp} dBTP (target -14 LUFS, -1.5 dBTP)\n- Music: ${musicFile ? path.basename(musicFile) : 'none'}${musicFile ? `, bed ${audio.musicDb ?? -21} dB, ducked under the voice` : ''}\n- Sound effects: ${spaced.length} (${[...new Set(spaced.map((e) => e.sound))].join(', ') || 'none'}), all CC0\n- Composition: written by Claude from the reference (agent/Composition.tsx in the job folder)\n`,
  );
  for (const f of [premix]) fs.rmSync(f, {force: true});
  console.log(`DONE ${out}`);
};

// ---------------------------------------------------------------- preview: a standalone page (React + Remotion Player + the composition)
const preview = async () => {
  const esbuild = await import(pathToFileURL(req.resolve('esbuild')).href);
  const build = esbuild.build || esbuild.default.build;
  const dir = path.join(ws, 'preview');
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  fs.copyFileSync(path.join(tpl, 'preview-entry.tsx'), path.join(dir, 'entry.tsx'));
  fs.copyFileSync(path.join(tpl, 'storage-shim.ts'), path.join(dir, 'storage-shim.ts'));
  // the sound the render will have (voice levelled, music ducked, effects, -14 LUFS), so the preview is not silent
  let sound = 'none';
  try {
    const comp = fs.readFileSync(path.join(ws, 'Composition.tsx'), 'utf8');
    const tm = comp.match(/export const TOTAL_MS\s*=\s*(\d+(?:\.\d+)?)\s*;/);
    let tl = {};
    try {
      tl = JSON.parse(fs.readFileSync(path.join(ws, 'timeline.json'), 'utf8'));
    } catch {
      tl = {};
    }
    // TOTAL_MS is a number, or the voice length plus a tail (videoMs + 1500)
    const tail = comp.match(/TOTAL_MS\s*=\s*\(?\s*TL[^;]*videoMs\s*\+\s*(\d+)\s*;/);
    const totalS = (tm ? Number(tm[1]) : (tl.videoMs || 0) + (tail ? Number(tail[1]) : 1000)) / 1000;
    if (totalS > 0.5 && fs.existsSync(path.join(ws, 'voice.wav'))) {
      const premix = path.join(ws, 'preview-premix.wav');
      mixSound(totalS, premix);
      fs.mkdirSync(path.join(ws, 'public'), {recursive: true});
      // a new name for every build, so the app never plays an old mix from its cache
      for (const f of fs.readdirSync(path.join(ws, 'public'))) if (/^preview-mix-\d+\.m4a$/.test(f)) fs.rmSync(path.join(ws, 'public', f), {force: true});
      sound = `preview-mix-${Date.now()}.m4a`;
      ff(['-i', premix, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000', '-c:a', 'aac', '-b:a', '192k', path.join(ws, 'public', sound)]);
      fs.rmSync(premix, {force: true});
    }
  } catch (e) {
    console.log(`Preview sound skipped: ${String(e.message || e).slice(0, 200)}`);
  }
  try {
    await build({
      entryPoints: [path.join(dir, 'entry.tsx')],
      bundle: true,
      outfile: path.join(dir, 'preview.js'),
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      minify: true,
      nodePaths: [path.join(root, 'node_modules')],
      loader: {'.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl'},
      define: {'process.env.NODE_ENV': '"production"', __PREVIEW_SOUND__: JSON.stringify(sound === 'none' ? '' : sound)},
      logLevel: 'silent',
    });
  } catch (e) {
    die(`COMPILE ERROR\n${String((e && (e.errors || []).map((x) => `${x.location ? `${path.basename(x.location.file)}:${x.location.line}: ` : ''}${x.text}`).join('\n')) || e.message || e).slice(0, 3000)}`, 2);
  }
  const css = fs.existsSync(path.join(dir, 'preview.css')) ? '<link rel="stylesheet" href="preview.css" />' : '';
  fs.writeFileSync(
    path.join(dir, 'preview.html'),
    `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src http://127.0.0.1:*; style-src http://127.0.0.1:* 'unsafe-inline'; font-src data: http://127.0.0.1:*; img-src data: blob: http://127.0.0.1:*; media-src data: blob: http://127.0.0.1:*" />
${css}<style>html,body,#root{margin:0;height:100%;background:#05070f;overflow:hidden}</style></head>
<body><div id="root"></div><script src="preview.js"></script></body></html>`,
  );
  fs.rmSync(path.join(dir, 'entry.tsx'), {force: true});
  fs.rmSync(path.join(dir, 'storage-shim.ts'), {force: true});
  console.log(`PREVIEW ${path.join(dir, 'preview.html')}`);
};

if (cmd === 'setup') setup();
else if (cmd === 'setup-motion') setupMotion();
else if (cmd === 'stills') await stills();
else if (cmd === 'render') await render();
else if (cmd === 'preview') await preview();
else die('Unknown command. Use setup, stills, preview or render.');
