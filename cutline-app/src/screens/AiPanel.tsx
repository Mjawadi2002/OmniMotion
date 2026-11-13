import {useEffect, useRef, useState} from 'react';
import {ArrowClockwise, CheckCircle, Circle, Copy, MinusCircle, SpinnerGap, Stop, WarningCircle, X} from '@phosphor-icons/react';
import {api} from '../lib/api';
import {dismissAiRun, useAiRun, type AiJob, type StepStatus} from '../lib/aiRun';
import {useToast} from '../lib/util';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const useElapsed = (running: boolean, since: number) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return Math.max(0, Math.round((now - since) / 1000));
};

const DONE_TITLE: Record<AiJob, string> = {plan: 'Plan written', edit: 'Change made', look: 'Look designed', hook: 'Hook judged', analyze: 'Analysis ready'};

const StepIcon = ({status}: {status: StepStatus}) =>
  status === 'done' ? (
    <CheckCircle size={18} weight="fill" color="var(--ok)" aria-hidden />
  ) : status === 'active' ? (
    <SpinnerGap size={18} className="spin" aria-hidden />
  ) : status === 'warn' ? (
    <WarningCircle size={18} weight="fill" color="var(--accent)" aria-hidden />
  ) : status === 'skipped' ? (
    <MinusCircle size={18} aria-hidden />
  ) : (
    <Circle size={18} aria-hidden />
  );

const STEP_WORD: Record<StepStatus, string> = {pending: 'waiting', active: 'in progress', done: 'done', skipped: 'skipped', warn: 'needs attention'};

// Live view of what Claude is doing: the steps, a one-line "right now", what it is writing as it writes it, and a full log.
// compact: the version used inside the Edit chat (steps and the live line; the log opens on request).
export const AiPanel = ({job, compact = false, onRetry}: {job: AiJob; compact?: boolean; onRetry?: () => void}) => {
  const s = useAiRun(job);
  const toast = useToast();
  const [showLog, setShowLog] = useState(!compact);
  const logRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const elapsed = useElapsed(!!s?.running, s?.startedAt || Date.now());
  const logLen = s?.log.length || 0;

  useEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [logLen, showLog]);

  if (!s || s.dismissed) return null;

  const failed = !s.running && !s.ok && !s.cancelled;
  const last = s.log[s.log.length - 1];
  const rel = (at: number) => clock(Math.max(0, Math.round((at - s.startedAt) / 1000)));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s.log.map((l) => `${rel(l.at)}  ${l.text}`).join('\n'));
      toast('Log copied.');
    } catch {
      toast('Could not copy the log.', 'bad');
    }
  };
  const resets = (t?: number) => (t ? new Date(t * 1000).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'}) : '');

  return (
    <section className="card pad stack ai-panel" aria-live="polite" aria-label="What Claude is doing" data-compact={compact || undefined}>
      <div className="row between">
        <div className="row" style={{gap: 'var(--sp-3)'}}>
          {s.running ? <SpinnerGap size={20} className="spin" aria-hidden /> : s.ok ? <CheckCircle size={20} weight="fill" color="var(--ok)" aria-hidden /> : <WarningCircle size={20} weight="fill" color={s.cancelled ? 'var(--text-3)' : 'var(--accent)'} aria-hidden />}
          <h3>{s.running ? s.title : s.ok ? DONE_TITLE[job] : s.cancelled ? 'Stopped' : 'Claude hit a problem'}</h3>
        </div>
        <span className="row">
          <span className="mono muted">{clock(s.running ? elapsed : s.seconds ?? elapsed)}</span>
          {s.running ? (
            <button className="btn secondary sm" onClick={() => api().ai.cancel()}>
              <Stop size={14} aria-hidden /> Stop
            </button>
          ) : (
            <button className="btn ghost sm" onClick={() => dismissAiRun(job)} aria-label="Close this panel">
              <X size={14} aria-hidden />
            </button>
          )}
        </span>
      </div>

      <div className="stages">
        {s.steps.map((st) => (
          <div key={st.id} className="stage" data-s={st.status === 'warn' ? 'active' : st.status}>
            <StepIcon status={st.status} />
            <span>{st.label}</span>
            {st.detail ? <span className="mono muted ai-detail">{st.detail}</span> : null}
            <span className="sr-only">{STEP_WORD[st.status]}</span>
          </div>
        ))}
      </div>

      {s.running && last ? (
        <div className="ai-now" data-l={last.level}>
          <span className="mono faint">{rel(last.at)}</span>
          <span>{last.text}</span>
        </div>
      ) : null}

      {s.running && s.chars > 0 ? (
        <div className="ai-writing">
          <div className="row between">
            <span className="help">What Claude is writing right now</span>
            <span className="mono muted">{s.chars.toLocaleString()} characters</span>
          </div>
          <div className="ai-tail" aria-hidden>
            {s.tail}
          </div>
        </div>
      ) : null}

      {!s.running ? (
        <div className="row wrap">
          {s.tokens ? <span className="chip">{s.tokens >= 1000 ? `${(s.tokens / 1000).toFixed(1)}k` : s.tokens} tokens of your Claude plan</span> : null}
          {s.fiveHour ? (
            <span className="chip" title={`Resets at ${resets(s.fiveHour.resetsAt)}`}>
              Session {Math.round(s.fiveHour.utilization * 100)}% used{s.fiveHour.resetsAt ? `, resets ${resets(s.fiveHour.resetsAt)}` : ''}
            </span>
          ) : null}
          {s.ok && s.unused && s.unused.length === 0 && job === 'plan' ? <span className="chip ok">Every file placed</span> : null}
          {s.unused && s.unused.length ? <span className="chip bad">Not placed: {s.unused.join(', ')}</span> : null}
          {s.motion !== undefined && (s.motion > 0 || (s.motionNeeded || 0) > 0) ? <span className={`chip ${s.motion >= (s.motionNeeded || 0) ? 'ok' : 'bad'}`}>{s.motion} motion graphic{s.motion === 1 ? '' : 's'}{(s.motionNeeded || 0) > s.motion ? `, ${s.motionNeeded} expected` : ''}</span> : null}
        </div>
      ) : null}

      {failed ? (
        <div className="notice bad" role="alert">
          <WarningCircle size={18} aria-hidden style={{flex: 'none'}} />
          <div style={{flex: 1}}>
            <div>{s.error || 'Claude stopped without a message.'}</div>
            <div className="help" style={{marginTop: 4}}>The log below shows where it stopped.</div>
          </div>
          {onRetry ? (
            <button className="btn secondary sm" onClick={onRetry}>
              <ArrowClockwise size={14} aria-hidden /> Try again
            </button>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="row between">
          <button className="btn ghost sm" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
            {showLog ? 'Hide live log' : `Show live log (${logLen})`}
          </button>
          {showLog && logLen ? (
            <button className="btn ghost sm" onClick={copy}>
              <Copy size={14} aria-hidden /> Copy
            </button>
          ) : null}
        </div>
        {showLog ? (
          <div
            className="log ai-log"
            ref={logRef}
            tabIndex={0}
            aria-label="Claude's live log"
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }}
          >
            {logLen === 0 ? <span className="faint">Waiting for Claude to start</span> : null}
            {s.log.map((l, i) => (
              <div key={i} className="ai-line" data-l={l.level}>
                <span className="mono faint">{rel(l.at)}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};
