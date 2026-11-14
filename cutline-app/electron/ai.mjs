// AI planning: Claude writes the edit plan (the same story analysis done by hand in the engine docs).
// Two ways to connect: Claude Code (uses the Claude account the user is already signed in with) or an Anthropic API key.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {claudeBin, claudeEnv} from './claude.mjs';
import {killChild} from './airun.mjs';
import {freeBackend, freeEnv, isLimitError, llmMode, viaFree} from './freellm.mjs';
import {currentProject, memoryBlock} from './memory.mjs';
import {enginePaths} from './paths.mjs';
import {inputThumbs} from './media.mjs';
import {cacheDir} from './store.mjs';
import {getSecret, getSettings} from './store.mjs';
import {blueprintForPrompt, studyReference} from './aistyle.mjs';
import {lookPathFor} from './looks.mjs';

const MODEL = 'claude-sonnet-5-5';

const readDoc = (dir, name) => {
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8');
  } catch {
    return '';
  }
};

const PLACEMENT = `WHERE EACH KIND OF FILE GOES
- logo: show it where the brand, product or company it belongs to is first spoken; if the speech never names it, in the closing beat.
- screenshot: show it while the speaker describes the page, app or result it shows.
- image: show it on the words that describe what it shows.
- broll video: show it as a window (a shot, in a vlog) on the line it illustrates.
Never stretch a file over unrelated words. If a file fits nothing well, still use it once, briefly, at its most related moment.`;

// the provided files (images, logos, screenshots, b-roll) that the plan never mentions
export const unusedMedia = (plan, pool) => {
  const text = JSON.stringify(plan || {}).toLowerCase();
  return pool.filter((m) => {
    const name = String(m.name || '').toLowerCase();
    const base = name.replace(/.[^.]+$/, '');
    return name && !text.includes(name) && !(base && text.includes(base));
  });
};

const mediaPool = (project, inputs) => (inputs.length ? inputs : (project.media || []).filter((m) => m.kind === 'image' || (m.kind === 'video' && m.role === 'broll')));

export const buildPrompt = (project, job, inputs = [], styles = [], brief = '') => {
  const e = enginePaths(getSettings().enginePath);
  const docs = `${readDoc(e.docs, 'DIRECTOR.md')}\n\n${readDoc(e.docs, 'PLAN_SCHEMA.md')}\n\n${readDoc(e.docs, 'MOTION_GRAPHICS.md')}`;
  const words = job.words || [];
  const readable = [];
  let line = [];
  words.forEach((w, i) => {
    line.push(w.text);
    if (/[.!?;؟]$/.test(w.text) || line.length >= 12 || i === words.length - 1) {
      const t = words[i - line.length + 1].startMs;
      readable.push(`[${(t / 1000).toFixed(2)}s] ${line.join(' ')}`);
      line = [];
    }
  });
  const vlog = project.mode === 'vlog';
  const palette = project.style === 'light' ? 'personal (light)' : 'tech (dark)';
  const clips = vlog && job.clips ? job.clips.map((c) => `- id "${c.id}": ${c.name}, ${(c.durationMs / 1000).toFixed(1)} s, ${c.portrait ? 'portrait' : 'landscape'}, contact sheet image ${c.sheet} (${c.sampleTimesMs.length} evenly spaced frames, left to right, top to bottom, at ms: ${c.sampleTimesMs.join(', ')})`).join('\n') : '';
  const pool = mediaPool(project, inputs);
  const assets = pool.map((m) => `- ${m.name} (${m.role}, ${m.kind})${m.thumb ? `: look at the picture at ${m.thumb}${m.kind === 'video' ? ' (a sheet of 8 evenly spaced frames, left to right, top to bottom)' : ''}` : ''}`).join(String.fromCharCode(10));
  const refs = (project.media || []).filter((m) => m.role === 'reference').map((m) => `- ${m.original}`).join(String.fromCharCode(10));
  return `You are the editor behind the OmniMotion app. Write the edit plan (edit_plan.json) for this project.

PROJECT
- mode: ${vlog ? 'vlog (narration + clips)' : 'talking head'}
- look: ${palette}; default mode in the plan: ${vlog ? '"vlog"' : project.style === 'light' ? '"lightHead"' : '"techHead"'}
${project.popout ? '- pop-out head is on (light look)\n' : ''}
RULES (hard)
- Every word shown on screen must be spoken in the transcript, or listed in "allowText" when it is a direct translation, or come from the files listed below. Digits are free. Never invent facts, numbers, names or places.
- Anchor everything to spoken words with {"at": "words", "n": occurrence, "end": bool, "lead": ms}. Use words exactly as they appear in the transcript.
- One idea per beat, windows 1.5 to 2.5 s, a visual change every ~2.5 s, no overlapping windows in the same slot, keep the head visible about half of the time.
- Use only graphic kinds from the schema. Mixed Tunisian Arabic / French / English speech: keep the speaker's own words.
- MOTION GRAPHICS ARE REQUIRED: use real animated 2D and 3D elements (kind "motion", scenes in the MOTION GRAPHICS guide below) wherever the story has something to illustrate: time, money, growth, tools, a goal, a conversation, a process. At least one per 12 seconds of speech, chosen by what the words mean, scenes varied, anchored on the spoken words. A plain text card is not a substitute. They work in every look and reference, because they use the look's own colours.
- Keep graphics off the captions: motion graphics go in the free area above the speaker (leave out "slot" and "mode"), and no two graphics may open in the same place at the same time.
${vlog ? '- Vlog: write "shots" that tile the whole narration using the clips; look at every contact sheet image first and match what each clip shows to what is being said; vary clips; use "fx" for a few topic changes.\n' : ''}
OUTPUT
Return ONLY one JSON object (the edit plan), no commentary, no code fences.

ENGINE DOCS
${docs}

TRANSCRIPT (edited timeline)
${readable.join('\n')}

${brief ? `THE USER'S DIRECTION FOR THIS EDIT (follow it closely; where it conflicts with the reference style, the user wins; it never overrides the hard rules above)${'\n'}${brief}${'\n\n'}` : ''}${vlog ? `CLIPS\n${clips}\n` : ''}${styles.length ? `STYLE BLUEPRINT TO RECREATE (studied from ${styles.map((x) => x.from).join(' and ')}). This is the style the user wants. Recreate it with the engine: follow its editRecipe in order, use the engine equivalents of its components at the same rate and in the same places, give graphics the same kind of entrances, put its transitions on graphics ("transition": one of its engineSettings.transitions), match its pacing (graphics per minute, how long each stays) and its motion graphics (same scenes and density). Motion graphics stay required even when the reference has none: then keep them as short and snappy as the reference's other graphics and in its rhythm. Never copy its words or footage.${'\n'}${styles.map((x) => blueprintForPrompt(x)).join('\n')}${'\n'}` : ''}${refs ? `STYLE REFERENCES THE USER ATTACHED (for taste only; never copy their footage or text)${'\n'}${refs}${'\n'}` : ''}${assets ? `FILES THE USER PROVIDED. Every one of these MUST appear in the plan at least once, written exactly as its file name below (or the name without its extension) in content.src or in a logos tile image:
${assets}
${PLACEMENT}
` : ''}`;
};

const extractJson = (text) => {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('The reply did not contain a plan.');
  return JSON.parse(text.slice(a, b + 1));
};

const viaApi = async (prompt, images) => {
  const mode = llmMode();
  const freeContent = () => [...images.map((img) => ({type: 'image', source: {type: 'base64', media_type: /.jpe?g$/i.test(img) ? 'image/jpeg' : 'image/png', data: fs.readFileSync(img).toString('base64')}})), {type: 'text', text: prompt}];
  if (mode === 'free') return viaFree(freeContent());
  try {
    return await viaAnthropic(prompt, images);
  } catch (e) {
    if (mode === 'fallback' && isLimitError(e.message)) return viaFree(freeContent());
    throw e;
  }
};
const viaAnthropic = async (prompt, images) => {
  const key = getSecret('anthropic');
  if (!key) throw new Error('No Anthropic API key saved. Add it in Settings, or connect Claude Code.');
  const content = [];
  for (const img of images) content.push({type: 'image', source: {type: 'base64', media_type: /.jpe?g$/i.test(img) ? 'image/jpeg' : 'image/png', data: fs.readFileSync(img).toString('base64')}});
  content.push({type: 'text', text: prompt});
  const res = await fetch('https://api.anthropic.com/v1/messages', {method: 'POST', headers: {'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'}, body: JSON.stringify({model: getSettings().aiModel || MODEL, max_tokens: 12000, messages: [{role: 'user', content}]})});
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `Anthropic API error ${res.status}`);
  return body.content.map((c) => c.text || '').join('');
};

export let lastUsage = null;
// say what really happened when Claude Code reports a billing or limit problem
const friendly = (msg) => {
  if (/credit balance/i.test(msg)) return 'Claude Code billed API credits instead of your Claude subscription. In Settings, sign out and sign in again with your Claude account (not the Anthropic Console). OmniMotion already ignores any ANTHROPIC_API_KEY on this computer.';
  if (/usage limit|rate limit|limit reached/i.test(msg)) return 'Your Claude plan limit for this session is reached. It resets on its own (see your Claude usage page); then try again.';
  return msg;
};

// What Claude is doing, in words a person understands (the event stream names tools and files)
const describeTool = (name, input) => {
  const p = input?.file_path || input?.path || input?.pattern || '';
  const base = p ? path.basename(String(p)) : '';
  if (name === 'Read') {
    if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(base)) return `Looking at the picture ${base}`;
    if (/\.md$/i.test(base)) return `Reading the guide ${base}`;
    return `Reading ${base || 'a file'}`;
  }
  if (name === 'Write') return `Writing ${base || 'a file'}`;
  if (name === 'Edit') return `Fixing ${base || 'a file'}`;
  if (name === 'Glob') return 'Listing files';
  return `Using ${name}${base ? ' on ' + base : ''}`;
};

const isWinScript = (bin) => /\.(cmd|bat)$/i.test(bin);
const winQuote = (a) => (/[\s"&|<>^()]/.test(a) || a === '' ? `"${String(a).replace(/"/g, '\\"')}"` : a);

// Runs Claude Code on a prompt and streams what it does. Fixed overhead is kept small (only the Read tool, no connectors, no skills, no saved settings), which
// is most of the difference between a few thousand and tens of thousands of tokens of the user's plan per request. run (optional) receives the live events.
// opts (Agent build): tools (list), permissionMode, maxTurns, sessionId (start a kept conversation) or resume (continue it), model.
// File tools stay limited to cwd and addDirs; there is never a shell tool.
const claudeRunOnce = (prompt, cwd, timeoutMs = 600000, addDirs = [], run = null, opts = {}, backend = null) =>
  new Promise((resolve, reject) => {
    const bin = claudeBin();
    if (!bin) return reject(new Error('Claude Code is not installed. Open Settings and choose Install Claude Code.'));
    const tools = (opts.tools || ['Read']).filter((t) => ['Read', 'Write', 'Edit', 'Glob', 'Grep'].includes(t)).join(',');
    const session = opts.resume ? ['--resume', opts.resume] : opts.sessionId ? ['--session-id', opts.sessionId] : ['--no-session-persistence'];
    const args = ['-p', '--model', backend ? backend.model : opts.model || getSettings().aiModel || 'sonnet', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', tools, '--allowedTools', tools, ...(opts.permissionMode ? ['--permission-mode', opts.permissionMode] : []), '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', '', ...session, '--max-turns', String(opts.maxTurns || 16), ...addDirs.flatMap((d) => ['--add-dir', d])];
    const viaShell = process.platform === 'win32' && isWinScript(bin);
    // the free gateway is given to this process only (never to the user's environment or Claude settings)
    const env = backend ? {...claudeEnv(), ...freeEnv(backend)} : claudeEnv();
    if (backend && run) run.log(`Using free models through FreeLLMAPI (${backend.model})`);
    const child = viaShell ? spawn(winQuote(bin) + ' ' + args.map(winQuote).join(' '), [], {cwd, shell: true, windowsHide: true, env}) : spawn(bin, args, {cwd, windowsHide: true, env});
    lastUsage = null;
    if (run) run.child = child;
    let final = null;
    let err = '';
    let buf = '';
    let text = '';
    let chars = 0;
    let sawPartial = false;
    let announcedWrite = false;
    const blocks = {};
    const t = setTimeout(() => {
      killChild(child);
      reject(new Error('Claude Code took too long.'));
    }, timeoutMs);

    const noteTool = (name, input) => run && run.log(describeTool(name, input), 'tool');
    const handle = (j) => {
      if (j.type === 'system' && j.subtype === 'init') {
        run && run.log(`Claude is ready (${j.model || 'model'})`);
      } else if (j.type === 'stream_event' && j.event) {
        sawPartial = true;
        const e = j.event;
        if (e.type === 'content_block_start' && e.content_block) {
          blocks[e.index] = {type: e.content_block.type, name: e.content_block.name, json: ''};
          if (e.content_block.type === 'thinking') run && run.log('Thinking it through', 'think');
          if (e.content_block.type === 'text' && !announcedWrite) {
            announcedWrite = true;
            run && run.log('Writing the answer', 'write');
          }
        } else if (e.type === 'content_block_delta' && e.delta) {
          if (e.delta.type === 'text_delta') {
            text += e.delta.text || '';
            chars += (e.delta.text || '').length;
            run && run.writing(chars, text.slice(-360));
          } else if (e.delta.type === 'input_json_delta' && blocks[e.index]) {
            const bl = blocks[e.index];
            bl.json += e.delta.partial_json || '';
            // a big file is written as one tool call that streams for minutes: say how far it has got, so the log never looks frozen
            if (run && /^(Write|Edit)$/.test(bl.name || '')) {
              const now = Date.now();
              if (!bl.file) {
                const m = /"file_path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(bl.json);
                if (m) bl.file = path.basename(m[1].replace(/\\\\/g, '/'));
              }
              if (bl.json.length > 3000 && (!bl.reportedAt || now - bl.reportedAt > 6000)) {
                bl.reportedAt = now;
                run.log(`${bl.name === 'Edit' ? 'Changing' : 'Writing'} ${bl.file || 'a file'}: ${(bl.json.length / 1000).toFixed(1)}k characters so far`, 'write');
              }
            }
          }
        } else if (e.type === 'content_block_stop') {
          const bl = blocks[e.index];
          if (bl && bl.type === 'tool_use') {
            let input = {};
            try {
              input = JSON.parse(bl.json || '{}');
            } catch {
              // partial input: describe the tool without a file
            }
            noteTool(bl.name, input);
          }
        }
      } else if (j.type === 'assistant' && j.message && !sawPartial) {
        // older Claude Code without partial messages: whole messages only
        for (const c of j.message.content || []) {
          if (c.type === 'tool_use') noteTool(c.name, c.input);
          if (c.type === 'text') {
            text += c.text || '';
            chars += (c.text || '').length;
            run && run.writing(chars, text.slice(-360), true);
          }
        }
      } else if (j.type === 'rate_limit_event' && j.rate_limit_info) {
        const w = j.rate_limit_info.unifiedWindows || {};
        run && run.usage({windows: {fiveHour: w.five_hour, sevenDay: w.seven_day}, status: j.rate_limit_info.status});
      } else if (j.type === 'result') final = j;
    };

    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          handle(JSON.parse(line));
        } catch {
          // not an event: ignore
        }
      }
    });
    child.stderr.on('data', (d) => {
      err += d;
      if (run) for (const l of String(d).split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) run.log(l, 'warn');
    });
    child.on('error', (e) => {
      clearTimeout(t);
      reject(new Error(`Claude Code could not be started: ${e.message}`));
    });
    child.on('close', () => {
      clearTimeout(t);
      if (run && run.cancelled) {
        const e = new Error('Stopped.');
        e.cancelled = true;
        return reject(e);
      }
      if (buf.trim()) {
        try {
          handle(JSON.parse(buf.trim()));
        } catch {
          // ignore
        }
      }
      if (!final) return reject(new Error(friendly((err || text).trim().slice(0, 400) || 'Claude Code returned nothing.')));
      const u = final.usage;
      lastUsage = u ? (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) : null;
      if (run) {
        run.writing(chars, text.slice(-360), true);
        if (lastUsage) run.usage({tokens: lastUsage});
      }
      if (final.is_error) return reject(new Error(friendly(String(final.result || 'Claude Code returned an error.'))));
      resolve(String(final.result ?? text));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });

// Claude Code for one job: the project's memory goes first in every new conversation, and the free gateway is used as Settings say
// ('free': always; 'fallback': when the Claude plan limit is reached, continuing the same conversation from where Claude stopped).
const claudeRun = async (prompt, cwd, timeoutMs = 600000, addDirs = [], run = null, opts = {}) => {
  const mem = opts.resume ? '' : memoryBlock(currentProject());
  const full = mem ? `${mem}

${prompt}` : prompt;
  const mode = llmMode();
  if (mode === 'free') {
    const free = await freeBackend();
    if (!free) throw new Error('Settings say to use free models, but your FreeLLMAPI gateway is not set up. Add it in Settings (Free models), or use the built-in one.');
    return claudeRunOnce(full, cwd, timeoutMs, addDirs, run, opts, free);
  }
  try {
    return await claudeRunOnce(full, cwd, timeoutMs, addDirs, run, opts);
  } catch (e) {
    if (mode !== 'fallback' || e.cancelled || !isLimitError(e.message)) throw e;
    const free = await freeBackend();
    if (!free) throw e;
    run && run.log('Your Claude limit is reached: continuing on free models through FreeLLMAPI, from where Claude stopped', 'warn');
    const sid = opts.resume || opts.sessionId;
    if (!sid) return claudeRunOnce(full, cwd, timeoutMs, addDirs, run, opts, free);
    const cont = `Claude stopped part way through this task (its usage limit was reached). You continue it in the same conversation: look at what is already done in the files, do not redo finished work, and finish exactly this task:

${prompt}`;
    try {
      return await claudeRunOnce(cont, cwd, timeoutMs, addDirs, run, {...opts, sessionId: undefined, resume: sid}, free);
    } catch (e2) {
      // the limit was hit before the conversation was saved: start it on the gateway with the same id
      if (!/no conversation|not found|could not find/i.test(e2.message)) throw e2;
      return claudeRunOnce(full, cwd, timeoutMs, addDirs, run, {...opts, resume: undefined, sessionId: sid}, free);
    }
  }
};

export const testAi = async (provider) => {
  if (provider === 'api') {
    if (!getSecret('anthropic')) return {ok: false, message: 'No API key saved.'};
    try {
      const r = await viaApi('Reply with the single word OK.', []);
      return {ok: /ok/i.test(r), message: r.trim().slice(0, 80) || 'No reply.'};
    } catch (e) {
      return {ok: false, message: e.message};
    }
  }
  if (!claudeBin()) return {ok: false, message: 'Claude Code is not installed. Use Install Claude Code in Settings, then sign in.'};
  try {
    const r = await claudeRun('Reply with the single word OK.', process.cwd(), 90000);
    return {ok: /ok/i.test(r), message: r.trim().slice(0, 80) || 'Connected.'};
  } catch (e) {
    return {ok: false, message: `${e.message} If you are not signed in, use Sign in with Claude in Settings.`};
  }
};

export const planWithAi = async (project, job, run = null, brief = '') => {
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider === 'off') throw new Error('AI planning is switched off in Settings.');
  if (!job.words) throw new Error('Prepare the project first so there is a transcript to plan from.');

  const words = job.words;
  const minutes = (words[words.length - 1]?.endMs || 0) / 60000;
  run?.step('read', 'active');
  run?.log(`Transcript: ${words.length} words, about ${minutes.toFixed(1)} minutes of speech`);
  run?.step('read', 'done', `${words.length} words`);

  run?.step('files', 'active');
  const inputs = await inputThumbs(project);
  for (const i of inputs) run?.log(`Prepared ${i.name} (${i.role})`);
  const sheets = project.mode === 'vlog' && job.clips ? job.clips.map((c) => c.sheet).filter((p) => p && fs.existsSync(p)) : [];
  if (sheets.length) run?.log(`Prepared ${sheets.length} contact sheet${sheets.length > 1 ? 's' : ''} of your clips`);
  const styles = [];
  try {
    const lf = lookPathFor(project.look);
    if (lf && fs.existsSync(lf)) {
      const lk = JSON.parse(fs.readFileSync(lf, 'utf8'));
      if (lk.blueprint) {
        styles.push({from: `the look "${lk.label}"`, blueprint: lk.blueprint, style: lk.style});
        run?.log(`Using the style blueprint of the look "${lk.label}"`);
      }
    }
  } catch {
    // a look without a blueprint: colours and fonts only
  }
  for (const m of (project.media || []).filter((x) => x.role === 'reference' && x.kind === 'video' && fs.existsSync(x.path))) {
    run?.log(`Studying the reference ${m.name}: transitions, graphics, animations and effects`);
    try {
      const st = await studyReference(m.path, null);
      styles.push({from: `the reference ${m.name}`, ...st});
      run?.log(`Reference ${m.name}: ${(st.blueprint.components || []).length} components, ${(st.blueprint.transitions || []).length} transition types`);
    } catch (e) {
      if (e.cancelled) throw e;
      run?.log(`Could not study ${m.name}: ${e.message}`, 'warn');
    }
  }
  if (brief) run?.log(`Your direction: "${brief.slice(0, 160)}"`);
  const prompt = buildPrompt(project, job, inputs, styles, brief);
  const pics = [...sheets, ...inputs.map((i) => i.thumb).filter(Boolean)];
  run?.step('files', inputs.length || sheets.length ? 'done' : 'skipped', inputs.length ? `${inputs.length} file${inputs.length > 1 ? 's' : ''}` : sheets.length ? `${sheets.length} sheets` : 'nothing attached');

  const ask = (p) => {
    if (provider === 'api') {
      run?.log('Waiting for the Anthropic API (an API key gives no live output)');
      return viaApi(p, pics);
    }
    return claudeRun(p, job.jobDir, 600000, [cacheDir(), project.dir], run);
  };
  run?.log(`Sending ${Math.round(prompt.length / 1000)}k characters of instructions to ${provider === 'api' ? 'the Anthropic API' : 'Claude'}`);
  run?.step('write', 'active');
  let plan = extractJson(await ask(prompt));
  run?.log(`The plan has ${(plan.graphics || []).length} graphics${plan.titles?.length ? `, ${plan.titles.length} titles` : ''}${plan.shots?.length ? `, ${plan.shots.length} shots` : ''}`);
  run?.step('write', 'done');

  // the plan has to place every attached file and use real motion graphics (about one per 12 s of speech): when something is missing, Claude gets one chance to fix it
  const pool = mediaPool(project, inputs);
  const refMotion = Math.max(0, ...styles.map((x) => (x.style && x.style.motionPerMinute) || 0));
  const motionNeeded = minutes * 60 >= 10 ? Math.min(12, Math.max(1, Math.floor((minutes * 60) / 14), Math.round(refMotion * minutes))) : 0;
  const motionHave = (p) => (p.graphics || []).filter((g) => g.kind === 'motion').length;
  run?.step('check', 'active');
  let missing = pool.length ? unusedMedia(plan, pool) : [];
  let lacking = motionNeeded > motionHave(plan);
  if (missing.length || lacking) {
    const asks = [];
    if (missing.length) asks.push(`These provided files were left out: ${missing.map((m) => `${m.name} (${m.role})`).join(', ')}. Place every one of them where it belongs (see WHERE EACH KIND OF FILE GOES).`);
    if (lacking) asks.push(`The plan has ${motionHave(plan)} motion graphics but needs at least ${motionNeeded} (about one per 12 seconds of speech). Add real motion graphics (kind "motion") where the story has something to illustrate, choosing the scene by what the words mean, varied, anchored on spoken words, and never overlapping another graphic or the captions.`);
    if (missing.length) run?.log(`Claude left out ${missing.map((m) => m.name).join(', ')}. Asking it to place them.`, 'warn');
    if (lacking) run?.log(`Only ${motionHave(plan)} motion graphics, ${motionNeeded} needed. Asking Claude to add more.`, 'warn');
    run?.step('write', 'active', 'second pass');
    try {
      const again = extractJson(await ask(`${prompt}

CORRECTION
${asks.join('\n')}
Return the complete plan again. Keep everything else that is good.

YOUR PREVIOUS PLAN
${JSON.stringify(plan)}`));
      const left = pool.length ? unusedMedia(again, pool) : [];
      if (left.length <= missing.length && motionHave(again) >= motionHave(plan)) {
        plan = again;
        missing = left;
        lacking = motionNeeded > motionHave(plan);
      }
    } catch (e) {
      if (e.cancelled) throw e;
      run?.log('The second pass failed, so the first plan is kept.', 'warn');
    }
    run?.step('write', 'done');
  }
  const motion = motionHave(plan);
  run?.log(`${motion} motion graphic${motion === 1 ? '' : 's'} in the plan${pool.length ? `, ${pool.length - missing.length} of ${pool.length} attached files placed` : ''}`);
  run?.step('check', missing.length || lacking ? 'warn' : 'done', [pool.length ? (missing.length ? `${missing.length} files not placed` : `all ${pool.length} files placed`) : '', motionNeeded || motion ? `${motion} motion` : ''].filter(Boolean).join(', ') || 'nothing to check');
  return {plan, unused: missing.map((m) => m.name), motion, motionNeeded};
};
export {claudeRun, extractJson, readDoc, viaApi};
