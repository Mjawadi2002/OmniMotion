// Analyze a video from a link (YouTube, Instagram, TikTok and anything else yt-dlp supports) or from a file:
// download it, measure its edit (cuts, transitions, graphics, captions, music), let Claude study its style (components, animations, motion graphics),
// measure its colours, transcribe it (Tunisian, Arabic, French, English...), measure how the voice sounds, and write a report:
// the hook, the structure, the theme, the tone of voice, why it works and what to take from it. From there the user can make a look or add it to the Library.
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {app} from 'electron';
import {claudeRun, extractJson, viaApi} from './ai.mjs';
import {studyReference} from './aistyle.mjs';
import {describeRef} from './library.mjs';
import {voiceFeatures} from './voicetone.mjs';
import {killChild} from './airun.mjs';
import {enginePaths} from './paths.mjs';
import {cacheDir, getSecret, getSettings, newId} from './store.mjs';
import {probe} from './media.mjs';

const run = promisify(execFile);
const list = (v) => (Array.isArray(v) ? v : []);
const str = (v, n = 600) => String(v ?? '').slice(0, n);
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));
const MAX_LISTEN_SEC = 180;

export const analysesDir = () => {
  const d = path.join(app.getPath('userData'), 'analyses');
  fs.mkdirSync(d, {recursive: true});
  return d;
};
const dirOf = (id) => {
  if (!/^[a-f0-9]{8}$/.test(String(id))) throw new Error('Unknown analysis.');
  return path.join(analysesDir(), id);
};
const readJson = (f, d = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1));

// ---------------------------------------------------------------- yt-dlp: the official build the user installed from the app, one on PATH, or the Python module
const ytdlpLocal = () => path.join(app.getPath('userData'), 'tools', 'yt-dlp.exe');
let found = null;
export const findYtdlp = (force = false) => {
  if (found && !force) return found;
  const tries = [
    {cmd: ytdlpLocal(), args: [], how: 'installed by OmniMotion'},
    app.isPackaged ? {cmd: path.join(process.resourcesPath, 'tools', 'yt-dlp.exe'), args: [], how: 'bundled'} : null,
    {cmd: 'yt-dlp', args: [], how: 'on this computer'},
    {cmd: 'python', args: ['-m', 'yt_dlp'], how: 'Python module'},
    {cmd: 'py', args: ['-m', 'yt_dlp'], how: 'Python module'},
  ].filter(Boolean);
  for (const t of tries) {
    if (path.isAbsolute(t.cmd) && !fs.existsSync(t.cmd)) continue;
    try {
      const r = spawnSync(t.cmd, [...t.args, '--version'], {encoding: 'utf8', timeout: 30000, windowsHide: true});
      if (r.status === 0 && /^\d{4}\.\d/.test((r.stdout || '').trim())) {
        found = {...t, version: r.stdout.trim()};
        return found;
      }
    } catch {
      // not this one
    }
  }
  found = null;
  return null;
};
export const ytdlpStatus = () => {
  const y = findYtdlp(true);
  return y ? {ok: true, version: y.version, how: y.how} : {ok: false};
};

// the official Windows build from the yt-dlp project's GitHub releases, saved in the app's own folder (only when the user asks for it)
export const installYtdlp = async () => {
  const dest = ytdlpLocal();
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', {redirect: 'follow'});
  if (!res.ok) throw new Error(`Could not download yt-dlp (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1_000_000 || buf[0] !== 0x4d || buf[1] !== 0x5a) throw new Error('The yt-dlp download did not look like a Windows program, so it was not saved.');
  fs.writeFileSync(`${dest}.part`, buf);
  fs.renameSync(`${dest}.part`, dest);
  const s = ytdlpStatus();
  if (!s.ok) throw new Error('yt-dlp was downloaded but does not start.');
  return s;
};

const platformOf = (url, extractor = '') => {
  const s = `${url} ${extractor}`.toLowerCase();
  if (/tiktok/.test(s)) return 'TikTok';
  if (/instagram/.test(s)) return 'Instagram';
  if (/youtu\.?be|youtube/.test(s)) return 'YouTube';
  if (/facebook|fb\.watch/.test(s)) return 'Facebook';
  if (/twitter|x\.com/.test(s)) return 'X';
  return 'Web';
};

const friendly = (err) => {
  const t = String(err || '');
  if (/login|sign in|cookies|rate-limit|private|not available/i.test(t)) return 'The site wants you to be signed in to see this video. Choose your browser under "Use my browser sign-in" and try again (you must be signed in to the site in that browser), or download the video yourself and use "Analyze a file".';
  if (/Unsupported URL/i.test(t)) return 'This link is not supported. Paste the link of one video (a YouTube, Instagram, TikTok or other public video page).';
  if (/HTTP Error 404|does not exist|unavailable/i.test(t)) return 'This video could not be found. Check the link.';
  const last = t.trim().split(/\r?\n/).filter((l) => /ERROR/i.test(l)).pop();
  return last ? last.replace(/^.*ERROR:\s*/i, 'yt-dlp: ').slice(0, 300) : 'The download failed.';
};

const download = (url, dir, cookies, runEv) =>
  new Promise((resolve, reject) => {
    const y = findYtdlp();
    if (!y) return reject(new Error('yt-dlp is not installed. Click "Install yt-dlp" on this page first.'));
    const args = [
      ...y.args,
      '--no-playlist',
      '--newline',
      '--no-colors',
      '--restrict-filenames',
      '--max-filesize', '700M',
      '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b',
      '--merge-output-format', 'mp4',
      '--write-info-json',
      '--write-thumbnail',
      '--convert-thumbnails', 'jpg',
      '-o', path.join(dir, 'video.%(ext)s'),
    ];
    if (['chrome', 'edge', 'firefox', 'brave', 'opera'].includes(cookies)) args.push('--cookies-from-browser', cookies);
    args.push('--', url);
    const child = spawn(y.cmd, args, {cwd: dir, windowsHide: true});
    if (runEv) runEv.child = child;
    let err = '';
    let lastPct = -10;
    const onLine = (line) => {
      const m = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\S+)/.exec(line);
      if (m) {
        const pct = Math.floor(+m[1]);
        if (pct >= lastPct + 20 || pct === 100) {
          lastPct = pct;
          runEv?.log(`Downloading: ${pct}% of ${m[2]}`);
        }
      } else if (/\[Merger\]|\[ExtractAudio\]/.test(line)) runEv?.log('Joining the picture and the sound');
    };
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-10000);
    });
    child.on('error', (e) => reject(new Error(`yt-dlp could not start: ${e.message}`)));
    child.on('close', (code) => {
      if (runEv?.cancelled) return reject(new Error('Stopped.'));
      const video = fs.readdirSync(dir).find((f) => /^video\.(mp4|mkv|webm|mov)$/i.test(f));
      if (code !== 0 || !video) return reject(new Error(friendly(err)));
      resolve(path.join(dir, video));
    });
  });

// ---------------------------------------------------------------- listening: transcript (ElevenLabs Scribe) and the voice
const transcribe = async (file, dir, runEv) => {
  const e = enginePaths(getSettings().enginePath);
  const wav = path.join(dir, 'voice16k.wav');
  await run('ffmpeg', ['-v', 'error', '-y', '-t', String(MAX_LISTEN_SEC), '-i', file, '-vn', '-ac', '1', '-ar', '16000', wav], {windowsHide: true});
  const cfg = readJson(path.join(e.skill, 'style.config.json'));
  const lib = path.join(e.skill, 'scripts', 'lib', 'transcribe.mjs');
  if (!cfg || !fs.existsSync(lib)) return {wav, words: [], events: [], note: 'The engine transcription module was not found.'};
  const p = cfg.transcription?.providers?.elevenlabs;
  const envName = p?.apiKeyEnv || 'ELEVENLABS_API_KEY';
  const saved = getSecret('elevenlabs');
  const had = process.env[envName];
  if (saved) process.env[envName] = saved;
  try {
    const {transcribeElevenLabs, readApiKey} = await import(pathToFileURL(lib).href);
    if (!readApiKey(e.root, envName)) return {wav, words: [], events: [], note: 'No ElevenLabs key: add one in Settings to get the words and the pace.'};
    runEv?.log('Transcribing with ElevenLabs (Tunisian, Arabic, French, English and more are detected on their own)');
    const t = await transcribeElevenLabs({projectRoot: e.root, wavPath: wav, cfg, lang: 'auto', outDir: dir});
    const raw = readJson(path.join(dir, 'transcript.elevenlabs.json'), {});
    const events = list(raw.words)
      .filter((w) => w.type === 'audio_event')
      .map((w) => ({text: w.text, atSec: Math.round((w.start || 0) * 10) / 10}));
    return {wav, words: t.words, language: t.language, full: t.full, events};
  } catch (err) {
    return {wav, words: [], events: [], note: `Transcription failed: ${String(err.message).slice(0, 200)}`};
  } finally {
    if (saved) {
      if (had === undefined) delete process.env[envName];
      else process.env[envName] = had;
    }
  }
};

// frames of the first 3 seconds (what decides whether people stay)
const hookSheet = async (file, dir) => {
  const out = path.join(dir, 'hook-frames.jpg');
  if (fs.existsSync(out)) return out;
  const tmp = path.join(dir, 'hookf');
  fs.mkdirSync(tmp, {recursive: true});
  const times = [0, 0.4, 0.9, 1.5, 2.2, 3];
  for (let i = 0; i < times.length; i++) {
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', times[i].toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=240:-2', '-q:v', '4', path.join(tmp, `f_${String(i + 1).padStart(3, '0')}.jpg`)], {windowsHide: true}).catch(() => {});
  }
  await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, 'f_%03d.jpg'), '-vf', 'tile=6x1:padding=4:color=white', '-frames:v', '1', '-q:v', '4', out], {windowsHide: true}).catch(() => {});
  fs.rmSync(tmp, {recursive: true, force: true});
  return fs.existsSync(out) ? out : null;
};

// ---------------------------------------------------------------- the report
const metaFromInfo = (info, url) => ({
  title: str(info?.title || info?.fulltitle, 200) || null,
  uploader: str(info?.uploader || info?.channel || info?.creator, 120) || null,
  followers: Number.isFinite(info?.channel_follower_count) ? info.channel_follower_count : null,
  views: Number.isFinite(info?.view_count) ? info.view_count : null,
  likes: Number.isFinite(info?.like_count) ? info.like_count : null,
  comments: Number.isFinite(info?.comment_count) ? info.comment_count : null,
  uploadDate: info?.upload_date ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}` : null,
  description: str(info?.description, 1500) || null,
  tags: list(info?.tags).slice(0, 20).map((t) => str(t, 40)),
  platform: platformOf(url || '', info?.extractor_key),
  webpage: info?.webpage_url || url || null,
});

const buildReportPrompt = ({meta, facts, palette, study, listen, voice, hookImg, overviewImg}) => {
  const words = listen.words || [];
  const timed = words.map((w) => `${w.text}@${(w.startMs / 1000).toFixed(1)}`).join(' ');
  const first3 = words.filter((w) => w.startMs < 3000).map((w) => w.text).join(' ');
  const bp = study?.blueprint || {};
  return `You are a short-form content strategist and editor (TikTok, Reels, Shorts) who studies competitors to help a creator make better reels.
Study this video and write a report the creator can act on. The speaker may use Tunisian Arabic, another Arabic dialect, French, English or a mix: understand it in its own language, quote it as said, and write the report in English.
Never invent numbers, results or facts that are not in the data below. Where you infer, say so ("seems", "likely").

ABOUT THE VIDEO (from the page)
${JSON.stringify({...meta, description: meta.description ? meta.description.slice(0, 800) : null}, null, 1)}

THE EDIT, MEASURED FROM EVERY FRAME
${JSON.stringify({durationSec: facts.durationSec, format: facts.format, cutsPerMinute: facts.cutsPerMinute, averageShotSec: facts.averageShotSec, transitionTypes: facts.transitionTypes, graphicsPerMinute: facts.graphicsPerMinute, averageGraphicSec: facts.averageGraphicSec, captions: facts.captions, punchInsPerMinute: facts.punchInsPerMinute, music: facts.audio}, null, 1)}

ITS STYLE, AS STUDIED FRAME BY FRAME (components, animations, motion graphics, transitions)
${JSON.stringify({summary: bp.summary, components: list(bp.components).slice(0, 12).map((c) => ({name: c.name, animation: c.animation, when: c.when})), motionGraphics: bp.motionGraphics, transitions: bp.transitions, effects: bp.effects, captions: bp.captions, animationFeel: bp.animationFeel, layout: bp.layout}, null, 1)}

COLOURS MEASURED FROM THE FRAMES (share of the picture): ${JSON.stringify(palette || [])}

WHAT IS SAID (word@seconds)${listen.language ? `, language detected: ${listen.language}` : ''}
${timed || `(no transcript: ${listen.note || 'none'})`}
First 3 seconds: "${first3}"
Sounds tagged by the transcriber: ${JSON.stringify(listen.events || [])}

HOW THE VOICE SOUNDS (measured from the audio; you cannot hear it, so rely on these numbers)
${voice ? JSON.stringify(voice, null, 1) : '(could not be measured)'}

PICTURES
${hookImg ? `- look at the image file ${hookImg}: 6 frames at 0, 0.4, 0.9, 1.5, 2.2 and 3.0 seconds (the hook)` : ''}
${overviewImg ? `- look at the image file ${overviewImg}: 8 frames spread over the whole video, left to right` : ''}

OUTPUT: only one JSON object, no code fences:
{"summary": "three sentences: what this video is, who it is for, why it likely performs",
 "hook": {"score": 0-10, "type": "question | bold claim | curiosity gap | pattern interrupt | story | result first | relatable pain | list promise | other", "firstWords": "quoted as said", "translation": "English, if not already English", "visual": "what the first second shows and how it moves", "whyItWorks": "...", "techniques": ["..."], "template": "the hook as a fill-in-the-blank line the creator can reuse"},
 "structure": [{"fromSec": n, "toSec": n, "beat": "hook | setup | problem | value | proof | story | twist | payoff | cta", "what": "what happens, briefly"}],
 "theme": {"mood": "...", "colors": [{"hex": "#RRGGBB from the measured colours", "role": "background | text | accent | highlight | skin/footage", "feel": "..."}], "typography": "fonts feel, weights, case, sizes", "grade": "the colour grade and light"},
 "tone": {"delivery": "how the voice is used, from the measurements", "energy": "...", "pace": "...", "emotion": "...", "howToCopy": "concrete advice to deliver this way"},
 "editing": {"rhythm": "...", "transitions": "...", "animations": "...", "motionGraphics": "...", "captions": "...", "sound": "..."},
 "audience": "who it targets",
 "cta": "the call to action, if any, quoted",
 "whyItPerforms": ["..."],
 "steal": ["specific things the creator should take for their own reels, most valuable first"],
 "avoid": ["what not to copy, or weaknesses"],
 "scriptTemplate": "a reusable script skeleton with the same structure, as short lines with [placeholders]",
 "styleSheet": {"captions": "...", "layout": "...", "pacing": "...", "colors": "...", "sound": "...", "motion": "..."}}`;
};

const cleanReport = (o) => ({
  summary: str(o.summary, 800),
  hook: {
    score: clamp(o.hook?.score, 0, 10),
    type: str(o.hook?.type, 40),
    firstWords: str(o.hook?.firstWords, 300).replace(/^["“”«»'‘’]+|["“”«»'‘’]+$/g, ''),
    translation: str(o.hook?.translation, 300),
    visual: str(o.hook?.visual, 400),
    whyItWorks: str(o.hook?.whyItWorks, 600),
    techniques: list(o.hook?.techniques).slice(0, 6).map((x) => str(x, 200)),
    template: str(o.hook?.template, 300),
  },
  structure: list(o.structure)
    .slice(0, 14)
    .map((s) => ({fromSec: clamp(s.fromSec, 0, 3600), toSec: clamp(s.toSec, 0, 3600), beat: str(s.beat, 20), what: str(s.what, 240)})),
  theme: {
    mood: str(o.theme?.mood, 200),
    colors: list(o.theme?.colors)
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c?.hex))
      .slice(0, 6)
      .map((c) => ({hex: c.hex.toUpperCase(), role: str(c.role, 30), feel: str(c.feel, 120)})),
    typography: str(o.theme?.typography, 300),
    grade: str(o.theme?.grade, 300),
  },
  tone: {delivery: str(o.tone?.delivery, 400), energy: str(o.tone?.energy, 200), pace: str(o.tone?.pace, 200), emotion: str(o.tone?.emotion, 200), howToCopy: str(o.tone?.howToCopy, 500)},
  editing: Object.fromEntries(['rhythm', 'transitions', 'animations', 'motionGraphics', 'captions', 'sound'].map((k) => [k, str(o.editing?.[k], 400)])),
  audience: str(o.audience, 300),
  cta: str(o.cta, 300),
  whyItPerforms: list(o.whyItPerforms).slice(0, 8).map((x) => str(x, 300)),
  steal: list(o.steal).slice(0, 10).map((x) => str(x, 300)),
  avoid: list(o.avoid).slice(0, 6).map((x) => str(x, 300)),
  scriptTemplate: str(o.scriptTemplate, 1500),
  styleSheet: Object.fromEntries(['captions', 'layout', 'pacing', 'colors', 'sound', 'motion'].map((k) => [k, str(o.styleSheet?.[k], 400)])),
});

// ---------------------------------------------------------------- storage
export const listAnalyses = (mediaUrl) =>
  fs
    .readdirSync(analysesDir())
    .map((id) => readJson(path.join(analysesDir(), id, 'analysis.json')))
    .filter((a) => a && a.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((a) => ({id: a.id, status: a.status, error: a.error, createdAt: a.createdAt, source: a.source, meta: a.meta, hookScore: a.report?.hook?.score ?? null, thumbUrl: a.thumb && fs.existsSync(a.thumb) ? mediaUrl(a.thumb) : null}));

export const getAnalysis = (id, mediaUrl) => {
  const a = readJson(path.join(dirOf(id), 'analysis.json'));
  if (!a) throw new Error('This analysis was not found.');
  const url = (p) => (p && fs.existsSync(p) ? mediaUrl(p) : null);
  return {...a, videoUrl: url(a.video), thumbUrl: url(a.thumb), hookUrl: url(a.hookImg), overviewUrl: url(a.overviewImg)};
};

export const removeAnalysis = (id) => fs.rmSync(dirOf(id), {recursive: true, force: true});

// ---------------------------------------------------------------- the whole analysis
export const analyzeVideo = async ({url, file, cookies}, runEv) => {
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider === 'off') throw new Error('AI is switched off in Settings. Choose Claude account or an API key there.');
  if (url && !/^https?:\/\/[^\s]+$/i.test(String(url).trim())) throw new Error('Paste a full link that starts with https://');
  if (!url && !(file && fs.existsSync(file))) throw new Error('Paste a link or choose a video file.');
  const id = newId();
  const dir = path.join(analysesDir(), id);
  fs.mkdirSync(dir, {recursive: true});
  const rec = {id, createdAt: Date.now(), status: 'working', source: url ? {url: String(url).trim()} : {file: path.basename(file)}, meta: {platform: url ? platformOf(url) : 'File'}};
  const save = () => writeJson(path.join(dir, 'analysis.json'), rec);
  save();
  const stopped = () => {
    if (runEv?.cancelled) throw new Error('Stopped.');
  };
  try {
    // 1. the video
    runEv?.step('download', 'active');
    let video;
    if (url) {
      video = await download(rec.source.url, dir, cookies, runEv);
      const infoFile = fs.readdirSync(dir).find((f) => f.endsWith('.info.json'));
      const info = infoFile ? readJson(path.join(dir, infoFile)) : null;
      rec.meta = metaFromInfo(info, rec.source.url);
      const thumb = fs.readdirSync(dir).find((f) => /^video\.(jpg|jpeg|png|webp)$/i.test(f));
      rec.thumb = thumb ? path.join(dir, thumb) : null;
      if (infoFile) fs.renameSync(path.join(dir, infoFile), path.join(dir, 'info.json'));
    } else {
      video = path.join(dir, `video${path.extname(file).toLowerCase() || '.mp4'}`);
      fs.copyFileSync(file, video);
      rec.meta = {platform: 'File', title: path.basename(file).replace(/\.[^.]+$/, '')};
    }
    rec.video = video;
    const pr = await probe(video);
    rec.meta.durationSec = Math.round((pr.durationMs || 0) / 100) / 10;
    rec.meta.width = pr.width;
    rec.meta.height = pr.height;
    if (!rec.thumb) {
      const t = path.join(dir, 'thumb.jpg');
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', video, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', t], {windowsHide: true}).catch(() => {});
      rec.thumb = fs.existsSync(t) ? t : null;
    }
    save();
    runEv?.log(`${rec.meta.title ? `"${str(rec.meta.title, 80)}"` : 'The video'}: ${rec.meta.durationSec}s, ${pr.width}x${pr.height}`);
    if (rec.meta.durationSec > 150) runEv?.log('Long video: the edit is studied over its first 2.5 minutes and the voice over its first 3 minutes', 'warn');
    runEv?.step('download', 'done', url ? rec.meta.platform : 'your file');
    stopped();

    // 2. the edit, measured, then studied by Claude (components, animations, motion graphics, transitions)
    const study = await studyReference(video, runEv);
    rec.facts = study.facts;
    rec.blueprint = study.blueprint;
    rec.style = study.style;
    save();
    stopped();

    // 3. colours and pictures
    runEv?.step('colors', 'active');
    const d = await describeRef(video, () => null);
    rec.palette = d.palette;
    rec.overviewImg = d.sheet;
    rec.hookImg = await hookSheet(video, dir);
    runEv?.step('colors', 'done', `${rec.palette.length} colours`);
    save();
    stopped();

    // 4. what is said and how it sounds
    runEv?.step('listen', 'active');
    const listen = await transcribe(video, dir, runEv);
    stopped();
    if (listen.note) runEv?.log(listen.note, 'warn');
    rec.transcript = {language: listen.language || null, text: str(listen.full, 6000) || null, words: (listen.words || []).length, note: listen.note || null};
    rec.voice = voiceFeatures(listen.wav, listen.words || [], listen.events || []);
    fs.rmSync(listen.wav, {force: true});
    if (rec.voice) runEv?.log(`Voice: ${rec.voice.labels.pitch}, ${rec.voice.labels.energy}${rec.voice.wordsPerMinute ? `, ${rec.voice.wordsPerMinute} words per minute` : ''}`);
    runEv?.step('listen', 'done', listen.words?.length ? `${listen.words.length} words${listen.language ? `, ${listen.language}` : ''}` : 'voice only');
    save();
    stopped();

    // 5. the report
    runEv?.step('report', 'active');
    const prompt = buildReportPrompt({meta: rec.meta, facts: rec.facts, palette: rec.palette, study, listen, voice: rec.voice, hookImg: rec.hookImg, overviewImg: rec.overviewImg});
    const images = [rec.hookImg, rec.overviewImg].filter(Boolean);
    const text = provider === 'api' ? await viaApi(prompt, images) : await claudeRun(prompt, cacheDir(), 900000, [cacheDir(), dir], runEv);
    rec.report = cleanReport(extractJson(text));
    if (rec.meta.views && rec.meta.likes !== null && rec.meta.likes !== undefined) rec.meta.engagement = Math.round(((rec.meta.likes + (rec.meta.comments || 0)) / rec.meta.views) * 1000) / 10;
    runEv?.step('report', 'done', `hook ${rec.report.hook.score}/10`);
    rec.status = 'done';
    save();
    return rec;
  } catch (e) {
    rec.status = 'failed';
    rec.error = String(e.message || e).slice(0, 400);
    save();
    if (runEv?.child) killChild(runEv.child);
    throw e;
  }
};
