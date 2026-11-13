// Where things live: the app's data, the engine (the edit-style skill inside video-studio) and each project's job folder.
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {app} from 'electron';

export const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const isEngine = (r) => !!r && fs.existsSync(path.join(r, '.claude', 'skills', 'edit-style', 'scripts', 'director.mjs'));

// the engine that ships inside the installed app
export const bundledEngine = () => (app.isPackaged ? path.join(process.resourcesPath, 'engine') : '');

// every place the engine may be, best first: the one inside the installed app, the folder chosen in Settings, the folder next to the app (development)
export const engineCandidates = (enginePath) => [bundledEngine(), enginePath, path.join(appDir, '..', 'video-studio')].filter(Boolean).map((x) => path.resolve(x));

export const enginePaths = (enginePath) => {
  const root = engineCandidates(enginePath).find(isEngine) || path.resolve(enginePath || path.join(appDir, '..', 'video-studio'));
  const skill = path.join(root, '.claude', 'skills', 'edit-style');
  const bundled = !!bundledEngine() && root === path.resolve(bundledEngine());
  // the installed engine is read-only program files: each project's working files live in the app's data folder instead
  const jobsBase = bundled ? path.join(app.getPath('userData'), 'jobs') : path.join(root, '.edit-jobs');
  return {
    root,
    skill,
    bundled,
    jobsBase,
    director: path.join(skill, 'scripts', 'director.mjs'),
    docs: path.join(skill, 'docs'),
    config: path.join(skill, 'style.config.json'),
    jobDir: (name) => path.join(jobsBase, `dir-${name}`),
    ok: isEngine(root),
  };
};

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'project';
