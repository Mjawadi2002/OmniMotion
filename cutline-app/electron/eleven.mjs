// ElevenLabs for Motion graphics videos: the voices on the user's account, what is left on their subscription, and a voice-over with
// the time of every word (text-to-speech with timestamps), so captions and graphics land on the words exactly.
// The key is the one saved in Settings (OS secure storage) or, in development, ELEVENLABS_API_KEY in the engine's .env.
import fs from 'node:fs';
import path from 'node:path';
import {getSecret, getSettings} from './store.mjs';
import {enginePaths} from './paths.mjs';

const API = 'https://api.elevenlabs.io';

export const elevenKey = () => {
  const k = getSecret('elevenlabs');
  if (k) return k;
  try {
    const env = fs.readFileSync(path.join(enginePaths(getSettings().enginePath).root, '.env'), 'utf8');
    const m = /^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m.exec(env);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
};

const call = async (p, init = {}) => {
  const key = elevenKey();
  if (!key) throw new Error('No ElevenLabs key. Add it in Settings (Transcription, ElevenLabs API key).');
  const res = await fetch(`${API}${p}`, {...init, headers: {'xi-api-key': key, ...(init.headers || {})}});
  if (!res.ok) {
    let msg = `ElevenLabs error ${res.status}`;
    try {
      const b = await res.json();
      const d = b && b.detail;
      msg = (d && (d.message || d.status)) || (typeof d === 'string' ? d : msg);
    } catch {
      // keep the status
    }
    if (res.status === 401) msg = 'ElevenLabs refused the key. Check it in Settings, and that it allows Voices and Text to Speech.';
    throw new Error(msg);
  }
  return res;
};

// the voices on the account (premade, cloned, library voices the user added)
export const listVoices = async () => {
  const r = await (await call('/v1/voices')).json();
  return (r.voices || [])
    .map((v) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category || '',
      gender: (v.labels && v.labels.gender) || '',
      age: (v.labels && v.labels.age) || '',
      accent: (v.labels && v.labels.accent) || '',
      description: (v.labels && (v.labels.description || v.labels.descriptive)) || v.description || '',
      useCase: (v.labels && (v.labels.use_case || v.labels.use_case)) || '',
      previewUrl: v.preview_url || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// characters used and left this period, and the plan
export const subscription = async () => {
  try {
    const s = await (await call('/v1/user/subscription')).json();
    return {tier: s.tier || '', used: s.character_count ?? null, limit: s.character_limit ?? null, resetsAt: s.next_character_count_reset_unix ? s.next_character_count_reset_unix * 1000 : null};
  } catch (e) {
    // a key without the user_read permission still makes voice-overs
    return {tier: '', used: null, limit: null, resetsAt: null, error: e.message};
  }
};

export const MODELS = [
  {id: 'eleven_multilingual_v2', label: 'Multilingual v2 (best quality, 29 languages)'},
  {id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 (faster, half the credits)'},
];

// the voice-over and its word times. Characters with times come back; words are rebuilt from them.
export const synthesize = async ({voiceId, text, modelId, stability = 0.5, similarity = 0.75, style = 0.15, speed = 1}, outDir) => {
  if (!voiceId) throw new Error('Choose a voice first.');
  const clean = String(text || '').trim();
  if (!clean) throw new Error('The script is empty.');
  const body = {
    text: clean,
    model_id: modelId || 'eleven_multilingual_v2',
    voice_settings: {stability, similarity_boost: similarity, style, use_speaker_boost: true, speed},
  };
  const r = await (await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)})).json();
  if (!r.audio_base64) throw new Error('ElevenLabs returned no audio.');
  fs.mkdirSync(outDir, {recursive: true});
  const audio = path.join(outDir, 'voiceover.mp3');
  fs.writeFileSync(audio, Buffer.from(r.audio_base64, 'base64'));
  const al = r.alignment || r.normalized_alignment;
  const words = [];
  if (al && Array.isArray(al.characters)) {
    let cur = null;
    al.characters.forEach((ch, i) => {
      const s = Math.round(al.character_start_times_seconds[i] * 1000);
      const e = Math.round(al.character_end_times_seconds[i] * 1000);
      if (/\s/.test(ch)) {
        if (cur) words.push(cur);
        cur = null;
      } else if (!cur) cur = {text: ch, startMs: s, endMs: e};
      else {
        cur.text += ch;
        cur.endMs = e;
      }
    });
    if (cur) words.push(cur);
  }
  fs.writeFileSync(path.join(outDir, 'voiceover.words.json'), JSON.stringify(words, null, 1));
  return {audio, words, chars: clean.length};
};
