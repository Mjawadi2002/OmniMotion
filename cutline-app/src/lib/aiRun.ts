import {useSyncExternalStore} from 'react';
import {api, type AiEvent} from './api';

export type StepStatus = 'pending' | 'active' | 'done' | 'skipped' | 'warn';
export type AiJob = 'plan' | 'edit' | 'look' | 'hook' | 'analyze' | 'agent' | 'script';

export interface AiRunState {
  runId: string;
  job: AiJob;
  title: string;
  steps: {id: string; label: string; status: StepStatus; detail?: string}[];
  log: {at: number; level: string; text: string}[];
  chars: number;
  tail: string;
  tokens: number | null;
  fiveHour?: {utilization: number; resetsAt: number};
  sevenDay?: {utilization: number; resetsAt: number};
  startedAt: number;
  running: boolean;
  ok?: boolean;
  cancelled?: boolean;
  error?: string;
  seconds?: number;
  unused?: string[];
  motion?: number;
  motionNeeded?: number;
  summary?: string;
  dismissed: boolean;
}

// The state of Claude's current / latest job per kind. It lives here, not in a screen, so switching tabs while Claude works loses nothing.
const runs: Partial<Record<AiJob, AiRunState>> = {};
const subs = new Set<() => void>();
let listening = false;

const emit = () => subs.forEach((f) => f());
const put = (job: AiJob, next: AiRunState) => {
  runs[job] = next;
  emit();
};

const reduce = (e: AiEvent) => {
  const cur = runs[e.job];
  if (e.type === 'start') {
    put(e.job, {
      runId: e.runId,
      job: e.job,
      title: e.title || 'Claude is working',
      steps: (e.steps || []).map((s) => ({...s, status: 'pending' as StepStatus})),
      log: [],
      chars: 0,
      tail: '',
      tokens: null,
      startedAt: e.at,
      running: true,
      dismissed: false,
    });
    return;
  }
  if (!cur || cur.runId !== e.runId) return;
  if (e.type === 'step') {
    put(e.job, {...cur, steps: cur.steps.map((s) => (s.id === e.id ? {...s, status: (e.status || 'active') as StepStatus, detail: e.detail ?? s.detail} : s))});
  } else if (e.type === 'log') {
    put(e.job, {...cur, log: [...cur.log.slice(-299), {at: e.at, level: e.level || 'info', text: e.text || ''}]});
  } else if (e.type === 'writing') {
    put(e.job, {...cur, chars: e.chars || 0, tail: e.tail || ''});
  } else if (e.type === 'usage') {
    put(e.job, {...cur, tokens: e.tokens ?? cur.tokens, fiveHour: e.windows?.fiveHour ?? cur.fiveHour, sevenDay: e.windows?.sevenDay ?? cur.sevenDay});
  } else if (e.type === 'end') {
    put(e.job, {
      ...cur,
      running: false,
      ok: !!e.ok,
      cancelled: !!e.cancelled,
      error: e.error,
      seconds: e.seconds,
      unused: e.unused,
      motion: e.motion,
      motionNeeded: e.motionNeeded,
      summary: e.summary,
      tokens: e.tokens ?? cur.tokens,
      // a step that was still going when it stopped is shown as interrupted
      steps: cur.steps.map((s) => (s.status === 'active' && !e.ok ? {...s, status: 'warn' as StepStatus} : s)),
    });
  }
};

const listen = () => {
  if (listening) return;
  listening = true;
  try {
    api().ai.onEvent(reduce);
  } catch {
    listening = false;
  }
};

export const dismissAiRun = (job: AiJob) => {
  const cur = runs[job];
  if (cur) put(job, {...cur, dismissed: true});
};

export const useAiRun = (job: AiJob): AiRunState | undefined => {
  listen();
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => runs[job],
  );
};
