// What Claude remembers between jobs, so it does not ask again or redo what was decided: a note the user writes once (Settings),
// and a short log per project (the changes asked for in plain words and what was done, undos, spelling fixes, builds). Everything is
// recorded by the app itself (no extra AI call) and given to Claude at the start of each new conversation; a resumed conversation already has it.
import fs from 'node:fs';
import path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {app} from 'electron';
import {getSettings} from './store.mjs';

const MAX_ENTRIES = 40;
const MAX_CHARS = 3500;

const dir = () => {
  const d = path.join(app.getPath('userData'), 'memory');
  fs.mkdirSync(d, {recursive: true});
  return d;
};
const fileOf = (id) => (/^[a-zA-Z0-9_-]{1,40}$/.test(String(id)) ? path.join(dir(), `${id}.json`) : null);

export const readMemory = (id) => {
  const f = fileOf(id);
  if (!f) return [];
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
};

// kind: 'edit' | 'undo' | 'spelling' | 'build' | 'note'; text in plain words, short
export const remember = (id, kind, text) => {
  const f = fileOf(id);
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!f || !t) return;
  const items = readMemory(id);
  if (items.length && items[items.length - 1].text === t) return;
  items.push({at: Date.now(), kind, text: t});
  fs.writeFileSync(f, JSON.stringify(items.slice(-MAX_ENTRIES), null, 1));
};

export const forget = (id) => {
  const f = fileOf(id);
  if (f) fs.rmSync(f, {force: true});
};

export const memoryCounts = () =>
  Object.fromEntries(
    fs
      .readdirSync(dir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.replace(/\.json$/, ''), readMemory(f.replace(/\.json$/, '')).length]),
  );

// the block given to Claude: the user's own note first, then the project's log (newest kept when it is long)
export const memoryBlock = (projectId) => {
  const note = String(getSettings().memoryNote || '').trim().slice(0, 1500);
  const items = projectId ? readMemory(projectId) : [];
  if (!note && !items.length) return '';
  const lines = [];
  let used = 0;
  for (const it of [...items].reverse()) {
    const l = `- ${new Date(it.at).toISOString().slice(0, 10)} ${it.kind}: ${it.text}`;
    if (used + l.length > MAX_CHARS) break;
    lines.unshift(l);
    used += l.length;
  }
  return [
    'MEMORY (kept by OmniMotion from earlier work; follow it, do not ask again about what it settles, and do not redo work it says is done):',
    note ? `About the user (always): ${note}` : '',
    lines.length ? `This project so far:\n${lines.join('\n')}` : '',
    'END OF MEMORY',
  ]
    .filter(Boolean)
    .join('\n');
};

// which project a job belongs to, so every Claude conversation the job starts can be given its memory without changing each module
const ctx = new AsyncLocalStorage();
export const withProject = (projectId, fn) => ctx.run({projectId}, fn);
export const currentProject = () => ctx.getStore()?.projectId || null;
