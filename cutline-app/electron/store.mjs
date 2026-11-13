// Small JSON stores in the app's data folder: settings (secrets encrypted with the OS keychain), projects, reference library.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {app, safeStorage} from 'electron';

const base = () => app.getPath('userData');
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
};

// ---------------------------------------------------------------- settings
// projects made while the app was still called Cutline stay where they are
const defaultWorkspace = () => {
  const docs = app.getPath('documents');
  const fresh = path.join(docs, 'OmniMotion Studio');
  const old = path.join(docs, 'Cutline');
  const has = (d) => fs.existsSync(d) && fs.readdirSync(d).length > 0;
  return has(old) && !has(fresh) ? old : fresh;
};
const settingsFile = () => path.join(base(), 'settings.json');
const defaults = () => ({enginePath: '', workspaceRoot: defaultWorkspace(), theme: 'system', transcription: 'elevenlabs', aiProvider: 'claude-code', aiModel: '', secrets: {}, defaults: {style: 'tech', mode: 'talking'}});
export const getSettings = () => ({...defaults(), ...readJson(settingsFile(), {})});
export const publicSettings = () => {
  const s = getSettings();
  return {...s, secrets: undefined, hasKeys: {elevenlabs: !!s.secrets.elevenlabs, anthropic: !!s.secrets.anthropic}, canEncrypt: safeStorage.isEncryptionAvailable()};
};
export const saveSettings = (patch) => {
  const s = getSettings();
  const next = {...s, ...patch, defaults: {...s.defaults, ...(patch.defaults || {})}, secrets: s.secrets};
  writeJson(settingsFile(), next);
  return publicSettings();
};
export const setSecret = (name, value) => {
  const s = getSettings();
  if (!value) delete s.secrets[name];
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system, so the key was not saved.');
    s.secrets[name] = safeStorage.encryptString(value).toString('base64');
  }
  writeJson(settingsFile(), s);
  return publicSettings();
};
export const getSecret = (name) => {
  const v = getSettings().secrets[name];
  if (!v) return null;
  try {
    return safeStorage.decryptString(Buffer.from(v, 'base64'));
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- projects
const projDir = (id) => path.join(base(), 'projects', id);
export const listProjects = () => {
  const dir = path.join(base(), 'projects');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((id) => readJson(path.join(dir, id, 'project.json'), null)).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
};
export const getProject = (id) => readJson(path.join(projDir(id), 'project.json'), null);
export const saveProject = (p) => {
  p.updatedAt = Date.now();
  writeJson(path.join(projDir(p.id), 'project.json'), p);
  return p;
};
export const newId = () => crypto.randomBytes(4).toString('hex');
export const removeProject = (id) => fs.rmSync(projDir(id), {recursive: true, force: true});

// ---------------------------------------------------------------- reference library
const libFile = () => path.join(base(), 'library', 'index.json');
export const listLibrary = () => readJson(libFile(), []);
export const saveLibrary = (items) => writeJson(libFile(), items);
export const libraryDir = () => path.join(base(), 'library');
export const cacheDir = () => {
  const d = path.join(base(), 'cache');
  fs.mkdirSync(d, {recursive: true});
  return d;
};
