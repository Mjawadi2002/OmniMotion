// Hook lab: Claude judges the first seconds of the reel (what is said, what is shown, how fast it moves) like a short-form strategist,
// scores it, explains it, and proposes fixes the editor can apply (each one is an instruction for the Edit step, so it lands in the history and can be undone)
// plus new opening lines the speaker could record.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {claudeRun, extractJson, viaApi} from './ai.mjs';
import {cacheDir, getSettings} from './store.mjs';

const run = promisify(execFile);
const FIX_KINDS = ['trim', 'graphic', 'motion', 'zoom', 'text', 'sound', 'pace'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));
const list = (v) => (Array.isArray(v) ? v : []);
const str = (v, n = 400) => String(v ?? '').slice(0, n);

// what the viewer sees in the first seconds: frames of the footage at those moments of the edited timeline
const firstFrames = async (job, resolved) => {
  const src = job.publicDir && path.join(job.publicDir, 'input.mp4');
  if (!src || !fs.existsSync(src)) return null;
  const segs = resolved?.media?.segments || [];
  const toSrc = (t) => {
    const s = segs.find((g) => t >= g.outStartMs && t < g.outStartMs + (g.srcEndMs - g.srcStartMs));
    return s ? s.srcStartMs + (t - s.outStartMs) : t;
  };
  const times = [0, 400, 900, 1500, 2200, 3000];
  const key = crypto.createHash('sha1').update(`${src}|${fs.statSync(src).mtimeMs}|${JSON.stringify(segs.slice(0, 6))}`).digest('hex').slice(0, 12);
  const dir = path.join(cacheDir(), `hook-${key}`);
  const out = path.join(cacheDir(), `hook-${key}.jpg`);
  if (fs.existsSync(out)) return out;
  fs.mkdirSync(dir, {recursive: true});
  let i = 0;
  for (const t of times) {
    i++;
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', (toSrc(t) / 1000).toFixed(3), '-i', src, '-frames:v', '1', '-vf', 'scale=220:-2', '-q:v', '4', path.join(dir, `f_${String(i).padStart(3, '0')}.jpg`)], {windowsHide: true}).catch(() => {});
  }
  await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, 'f_%03d.jpg'), '-vf', 'tile=6x1:padding=4:color=white', '-frames:v', '1', '-q:v', '4', out], {windowsHide: true}).catch(() => {});
  fs.rmSync(dir, {recursive: true, force: true});
  return fs.existsSync(out) ? out : null;
};

const buildHookPrompt = (project, job, sheet) => {
  const words = job.words || [];
  const r = job.resolved || {};
  const first = words.filter((w) => w.startMs < 15000);
  const indexed = first.map((w, i) => `${w.srcIdx ?? i}:${w.text}@${(w.startMs / 1000).toFixed(2)}s`).join(' ');
  const inWindow = (x) => x.startMs < 6000;
  const shown = [
    ...list(r.graphics).filter(inWindow).map((g) => `${(g.startMs / 1000).toFixed(1)}s to ${(g.endMs / 1000).toFixed(1)}s: ${g.kind}${g.content ? ' ' + JSON.stringify(g.content).slice(0, 120) : ''}`),
    ...list(r.titles).filter(inWindow).map((t) => `${(t.startMs / 1000).toFixed(1)}s: title "${t.line1} ${t.highlight || ''}"`),
  ];
  const firstSound = list(r.sfx).filter((s) => s.atMs < 3000).map((s) => `${(s.atMs / 1000).toFixed(2)}s ${s.type}`);
  return `You are a short-form video strategist (TikTok, Reels, Shorts) who has studied thousands of hooks. Judge the HOOK of this reel: the first 3 seconds decide whether people stay.
The speaker may use Tunisian Arabic, another Arabic dialect, French, English or a mix: judge it in its own language, and write any new lines in the same language mix.

WHAT IS SAID (word index : word @ time on the edited reel; the first 3 seconds matter most)
${indexed || '(no transcript)'}

WHAT IS SHOWN IN THE FIRST 6 SECONDS (graphics, titles)
${shown.join('\n') || '(nothing over the footage)'}
Sound in the first 3 s: ${firstSound.join(', ') || 'none'}. Music: ${r.musicEnabled ? 'yes' : 'no'}. Layout at the start: ${list(r.layouts)[0]?.mode || 'unknown'}.
${sheet ? `FRAMES: look at the image file ${sheet} (6 frames at 0, 0.4, 0.9, 1.5, 2.2 and 3.0 seconds, left to right; the footage only, graphics are listed above).` : ''}

JUDGE (be honest and specific; quote the actual words; never invent facts about the speaker or their results)
Score each 0 to 10: "Stops the scroll" (does the first frame and the first second interrupt the scroll?), "Curiosity" (an open loop that makes people want the rest), "Clarity" (do we know what this is about within 3 s?), "Specific promise" (a concrete benefit, number or stakes), "Speed" (how fast the first strong word or image arrives), "Visual hook" (movement, graphic, framing in the first second).

FIXES the editor can apply right now (the speech itself cannot change): trim a weak start (remove words with "cuts" by word index), a graphic or motion graphic on the strongest early words, a zoom punch-in, a sound accent, a faster first graphic, or on-screen text. On-screen text must use spoken words; if a fix needs words that were NOT said, set "addsWords": true and say in the instruction to add those words to allowText (the user will approve it). Each instruction is given to the OmniMotion editor as is: write it as a precise edit request that names the words and times.
NEW OPENING LINES the speaker could record instead (same language mix, same facts, no invented results).

OUTPUT: only one JSON object, no code fences:
{"score": n, "verdict": "one sentence", "firstWords": "the first ~3 seconds of speech, quoted",
 "criteria": [{"name": "Stops the scroll", "score": n, "note": "..."}, {"name": "Curiosity", ...}, {"name": "Clarity", ...}, {"name": "Specific promise", ...}, {"name": "Speed", ...}, {"name": "Visual hook", ...}],
 "works": ["..."], "hurts": ["..."],
 "fixes": [{"title": "short", "why": "the effect on retention", "kind": "${FIX_KINDS.join(' | ')}", "addsWords": false, "instruction": "..."}],
 "rewrites": [{"line": "...", "why": "..."}]}`;
};

// keep only what the screen can show and the editor can apply
const clean = (o) => ({
  score: clamp(o.score, 0, 10),
  verdict: str(o.verdict, 300),
  firstWords: str(o.firstWords, 300).trim().replace(/^["“”«»'‘’]+|["“”«»'‘’]+$/g, ''),
  criteria: list(o.criteria)
    .slice(0, 6)
    .map((c) => ({name: str(c.name, 40), score: clamp(c.score, 0, 10), note: str(c.note, 300)})),
  works: list(o.works).slice(0, 6).map((x) => str(x, 300)),
  hurts: list(o.hurts).slice(0, 6).map((x) => str(x, 300)),
  fixes: list(o.fixes)
    .slice(0, 6)
    .filter((f) => f && f.instruction)
    .map((f) => ({title: str(f.title, 80), why: str(f.why, 300), kind: FIX_KINDS.includes(f.kind) ? f.kind : 'graphic', addsWords: !!f.addsWords, instruction: str(f.instruction, 800)})),
  rewrites: list(o.rewrites)
    .slice(0, 5)
    .map((r) => ({line: str(r.line, 300), why: str(r.why, 300)})),
});

export const planHash = (job) => crypto.createHash('sha1').update(JSON.stringify(job.plan || job.autoPlan || {})).digest('hex').slice(0, 12);

export const readHook = (job) => {
  try {
    const h = JSON.parse(fs.readFileSync(path.join(job.jobDir, 'hook.json'), 'utf8'));
    return {...h, firstWords: String(h.firstWords || '').trim().replace(/^["“”«»'‘’]+|["“”«»'‘’]+$/g, ''), outdated: h.planHash !== planHash(job)};
  } catch {
    return null;
  }
};

export const hookWithAi = async (project, job, runEv = null) => {
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider === 'off') throw new Error('AI is switched off in Settings. Choose Claude account or an API key there.');
  if (!job.words || !job.words.length) throw new Error('Prepare the project first so there is a transcript to judge.');
  if (!job.resolved) throw new Error('Build the preview once (Plan, then Save and preview) so the hook can be judged as it will look.');
  runEv?.step('read', 'active');
  const first3 = job.words.filter((w) => w.startMs < 3000).map((w) => w.text).join(' ');
  runEv?.log(`The first 3 seconds say: "${first3.slice(0, 160)}"`);
  runEv?.step('read', 'done', `${job.words.filter((w) => w.startMs < 3000).length} words in 3 s`);
  runEv?.step('frames', 'active');
  const sheet = await firstFrames(job, job.resolved);
  runEv?.step('frames', sheet ? 'done' : 'skipped', sheet ? '6 frames' : 'no footage');
  runEv?.step('judge', 'active');
  const prompt = buildHookPrompt(project, job, sheet);
  const text = provider === 'api' ? await viaApi(prompt, sheet ? [sheet] : []) : await claudeRun(prompt, cacheDir(), 600000, [cacheDir()], runEv);
  const out = clean(extractJson(text));
  runEv?.log(`Hook score ${out.score}/10: ${out.verdict}`);
  runEv?.step('judge', 'done', `${out.score}/10`);
  runEv?.step('save', 'active');
  const saved = {...out, at: Date.now(), planHash: planHash(job), sheet};
  fs.writeFileSync(path.join(job.jobDir, 'hook.json'), JSON.stringify(saved, null, 1));
  runEv?.step('save', 'done');
  return {...saved, outdated: false};
};
