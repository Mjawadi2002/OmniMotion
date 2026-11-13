// Runs the edit-style engine (scripts/director.mjs) as a child process and turns its log into stages and progress.
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {enginePaths, slug} from './paths.mjs';
import {getSecret, getSettings} from './store.mjs';
import {lookPathFor} from './looks.mjs';
import {claudeBin} from './claude.mjs';
import {engineCommand, engineEnv, hasBundledTools, packaged} from './runtime.mjs';

const runs = new Map();
let counter = 0;

export const PALETTE = {tech: 'tech', light: 'personal'};

const has = (cmd, arg) => {
  try {
    return spawnSync(cmd, [arg], {encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32'}).status === 0;
  } catch {
    return false;
  }
};

export const engineInfo = () => {
  const s = getSettings();
  const e = enginePaths(s.enginePath);
  return {
    root: e.root,
    ok: e.ok,
    bundled: e.bundled,
    node: packaged() || has('node', '--version'),
    ffmpeg: hasBundledTools() || has('ffmpeg', '-version'),
    python: has('python', '--version'),
    claudeCli: !!claudeBin(),
    cutoutModel: fs.existsSync(path.join(e.root, 'models', 'u2net_human_seg.onnx')),
    whisperModel: fs.existsSync(path.join(e.root, 'whisper.cpp')),
    elevenlabsKey: !!getSecret('elevenlabs') || fs.existsSync(path.join(e.root, '.env')),
  };
};

const STAGES = [
  {id: 'transcribe', label: 'Transcribing', re: /^(Transcribing|Vlog: preparing)/},
  {id: 'cut', label: 'Cutting silences', re: /^Silence cuts/},
  {id: 'assets', label: 'Fetching assets', re: /^asset /},
  {id: 'cutout', label: 'Cutting out the person', re: /^(Cutting the person|matte )/},
  {id: 'plan', label: 'Resolving the plan', re: /^Plan:/},
  {id: 'render', label: 'Rendering', re: /^(Rendering:|Rendered )/},
  {id: 'mix', label: 'Mixing audio', re: /^(Done:|Final loudness)/},
];

const clean = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

export const buildArgs = (project, step, opts = {}) => {
  const s = getSettings();
  const e = enginePaths(s.enginePath);
  const a = [e.director];
  if (project.mode === 'vlog') a.push('--vlog');
  a.push('--footage-dir', path.join(project.dir, 'footage'), '--input-dir', path.join(project.dir, 'input'), '--output-dir', path.join(project.dir, 'output'), '--name', project.id, '--palette', PALETTE[project.style] || 'tech');
  const lookFile = lookPathFor(project.look);
  if (lookFile) a.push('--look', lookFile);
  if (project.settings?.cutSilence !== false) a.push('--cut-silence');
  const stt = project.settings?.stt || s.transcription || 'elevenlabs';
  a.push('--stt', stt);
  if (project.mode === 'talking') {
    const primary = (project.media || []).find((m) => m.role === 'footage' && m.kind === 'video');
    if (primary) a.push('--footage', primary.path);
    a.push('--match-source');
  }
  // sound effects: by default the kit follows the look; the project can ask for fewer, more or none
  const sfx = project.settings?.sfx;
  if (sfx && sfx !== 'auto') a.push('--sfx', sfx);
  // an attached track always wins; otherwise the setting decides between the engine's own bed and none
  const track = (project.media || []).find((m) => m.role === 'music' && m.kind === 'audio' && fs.existsSync(m.path));
  if (track) a.push('--music', track.path);
  // how loud the music sits under the voice (the engine picks the best part of the track and levels it against the measured voice)
  // the caption style and the platform the reel is made for (its safe zone)
  const cstyle = project.settings?.captionStyle;
  if (cstyle && cstyle !== 'auto') a.push('--caption-style', cstyle);
  // the colours the user picked for the captions (text, highlighted word, box, text in the box)
  const cc = project.settings?.captionColors;
  if (cc && typeof cc === 'object') {
    const pairs = Object.entries(cc).filter(([k, v]) => ['text', 'accent', 'box', 'boxText'].includes(k) && /^#[0-9a-fA-F]{6}$/.test(String(v)));
    if (pairs.length) a.push('--caption-colors', pairs.map(([k, v]) => `${k}=${v}`).join(','));
  }
  a.push('--platform', project.settings?.platform || 'all');
  const mlevel = project.settings?.musicLevel;
  if (mlevel && mlevel !== 'auto') a.push('--music-level', mlevel);
  if (project.settings?.music === 'off') a.push('--music', 'off');
  // the music volume slider (dB on top of the level; the composition keeps the voice on top)
  const mgain = Number(project.settings?.musicVolume);
  if (Number.isFinite(mgain) && mgain !== 0) a.push('--music-gain', String(mgain));
  if (project.settings?.language && project.settings.language !== 'auto') a.push('--lang', project.settings.language);
  const jobDir = e.jobDir(project.id);
  const planFile = path.join(jobDir, 'edit_plan.json');
  if (step === 'prepare') a.push('--prepare');
  if (step === 'plan' || step === 'render') {
    if (fs.existsSync(planFile)) a.push('--plan', planFile);
    if (project.mode === 'talking' && project.style === 'light' && project.popout) a.push('--cutout');
  }
  if (step === 'plan' || step === 'auto') a.push('--plan-only');
  if (step === 'render') {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const out = opts.out || path.join(project.dir, 'output', `${slug(project.name)}_${project.mode === 'vlog' ? 'vlog' : project.style}_${stamp}.mp4`);
    a.push('--concurrency', String(opts.concurrency || 2), '--cache-bytes', '250000000', '--out', out, '--report', out.replace(/\.mp4$/, '_report.md'));
    return {args: a, out};
  }
  return {args: a};
};

export const startRun = (project, step, opts, emit) => {
  const s = getSettings();
  const e = enginePaths(s.enginePath);
  if (!e.ok) throw new Error(`The engine was not found at ${e.root}. Set its folder in Settings.`);
  const runId = `r${++counter}`;
  const {args, out} = buildArgs(project, step, opts);
  const env = engineEnv({root: e.root, jobsBase: e.jobsBase});
  const key = getSecret('elevenlabs');
  if (key) env.ELEVENLABS_API_KEY = key;
  const child = spawn(engineCommand(), args, {cwd: e.root, env, windowsHide: true});
  const state = {runId, child, step, projectId: project.id, out, stage: null, log: []};
  runs.set(runId, state);
  let buf = '';
  const onData = (chunk) => {
    buf += clean(chunk.toString());
    const lines = buf.split(/\r?\n|\r/);
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      state.log.push(line);
      emit({runId, projectId: project.id, type: 'log', line});
      for (const st of STAGES) {
        if (st.re.test(line) && state.stage !== st.id) {
          state.stage = st.id;
          emit({runId, projectId: project.id, type: 'stage', stage: st.id, label: st.label});
        }
      }
      const m = line.match(/^Rendered (\d+)\/(\d+)/);
      if (m) emit({runId, projectId: project.id, type: 'progress', stage: 'render', pct: Number(m[1]) / Number(m[2])});
      const mm = line.match(/^matte (\d+) frames/);
      if (mm) emit({runId, projectId: project.id, type: 'progress', stage: 'cutout', frames: Number(mm[1])});
      const loud = line.match(/^Final loudness: (-?[\d.]+) LUFS.*true peak (-?[\d.]+)/);
      if (loud) emit({runId, projectId: project.id, type: 'loudness', lufs: Number(loud[1]), peak: Number(loud[2])});
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('close', (code) => {
    runs.delete(runId);
    emit({runId, projectId: project.id, type: 'done', code, step, out: code === 0 ? out : undefined, tail: state.log.slice(-12)});
  });
  child.on('error', (err) => emit({runId, projectId: project.id, type: 'done', code: -1, step, tail: [String(err.message)]}));
  return {runId, out};
};

export const cancelRun = (runId) => {
  const r = runs.get(runId);
  if (!r) return false;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(r.child.pid), '/T', '/F'], {windowsHide: true});
  else r.child.kill('SIGTERM');
  return true;
};
export const activeRuns = () => [...runs.values()].map((r) => ({runId: r.runId, projectId: r.projectId, step: r.step, stage: r.stage}));

// everything the app shows from a project's job folder
export const readJob = (project, mediaUrl) => {
  const e = enginePaths(getSettings().enginePath);
  const jobDir = e.jobDir(project.id);
  const readJson = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(jobDir, f), 'utf8'));
    } catch {
      return null;
    }
  };
  const mtime = (f) => {
    try {
      return fs.statSync(path.join(jobDir, f)).mtimeMs;
    } catch {
      return 0;
    }
  };
  const stale = mtime('edit_plan.json') > mtime('plan.json') + 500;
  const words = readJson('transcript.retimed.json');
  const clips = readJson('clips.json');
  return {
    jobDir,
    publicDir: path.join(jobDir, 'public'),
    hasHook: fs.existsSync(path.join(jobDir, 'hook.json')),
    prepared: !!words,
    stale,
    words,
    cuts: readJson('cuts.json'),
    clips: clips ? Object.values(clips).map((c) => ({...c, sheetUrl: fs.existsSync(c.sheet) ? mediaUrl(c.sheet) : null})) : null,
    plan: readJson('edit_plan.json'),
    autoPlan: readJson('edit_plan.auto.json'),
    resolved: readJson('plan.json'),
    assets: readJson('assets-cache/assets_manifest.json'),
  };
};

export const savePlan = (project, plan) => {
  const e = enginePaths(getSettings().enginePath);
  const jobDir = e.jobDir(project.id);
  fs.mkdirSync(jobDir, {recursive: true});
  fs.writeFileSync(path.join(jobDir, 'edit_plan.json'), JSON.stringify(plan, null, 2));
};
export const saveAssetsPlan = (project, plan) => {
  const e = enginePaths(getSettings().enginePath);
  const jobDir = e.jobDir(project.id);
  fs.mkdirSync(jobDir, {recursive: true});
  fs.writeFileSync(path.join(jobDir, 'assets_plan.json'), JSON.stringify(plan, null, 2));
};
