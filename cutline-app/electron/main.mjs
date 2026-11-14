import {app, BrowserWindow, dialog, ipcMain, shell, nativeTheme} from 'electron';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {appDir, enginePaths, slug} from './paths.mjs';
import {getProject, getSettings, listProjects, newId, publicSettings, removeProject, saveProject, saveSettings, setSecret} from './store.mjs';
import {attach, detach, ensureWorkspace, kindOf, poster} from './media.mjs';
import {activeRuns, cancelRun, engineInfo, readJob, saveAssetsPlan, savePlan, startRun} from './engine.mjs';
import {lastUsage, planWithAi, testAi} from './ai.mjs';
import {aiBusy, cancelAi, setAiSender, startAiRun} from './airun.mjs';
import {forget, memoryCounts, readMemory, remember, withProject} from './memory.mjs';
import {testFree} from './freellm.mjs';
import {addGatewayKey, gatewayAvailable, gatewayStatus, removeGatewayKey, stopGateway} from './gateway.mjs';
import {useBundledTools} from './runtime.mjs';
import {cancelLogin, claudeStatus, installClaude, sendLoginCode, signOut, startLogin} from './claude.mjs';
import {editWithAi} from './aiedit.mjs';
import {listHistory, pushHistory, restoreHistory} from './planhistory.mjs';
import {addReference, describeRef, listReferences, removeReference} from './library.mjs';
import {ensureSample, listLooks, lookMeta, lookPathFor, removeLook, saveLook} from './looks.mjs';
import {lookWithAi} from './ailook.mjs';
import {studyReference} from './aistyle.mjs';
import {hookWithAi, readHook} from './aihook.mjs';
import {RECORDING_STEPS, SCRIPT_STEPS, VOICE_STEPS, makeVoice, restoreWrittenScript, useRecording, writeScript} from './motion.mjs';
import {MODELS, listVoices, subscription} from './eleven.mjs';
import {CONTINUE_STEPS, agentCheck, continueChecks, MOTION_STEPS, startMotionBuild, AGENT_EDIT_STEPS, AGENT_RENDER_STEPS, AGENT_STEPS, TIMELINE_INSTRUCTION, agentBeats, agentEdit, agentRender, agentSaveBeats, agentState, agentUndo, startAgentBuild} from './agentbuild.mjs';
import {analyzeVideo, getAnalysis, installYtdlp, listAnalyses, removeAnalysis, ytdlpStatus} from './competitor.mjs';

// the app was called Cutline before; keep its saved projects, looks and settings
app.setName('OmniMotion');
{
  const appData = app.getPath('appData');
  const oldDir = path.join(appData, 'Cutline');
  // a different folder from the other OmniMotion app's data (Roaming/omnimotion), which this app never touches
  const newDir = path.join(appData, 'OmniMotion Studio');
  try {
    if (fs.existsSync(path.join(oldDir, 'projects')) && !fs.existsSync(path.join(newDir, 'projects'))) fs.cpSync(oldDir, newDir, {recursive: true, force: false});
  } catch {}
  app.setPath('userData', newDir);
}

useBundledTools();
const isDev = !!process.env.OMNIMOTION_DEV_URL;
let win = null;

// media is served to the window from a tiny local file server: 127.0.0.1 only, a random token per launch, and only inside the project, engine and app-data folders
const token = crypto.randomBytes(16).toString('hex');
let mediaPort = 0;
const MIME = {'.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff': 'font/woff', '.map': 'application/json'};
const MEDIA_PORT = 47283;
const mediaUrl = (p) => `http://127.0.0.1:${mediaPort}/__media/${token}/f/${encodeURIComponent(p)}`;
const dirIds = new Map();
const dirBase = (dir) => {
  const id = crypto.createHash('sha1').update(dir).digest('hex').slice(0, 10);
  dirIds.set(id, path.resolve(dir));
  return `/__media/${token}/d/${id}`;
};
const allowedRoots = () => {
  const s = getSettings();
  return [s.workspaceRoot, enginePaths(s.enginePath).root, path.join(app.getPath('userData'))].map((r) => path.resolve(r));
};
const inside = (p, root) => {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

const emit = (ev) => win && !win.isDestroyed() && win.webContents.send('run:event', ev);

// a call whose first argument is a project id runs "inside" that project, so every Claude conversation it starts gets the project's memory
const handle = (name, fn) =>
  ipcMain.handle(name, async (_e, ...args) => {
    try {
      const id = args[0];
      const run = () => fn(...args);
      return {ok: true, data: await (typeof id === 'string' && /^[a-f0-9]{8}$/.test(id) ? withProject(id, run) : run())};
    } catch (err) {
      return {ok: false, error: String(err?.message || err)};
    }
  });

const requireProject = (id) => {
  const p = getProject(id);
  if (!p) throw new Error('Project not found.');
  return p;
};

const registerIpc = () => {
  handle('settings:get', () => publicSettings());
  handle('settings:save', (patch) => {
    const s = saveSettings(patch);
    if (patch.theme) nativeTheme.themeSource = patch.theme;
    return s;
  });
  handle('settings:secret', (name, value) => setSecret(name, value));
  handle('engine:info', () => engineInfo());
  handle('window:overlay', (o) => {
    if (win && !win.isDestroyed() && typeof win.setTitleBarOverlay === 'function' && o && o.color && o.symbolColor) win.setTitleBarOverlay({color: o.color, symbolColor: o.symbolColor, height: 44});
    return true;
  });
  handle('ai:test', (provider) => testAi(provider));
  const emitClaude = (ev) => win && !win.isDestroyed() && win.webContents.send('claude:event', ev);
  handle('claude:status', () => claudeStatus());
  handle('claude:install', () => installClaude(emitClaude));
  handle('claude:login', () => startLogin(emitClaude));
  handle('claude:code', (t) => sendLoginCode(t));
  handle('claude:cancel', () => cancelLogin());
  handle('claude:signout', () => signOut());
  handle('shell:external', (u) => (String(u).startsWith('https://') ? shell.openExternal(u) : false));

  handle('projects:list', () => listProjects());
  handle('projects:get', (id) => requireProject(id));
  handle('projects:create', (data) => {
    const s = getSettings();
    const id = newId();
    const name = String(data.name || 'Untitled').trim() || 'Untitled';
    const dir = path.join(s.workspaceRoot, `${slug(name)}-${id}`);
    ensureWorkspace(dir);
    const mode = data.mode === 'vlog' ? 'vlog' : data.mode === 'motion' ? 'motion' : 'talking';
    return saveProject({id, name, mode, style: data.style === 'light' ? 'light' : 'tech', popout: !!data.popout, look: data.look || undefined, dir, createdAt: Date.now(), updatedAt: Date.now(), media: [], outputs: [], settings: {cutSilence: true, music: 'on', language: 'auto', ...(mode === 'motion' ? {agentActive: true} : {})}, status: {}, ...(mode === 'motion' ? {motion: {aspect: data.motion && data.motion.aspect === '16:9' ? '16:9' : '9:16', lengthS: [30, 45, 60].includes(Number(data.motion && data.motion.lengthS)) ? Number(data.motion.lengthS) : 30, language: 'auto', captions: {style: 'kinetic'}}} : {})});
  });
  handle('projects:save', (p) => saveProject(p));
  handle('projects:remove', (id) => removeProject(id));

  handle('media:pick', async (kinds) => {
    const filters = {video: [{name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi']}], audio: [{name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']}], image: [{name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg']}], text: [{name: 'Transcript', extensions: ['srt', 'vtt', 'txt', 'json']}]};
    const list = (kinds && kinds.length ? kinds : ['video', 'audio', 'image', 'text']).flatMap((k) => filters[k] || []);
    const all = {name: 'All supported', extensions: list.flatMap((f) => f.extensions)};
    const r = await dialog.showOpenDialog(win, {properties: ['openFile', 'multiSelections'], filters: [all, ...list]});
    return r.canceled ? [] : r.filePaths;
  });
  handle('media:attach', async (id, items) => {
    const p = requireProject(id);
    const added = await attach(p, items);
    saveProject(p);
    return {project: p, added};
  });
  handle('media:detach', (id, mediaId) => {
    const p = requireProject(id);
    detach(p, mediaId);
    return saveProject(p);
  });
  handle('media:poster', (file) => poster(file, mediaUrl));
  handle('media:url', (file) => mediaUrl(file));
  handle('media:dir', (dir) => dirBase(dir));
  handle('media:kind', (file) => kindOf(file));

  handle('run:start', (id, step, opts) => {
    const p = requireProject(id);
    return startRun(p, step, opts || {}, emit);
  });
  handle('run:cancel', (runId) => cancelRun(runId));
  handle('run:active', () => activeRuns());

  handle('job:read', (id) => {
    const p = requireProject(id);
    return readJob(p, mediaUrl);
  });
  handle('plan:save', (id, plan, assetsPlan) => {
    const p = requireProject(id);
    const known = new Set(readMemory(id).filter((m) => m.kind === 'spelling').map((m) => m.text));
    for (const fix of Object.values((plan && plan.wordFixes) || {})) {
      const t = `write "${String(fix).slice(0, 60)}" exactly like this in captions and graphics`;
      if (!known.has(t)) remember(id, 'spelling', t);
    }
    savePlan(p, plan);
    if (assetsPlan) saveAssetsPlan(p, assetsPlan);
    return true;
  });
  // live progress of Claude's work (plan, edit, look) for the window
  setAiSender((ev) => win && !win.isDestroyed() && win.webContents.send('ai:event', ev));
  handle('ai:cancel', () => cancelAi());
  handle('memory:counts', () => memoryCounts());
  handle('memory:read', (id) => readMemory(id));
  handle('memory:forget', (id) => {
    forget(id);
    return true;
  });
  handle('gateway:status', () => (gatewayAvailable() ? gatewayStatus() : {running: false, missing: true}));
  handle('gateway:addKey', (platform, key) => addGatewayKey(String(platform || ''), String(key || '')));
  handle('gateway:removeKey', (id) => removeGatewayKey(id));
  handle('free:test', (o) => testFree(o && typeof o === 'object' ? {base: o.base, key: o.key} : {}));
  const PLAN_STEPS = [
    {id: 'read', label: 'Reading your transcript'},
    {id: 'files', label: 'Preparing your files'},
    {id: 'write', label: 'Claude writes the plan'},
    {id: 'check', label: 'Checking that every file is placed'},
    {id: 'save', label: 'Saving the plan'},
  ];
  const EDIT_STEPS = [
    {id: 'read', label: 'Understanding your request'},
    {id: 'write', label: 'Claude changes the plan'},
    {id: 'check', label: 'Checking the change'},
    {id: 'save', label: 'Saving it'},
  ];
  const LOOK_STEPS = [
    {id: 'measure', label: 'Measuring cuts, transitions, graphics, captions and music'},
    {id: 'study', label: 'Claude studies the motion graphics, components, animations and effects'},
    {id: 'design', label: 'Designing the colours, fonts and grade'},
    {id: 'check', label: 'Checking colours and fonts'},
  ];
  const HOOK_STEPS = [
    {id: 'read', label: 'Reading the first seconds'},
    {id: 'frames', label: 'Looking at the first frames'},
    {id: 'judge', label: 'Claude judges the hook'},
    {id: 'save', label: 'Saving the result'},
  ];
  handle('hook:read', (id) => readHook(readJob(requireProject(id), mediaUrl)));
  handle('hook:analyze', async (id) => {
    const p = requireProject(id);
    const job = readJob(p, mediaUrl);
    const run = startAiRun('hook', 'Claude is judging your hook', HOOK_STEPS);
    try {
      const h = await hookWithAi(p, job, run);
      run.end(true, {tokens: lastUsage});
      return h;
    } catch (e) {
      run.end(false, {error: e.message});
      throw e;
    }
  });
  handle('plan:ai', async (id, brief) => {
    const p = requireProject(id);
    const job = readJob(p, mediaUrl);
    const run = startAiRun('plan', 'Claude is planning your edit', PLAN_STEPS);
    try {
      const {plan, unused, motion, motionNeeded} = await planWithAi(p, job, run, typeof brief === 'string' ? brief.slice(0, 2000) : '');
      run.step('save', 'active');
      savePlan(p, plan);
      run.step('save', 'done');
      run.end(true, {unused, motion, motionNeeded, tokens: lastUsage});
      return {...plan, _unused: unused};
    } catch (e) {
      run.end(false, {error: e.message});
      throw e;
    }
  });

  handle('plan:edit', async (id, instruction) => {
    const p = requireProject(id);
    const job = readJob(p, mediaUrl);
    if (!job.words) throw new Error('Prepare the project first so there is a transcript to edit.');
    const before = job.plan || job.autoPlan || {defaultMode: p.mode === 'vlog' ? 'vlog' : p.style === 'light' ? 'lightHead' : 'techHead', graphics: []};
    const past = listHistory(p).filter((h) => !h.undone);
    const run = startAiRun('edit', 'Claude is making your change', EDIT_STEPS);
    try {
      const r = await editWithAi(p, job, instruction, before, past, run);
      run.step('save', 'active');
      const n = pushHistory(p, {instruction, summary: r.summary, tokens: r.tokens, before});
      remember(p.id, 'edit', `asked "${String(instruction).slice(0, 180)}" -> done: ${String(r.summary || '').slice(0, 180)}`);
      savePlan(p, r.plan);
      run.step('save', 'done');
      run.end(true, {tokens: r.tokens, summary: r.summary});
      return {n, summary: r.summary, tokens: r.tokens};
    } catch (e) {
      run.end(false, {error: e.message});
      throw e;
    }
  });
  // Agent build: Claude writes a bespoke composition that recreates a reference and checks its own frames; the result is a live preview
  // the user can change in plain words (Edit, with undo) and render (Render)
  const agentView = (p) => {
    const st = agentState(p);
    if (!st) return null;
    return {previewUrl: `${dirBase(st.dir)}/preview/preview.html?v=${Math.round(st.built)}`, history: st.history, built: st.built, check: st.check};
  };
  const agentJob = async (id, job, title, steps, fn) => {
    const p = requireProject(id);
    const run = startAiRun(job, title, steps);
    try {
      const r = await fn(p, run);
      run.end(true, {...r, tokens: lastUsage});
      return {...r, view: agentView(p)};
    } catch (e) {
      if (!e.cancelled) console.error(`[agent:${job}]`, e.stack || e.message);
      run.end(false, {error: e.message});
      throw e;
    }
  };
  handle('agent:build', (id, opts) =>
    agentJob(id, 'agent', 'Claude is rebuilding the reference on your footage', AGENT_STEPS, async (p, run) => {
      const r = await startAgentBuild(p, readJob(p, mediaUrl), {reference: opts && opts.reference, notes: opts && opts.notes, speed: opts && opts.speed}, run);
      remember(p.id, 'build', `reference style rebuilt on the footage (${(opts && opts.speed) || 'fast'}), checks ${r.clean ? 'clean' : r.interrupted ? 'stopped early' : 'done with fixes'}; change it from here instead of rebuilding`);
      saveProject({...p, settings: {...p.settings, agentActive: true}});
      return r;
    }),
  );
  handle('agent:state', (id) => agentView(requireProject(id)));
  // Motion graphics: script (Claude), voice-over (ElevenLabs), build (Agent build without footage)
  handle('motion:script', async (id) => {
    const p = requireProject(id);
    const run = startAiRun('script', 'Claude is writing your script', SCRIPT_STEPS);
    try {
      const next = await writeScript(p, run);
      run.end(true, {tokens: lastUsage});
      return next;
    } catch (e) {
      run.end(false, {error: e.message});
      throw e;
    }
  });
  handle('motion:voices', async () => ({voices: await listVoices(), subscription: await subscription(), models: MODELS}));
  handle('motion:voice', async (id) => {
    const p = requireProject(id);
    const run = startAiRun('script', 'Recording the voice-over', VOICE_STEPS);
    try {
      const next = await makeVoice(p, run);
      run.end(true, {});
      return next;
    } catch (e) {
      run.end(false, {error: e.message});
      throw e;
    }
  });
  // your own recording: copied, transcribed with word times, and its transcript becomes the script
  handle('motion:recording', async (id, file) => {
    const p = requireProject(id);
    const run = startAiRun('script', 'Using your recording', RECORDING_STEPS);
    try {
      const next = await useRecording(p, typeof file === 'string' ? file : '', run);
      run.end(true, {});
      return next;
    } catch (e) {
      run.end(false, {error: e.message});
      throw e;
    }
  });
  handle('motion:writtenScript', (id) => restoreWrittenScript(requireProject(id)));
  handle('motion:build', (id, opts) =>
    agentJob(id, 'agent', 'Claude is animating your video', MOTION_STEPS, async (p, run) => {
      const r = await startMotionBuild(p, opts || {}, run);
      remember(p.id, 'build', `motion video built (${(opts && opts.speed) || 'fast'}), checks ${r.clean ? 'clean' : r.interrupted ? 'stopped early' : 'done with fixes'}; change it from here instead of rebuilding`);
      return r;
    }),
  );
  // a build that stopped part way (usage limit, network...): Claude resumes its own conversation and finishes the check rounds
  handle('agent:check', (id) => agentCheck(requireProject(id)));
  handle('agent:continue', (id) => agentJob(id, 'agent', 'Claude is finishing the checks', CONTINUE_STEPS, (p, run) => continueChecks(p, run)));
  handle('agent:beats', (id) => agentBeats(requireProject(id)));
  handle('agent:saveBeats', (id, beats, label) => agentJob(id, 'edit', 'Updating the timeline', [{id: 'preview', label: 'Rebuilding the preview'}], (p, run) => agentSaveBeats(p, beats, label, run)));
  handle('agent:enableTimeline', (id) => agentJob(id, 'edit', 'Claude is making the timeline editable', AGENT_EDIT_STEPS, (p, run) => agentEdit(p, TIMELINE_INSTRUCTION, run)));
  handle('agent:edit', (id, instruction) =>
    agentJob(id, 'edit', 'Claude is changing your edit', AGENT_EDIT_STEPS, async (p, run) => {
      const r = await agentEdit(p, String(instruction || '').slice(0, 2000), run);
      remember(p.id, 'edit', `asked "${String(instruction).slice(0, 180)}" -> done: ${String((r && r.summary) || '').slice(0, 180)}`);
      return r;
    }),
  );
  handle('agent:undo', (id) =>
    agentJob(id, 'edit', 'Undoing the last change', [{id: 'preview', label: 'Rebuilding the preview'}], async (p, run) => {
      const r = await agentUndo(p, run);
      remember(p.id, 'undo', 'the user undid the last change to the video: do not bring it back unless asked');
      return r;
    }),
  );
  handle('agent:render', (id, opts) =>
    agentJob(id, 'agent', 'Rendering your Agent build', AGENT_RENDER_STEPS, async (p, run) => {
      const r = await agentRender(p, opts, run);
      return {...r, url: mediaUrl(r.out)};
    }),
  );
  handle('agent:use', (id, on) => {
    const p = requireProject(id);
    return saveProject({...p, settings: {...p.settings, agentActive: !!on}});
  });
  handle('agent:last', (id) => {
    const p = requireProject(id);
    const dir = path.join(p.dir, 'output');
    if (!fs.existsSync(dir)) return null;
    const f = fs.readdirSync(dir).filter((x) => /_agent_\d+\.mp4$/.test(x)).sort().pop();
    return f ? {out: path.join(dir, f), url: mediaUrl(path.join(dir, f))} : null;
  });
  handle('plan:history', (id) => listHistory(requireProject(id)));
  handle('plan:restore', (id, n) => {
    restoreHistory(requireProject(id), n);
    remember(id, 'undo', `the user undid change ${n}: do not bring it back unless asked`);
    return true;
  });

  handle('looks:list', () => listLooks());
  handle('looks:meta', () => lookMeta());
  handle('looks:save', (look) => saveLook(look));
  handle('looks:remove', (id) => removeLook(id));
  handle('looks:sample', async () => dirBase(await ensureSample()));
  handle('looks:ai', async (req) => {
    const run = startAiRun('look', req.referencePath ? 'Claude is studying your reference' : 'Claude is designing your look', LOOK_STEPS);
    try {
      let sheetPath = null;
      let palette = null;
      let studied = null;
      if (req.referencePath) {
        // the deep study: every cut, transition, graphic, caption, animation and effect, mapped to what OmniMotion can do
        studied = await studyReference(req.referencePath, run);
        run.log('Measuring the colours of the reference');
        const d = await describeRef(req.referencePath, mediaUrl);
        sheetPath = d.sheet;
        palette = d.palette;
      } else {
        run.step('measure', 'skipped', 'no reference video');
        run.step('study', 'skipped', 'no reference video');
      }
      const look = await lookWithAi({sheetPath, palette, description: req.description, name: req.name, run});
      run.end(true, {tokens: lastUsage});
      return studied ? {...look, blueprint: studied.blueprint, style: studied.style, facts: studied.facts, sfx: look.sfx || studied.style.sfx} : look;
    } catch (e) {
      run.end(false, {error: e.message});
      throw e;
    }
  });
  // analyze a video from a link or a file: the hook, the style, the colours, the voice and what to take from it
  const ANALYZE_STEPS = [
    {id: 'download', label: 'Getting the video'},
    {id: 'measure', label: 'Measuring cuts, transitions, graphics, captions and music'},
    {id: 'study', label: 'Claude studies the components, animations, motion graphics and effects'},
    {id: 'colors', label: 'Measuring the colours and the first frames'},
    {id: 'listen', label: 'Transcribing and measuring the voice'},
    {id: 'report', label: 'Claude writes the report: hook, structure, theme, tone, what to take'},
  ];
  handle('analyze:list', () => listAnalyses(mediaUrl));
  handle('analyze:get', (id) => getAnalysis(id, mediaUrl));
  handle('analyze:remove', (id) => removeAnalysis(id));
  handle('analyze:ytdlp', () => ytdlpStatus());
  handle('analyze:install', () => installYtdlp());
  handle('analyze:start', async (req) => {
    const r = req && typeof req === 'object' ? req : {};
    const run = startAiRun('analyze', r.url ? 'Analyzing the video from your link' : 'Analyzing your video', ANALYZE_STEPS);
    try {
      const rec = await analyzeVideo({url: typeof r.url === 'string' ? r.url.slice(0, 2000) : null, file: typeof r.file === 'string' ? r.file : null, cookies: r.cookies}, run);
      run.end(true, {tokens: lastUsage});
      return {id: rec.id};
    } catch (e) {
      run.end(false, {error: e.message});
      throw e;
    }
  });
  handle('library:list', () => listReferences(mediaUrl));
  handle('library:add', (file) => addReference(file));
  handle('library:remove', (id) => removeReference(id));

  if (process.env.OMNIMOTION_SHOTS) {
    // capture mode only: a scripted run of the live progress (no Claude, no project, nothing written), to check the screens
    handle('dev:ai-demo', (job, mode) => {
      const run = startAiRun(job, job === 'plan' ? 'Claude is planning your edit' : job === 'edit' ? 'Claude is making your change' : 'Claude is designing your look', job === 'plan' ? PLAN_STEPS : job === 'edit' ? EDIT_STEPS : LOOK_STEPS);
      const at = (ms, fn) => setTimeout(fn, ms);
      const first = job === 'plan' ? ['read', 'files', 'write', 'check', 'save'] : job === 'edit' ? ['read', 'write', 'check', 'save'] : ['study', 'design', 'check'];
      run.step(first[0], 'active');
      run.log('Transcript: 212 words, about 1.4 minutes of speech');
      at(600, () => { run.step(first[0], 'done', '212 words'); run.step(first[1], 'active'); run.log('Prepared logo-brand.png (logo)'); run.log('Prepared screenshot-app.png (screenshot)'); });
      at(1400, () => { run.step(first[1], 'done', '2 files'); run.log('Sending 41k characters of instructions to Claude'); run.step(first[2], 'active'); run.log('Claude is ready (claude-sonnet-5-5)'); });
      at(2200, () => run.log('Thinking it through', 'think'));
      at(3200, () => run.log('Reading the guide PLAN_SCHEMA.md', 'tool'));
      at(4200, () => run.log('Looking at the picture logo-brand.png', 'tool'));
      at(5200, () => { run.log('Writing the answer', 'write'); run.writing(180, '{"defaultMode": "techHead", "graphics": [{"id": "g1", "kind": "slam", "from": {"at": "wake up"}, "content": {"word": "WAKE UP"}}'); });
      at(6200, () => run.writing(1460, 'ct": {"word": "WAKE UP"}}, {"id": "g2", "kind": "stat", "from": {"at": "five"}, "content": {"value": 5, "unit": "AM"}}, {"id": "g3", "kind": "pills", "from": {"at": "coffee"}'));
      at(7200, () => { run.writing(2310, 'rom": {"at": "gym"}, "content": {"items": ["gym", "work", "family"]}}], "titles": [], "sections": []}', true); run.usage({tokens: 14230, windows: {fiveHour: {utilization: 0.42, resetsAt: Math.floor(Date.now() / 1000) + 5400}}}); });
      at(7800, () => {
        if (mode === 'fail') { run.end(false, {error: 'Your Claude plan limit for this session is reached. It resets on its own (see your Claude usage page); then try again.'}); return; }
        run.step(first[2], 'done'); run.step(first[3], 'active'); run.log('The plan has 3 graphics');
        at(500, () => { run.step(first[3], 'done', 'all 2 placed'); if (first[4]) { run.step(first[4], 'active'); at(300, () => { run.step(first[4], 'done'); run.end(true, {tokens: 14230, unused: job === 'plan' ? [] : undefined, summary: 'demo'}); }); } else run.end(true, {tokens: 14230}); });
      });
      return true;
    });
    // capture mode only: reuse an existing transcript so no new speech-to-text call is made
    handle('dev:seed', (id, srcFile) => {
      const p = requireProject(id);
      const jobDir = enginePaths(getSettings().enginePath).jobDir(p.id);
      fs.mkdirSync(jobDir, {recursive: true});
      fs.copyFileSync(srcFile, path.join(jobDir, 'transcript.raw.json'));
      return true;
    });
  }
  handle('shell:reveal', (p) => shell.showItemInFolder(p));
  handle('shell:open', (p) => shell.openPath(p));
  handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win, {properties: ['openDirectory', 'createDirectory']});
    return r.canceled ? null : r.filePaths[0];
  });
};

const createWindow = () => {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#070B18',
    autoHideMenuBar: true,
    title: 'OmniMotion',
    icon: path.join(appDir, 'resources', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {color: '#0c1226', symbolColor: '#eef2ff', height: 44},
    webPreferences: {preload: path.join(appDir, 'electron', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true},
  });
  win.webContents.setWindowOpenHandler(({url}) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return {action: 'deny'};
  });
  // closing the app ends Claude's work (a build, a change, an analysis): ask first, so a 30-minute build is not lost by accident
  let leaving = false;
  win.on('close', (e) => {
    if (leaving || process.env.OMNIMOTION_SHOTS || !aiBusy()) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Keep working', 'Close and stop Claude'],
      defaultId: 0,
      cancelId: 0,
      title: 'Claude is still working',
      message: 'Claude is still working on your video.',
      detail: 'If you close OmniMotion now, Claude stops and its unfinished work is lost (a build has to start again). Wait for it to finish, or close anyway.',
    });
    if (choice === 0) e.preventDefault();
    else leaving = true;
  });
  if (isDev) win.loadURL(process.env.OMNIMOTION_DEV_URL);
  else win.loadURL(`http://127.0.0.1:${mediaPort}/`);
  return win;
};

// capture mode (used to check the interface visually): OMNIMOTION_SHOTS='[{"hash":"#/projects","file":"a.png"}]'
const runCapture = async () => {
  const shots = JSON.parse(process.env.OMNIMOTION_SHOTS);
  win.webContents.on('console-message', (_e, level, msg) => level >= 2 && console.log('[renderer]', msg.slice(0, 300)));
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await new Promise((r) => setTimeout(r, 1500));
  for (const s of shots) {
    if (s.js) await win.webContents.executeJavaScript(s.js);
    if (s.hash) await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(s.hash)}`);
    await new Promise((r) => setTimeout(r, s.wait || 1400));
    const img = await win.webContents.capturePage();
    fs.mkdirSync(path.dirname(s.file), {recursive: true});
    fs.writeFileSync(s.file, img.toPNG());
  }
  app.quit();
};

const send = (req, res, full, type) => {
  const size = fs.statSync(full).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const head = {'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache'};
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, {...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1});
    fs.createReadStream(full, {start, end}).pipe(res);
  } else {
    res.writeHead(200, {...head, 'Content-Length': size});
    fs.createReadStream(full).pipe(res);
  }
};

// one local server for the app window and its media: 127.0.0.1 only; media needs this launch's token and stays inside the project, engine and app-data folders
const startMediaServer = () =>
  new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://x');
        const seg = url.pathname.split('/').filter(Boolean);
        if (seg[0] === '__media') {
          const parts = seg.map(decodeURIComponent);
          if (parts[1] !== token || !parts[3]) return void res.writeHead(403).end();
          let full;
          if (parts[2] === 'f') full = path.resolve(parts.length > 4 ? path.join(parts[3], ...parts.slice(4)) : parts[3]);
          else if (parts[2] === 'd' && dirIds.has(parts[3])) full = path.resolve(path.join(dirIds.get(parts[3]), ...parts.slice(4)));
          else return void res.writeHead(404).end();
          if (!allowedRoots().some((r) => inside(full, r)) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return void res.writeHead(404).end();
          return send(req, res, full, MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
        }
        // the built app (production)
        const dist = path.join(appDir, 'dist');
        let rel = decodeURIComponent(url.pathname);
        if (rel === '/' || !path.extname(rel)) rel = '/index.html';
        const full = path.resolve(path.join(dist, rel));
        if (!inside(full, dist) || !fs.existsSync(full)) return void res.writeHead(404).end();
        return send(req, res, full, MIME[path.extname(full).toLowerCase()] || (full.endsWith('.js') ? 'text/javascript' : full.endsWith('.css') ? 'text/css' : full.endsWith('.html') ? 'text/html' : full.endsWith('.woff') ? 'font/woff' : 'application/octet-stream'));
      } catch {
        res.writeHead(500).end();
      }
    });
    const listen = (port) => srv.listen(port, '127.0.0.1', () => ((mediaPort = srv.address().port), resolve(null)));
    srv.once('error', () => listen(0));
    listen(MEDIA_PORT);
  });

// one OmniMotion at a time: two copies share the same projects, jobs and Claude sign-in, and a second copy starting or quitting
// has been seen to end the first one's Claude build. Launching it again brings the open window forward instead.
if (!app.requestSingleInstanceLock()) {
  console.error('OmniMotion is already running: this copy closes.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  startMediaServer().then(() => {
    nativeTheme.themeSource = getSettings().theme || 'system';
    registerIpc();
    createWindow();
    if (process.env.OMNIMOTION_SHOTS) runCapture();
  });
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => app.quit());
// on Windows a process started by the app outlives it: when OmniMotion quits, end Claude's work and any render it started,
// so nothing keeps running (and using the Claude plan) after the window is gone
app.on('will-quit', () => {
  try {
    cancelAi();
  } catch {
    // nothing running
  }
  for (const r of activeRuns()) {
    try {
      cancelRun(r.runId);
    } catch {
      // already ended
    }
  }
  stopGateway();
});
