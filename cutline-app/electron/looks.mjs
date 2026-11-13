// Looks: a look is colours + fonts + grade on top of one of the engine's two families (tech = dark stage, light = paper stage).
// Two are built in; any number of custom looks live in the app's data folder and are handed to the engine with --look.
import fs from 'node:fs';
import path from 'node:path';
import {app} from 'electron';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {enginePaths, slug} from './paths.mjs';
import {cacheDir, getSettings, listProjects} from './store.mjs';

const dir = () => {
  const d = path.join(app.getPath('userData'), 'looks');
  fs.mkdirSync(d, {recursive: true});
  return d;
};
export const lookFile = (id) => path.join(dir(), `${id}.json`);

const engineConfig = () => {
  const e = enginePaths(getSettings().enginePath);
  if (!e.ok) throw new Error(`The editing engine was not found (looked in ${e.root}). Open Settings and choose your video-studio folder.`);
  return JSON.parse(fs.readFileSync(e.config, 'utf8'));
};

// the roles a look may set, grouped for the editor
export const ROLE_GROUPS = {
  tech: [
    {title: 'Stage', roles: [['background', 'Background'], ['backgroundAlt', 'Glow and panels']]},
    {title: 'Text', roles: [['text', 'Text'], ['textMuted', 'Quiet text']]},
    {title: 'Colour of action', roles: [['primary', 'Progress bar and grid'], ['accent', 'Emphasis and numbers'], ['textOnAccent', 'Text on emphasis']]},
    {title: 'Windows', roles: [['card', 'Window card'], ['cardInk', 'Text in windows']]},
    {title: 'Signals', roles: [['positive', 'Good'], ['red', 'Strike and warning']]},
  ],
  light: [
    {title: 'Stage', roles: [['paper', 'Paper'], ['paperInk', 'Text on paper'], ['paperMuted', 'Quiet text on paper']]},
    {title: 'Colour of action', roles: [['accent', 'Highlight boxes and emphasis'], ['accentDeep', 'Deeper accent'], ['textOnAccent', 'Text on highlights'], ['primary', 'Outlines and glow']]},
    {title: 'Windows', roles: [['card', 'Window card'], ['cardInk', 'Text in windows'], ['background', 'Dark demo stage'], ['text', 'Text on dark']]},
    {title: 'Signals', roles: [['positive', 'Good'], ['red', 'Strike and warning']]},
  ],
};

export const lookMeta = () => {
  const cfg = engineConfig();
  const base = (name) => Object.fromEntries(Object.entries(cfg.palettes[name].roles).filter(([, v]) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)));
  return {
    catalog: cfg.fonts.catalog || Object.keys(cfg.fonts.registry).map((family) => ({family, kind: 'sans', weights: ''})),
    base: {tech: base('tech'), light: base('personal')},
    baseFonts: cfg.presets.ref.fonts,
    baseGrade: {tech: cfg.director.grade.tech, light: cfg.director.grade.personal},
    groups: ROLE_GROUPS,
  };
};

const BUILTIN = (cfg) => [
  {id: 'tech', label: 'Tech', family: 'tech', builtin: true, summary: 'Dark navy stage, you full screen, slams, counters and glass panels.', roles: pick(cfg.palettes.tech.roles), fonts: {}, grade: cfg.director.grade.tech},
  {id: 'light', label: 'Light', family: 'light', builtin: true, summary: 'Paper stage, you in a card, a topic title on every sentence.', roles: pick(cfg.palettes.personal.roles), fonts: {}, grade: cfg.director.grade.personal},
];
const pick = (roles) => Object.fromEntries(Object.entries(roles).filter(([, v]) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)));

export const listLooks = () => {
  let builtin = [];
  try {
    builtin = BUILTIN(engineConfig());
  } catch {
    builtin = [];
  }
  const custom = fs
    .readdirSync(dir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return {...JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8')), builtin: false};
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return [...builtin, ...custom];
};

// a look's own sound character (see the engine's sfx.config.json): which kit and how many effects
export const cleanSfx = (s) => {
  if (!s || typeof s !== 'object') return undefined;
  const kit = ['tech', 'soft', 'punchy', 'minimal'].includes(s.kit) ? s.kit : undefined;
  const density = ['minimal', 'normal', 'rich'].includes(s.density) ? s.density : undefined;
  const gainDb = Number.isFinite(+s.gainDb) ? Math.max(-6, Math.min(3, +s.gainDb)) : undefined;
  return kit || density || gainDb ? {kit, density, gainDb} : undefined;
};

export const saveLook = (look) => {
  const id = look.id && !['tech', 'light'].includes(look.id) ? look.id : `${slug(look.label || 'look')}-${Math.random().toString(36).slice(2, 6)}`;
  const out = {id, label: String(look.label || 'My look').slice(0, 60), family: look.family === 'light' ? 'light' : 'tech', roles: look.roles || {}, fonts: look.fonts || {}, grade: look.grade, sfx: cleanSfx(look.sfx), blueprint: look.blueprint && typeof look.blueprint === 'object' ? look.blueprint : undefined, style: look.style && typeof look.style === 'object' ? look.style : undefined, facts: look.facts && typeof look.facts === 'object' ? look.facts : undefined, notes: look.notes || '', summary: look.summary || '', updatedAt: Date.now()};
  fs.writeFileSync(lookFile(id), JSON.stringify(out, null, 2));
  return {...out, builtin: false};
};
export const removeLook = (id) => fs.rmSync(lookFile(id), {force: true});
// A short clip for the look previews: the latest project's own footage when there is one, else a stand-in picture.
export const ensureSample = async () => {
  const run = promisify(execFile);
  const d = path.join(cacheDir(), 'look-sample');
  fs.mkdirSync(d, {recursive: true});
  const out = path.join(d, 'look-sample.mp4');
  const marker = path.join(d, 'source.txt');
  let src = null;
  const settings = getSettings();
  for (const p of listProjects()) {
    const f = path.join(enginePaths(settings.enginePath).jobDir(p.id), 'public', 'input.mp4');
    if (fs.existsSync(f)) {
      src = f;
      break;
    }
  }
  const stamp = src ? `${src}|${fs.statSync(src).mtimeMs}` : 'standin';
  if (fs.existsSync(out) && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === stamp) {
    if (!fs.existsSync(path.join(d, 'face.json'))) await sampleFace(out, d);
    return d;
  }
  if (src) {
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', '3', '-t', '6', '-i', src, '-an', '-vf', 'scale=576:1024:force_original_aspect_ratio=increase,crop=576:1024,fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '15', out], {windowsHide: true});
  } else {
    const head = 'lt(hypot((X-288)/92,(Y-380)/118),1)';
    const body = 'lt(hypot((X-288)/255,(Y-930)/340),1)';
    const shape = `max(${head},${body})`;
    const f = (a, b) => `${a}*(1-${shape})+${b}*${shape}`;
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=576x1024:r=30:d=6', '-vf', `format=rgb24,geq=r='${f('70+40*Y/1024', '196')}':g='${f('62+34*Y/1024', '152')}':b='${f('58+30*Y/1024', '126')}',format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '15', out], {windowsHide: true});
  }
  fs.writeFileSync(marker, stamp);
  await sampleFace(out, d);
  return d;
};

// where the face is in the sample (face.json next to it, read by the look previews) so the head card frames it like the real edit
const sampleFace = async (file, d) => {
  try {
    const lib = path.join(enginePaths(getSettings().enginePath).skill, 'scripts', 'lib', 'faceFrame.mjs');
    if (!fs.existsSync(lib)) return;
    const {findFace} = await import(pathToFileURL(lib).href);
    findFace(file, d);
  } catch {
    // previews keep the fixed framing
  }
};

export const lookPathFor =(id) => (id && !['tech', 'light'].includes(id) && fs.existsSync(lookFile(id)) ? lookFile(id) : null);
