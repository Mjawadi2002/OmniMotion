import {Suspense, lazy, useCallback, useEffect, useRef, useState} from 'react';
import {ArrowCounterClockwise, PaperPlaneRight, Sparkle, SpinnerGap} from '@phosphor-icons/react';
import {api, type Job, type PlanChange, type Project, type Settings} from '../lib/api';
import {fmtTime, useToast} from '../lib/util';
import type {RunState} from '../lib/run';
import {RunPanel} from './RunPanel';
import {StyleBar} from './StyleBar';
import {AiPanel} from './AiPanel';

const PlanPreview = lazy(() => import('./PlanPreview'));

const EXAMPLES = {
  talking: ['Make the first word slam appear a bit earlier', 'Remove the last graphic', 'Zoom in when I say "Greece"', 'Fix the caption: the word at 12 should be "Parthenon"', 'Add a quote card with the line I say about calm'],
  vlog: ['Use the second clip for the first sentence', 'Make every cut a crossfade', 'Add a small tag "Morning" at the start', 'Slow the third shot down a little', 'Remove the whip transitions'],
};

export const EditTab = ({project, job, run, reloadJob, settings, persist}: {persist?: (p: Project) => Promise<unknown>; project: Project; job: Job | null; run: {state: RunState; start: (s: 'plan') => Promise<unknown>; cancel: () => void}; reloadJob: () => Promise<unknown>; settings: Settings | null}) => {
  const toast = useToast();
  const [history, setHistory] = useState<PlanChange[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'asking' | 'building' | null>(null);
  const [showZones, setShowZones] = useState(false);
  const [liveVol, setLiveVol] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const off = (settings?.aiProvider || 'claude-code') === 'off';

  const loadHistory = useCallback(() => api().plan.history(project.id).then(setHistory).catch(() => {}), [project.id]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);
  useEffect(() => {
    if (job?.publicDir) api().media.dir(job.publicDir).then(setPublicUrl).catch(() => {});
  }, [job?.publicDir]);
  useEffect(() => {
    endRef.current?.scrollIntoView({block: 'end'});
  }, [history, busy, error]);
  // the preview rebuild after a change finished
  useEffect(() => {
    if (busy === 'building' && !run.state.running && run.state.step === 'plan') {
      setBusy(null);
      loadHistory();
      if (run.state.code !== 0) setError('The plan changed, but the preview could not be rebuilt. Open Plan and check the log.');
    }
  }, [busy, run.state.running, run.state.step, run.state.code, loadHistory]);

  if (!job?.prepared) {
    return (
      <div className="card empty">
        <h2>Prepare the story first</h2>
        <p className="muted">Edit mode changes the plan, which is built from your transcript.</p>
        <a className="btn primary" href={`#/project/${project.id}/story`}>
          Go to Story
        </a>
      </div>
    );
  }

  const send = async (instruction: string) => {
    const t = instruction.trim();
    if (!t || busy) return;
    setError(null);
    setText('');
    setBusy('asking');
    try {
      await api().plan.edit(project.id, t);
      await loadHistory();
      setBusy('building');
      await run.start('plan');
    } catch (e: any) {
      setBusy(null);
      setError(e.message);
      toast(e.message, 'bad');
    }
  };
  const undo = async (n: number) => {
    setError(null);
    setBusy('building');
    try {
      await api().plan.restore(project.id, n);
      await loadHistory();
      await run.start('plan');
    } catch (e: any) {
      setBusy(null);
      setError(e.message);
    }
  };

  const latestLive = [...history].reverse().find((h) => !h.undone)?.n;
  const resolved = job.resolved;
  const stale = busy !== null;
  const outdated = !busy && !run.state.running && job.stale;

  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div className="row between wrap">
        <div>
          <h2>Edit</h2>
          <p className="muted">Type what you want changed, in your own words. OmniMotion updates the edit and the preview; every change can be undone.</p>
        </div>
        <a className="btn primary" href={`#/project/${project.id}/render`}>
          Render this version
        </a>
      </div>

      <div className="edit-grid">
        <div className="preview-box" style={{position: 'static'}}>
          <div className="preview-frame" style={resolved ? {padding: 0, position: 'relative'} : undefined}>
            {resolved && publicUrl ? (
              <Suspense fallback={<span>Loading preview</span>}>
                <PlanPreview plan={resolved} publicUrl={publicUrl} captionStyle={project.settings?.captionStyle} captionColors={project.settings?.captionColors} platform={project.settings?.platform || 'all'} musicVolume={liveVol ?? project.settings?.musicVolume ?? 0} showZones={showZones} />
              </Suspense>
            ) : (
              <div className="stack" style={{alignItems: 'center'}}>
                <span>No preview yet.</span>
                <button className="btn secondary" onClick={() => run.start('plan')} disabled={run.state.running}>
                  Build the preview
                </button>
              </div>
            )}
            {stale && resolved ? (
              <div className="preview-veil" role="status">
                <SpinnerGap size={22} className="spin" aria-hidden /> {busy === 'asking' ? 'Claude is making the change' : 'Updating the preview'}
              </div>
            ) : null}
          </div>
          <StyleBar project={project} persist={persist} showZones={showZones} onShowZones={setShowZones} hasMusic={!!resolved?.musicEnabled} musicNeedsRebuild={!!resolved?.musicBalanced && resolved?.musicHeadroomDb === undefined} musicVolume={liveVol ?? undefined} onMusicVolume={setLiveVol} />
        </div>

        <div className="chat card">
          {outdated ? (
            <div className="notice" style={{margin: 'var(--sp-4) var(--sp-4) 0'}}>
              <span style={{flex: 1}}>The preview is older than your latest change.</span>
              <button className="btn secondary sm" onClick={() => run.start('plan')}>
                Update preview
              </button>
            </div>
          ) : null}
          <div className="msgs" aria-live="polite">
            {history.length === 0 && !busy ? (
              <div className="stack" style={{gap: 'var(--sp-3)'}}>
                <p className="muted">Try one of these, or write your own:</p>
                <div className="row wrap" style={{gap: 'var(--sp-2)'}}>
                  {EXAMPLES[project.mode].map((ex) => (
                    <button key={ex} className="chip example" onClick={() => setText(ex)}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {history.map((h) => (
              <div key={h.n} className="stack" style={{gap: 'var(--sp-2)', opacity: h.undone ? 0.5 : 1}}>
                <div className="msg user">{h.instruction}</div>
                <div className="msg ai">
                  <Sparkle size={16} aria-hidden style={{flex: 'none', marginTop: 3}} />
                  <div style={{flex: 1}}>
                    <div>{h.summary}</div>
                    <div className="row" style={{marginTop: 6}}>
                      <span className="faint mono">{new Date(h.at).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'})}</span>
                      {h.tokens ? <span className="faint" style={{fontSize: 'var(--fs-xs)'}}>{Math.max(1, Math.round(h.tokens / 1000))}k tokens of your Claude plan</span> : null}
                      {h.undone ? <span className="chip">Undone</span> : h.n === latestLive ? (
                        <button className="btn ghost sm" disabled={!!busy} onClick={() => undo(h.n)}>
                          <ArrowCounterClockwise size={14} aria-hidden /> Undo
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {busy === 'asking' ? <AiPanel job="edit" compact /> : null}
            {busy === 'building' ? (
              <div className="msg ai">
                <SpinnerGap size={16} className="spin" aria-hidden style={{flex: 'none', marginTop: 3}} />
                <span className="muted">Rebuilding the preview</span>
              </div>
            ) : null}
            {error ? <div className="notice bad">{error}</div> : null}
            <div ref={endRef} />
          </div>

          {run.state.step === 'plan' && (run.state.running || run.state.code) ? <RunPanel run={run.state} onCancel={run.cancel} /> : null}

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <label htmlFor="edit-prompt" className="sr-only">
              What should change
            </label>
            <textarea
              id="edit-prompt"
              className="textarea composer-input"
              rows={3}
              value={text}
              placeholder={off ? 'AI editing is off. Turn it on in Settings.' : 'For example: remove the last graphic, or make the quote appear when I say "failing"'}
              disabled={off || !!busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
            />
            <div className="row between">
              <span className="help">Enter to send, Shift+Enter for a new line. Time shown in the preview: 0:00 to {fmtTime(job.resolved?.durationMs || 0)}</span>
              <button className="btn primary" type="submit" disabled={!text.trim() || off || !!busy}>
                <PaperPlaneRight size={16} aria-hidden /> Apply
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
