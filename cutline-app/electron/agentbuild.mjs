// Agent build: Claude recreates a reference's whole edit (captions, layouts, cards, transitions, motion graphics) on the project's footage
// by writing a bespoke Remotion composition, the way an editor would build it by hand.
// Claude only gets file tools (Read, Write, Edit, Glob) limited to the project's agent workspace: no shell, no network.
// The app does everything else deterministically through the engine's scripts/agent.mjs: workspace, check frames, render, sound mix.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {enginePaths, slug} from './paths.mjs';
import {getSettings} from './store.mjs';
import {engineCommand, engineEnv} from './runtime.mjs';
import {claudeRun} from './ai.mjs';
import {aiBusy, killChild} from './airun.mjs';
import {analyzeReference} from './refanalyze.mjs';

export const AGENT_STEPS = [
  {id: 'setup', label: 'Preparing the footage and studying the reference frames'},
  {id: 'measure', label: 'Measuring the reference: cuts, transitions, graphics, captions'},
  {id: 'write', label: 'Claude designs and writes the edit'},
  {id: 'check', label: 'Rendering check frames and fixing what is wrong'},
  {id: 'preview', label: 'Building the live preview'},
];

const MAX_ROUNDS = 3;
// Fast: Sonnet, 16 reference frames, one check round (minutes). Best: Opus (or the model in Settings), every reference frame, up to three rounds.
const SPEEDS = {fast: {model: 'sonnet', rounds: 1}, best: {model: null, rounds: MAX_ROUNDS}};
const speedOf = (v) => (v === 'best' ? 'best' : 'fast');
const FAST_NOTE = '\nWork efficiently: read each file once, do not re-read what you already read, and write Composition.tsx in one go rather than in many small edits.';

// run the engine's agent script, streaming its lines into the run log; resolves {code, out}
const agentScript = (args, run, onLine = () => {}) =>
  new Promise((resolve, reject) => {
    const e = enginePaths(getSettings().enginePath);
    const script = path.join(e.skill, 'scripts', 'agent.mjs');
    const child = spawn(engineCommand(), [script, ...args], {cwd: e.root, env: engineEnv({root: e.root, jobsBase: e.jobsBase}), windowsHide: true});
    run.child = child;
    let out = '';
    let buf = '';
    const feed = (d) => {
      out += d;
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines.map((x) => x.trim()).filter(Boolean)) onLine(l);
    };
    child.stdout.on('data', (d) => feed(String(d)));
    child.stderr.on('data', (d) => feed(String(d)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (run.cancelled) {
        const err = new Error('Stopped.');
        err.cancelled = true;
        return reject(err);
      }
      resolve({code, out});
    });
  });

// the measured facts of the reference, as readable notes, plus its study pictures (transitions, graphics at their peak, animation strips)
const writeAnalysis = async (reference, ws, run) => {
  try {
    const a = await analyzeReference(reference, (m) => run.log(m));
    const dir = path.join(ws, 'reference');
    let i = 0;
    for (const [k, p] of Object.entries(a.images || {})) {
      if (p && fs.existsSync(p)) fs.copyFileSync(p, path.join(dir, `analysis-${String(++i).padStart(2, '0')}-${slug(k)}.png`));
    }
    const md = `# Measured facts about the reference (computed locally)\n\nPictures: reference/analysis-*.png (transitions before/after, graphics at their peak, frame strips of the biggest animations).\n\n\`\`\`json\n${JSON.stringify(a.facts || {}, null, 1).slice(0, 12000)}\n\`\`\`\n`;
    const f = path.join(ws, 'reference', 'analysis.md');
    fs.writeFileSync(f, md);
    return true;
  } catch (e) {
    run.log(`Reference measurement skipped: ${e.message}`, 'warn');
    return false;
  }
};

const firstPrompt = () => `Read BRIEF.md in this folder and follow it exactly. It describes the job, the files and the hard rules.
Study the reference thoroughly first (all reference/sheet-*.png, the reference stills, and reference/analysis*.* if present), then transcript.txt, the footage stills, and EXAMPLE.tsx.
Then write beats.json (the timeline), Composition.tsx reading it, sfx.json and audio.json. Write complete files (no placeholders, no TODOs).
When you are done, answer in a few lines: the layouts you built, the components, the caption style, and how they match the reference.`;

const reviewPrompt = (round, stillsDir) => `Round ${round} check. The app rendered your composition: ${path.relative(path.dirname(stillsDir), stillsDir)}/sheet.png is an overview, and each ${path.basename(stillsDir)}/frame-*.png is one moment (time in the name, half size: multiply positions by 2).
Open the sheet AND every frame, and compare them with the reference stills. Check each frame strictly for:
1. anything covering the face; 2. captions overlapping a card or another graphic, or two graphics overlapping; 3. text cut off, running off a card, or too small to read;
4. text outside the safe zone (BRIEF.md); 5. empty or broken frames, black areas, misplaced elements; 6. how far the look is from the reference (stage, cards, captions, fonts, colours, layouts) and what is missing.
If you find any problem, fix Composition.tsx (and sfx.json if timings moved) now, then answer with "REVISED:" and the list of fixes.
If every frame is clean and matches the reference closely, answer exactly "DONE" and one line on why.`;

const compilePrompt = (err) => `Your composition does not build or crashed while rendering. Fix Composition.tsx. The error:\n\n${String(err).slice(0, 2500)}\n\nAnswer with "REVISED:" and what you fixed.`;

export const startAgentBuild = async (project, job, opts, run) => {
  const e = enginePaths(getSettings().enginePath);
  if (!e.ok) throw new Error('The engine was not found. Set its folder in Settings.');
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider === 'off') throw new Error('Claude is switched off. Connect Claude in Settings to use Agent build.');
  if (provider === 'api') throw new Error('Agent build needs Claude Code (Settings, Claude: Claude account), because Claude writes and checks files.');
  if (!job.words) throw new Error('Run the Story step first, so the footage is transcribed and the silences are cut.');
  const footage = (project.media || []).find((m) => m.role === 'footage' && m.kind === 'video');
  if (!footage) throw new Error('Add your raw footage in Media first.');
  const reference = opts.reference;
  if (!reference || !fs.existsSync(reference)) throw new Error('Choose a reference video.');
  const jobDir = e.jobDir(project.id);
  const ws = path.join(jobDir, 'agent');
  const track = (project.media || []).find((m) => m.role === 'music' && m.kind === 'audio' && fs.existsSync(m.path));

  // 1. workspace
  run.step('setup', 'active');
  const notes = String(opts.notes || '').slice(0, 2000).replace(/\s+/g, ' ');
  const speed = speedOf(opts.speed);
  const setupArgs = ['setup', '--job', jobDir, '--footage', footage.path, '--reference', reference, '--input-dir', path.join(project.dir, 'input')];
  if (speed === 'fast') setupArgs.push('--fast');
  if (notes) setupArgs.push('--notes', notes);
  if (track) setupArgs.push('--music', track.path);
  const s = await agentScript(setupArgs, run, (l) => run.log(l));
  if (s.code !== 0) throw new Error(`Preparing the workspace failed: ${s.out.trim().split(/\r?\n/).slice(-3).join(' ')}`);
  run.step('setup', 'done');

  // 2. measured facts and study pictures
  run.step('measure', 'active');
  await writeAnalysis(reference, ws, run);
  run.step('measure', 'done');

  return designAndCheck({ws, jobDir, run, first: firstPrompt(), review: reviewPrompt, reference, kind: 'agent', speed});
};

// Claude designs and writes, then rounds of check frames it reviews and fixes, then the live preview.
// The Claude conversation is recorded in session.json from the start, so a build that stops part way (usage limit, network, a crash) can be
// continued (continueChecks) and edited instead of starting over.
const sessionFile = (ws) => path.join(ws, 'session.json');
const readSession = (ws) => {
  try {
    return JSON.parse(fs.readFileSync(sessionFile(ws), 'utf8'));
  } catch {
    return null;
  }
};
const writeSession = (ws, patch) => {
  const next = {...(readSession(ws) || {}), ...patch, at: Date.now()};
  fs.writeFileSync(sessionFile(ws), JSON.stringify(next, null, 1));
  return next;
};
const buildOpts = (speed = 'best') => ({tools: ['Read', 'Write', 'Edit', 'Glob'], permissionMode: 'acceptEdits', maxTurns: 120, model: SPEEDS[speed].model || getSettings().agentModel || 'opus'});

const designAndCheck = async ({ws, jobDir, run, first, review, reference = null, kind, speed = 'best'}) => {
  run.step('write', 'active');
  const sessionId = crypto.randomUUID();
  const claudeOpts = buildOpts(speed);
  const maxRounds = SPEEDS[speed].rounds;
  run.log(speed === 'fast' ? `Fast build: ${claudeOpts.model}, one check round` : `Best quality: ${claudeOpts.model}, up to ${maxRounds} check rounds`);
  writeSession(ws, {sessionId, reference, kind, speed, maxRounds, stage: 'write', rounds: 0, clean: false, interrupted: null});
  const summary = await claudeRun(speed === 'fast' ? first + FAST_NOTE : first, ws, 45 * 60 * 1000, [], run, {...claudeOpts, sessionId});
  run.log(summary.trim().slice(0, 380), 'write');
  run.step('write', 'done');
  writeSession(ws, {stage: 'check'});
  return checkAndPreview({ws, jobDir, run, review, sessionId, claudeOpts, startRound: 1, maxRounds});
};

// rounds of check frames from startRound, then the live preview. When Claude stops during a check but the composition renders,
// the build still ends with a preview (it is a finished, working video) and says how far the checks got.
const checkAndPreview = async ({ws, jobDir, run, review, sessionId, claudeOpts, startRound, maxRounds = MAX_ROUNDS}) => {
  run.step('check', 'active');
  let clean = false;
  let interrupted = null;
  let round = startRound;
  for (; round <= maxRounds + 1 && !clean; round++) {
    const stillsDir = path.join(ws, 'stills', `round-${round}`);
    run.log(`Rendering check frames (round ${round})`);
    const r = await agentScript(['stills', '--job', jobDir, '--count', '16', '--out', stillsDir], run, (l) => /^still \d+\/\d+/.test(l) || run.log(l));
    if (round > maxRounds) {
      if (r.code !== 0) throw new Error('The composition still does not build after the fixes. Try again, or describe the problem in the notes.');
      break;
    }
    let answer;
    try {
      answer = r.code === 0 ? await claudeRun(review(round, stillsDir), ws, 30 * 60 * 1000, [], run, {...claudeOpts, resume: sessionId}) : await claudeRun(compilePrompt(r.out.slice(-3000)), ws, 20 * 60 * 1000, [], run, {...claudeOpts, resume: sessionId});
    } catch (e) {
      if (run.cancelled || r.code !== 0) throw e; // stopped by the user, or nothing that works to show
      const msg = String(e.message || e);
      // say what the user can do about it
      interrupted = /authenticat|oauth|log ?in|sign ?in|401|credential/i.test(msg)
        ? 'Claude is signed out in OmniMotion: sign in again in Settings (Claude), then use "Finish the checks"'
        : /limit|quota|rate/i.test(msg)
          ? `your Claude usage limit was reached (${msg.slice(0, 120)}); use "Finish the checks" once it resets`
          : msg.slice(0, 300);
      run.log(`Claude stopped during the round ${round} check: ${interrupted}. The composition renders, so you get its preview now.`, 'warn');
      writeSession(ws, {rounds: round - 1, clean: false, interrupted});
      break;
    }
    run.log(answer.trim().slice(0, 380), 'write');
    clean = r.code === 0 && /^\s*DONE\b/i.test(answer);
    writeSession(ws, {rounds: round, clean, interrupted: null});
    if (clean) run.log(`Claude found no problems in round ${round}.`);
  }
  run.step('check', interrupted ? 'warn' : 'done', interrupted ? 'stopped early' : undefined);

  run.step('preview', 'active');
  writeSession(ws, {stage: 'preview'});
  await buildPreview(jobDir, run, interrupted ? null : sessionId, claudeOpts);
  writeSession(ws, {stage: 'done'});
  run.step('preview', 'done');
  return {clean, interrupted};
};

export const CONTINUE_STEPS = [
  {id: 'check', label: 'Rendering check frames and fixing what is wrong'},
  {id: 'preview', label: 'Building the live preview'},
];

// continue a build that stopped part way: Claude resumes its own conversation and finishes the check rounds
export const continueChecks = async (project, run) => {
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider !== 'claude-code') throw new Error('Continuing needs Claude Code (Settings, Claude: Claude account).');
  const ws = wsOf(project);
  const jobDir = path.dirname(ws);
  const sess = readSession(ws);
  if (!sess || !sess.sessionId) throw new Error('There is no build to continue. Build it first.');
  if (!fs.existsSync(path.join(ws, 'Composition.tsx'))) throw new Error('Claude had not written the composition yet. Build it again.');
  refreshKit(ws);
  const review = (sess.kind || (project.mode === 'motion' ? 'motion' : 'agent')) === 'motion' ? motionReview : reviewPrompt;
  const done = fs.existsSync(path.join(ws, 'stills')) ? fs.readdirSync(path.join(ws, 'stills')).filter((d) => /^round-\d+$/.test(d)).length : 0;
  // the round that was interrupted is checked again from fresh frames
  const speed = speedOf(sess.speed || 'best');
  const maxRounds = sess.maxRounds || SPEEDS[speed].rounds;
  const startRound = Math.min(maxRounds, Math.max(1, (sess.rounds || 0) + 1, done));
  run.log(`Continuing Claude's checks from round ${startRound}`);
  return checkAndPreview({ws, jobDir, run, review, sessionId: sess.sessionId, claudeOpts: buildOpts(speed), startRound, maxRounds});
};

// ---------------------------------------------------------------- Motion graphics video: no footage, a voice-over, Claude designs every frame
export const MOTION_STEPS = [
  {id: 'setup', label: 'Preparing the voice-over, the words and the reference'},
  {id: 'measure', label: 'Measuring the reference (when there is one)'},
  {id: 'write', label: 'Claude chooses a concept and writes the motion graphics'},
  {id: 'check', label: 'Rendering check frames and fixing what is wrong'},
  {id: 'preview', label: 'Building the live preview'},
];

const motionFirst = () => `Read BRIEF.md in this folder and follow it exactly: it describes the video, the files, the method (onetake) and the hard rules.
Read the onetake method files it names, study the reference if there is one (reference/), then script.md, transcript.txt and EXAMPLE.tsx.
Then write beats.json (the timeline), Composition.tsx reading it, sfx.json and audio.json. Write complete files (no placeholders, no TODOs).
When you are done, answer in a few lines: the three concepts you considered, the one you built and why, the look, and what carries each section into the next.`;

const motionReview = (round, stillsDir) => `Round ${round} check. The app rendered your composition: ${path.relative(path.dirname(stillsDir), stillsDir)}/sheet.png is an overview, and each ${path.basename(stillsDir)}/frame-*.png is one moment (time in the name, half size: multiply positions by 2).
Open the sheet AND every frame${'' /* the reference is optional */}, and compare them with transcript.txt (what is being said at that time) and the reference stills if there is a reference. Check each frame strictly for:
1. does the picture explain what is being said at that moment; 2. captions overlapping a graphic, or two graphics overlapping by accident; 3. text cut off, running off its shape, or too small to read;
4. text outside the safe zone (BRIEF.md); 5. empty, broken or black frames, misplaced elements; 6. slideshow signs (beats that replace each other with nothing carried, uniform pacing); 7. how far the look is from the style direction and the reference.
If you find any problem, fix Composition.tsx (and beats.json / sfx.json if timings moved) now, then answer with "REVISED:" and the list of fixes.
If every frame is clean, answer exactly "DONE" and one line on why.`;

export const startMotionBuild = async (project, opts, run) => {
  const e = enginePaths(getSettings().enginePath);
  if (!e.ok) throw new Error('The engine was not found. Set its folder in Settings.');
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider !== 'claude-code') throw new Error('Building needs Claude Code (Settings, Claude: Claude account), because Claude writes and checks files.');
  const m = project.motion || {};
  if (!m.script || !m.script.length) throw new Error('Write the script first (Script step).');
  if (!m.voice || !m.voice.audio || !fs.existsSync(m.voice.audio)) throw new Error('Make the voice-over first (Voice step).');
  const jobDir = e.jobDir(project.id);
  const ws = path.join(jobDir, 'agent');
  fs.mkdirSync(jobDir, {recursive: true});
  const track = (project.media || []).find((x) => x.role === 'music' && x.kind === 'audio' && fs.existsSync(x.path));
  const reference = m.reference && fs.existsSync(m.reference) ? m.reference : null;

  run.step('setup', 'active');
  const briefFile = path.join(jobDir, 'motion-brief.json');
  fs.writeFileSync(
    briefFile,
    JSON.stringify({title: m.title || project.name, idea: m.idea || '', understanding: m.understanding || '', style: [m.style || '', String(opts.notes || '')].filter(Boolean).join(' '), captions: captionText(m), lengthS: m.lengthS || 30, script: m.script}, null, 1),
  );
  const speed = speedOf(opts.speed);
  const args = ['setup-motion', '--job', jobDir, '--voice', m.voice.audio, '--words', m.voice.wordsFile, '--aspect', m.aspect || '9:16', '--brief', briefFile, '--input-dir', path.join(project.dir, 'input')];
  if (speed === 'fast') args.push('--fast');
  if (reference) args.push('--reference', reference);
  if (track) args.push('--music', track.path);
  const s = await agentScript(args, run, (l) => run.log(l));
  if (s.code !== 0) throw new Error(`Preparing the workspace failed: ${s.out.trim().split(/\r?\n/).slice(-3).join(' ')}`);
  run.step('setup', 'done');

  run.step('measure', 'active');
  if (reference) await writeAnalysis(reference, ws, run);
  else run.log('No reference: Claude designs from the style direction.');
  run.step('measure', 'done');

  return designAndCheck({ws, jobDir, run, first: motionFirst(), review: motionReview, reference, kind: 'motion', speed});
};

// the caption choice in words Claude can follow exactly
const CAPTION_PRESETS = {
  bold: 'Bold: big capital letters, heavy sans (Inter 800 or similar), 1 to 3 words, the spoken word lit in the accent colour.',
  boxed: 'Boxed: white words on a dark rounded pill, 1 to 3 words.',
  highlight: 'Highlight: the spoken word sits in an accent-coloured box, the others plain, 1 to 3 words.',
  karaoke: 'Karaoke: a full short line (up to 6 words) where each word lights up in the accent colour as it is spoken.',
  minimal: 'Minimal: small, quiet, lower on the frame, no box, 2 to 4 words.',
  kinetic: 'Kinetic: each word animates in on its own (rise, pop or slide), heavy type, 1 to 3 words, key words bigger and in the accent colour.',
  label: 'Label: words in a cream box with a thick ink border and a hard offset shadow, key word in the accent colour (paper / scrapbook style).',
  none: 'No captions: the motion graphics carry the words; still put the key words of each line on screen as type.',
};
export const captionText = (m) => {
  const c = m.captions || {};
  const base = CAPTION_PRESETS[c.style] || CAPTION_PRESETS.bold;
  const cols = c.colors || {};
  const col = [cols.text && `text ${cols.text}`, cols.accent && `highlighted word ${cols.accent}`, cols.box && `box ${cols.box}`].filter(Boolean).join(', ');
  return `${base}${col ? ` Colours: ${col}.` : ' Colours: from the look you choose.'}`;
};

// ---------------------------------------------------------------- after the build: preview, edits with undo, render

const wsOf = (project) => path.join(enginePaths(getSettings().enginePath).jobDir(project.id), 'agent');
const agentModel = () => getSettings().agentModel || 'opus';

// the workspace's fixed files (entry, root, timeline helpers) always match this version of the engine
const refreshKit = (ws) => {
  const tpl = path.join(enginePaths(getSettings().enginePath).skill, 'agent');
  for (const f of ['Root.tsx', 'index.ts', 'beats.ts']) if (fs.existsSync(path.join(tpl, f))) fs.copyFileSync(path.join(tpl, f), path.join(ws, f));
  if (!fs.existsSync(path.join(ws, 'beats.json'))) fs.writeFileSync(path.join(ws, 'beats.json'), JSON.stringify({beats: []}, null, 1));
};

// compile the standalone preview page; on a compile error Claude gets one chance to fix it (when a session is given)
const buildPreview = async (jobDir, run, sessionId = null, claudeOpts = null) => {
  refreshKit(path.join(jobDir, 'agent'));
  let r = await agentScript(['preview', '--job', jobDir], run, () => {});
  if (r.code !== 0 && sessionId) {
    run.log('The composition does not build; Claude is fixing it');
    const ans = await claudeRun(compilePrompt(r.out.slice(-3000)), path.join(jobDir, 'agent'), 20 * 60 * 1000, [], run, {...claudeOpts, resume: sessionId});
    run.log(ans.trim().slice(0, 300), 'write');
    r = await agentScript(['preview', '--job', jobDir], run, () => {});
  }
  if (r.code !== 0) throw new Error(`The composition does not build: ${r.out.trim().split(/\r?\n/).slice(-4).join(' ')}`);
};

// how far Claude's checks got, also for a build that stopped before its preview existed
export const agentCheck = (project) => {
  const ws = wsOf(project);
  const sess = readSession(ws);
  if (!sess || !sess.sessionId) return null;
  const hasComp = fs.existsSync(path.join(ws, 'Composition.tsx'));
  // the checks can only be continued once Claude has written the composition (stage past "write"; a new workspace holds a placeholder),
  // and never while a build or a change is running
  const written = sess.stage && sess.stage !== 'write';
  const running = aiBusy();
  const writeStopped = sess.stage === 'write' && !running; // stopped while writing: nothing to check, it must be built again
  return {
    rounds: sess.rounds || 0,
    clean: !!sess.clean,
    interrupted: sess.interrupted || null,
    running,
    writeStopped,
    canContinue: !running && hasComp && written && !sess.clean && (sess.rounds || 0) < (sess.maxRounds || MAX_ROUNDS),
    maxRounds: sess.maxRounds || MAX_ROUNDS,
    previewMissing: !fs.existsSync(path.join(ws, 'preview', 'preview.html')),
  };
};

export const agentState = (project) => {
  const ws = wsOf(project);
  const page = path.join(ws, 'preview', 'preview.html');
  if (!fs.existsSync(page)) return null;
  const hist = path.join(ws, 'history');
  const history = fs.existsSync(hist)
    ? fs
        .readdirSync(hist)
        .filter((d) => /^\d+$/.test(d))
        .map((d) => {
          try {
            return {n: Number(d), ...JSON.parse(fs.readFileSync(path.join(hist, d, 'meta.json'), 'utf8'))};
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.n - b.n)
    : [];
  const sess = readSession(ws);
  const check = sess ? {rounds: sess.rounds || 0, clean: !!sess.clean, interrupted: sess.interrupted || null, canContinue: !!sess.sessionId && !sess.clean && (sess.rounds || 0) < (sess.maxRounds || MAX_ROUNDS)} : null;
  return {dir: ws, page, history, built: fs.statSync(page).mtimeMs, check};
};

const SNAP = ['Composition.tsx', 'beats.json', 'sfx.json', 'audio.json'];
const snapshot = (ws, meta) => {
  const hist = path.join(ws, 'history');
  fs.mkdirSync(hist, {recursive: true});
  const n = fs.readdirSync(hist).filter((d) => /^\d+$/.test(d)).length + 1;
  const dir = path.join(hist, String(n));
  fs.mkdirSync(dir, {recursive: true});
  for (const f of SNAP) if (fs.existsSync(path.join(ws, f))) fs.copyFileSync(path.join(ws, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({at: Date.now(), undone: false, ...meta}));
  return n;
};
const restore = (ws, n) => {
  const dir = path.join(ws, 'history', String(n));
  for (const f of SNAP) if (fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(dir, f), path.join(ws, f));
};

export const AGENT_EDIT_STEPS = [
  {id: 'write', label: 'Claude changes the edit'},
  {id: 'preview', label: 'Rebuilding the preview'},
];

const editPrompt = (instruction) => `The user watched the preview and asks for this change:\n\n"${instruction}"\n\nChange Composition.tsx (and sfx.json / audio.json if needed) to do exactly that. Keep everything else as it is, and keep following the hard rules in BRIEF.md (face, overlaps, safe zone, spoken text only). If the request is unclear or impossible, do the closest sensible thing.\nAnswer with one short sentence describing what you changed.`;

export const agentEdit = async (project, instruction, run) => {
  const st = agentState(project);
  if (!st) throw new Error('Build the edit with Agent build first (Plan tab).');
  const ws = st.dir;
  const jobDir = path.dirname(ws);
  const n = snapshot(ws, {instruction: String(instruction).slice(0, 600), summary: ''});
  let session = null;
  try {
    session = JSON.parse(fs.readFileSync(path.join(ws, 'session.json'), 'utf8')).sessionId;
  } catch {
    session = null;
  }
  const opts = {tools: ['Read', 'Write', 'Edit', 'Glob'], permissionMode: 'acceptEdits', maxTurns: 60, model: agentModel()};
  run.step('write', 'active');
  let summary = null;
  try {
    if (session) summary = await claudeRun(editPrompt(instruction), ws, 20 * 60 * 1000, [], run, {...opts, resume: session});
  } catch (e) {
    if (e.cancelled) {
      restore(ws, n);
      throw e;
    }
    summary = null; // the saved conversation is gone: start a new one with the files as context
  }
  if (summary === null) {
    const fresh = crypto.randomUUID();
    summary = await claudeRun(`Read BRIEF.md and Composition.tsx first: Composition.tsx is the current edit (already approved by the user), recreating the reference described in BRIEF.md.\n\n${editPrompt(instruction)}`, ws, 25 * 60 * 1000, [], run, {...opts, sessionId: fresh});
    session = fresh;
    fs.writeFileSync(path.join(ws, 'session.json'), JSON.stringify({sessionId: fresh, at: Date.now()}));
  }
  run.step('write', 'done');
  run.step('preview', 'active');
  try {
    await buildPreview(jobDir, run, session, opts);
  } catch (e) {
    restore(ws, n);
    await agentScript(['preview', '--job', jobDir], run, () => {});
    throw new Error(`${e.message} The edit was put back as it was.`);
  }
  run.step('preview', 'done');
  const metaFile = path.join(ws, 'history', String(n), 'meta.json');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  fs.writeFileSync(metaFile, JSON.stringify({...meta, summary: summary.trim().slice(0, 400)}));
  return {n, summary: summary.trim().slice(0, 400)};
};

// undo the latest change still in effect
export const agentUndo = async (project, run) => {
  const st = agentState(project);
  if (!st) throw new Error('Nothing to undo.');
  const last = [...st.history].reverse().find((h) => !h.undone);
  if (!last) throw new Error('Nothing to undo.');
  restore(st.dir, last.n);
  const metaFile = path.join(st.dir, 'history', String(last.n), 'meta.json');
  fs.writeFileSync(metaFile, JSON.stringify({...JSON.parse(fs.readFileSync(metaFile, 'utf8')), undone: true}));
  await buildPreview(path.dirname(st.dir), run);
  return {n: last.n};
};

// ---------------------------------------------------------------- the timeline (beats.json): moved and resized by hand, no Claude
export const agentBeats = (project) => {
  const st = agentState(project);
  if (!st) return null;
  const read = (f, d) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(st.dir, f), 'utf8'));
    } catch {
      return d;
    }
  };
  const tl = read('timeline.json', {});
  const beats = (read('beats.json', {beats: []}).beats || []).filter((b) => b && b.id && Number.isFinite(b.startMs) && Number.isFinite(b.endMs));
  return {beats, words: read('words.json', []), videoMs: tl.videoMs || 0, width: tl.width || 1080, height: tl.height || 1920};
};

export const agentSaveBeats = async (project, beats, label, run) => {
  const st = agentState(project);
  if (!st) throw new Error('Build the edit with Agent build first (Plan tab).');
  const current = agentBeats(project);
  const known = new Map(current.beats.map((b) => [b.id, b]));
  // only times change here: ids, tracks and labels stay as Claude wrote them
  const next = current.beats.map((b) => {
    const n = (beats || []).find((x) => x && x.id === b.id);
    if (!n) return b;
    const startMs = Math.max(0, Math.round(Number(n.startMs)));
    const endMs = Math.max(startMs + 200, Math.round(Number(n.endMs)));
    return {...b, startMs, endMs};
  });
  if (!next.some((b, i) => b.startMs !== current.beats[i].startMs || b.endMs !== current.beats[i].endMs)) return {n: null};
  void known;
  const n = snapshot(st.dir, {instruction: String(label || 'Timeline change').slice(0, 200), summary: 'Changed on the timeline', kind: 'timeline'});
  const all = JSON.parse(fs.readFileSync(path.join(st.dir, 'beats.json'), 'utf8'));
  fs.writeFileSync(path.join(st.dir, 'beats.json'), JSON.stringify({...all, beats: next}, null, 1));
  run.step('preview', 'active');
  try {
    await buildPreview(path.dirname(st.dir), run);
  } catch (e) {
    restore(st.dir, n);
    await agentScript(['preview', '--job', path.dirname(st.dir)], run, () => {});
    throw e;
  }
  run.step('preview', 'done');
  return {n};
};

// builds made before the timeline existed: Claude moves the composition's times into beats.json, nothing else changes
export const TIMELINE_INSTRUCTION = 'Make the timeline editable: read the "Timeline" section of BRIEF.md, then move the start and end time of every card, title, motion graphic, sticker group, layout section and end card into beats.json, and make Composition.tsx read them with the helpers in beats.ts. Times inside an element stay tied to words or relative to its beat. Sound effects that belong to an element use {"beat", "offsetMs"}. Do not change how anything looks or when it happens.';

export const AGENT_RENDER_STEPS = [
  {id: 'render', label: 'Rendering the video'},
  {id: 'mix', label: 'Mixing voice, music and sound effects to -14 LUFS'},
];

export const agentRender = async (project, opts, run) => {
  const st = agentState(project);
  if (!st) throw new Error('Build the edit with Agent build first (Plan tab).');
  const jobDir = path.dirname(st.dir);
  const track = (project.media || []).find((m) => m.role === 'music' && m.kind === 'audio' && fs.existsSync(m.path));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const out = path.join(project.dir, 'output', `${slug(project.name)}_agent_${stamp}.mp4`);
  const args = ['render', '--job', jobDir, '--out', out, '--concurrency', String((opts && opts.concurrency) || 2)];
  if (track) args.push('--music', track.path);
  run.step('render', 'active');
  let mixing = false;
  const r = await agentScript(args, run, (l) => {
    const m = /^Rendering (\d+)%/.exec(l);
    if (m) {
      if (Number(m[1]) % 10 === 0) run.log(`Rendering the video: ${m[1]}%`);
    } else if (/^Mixing/.test(l) && !mixing) {
      mixing = true;
      run.step('render', 'done');
      run.step('mix', 'active');
    } else if (!/^Building/.test(l)) run.log(l);
  });
  if (r.code !== 0) throw new Error(`Rendering failed: ${r.out.trim().split(/\r?\n/).slice(-3).join(' ')}`);
  run.step('render', 'done');
  run.step('mix', 'done');
  return {out, report: out.replace(/\.mp4$/, '_report.md')};
};

export const cancelAgent = (run) => killChild(run && run.child);
