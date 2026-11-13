import {useCallback, useEffect, useRef, useState} from 'react';
import {api, type RunEvent} from './api';

export const STAGE_ORDER = ['transcribe', 'cut', 'assets', 'cutout', 'plan', 'render', 'mix'] as const;
export const STAGE_LABEL: Record<string, string> = {transcribe: 'Reading and transcribing', cut: 'Cutting silences', assets: 'Fetching assets', cutout: 'Cutting out the person', plan: 'Resolving the plan', render: 'Rendering frames', mix: 'Mixing audio to -14 LUFS'};

export interface RunState {
  running: boolean;
  step: string | null;
  runId: string | null;
  stage: string | null;
  seen: string[];
  pct: number;
  frames: number;
  log: string[];
  code: number | null;
  out?: string;
  loudness?: {lufs: number; peak: number};
  startedAt: number;
  tail: string[];
}

const idle: RunState = {running: false, step: null, runId: null, stage: null, seen: [], pct: 0, frames: 0, log: [], code: null, startedAt: 0, tail: []};

// one hook per project view: starts engine steps and follows their events
export const useRun = (projectId: string, onDone: (ev: RunEvent) => void) => {
  const [state, setState] = useState<RunState>(idle);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const off = api().run.onEvent((ev) => {
      if (ev.projectId !== projectId) return;
      setState((s) => {
        if (ev.type === 'log') return {...s, log: [...s.log.slice(-400), ev.line!]};
        if (ev.type === 'stage') return {...s, stage: ev.stage!, seen: s.seen.includes(ev.stage!) ? s.seen : [...s.seen, ev.stage!]};
        if (ev.type === 'progress') return ev.stage === 'render' ? {...s, pct: ev.pct!} : {...s, frames: ev.frames ?? s.frames};
        if (ev.type === 'loudness') return {...s, loudness: {lufs: ev.lufs!, peak: ev.peak!}};
        if (ev.type === 'done') return {...s, running: false, code: ev.code ?? -1, out: ev.out, tail: ev.tail || [], pct: ev.code === 0 ? 1 : s.pct};
        return s;
      });
      if (ev.type === 'done') done.current(ev);
    });
    // pick up a run that is still going when the view is reopened
    api().run.active().then((list) => {
      const r = list.find((x) => x.projectId === projectId);
      if (r) setState((s) => ({...s, running: true, runId: r.runId, step: r.step, stage: r.stage, startedAt: Date.now()}));
    });
    return off;
  }, [projectId]);

  const start = useCallback(
    async (step: 'prepare' | 'auto' | 'plan' | 'render', opts?: Record<string, unknown>) => {
      setState({...idle, running: true, step, startedAt: Date.now()});
      try {
        const r = await api().run.start(projectId, step, opts);
        setState((s) => ({...s, runId: r.runId}));
        return r;
      } catch (e: any) {
        setState((s) => ({...s, running: false, code: -1, tail: [String(e.message)]}));
        throw e;
      }
    },
    [projectId],
  );
  const cancel = useCallback(() => {
    if (state.runId) api().run.cancel(state.runId);
  }, [state.runId]);
  return {state, start, cancel};
};
