// Transcription with Whisper.cpp through Remotion's official tooling. Produces word-level timestamps.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

export const extractAudio = (input, wavOut) => {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vn', '-ar', '16000', '-ac', '1', wavOut], {stdio: 'inherit'});
};

const pickModel = (whisperPath, cfg) => {
  const order = [cfg.transcription.model, ...cfg.transcription.fallbackModels];
  for (const m of order) if (fs.existsSync(path.join(whisperPath, `ggml-${m}.bin`))) return m;
  throw new Error(
    `No Whisper model found in ${whisperPath} (looked for: ${order.join(', ')}). ` +
      `Download one with downloadWhisperModel({model:'${cfg.transcription.model}', folder:'${whisperPath}'}) ` +
      `(small is ~466 MB) or pass --transcript <file> to skip transcription.`,
  );
};

// Whisper returns one item per word when --split-on-word is on. Items holding several words are split evenly.
const itemsToWords = (items) => {
  const words = [];
  for (const it of items) {
    const text = (it.text || '').trim();
    if (!text || /^\[.*\]$/.test(text)) continue;
    const a = it.offsets.from;
    const b = Math.max(it.offsets.to, a + 60);
    const parts = text.split(/\s+/);
    parts.forEach((p, i) => {
      const s = a + ((b - a) * i) / parts.length;
      const e = a + ((b - a) * (i + 1)) / parts.length;
      words.push({text: p, startMs: Math.round(s), endMs: Math.round(e)});
    });
  }
  return words;
};

export const transcribeToWords = async ({projectRoot, wavPath, cfg, lang}) => {
  const req = createRequire(path.join(projectRoot, 'package.json'));
  const {transcribe} = req('@remotion/install-whisper-cpp');
  const whisperPath = path.join(projectRoot, cfg.transcription.folder);
  const model = pickModel(whisperPath, cfg);
  const language = lang && lang !== 'auto' ? lang : cfg.transcription.defaultLanguage;
  const out = await transcribe({
    model,
    whisperPath,
    whisperCppVersion: cfg.transcription.version,
    inputPath: wavPath,
    tokenLevelTimestamps: cfg.transcription.tokenLevelTimestamps,
    language,
    additionalArgs: ['--split-on-word'],
    printOutput: false,
  });
  return {words: itemsToWords(out.transcription), raw: out, model, language: out.result?.language || language};
};

// ---------- ElevenLabs Speech-to-Text (Scribe). The key is read from the environment or <project>/.env, never from the tokens file. ----------
export const readApiKey = (projectRoot, envName) => {
  if (process.env[envName]) return process.env[envName].trim();
  const envFile = path.join(projectRoot, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${envName}\\s*=\\s*(.+?)\\s*$`));
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return null;
};

export const transcribeElevenLabs = async ({projectRoot, wavPath, cfg, lang, outDir}) => {
  const p = cfg.transcription.providers.elevenlabs;
  const key = readApiKey(projectRoot, p.apiKeyEnv);
  if (!key) throw new Error(`No ElevenLabs key. Set ${p.apiKeyEnv} in the environment or in ${path.join(projectRoot, '.env')} (the file is git-ignored).`);
  const form = new FormData();
  form.append('model_id', p.modelId);
  form.append('file', new Blob([fs.readFileSync(wavPath)], {type: 'audio/wav'}), path.basename(wavPath));
  form.append('timestamps_granularity', p.timestampsGranularity);
  form.append('diarize', String(p.diarize));
  form.append('tag_audio_events', String(p.tagAudioEvents));
  if (lang && lang !== 'auto') form.append('language_code', lang);
  const res = await fetch(p.endpoint, {method: 'POST', headers: {'xi-api-key': key}, body: form});
  const bodyText = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs STT failed (${res.status}): ${bodyText.slice(0, 400)}`);
  const json = JSON.parse(bodyText);
  if (outDir) {
    fs.writeFileSync(path.join(outDir, 'transcript.elevenlabs.json'), JSON.stringify(json, null, 1));
    fs.writeFileSync(path.join(outDir, 'transcript.txt'), json.text || '');
  }
  const words = (json.words || [])
    .filter((w) => w.type === 'word' && w.text && w.start != null && w.end != null)
    .map((w) => ({text: w.text.trim(), startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000), conf: typeof w.logprob === 'number' ? +Math.exp(w.logprob).toFixed(3) : undefined}));
  if (!words.length) throw new Error('ElevenLabs returned no words.');
  return {words, language: json.language_code, full: json.text};
};

// Accepts: our own words JSON ([{text,startMs,endMs}]), a whisper.cpp JSON ({transcription:[...]}), or an .srt file.
export const loadTranscriptFile = (file) => {
  const txt = fs.readFileSync(file, 'utf8');
  if (file.toLowerCase().endsWith('.srt')) {
    const words = [];
    const blocks = txt.replace(/\r/g, '').split(/\n\n+/);
    const toMs = (s) => {
      const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
      return ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4];
    };
    for (const b of blocks) {
      const lines = b.split('\n');
      const ti = lines.findIndex((l) => l.includes('-->'));
      if (ti < 0) continue;
      const [a, c] = lines[ti].split('-->').map((s) => toMs(s.trim()));
      const parts = lines.slice(ti + 1).join(' ').split(/\s+/).filter(Boolean);
      parts.forEach((p, i) => words.push({text: p, startMs: Math.round(a + ((c - a) * i) / parts.length), endMs: Math.round(a + ((c - a) * (i + 1)) / parts.length)}));
    }
    return {words};
  }
  const j = JSON.parse(txt);
  if (Array.isArray(j)) return {words: j};
  if (j.words && j.words.some((w) => w.type)) {
    return {words: j.words.filter((w) => w.type === 'word' && w.start != null).map((w) => ({text: w.text.trim(), startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000)}))};
  }
  if (j.words) return {words: j.words};
  if (j.transcription) return {words: itemsToWords(j.transcription)};
  throw new Error(`Unrecognised transcript format: ${file}`);
};

// Script-only input (no audio): synthetic timing from tokens.transcription.scriptMode.
export const wordsFromScript = (text, cfg) => {
  const sm = cfg.transcription.scriptMode;
  const per = 1000 / sm.wordsPerSecond;
  const words = [];
  let t = 400;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    words.push({text: w, startMs: Math.round(t), endMs: Math.round(t + per * 0.9)});
    t += per;
    if (/[.!?؟…]$/.test(w)) t += sm.pauseAfterSentenceMs;
  }
  return words;
};

// Rule-based punctuation clean-up driven by transcription.punctuation in the tokens (never changes letters).
export const normalizePunctuation = (words, cfg) => {
  const P = cfg.transcription.punctuation;
  const latin = new RegExp(cfg.fonts.scripts.latin);
  const arabic = new RegExp(cfg.fonts.scripts.arabic);
  return words.map((w) => {
    let t = w.text;
    for (const [from, to] of Object.entries(P.map)) t = t.split(from).join(to);
    const letters = Object.keys(P.arabicAfterLatin).reduce((x, m) => x.split(m).join(''), t);
    if (latin.test(letters) && !arabic.test(letters)) for (const [from, to] of Object.entries(P.arabicAfterLatin)) t = t.split(from).join(to);
    return t === w.text ? w : {...w, text: t};
  });
};
