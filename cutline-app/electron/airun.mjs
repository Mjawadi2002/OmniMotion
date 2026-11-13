// Live progress for Claude's work. The app tells the window which steps a job has, what Claude is doing right now and how far its writing has got,
// and lets the user stop it. One job runs at a time.
import {spawnSync} from 'node:child_process';

let sender = () => {};
let current = null;
let counter = 0;

export const setAiSender = (fn) => {
  sender = fn;
};
export const aiBusy = () => !!current;

export const cancelAi = () => {
  if (!current) return false;
  current.cancelled = true;
  killChild(current.child);
  return true;
};

export const killChild = (child) => {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true});
    else child.kill('SIGTERM');
  } catch {
    // already gone
  }
};

// job: 'plan' | 'edit' | 'look'. steps: [{id, label}] shown as a checklist in the window.
export const startAiRun = (job, title, steps) => {
  if (current) throw new Error('Claude is already working on something. Wait for it to finish, or stop it first.');
  const run = {id: `a${++counter}`, job, startedAt: Date.now(), child: null, cancelled: false, ended: false};
  current = run;
  const send = (e) => sender({runId: run.id, job, at: Date.now(), ...e});
  run.step = (id, status = 'active', detail) => send({type: 'step', id, status, detail});
  run.log = (text, level = 'info') => send({type: 'log', level, text: String(text).slice(0, 400)});
  run.usage = (u) => send({type: 'usage', ...u});
  // the text Claude is writing, a few times a second at most
  let lastWrite = 0;
  run.writing = (chars, tail, force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < 250) return;
    lastWrite = now;
    send({type: 'writing', chars, tail});
  };
  run.end = (ok, extra = {}) => {
    if (run.ended) return;
    run.ended = true;
    send({type: 'end', ok, cancelled: run.cancelled, seconds: Math.round((Date.now() - run.startedAt) / 1000), ...extra});
    if (current === run) current = null;
  };
  send({type: 'start', title, steps});
  return run;
};
