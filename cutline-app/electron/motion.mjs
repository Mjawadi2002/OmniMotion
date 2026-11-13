// Motion graphics videos, before the build: Claude restates the idea (so the user sees it was understood) and writes a script sized
// to the chosen length; ElevenLabs reads it with the chosen voice and returns the time of every word.
import fs from 'node:fs';
import path from 'node:path';
import {cacheDir, getSettings, saveProject} from './store.mjs';
import {claudeRun, extractJson, viaApi} from './ai.mjs';
import {synthesize} from './eleven.mjs';

// spoken words per second, by language (narration pace, not a race)
const WPS = {en: 2.7, fr: 2.6, ar: 2.2, es: 2.8, de: 2.4, it: 2.7, pt: 2.6, tr: 2.3}; // measured on ElevenLabs voices at speed 1

export const SCRIPT_STEPS = [
  {id: 'read', label: 'Understanding your idea'},
  {id: 'write', label: 'Claude writes the script'},
  {id: 'check', label: 'Checking the length'},
];

const scriptPrompt = (m, fix) => {
  const lang = m.language && m.language !== 'auto' ? m.language : 'the same language as the idea';
  const wps = WPS[m.language] || 2.6;
  const target = Math.round((m.lengthS || 30) * wps * 0.96);
  return `You write narration scripts for short motion graphics videos (an animated explainer, no camera, a voice-over with captions).

THE USER'S IDEA
${m.idea || ''}

STYLE DIRECTION (optional): ${m.style || 'none'}
FORMAT: ${m.aspect === '16:9' ? 'horizontal 16:9 (YouTube, presentations)' : 'vertical 9:16 (Reels, TikTok, Shorts)'}
LENGTH: ${m.lengthS || 30} seconds of narration, so about ${target} spoken words (${wps} words a second). Stay within 10% of that.
LANGUAGE: ${lang}.
${m.notes ? `THE USER'S NOTES ON THE PREVIOUS SCRIPT (follow them): ${m.notes}\n` : ''}${fix ? `YOUR PREVIOUS SCRIPT HAD ${fix.words} WORDS; IT MUST HAVE ABOUT ${target}. Rewrite it to that length.\n` : ''}
RULES
- First, restate in one or two plain sentences what the video must make the viewer understand (the "understanding"). If the idea is vague, choose the most useful reading and say so in it.
- A strong hook in the first line (a question, a surprising claim made in the idea, or the problem). Then the explanation in a clear order, then a short payoff or call to action.
- Only facts that are in the idea or are common knowledge stated carefully. No invented statistics, prices, dates, quotes, brands or names. If a number would help but the idea gives none, describe instead of inventing.
- Short spoken sentences (6 to 16 words), one idea each, written to be said aloud: no lists with bullets, no emojis, no hashtags, no stage directions, no markdown.
- Each line gets a "purpose" (hook, problem, idea, step 1, example, payoff, call to action...) and a "visual": one sentence describing what the motion graphic could show for that line (a picture idea, not text to copy).

Answer with JSON only:
{"understanding": "...", "title": "short working title", "language": "en|fr|ar|...", "script": [{"line": "...", "purpose": "...", "visual": "..."}]}`;
};

const askClaude = async (prompt, run) => {
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider === 'off') throw new Error('Claude is switched off in Settings.');
  return provider === 'api' ? viaApi(prompt, []) : claudeRun(prompt, cacheDir(), 300000, [], run);
};

export const writeScript = async (project, run) => {
  const m = project.motion || {};
  if (!String(m.idea || '').trim()) throw new Error('Describe the video idea first.');
  run.step('read', 'done');
  run.step('write', 'active');
  let out = extractJson(await askClaude(scriptPrompt(m), run));
  run.step('write', 'done');
  run.step('check', 'active');
  const count = (o) => (o.script || []).map((l) => String(l.line || '')).join(' ').split(/\s+/).filter(Boolean).length;
  const wps = WPS[out.language] || WPS[m.language] || 2.6;
  const target = (m.lengthS || 30) * wps * 0.96;
  if (Math.abs(count(out) - target) / target > 0.12) {
    run.log(`The script has ${count(out)} words for about ${Math.round(target)}: asking for the right length`);
    out = extractJson(await askClaude(scriptPrompt(m, {words: count(out)}), run));
  }
  run.step('check', 'done');
  const script = (out.script || []).map((l) => ({line: String(l.line || '').trim(), purpose: String(l.purpose || '').trim(), visual: String(l.visual || '').trim()})).filter((l) => l.line);
  if (!script.length) throw new Error('Claude returned an empty script. Try again, or describe the idea in more detail.');
  const next = {...project, motion: {...m, understanding: String(out.understanding || '').trim(), title: String(out.title || '').trim(), scriptLanguage: out.language || m.language || '', script, voice: null}};
  saveProject(next);
  return next;
};

export const VOICE_STEPS = [{id: 'voice', label: 'ElevenLabs records the voice-over'}];

export const makeVoice = async (project, run) => {
  const m = project.motion || {};
  if (!m.script || !m.script.length) throw new Error('Write the script first.');
  if (!m.voiceId) throw new Error('Choose a voice first.');
  const text = m.script.map((l) => l.line).join(' ');
  run.step('voice', 'active');
  run.log(`${text.length} characters to ElevenLabs (${m.voiceName || m.voiceId})`);
  const dir = path.join(project.dir, 'voice');
  fs.mkdirSync(dir, {recursive: true});
  const r = await synthesize({voiceId: m.voiceId, text, modelId: m.voiceModel, speed: m.voiceSpeed || 1, stability: m.voiceStability ?? 0.5}, dir);
  const durMs = r.words.length ? r.words[r.words.length - 1].endMs : 0;
  run.log(`Voice-over ready: ${(durMs / 1000).toFixed(1)} s, ${r.words.length} words timed`);
  run.step('voice', 'done');
  const next = {...project, motion: {...m, voice: {audio: r.audio, wordsFile: path.join(dir, 'voiceover.words.json'), words: r.words.length, durationMs: durMs, chars: r.chars, at: Date.now(), voiceId: m.voiceId, voiceName: m.voiceName || ''}}};
  saveProject(next);
  return next;
};
