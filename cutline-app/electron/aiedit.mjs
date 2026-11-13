// Edit mode: the user types a change in plain words, Claude revises the current plan.
import {enginePaths} from './paths.mjs';
import {getSettings} from './store.mjs';
import {claudeRun, extractJson, readDoc, viaApi} from './ai.mjs';
import * as ai from './ai.mjs';

const NL = String.fromCharCode(10);

export const buildEditPrompt = (project, job, instruction, currentPlan, history) => {
  const e = enginePaths(getSettings().enginePath);
  // edits only need the plan format (the long decision guide is for writing a plan from scratch), which saves tokens on the user's plan
  const docs = `${readDoc(e.docs, 'PLAN_SCHEMA.md')}\n\n${readDoc(e.docs, 'MOTION_GRAPHICS.md')}`;
  const words = job.words || [];
  const lines = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(`${w.srcIdx ?? i}:${w.text}`);
    if (cur.length >= 10 || i === words.length - 1) {
      lines.push(`[${(words[i - cur.length + 1].startMs / 1000).toFixed(2)}s] ${cur.join(' ')}`);
      cur = [];
    }
  });
  const resolved = (job.resolved?.graphics || []).map((g) => `- ${g.id} (${g.kind}) ${(g.startMs / 1000).toFixed(2)}s to ${(g.endMs / 1000).toFixed(2)}s`).join(NL);
  const shots = (job.resolved?.shots || []).map((s, i) => `- shot ${i + 1}: ${s.clipId} ${(s.startMs / 1000).toFixed(2)}s to ${(s.endMs / 1000).toFixed(2)}s`).join(NL);
  const past = (history || []).slice(-6).map((h) => `- "${h.instruction}" -> ${h.summary}`).join(NL);
  const vlog = project.mode === 'vlog';
  const mode = vlog ? 'vlog (shots tile the narration; keep them tiling)' : project.style === 'light' ? 'talking head, light look' : 'talking head, tech look';
  return [
    'You are the editor behind the OmniMotion app. The user is watching a preview of their edit and types a change in plain words. Apply ONLY that change to the current edit plan.',
    '',
    'RULES (hard)',
    '- Change only what the user asked for. Keep every other part of the plan exactly as it is.',
    '- Every word shown on screen must be spoken in the transcript, listed in "allowText", or come from the user files. Never invent facts, numbers, names or places.',
    '- Anchors use spoken words: {"at": "words", "n": occurrence, "end": bool, "lead": ms}. Earlier or later means a smaller or larger "lead", or a different word. Graphic ids stay the same unless a graphic is added or removed.',
    '- To fix a mis-heard word, set plan.wordFixes = {"<word index>": "correct word"} using the indexes in the transcript below (keep existing wordFixes). To remove part of the speech, add to plan.cuts = [{"fromWord": i, "toWord": j}] only when the user clearly asks to cut that speech.',
    '- Text size, colours and fonts are fixed by the design system. If asked for something the plan format cannot do, say so plainly in the summary and return the plan unchanged.',
    '- MOTION GRAPHICS: the plan format DOES support real animated 2D and 3D elements (kind "motion": clock, timeline, growth, rocket, target, bulb, bubbles, network, layers, cube, orbit, coin; see the guide below). When the user asks for animation, 3D, 2D elements, icons or "real motion graphics", add or change motion graphics: never answer that they are not possible. Keep the existing ones unless asked to remove them. If the story has something to illustrate and the plan has no motion graphic, add one.',
    '- Graphics must never sit on the captions or on each other. The engine moves a graphic off the caption line by itself; when you move or add graphics, choose different times or slots so two never open in the same area together. A motion graphic goes in the free area above the speaker: leave out "slot" and "mode".',
    `- Mode: ${mode}.`,
    '',
    'OUTPUT',
    'Return ONLY one JSON object: {"summary": "one or two plain sentences saying what you changed, no jargon", "plan": <the full updated plan>}. No code fences, no commentary.',
    '',
    'USER REQUEST',
    instruction,
    '',
    past ? `EARLIER CHANGES IN THIS SESSION${NL}${past}${NL}` : '',
    'CURRENT PLAN',
    JSON.stringify(currentPlan, null, 1),
    '',
    'CURRENT TIMES (edited timeline)',
    resolved || '(graphics not resolved yet)',
    vlog ? shots : '',
    '',
    'TRANSCRIPT WITH WORD INDEXES',
    lines.join(NL),
    '',
    'ENGINE DOCS',
    docs,
  ].join(NL);
};

export const editWithAi = async (project, job, instruction, currentPlan, history, run = null) => {
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider === 'off') throw new Error('AI editing is switched off in Settings. Choose Claude account or an API key there.');
  run?.step('read', 'active');
  const prompt = buildEditPrompt(project, job, instruction, currentPlan, history);
  run?.log(`Your request: "${instruction.slice(0, 160)}"`);
  run?.log(`Sending the current plan and transcript (${Math.round(prompt.length / 1000)}k characters)`);
  run?.step('read', 'done');
  run?.step('write', 'active');
  if (provider === 'api') run?.log('Waiting for the Anthropic API (an API key gives no live output)');
  const text = provider === 'api' ? await viaApi(prompt, []) : await claudeRun(prompt, job.jobDir, 600000, [], run);
  run?.step('write', 'done');
  run?.step('check', 'active');
  const out = extractJson(text);
  if (!out.plan || typeof out.plan !== 'object') throw new Error('The reply did not contain an updated plan.');
  run?.log(`Done: ${String(out.summary || 'plan updated').slice(0, 200)}`);
  run?.step('check', 'done');
  return {summary: String(out.summary || 'Plan updated.'), plan: out.plan, tokens: provider === 'api' ? null : ai.lastUsage};
};
