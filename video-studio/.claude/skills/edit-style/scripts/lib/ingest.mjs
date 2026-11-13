// Scans the footage and input folders and classifies every file. The director (Claude) reads this to decide how each input is used.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const VIDEO = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
const TEXT = new Set(['.srt', '.vtt', '.txt', '.md', '.json']);

const probe = (file) => {
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());
    const v = j.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
    const a = j.streams.find((s) => s.codec_type === 'audio');
    return {durationMs: Math.round(parseFloat(j.format.duration || 0) * 1000), width: v?.width, height: v?.height, fps: v ? eval(v.r_frame_rate) : null, hasVideo: !!v, hasAudio: !!a};
  } catch {
    return {};
  }
};

export const ingest = ({footageDir, inputDir}) => {
  const out = {footage: [], inputs: {videos: [], audio: [], images: [], transcripts: [], other: []}};
  const list = (dir) => (dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile()) : []);
  for (const f of list(footageDir)) {
    const e = path.extname(f).toLowerCase();
    if (VIDEO.has(e) || AUDIO.has(e)) out.footage.push({file: f, name: path.basename(f), kind: VIDEO.has(e) ? 'video' : 'audio', ...probe(f)});
    else if (TEXT.has(e)) out.inputs.transcripts.push({file: f, name: path.basename(f), forFootage: true});
  }
  for (const f of list(inputDir)) {
    const e = path.extname(f).toLowerCase();
    const name = path.basename(f);
    const base = {file: f, name};
    if (VIDEO.has(e)) out.inputs.videos.push({...base, ...probe(f), role: /b-?roll|clip|screen|record|demo/i.test(name) ? 'broll' : 'source-or-broll'});
    else if (AUDIO.has(e)) {
      const p = probe(f);
      out.inputs.audio.push({...base, ...p, role: /music|bgm|track|song|beat|ambient|lofi|bed/i.test(name) ? 'music' : /voice|vo\b|narrat|record|speech|dub/i.test(name) ? 'voiceover' : p.durationMs > 0 && p.durationMs < 20000 ? 'sfx-or-music' : 'voiceover-or-music'});
    } else if (IMAGE.has(e)) out.inputs.images.push({...base, role: /logo|icon|brand|mark/i.test(name) ? 'logo' : /screen|shot|ui|app|page|site/i.test(name) ? 'screenshot' : 'image'});
    else if (TEXT.has(e)) out.inputs.transcripts.push({...base, forFootage: false});
    else out.other.push(base);
  }
  return out;
};
