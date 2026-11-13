// Attaching media: files are copied into the project's folders under the names the engine recognises; originals are never modified.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {cacheDir, newId} from './store.mjs';

const run = promisify(execFile);
const VIDEO = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
const TEXT = new Set(['.srt', '.vtt', '.txt', '.md', '.json']);

export const kindOf = (file) => {
  const e = path.extname(file).toLowerCase();
  return VIDEO.has(e) ? 'video' : AUDIO.has(e) ? 'audio' : IMAGE.has(e) ? 'image' : TEXT.has(e) ? 'text' : 'other';
};

// role -> folder and file-name prefix (the engine reads roles from these names)
const ROLES = {
  footage: {dir: 'footage', prefix: ''},
  clip: {dir: 'footage', prefix: ''},
  broll: {dir: 'input', prefix: 'broll-'},
  voiceover: {dir: 'input', prefix: 'voiceover-'},
  music: {dir: 'input', prefix: 'music-'},
  image: {dir: 'input', prefix: ''},
  logo: {dir: 'input', prefix: 'logo-'},
  screenshot: {dir: 'input', prefix: 'screenshot-'},
  transcript: {dir: 'input', prefix: 'transcript-'},
  reference: {dir: 'references', prefix: ''},
};

export const ensureWorkspace = (dir) => {
  for (const d of ['footage', 'input', 'output', 'references']) fs.mkdirSync(path.join(dir, d), {recursive: true});
};

export const probe = async (file) => {
  try {
    const {stdout} = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
    const j = JSON.parse(stdout);
    const v = j.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
    return {durationMs: Math.round(parseFloat(j.format.duration || 0) * 1000) || undefined, width: v?.width, height: v?.height};
  } catch {
    return {};
  }
};

const uniqueName = (dir, name) => {
  let out = name;
  let i = 1;
  while (fs.existsSync(path.join(dir, out))) out = `${path.basename(name, path.extname(name))}-${i++}${path.extname(name)}`;
  return out;
};

export const attach = async (project, items) => {
  const added = [];
  const room = {images: LIMITS.images - inputCounts(project).images, videos: LIMITS.videos - inputCounts(project).videos};
  for (const it of items) {
    const role = ROLES[it.role] ? it.role : kindOf(it.path) === 'video' ? 'footage' : 'image';
    if (isImageRole(role) && --room.images < 0) throw new Error(`You can attach up to ${LIMITS.images} images to a project. Remove one first.`);
    if (role === 'broll' && --room.videos < 0) throw new Error(`You can attach up to ${LIMITS.videos} extra videos to a project. Remove one first.`);
  }
  for (const it of items) {
    const role = ROLES[it.role] ? it.role : kindOf(it.path) === 'video' ? 'footage' : 'image';
    const def = ROLES[role];
    const dir = path.join(project.dir, def.dir);
    fs.mkdirSync(dir, {recursive: true});
    const base = path.basename(it.path);
    const name = uniqueName(dir, base.toLowerCase().startsWith(def.prefix) ? base : def.prefix + base);
    const dest = path.join(dir, name);
    await fs.promises.copyFile(it.path, dest);
    const kind = kindOf(dest);
    const info = kind === 'video' || kind === 'audio' ? await probe(dest) : {};
    added.push({id: newId(), name, original: base, role, kind, path: dest, size: fs.statSync(dest).size, ...info});
  }
  project.media = [...(project.media || []), ...added];
  return added;
};

export const detach = (project, mediaId) => {
  const m = (project.media || []).find((x) => x.id === mediaId);
  if (m) fs.rmSync(m.path, {force: true});
  project.media = (project.media || []).filter((x) => x.id !== mediaId);
};

export const poster = async (file, mediaUrl) => {
  const kind = kindOf(file);
  if (kind === 'image') return mediaUrl(file);
  if (kind !== 'video') return null;
  const st = fs.statSync(file);
  const key = crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
  const out = path.join(cacheDir(), `poster-${key}.jpg`);
  if (!fs.existsSync(out)) {
    try {
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', out]);
    } catch {
      try {
        await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', out]);
      } catch {
        return null;
      }
    }
  }
  return mediaUrl(out);
};

// ---------------------------------------------------------------- limits and previews for the inputs
export const LIMITS = {images: 10, videos: 5};
export const isImageRole = (r) => r === 'image' || r === 'logo' || r === 'screenshot';
export const inputCounts = (project) => ({
  images: (project.media || []).filter((m) => isImageRole(m.role)).length,
  videos: (project.media || []).filter((m) => m.role === 'broll').length,
});

// small pictures of every input (a frame sheet for videos) so Claude can look at them when it plans
export const inputThumbs = async (project) => {
  const out = [];
  for (const m of project.media || []) {
    const wanted = isImageRole(m.role) || m.role === 'broll';
    if (!wanted || !fs.existsSync(m.path)) continue;
    let thumb = null;
    if (m.kind === 'image' && !m.path.toLowerCase().endsWith('.svg')) {
      const st = fs.statSync(m.path);
      const key = crypto.createHash('sha1').update(`${m.path}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 14);
      thumb = path.join(cacheDir(), `in-${key}.jpg`);
      if (!fs.existsSync(thumb)) {
        try {
          await run('ffmpeg', ['-v', 'error', '-y', '-i', m.path, '-frames:v', '1', '-vf', "scale='min(800,iw)':-2", '-q:v', '4', thumb], {windowsHide: true});
        } catch {
          thumb = null;
        }
      }
    } else if (m.kind === 'video') {
      const st = fs.statSync(m.path);
      const key = crypto.createHash('sha1').update(`${m.path}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 14);
      thumb = path.join(cacheDir(), `in-${key}.jpg`);
      if (!fs.existsSync(thumb)) {
        try {
          const dur = Math.max(1, (m.durationMs || 8000) / 1000);
          await run('ffmpeg', ['-v', 'error', '-y', '-i', m.path, '-vf', `fps=8/${dur.toFixed(3)},scale=220:-2,tile=4x2`, '-frames:v', '1', '-q:v', '5', thumb], {windowsHide: true});
        } catch {
          thumb = null;
        }
      }
    }
    out.push({name: m.name, role: m.role, kind: m.kind, durationMs: m.durationMs, thumb});
  }
  return out;
};
