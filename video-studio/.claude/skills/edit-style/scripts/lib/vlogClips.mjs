// Vlog intake: turns every footage clip into a light working copy (constant frame rate, sensible size, frequent keyframes)
// and a contact sheet of evenly spaced frames, so the editor (Claude) can look at what each clip contains and match it to the narration.
// Originals are never touched.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const slug = (s) => path.basename(s, path.extname(s)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'clip';

export const prepareClips = ({files, pub, jobDir, fps = 30, maxLong = 1920, portraitW = 1080, sheetCols = 6}) => {
  fs.mkdirSync(path.join(pub, 'clips'), {recursive: true});
  fs.mkdirSync(path.join(jobDir, 'contact'), {recursive: true});
  const used = new Set();
  const clips = {};
  for (const file of files) {
    let id = slug(file);
    while (used.has(id)) id += '-x';
    used.add(id);
    const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());
    const v = pr.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
    if (!v) continue;
    const rot = Math.abs(parseInt((v.side_data_list || []).find((x) => x.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0, 10)) % 180 === 90;
    const w = rot ? v.height : v.width;
    const h = rot ? v.width : v.height;
    const durationMs = Math.round(parseFloat(pr.format.duration || v.duration) * 1000);
    const hasAudio = pr.streams.some((s) => s.codec_type === 'audio');
    const portrait = h >= w;
    const scale = portrait ? `scale='min(${portraitW},iw)':-2` : `scale=-2:'min(${Math.round(maxLong * 0.5625)},ih)'`;
    const out = path.join(pub, 'clips', `${id}.mp4`);
    if (!fs.existsSync(out)) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=${fps},${scale},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-g', '15', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', out], {stdio: 'inherit'});
    }
    // contact sheet: evenly spaced frames, times recorded so the plan can point at a moment
    const n = Math.min(24, Math.max(6, Math.ceil(durationMs / 5000)));
    const times = Array.from({length: n}, (_, k) => Math.round(((k + 0.5) * durationMs) / n));
    const sheet = path.join(jobDir, 'contact', `${id}.png`);
    if (!fs.existsSync(sheet)) {
      const rows = Math.ceil(n / sheetCols);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', out, '-vf', `fps=${n}/${(durationMs / 1000).toFixed(3)},scale=${portrait ? 180 : 320}:-2,tile=${sheetCols}x${rows}`, '-frames:v', '1', sheet], {stdio: 'inherit'});
    }
    const ob = fs.statSync(file);
    clips[id] = {id, name: path.basename(file), file: `clips/${id}.mp4`, durationMs, width: w, height: h, portrait, hasAudio, sheet, sampleTimesMs: times, sheetCols, modified: ob.mtimeMs};
  }
  return clips;
};
