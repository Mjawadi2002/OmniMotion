import {useEffect, useRef, useState} from 'react';
import {CheckCircle, Circle, SpinnerGap, Stop, WarningCircle} from '@phosphor-icons/react';
import {STAGE_LABEL, STAGE_ORDER, type RunState} from '../lib/run';

const useElapsed = (running: boolean, since: number) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const s = Math.max(0, Math.round((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// stages shown for each engine step
const SHOW: Record<string, string[]> = {
  prepare: ['transcribe', 'cut'],
  auto: ['plan'],
  plan: ['assets', 'plan'],
  render: ['assets', 'cutout', 'plan', 'render', 'mix'],
};

export const RunPanel = ({run, onCancel}: {run: RunState; onCancel: () => void}) => {
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsed(run.running, run.startedAt);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [run.log, showLog]);
  if (!run.step) return null;
  const shown = (SHOW[run.step] || []).filter((s) => run.seen.includes(s) || ['transcribe', 'cut', 'plan', 'render', 'mix'].includes(s));
  const activeIdx = run.stage ? STAGE_ORDER.indexOf(run.stage as any) : -1;
  const failed = !run.running && run.code !== null && run.code !== 0;
  return (
    <div className="card pad stack" aria-live="polite">
      <div className="row between">
        <h3>{run.running ? 'Working' : failed ? 'The run stopped' : 'Finished'}</h3>
        <span className="row">
          <span className="mono muted">{elapsed}</span>
          {run.running ? (
            <button className="btn secondary sm" onClick={onCancel}>
              <Stop size={14} aria-hidden /> Cancel
            </button>
          ) : null}
        </span>
      </div>
      <div className="stages">
        {shown.map((s) => {
          const idx = STAGE_ORDER.indexOf(s as any);
          const state = failed && run.stage === s ? 'bad' : !run.running && !failed ? (run.seen.includes(s) || idx < activeIdx ? 'done' : 'skip') : idx < activeIdx || (run.seen.includes(s) && run.stage !== s) ? 'done' : run.stage === s ? 'active' : 'pending';
          return (
            <div key={s} className="stage" data-s={state}>
              {state === 'done' ? <CheckCircle size={18} weight="fill" color="var(--ok)" aria-hidden /> : state === 'active' ? <SpinnerGap size={18} className="spin" aria-hidden /> : state === 'bad' ? <WarningCircle size={18} color="var(--danger)" aria-hidden /> : <Circle size={18} aria-hidden />}
              <span>{STAGE_LABEL[s]}</span>
              {s === 'render' && run.stage === 'render' ? <span className="mono muted">{Math.round(run.pct * 100)}%</span> : null}
              {s === 'cutout' && run.stage === 'cutout' && run.frames ? <span className="mono muted">{run.frames} frames</span> : null}
              <span className="sr-only">{state}</span>
            </div>
          );
        })}
      </div>
      {run.step === 'render' ? (
        <div className="bar" role="progressbar" aria-valuenow={Math.round(run.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Render progress">
          <i style={{width: `${run.pct * 100}%`}} />
        </div>
      ) : null}
      {failed ? (
        <div className="notice bad">
          <WarningCircle size={18} aria-hidden style={{flex: 'none'}} />
          <div>
            <div>{run.tail.filter(Boolean).slice(-3).join(' ') || 'The engine stopped without a message.'}</div>
            <div className="help" style={{marginTop: 4}}>Open the log below for the full output. You can run the step again after fixing the cause.</div>
          </div>
        </div>
      ) : null}
      {run.loudness ? (
        <div className="row wrap">
          <span className="chip ok">{run.loudness.lufs.toFixed(1)} LUFS</span>
          <span className="chip ok">{run.loudness.peak.toFixed(1)} dBTP peak</span>
        </div>
      ) : null}
      <div>
        <button className="btn ghost sm" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
          {showLog ? 'Hide log' : 'Show log'}
        </button>
        {showLog ? (
          <div className="log" ref={logRef} tabIndex={0} aria-label="Engine log">
            {run.log.join('\n')}
          </div>
        ) : null}
      </div>
    </div>
  );
};
