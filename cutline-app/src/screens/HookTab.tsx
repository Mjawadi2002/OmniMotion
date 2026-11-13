import {Suspense, lazy, useEffect, useState} from 'react';
import {ArrowClockwise, Check, Copy, Lightning, Sparkle, Warning} from '@phosphor-icons/react';
import {api, type HookResult, type Job, type Project, type Settings} from '../lib/api';
import type {RunState} from '../lib/run';
import {useToast} from '../lib/util';
import {AiPanel} from './AiPanel';

const PlanPreview = lazy(() => import('./PlanPreview'));

const KIND_LABEL: Record<string, string> = {trim: 'Trim the start', graphic: 'Graphic', motion: 'Motion graphic', zoom: 'Zoom', text: 'On-screen text', sound: 'Sound', pace: 'Pace'};
const tone = (n: number) => (n >= 8 ? 'var(--ok)' : n >= 5 ? 'var(--accent)' : 'var(--bad, #ff4d4d)');

const ScoreRing = ({score}: {score: number}) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width={88} height={88} viewBox="0 0 88 88" role="img" aria-label={`Hook score ${score} out of 10`}>
      <circle cx={44} cy={44} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={8} />
      <circle cx={44} cy={44} r={r} fill="none" stroke={tone(score)} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${(c * score) / 10} ${c}`} transform="rotate(-90 44 44)" />
      <text x={44} y={50} textAnchor="middle" fontSize={24} fontWeight={800} fill="var(--text)">
        {Math.round(score * 10) / 10}
      </text>
      <text x={44} y={66} textAnchor="middle" fontSize={10} fill="var(--text-3)">
        / 10
      </text>
    </svg>
  );
};

// Hook lab: the first seconds judged like a short-form strategist would, with fixes applied in one click (through the Edit history, so they can be undone).
export const HookTab = ({project, job, run, reloadJob, settings}: {project: Project; job: Job | null; run: {state: RunState; start: (s: 'plan') => Promise<unknown>; cancel: () => void}; reloadJob: () => Promise<unknown>; settings: Settings | null}) => {
  const toast = useToast();
  const [hook, setHook] = useState<HookResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);
  const [applied, setApplied] = useState<Record<number, boolean>>({});
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  useEffect(() => {
    api().hook.read(project.id).then(setHook).catch(() => setHook(null));
  }, [project.id, job?.resolved]);
  useEffect(() => {
    if (job?.publicDir) api().media.dir(job.publicDir).then(setPublicUrl).catch(() => {});
  }, [job?.publicDir]);
  useEffect(() => {
    if (hook?.sheet) api().media.url(hook.sheet).then(setSheetUrl).catch(() => setSheetUrl(null));
  }, [hook?.sheet]);

  if (!job) return <div className="muted">Loading</div>;
  const aiOff = (settings?.aiProvider || 'claude-code') === 'off';
  if (!job.prepared || !job.resolved) {
    return (
      <div className="card empty">
        <h2>Build the preview first</h2>
        <p className="muted">The hook is judged as the viewer will see it: your words, the first graphics and the first frames. Make a plan and preview it, then come back.</p>
        <a className="btn primary" href={`#/project/${project.id}/plan`}>
          Go to Plan
        </a>
      </div>
    );
  }

  const analyze = async () => {
    setBusy(true);
    setApplied({});
    try {
      setHook(await api().hook.analyze(project.id));
      await reloadJob();
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const apply = async (i: number) => {
    if (!hook) return;
    const f = hook.fixes[i];
    setApplying(i);
    try {
      await api().plan.edit(project.id, f.instruction);
      setApplied((a) => ({...a, [i]: true}));
      toast('Applied. The preview is being rebuilt; you can undo it in Edit.');
      await run.start('plan');
      await reloadJob();
    } catch (e: any) {
      toast(e.message, 'bad');
    } finally {
      setApplying(null);
    }
  };
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast('Copied.');
    } catch {
      toast('Could not copy.', 'bad');
    }
  };

  const words = job.words || [];
  const first3 = words.filter((w) => w.startMs < 3000);
  const next = words.filter((w) => w.startMs >= 3000 && w.startMs < 6000);
  const running = busy || run.state.running || applying !== null;

  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div className="row between wrap">
        <div>
          <h2>Hook</h2>
          <p className="muted">The first three seconds decide whether people stay. Claude judges them as a short-form strategist would, then you apply the fixes you like.</p>
        </div>
        <button className="btn primary" disabled={running || aiOff} onClick={analyze} title={aiOff ? 'Switch AI on in Settings' : undefined}>
          {hook ? <ArrowClockwise size={18} aria-hidden /> : <Sparkle size={18} aria-hidden />} {busy ? 'Judging' : hook ? 'Judge again' : 'Judge my hook'}
        </button>
      </div>

      <AiPanel job="hook" onRetry={analyze} />

      {hook && hook.outdated ? (
        <div className="notice">
          <Warning size={18} aria-hidden style={{flex: 'none'}} />
          <span style={{flex: 1}}>The plan changed since this was judged. Judge again to see the new score.</span>
        </div>
      ) : null}

      <div className="hook-grid">
        <div className="stack" style={{gap: 'var(--sp-3)'}}>
          <div className="preview-frame hook-preview" style={{padding: 0}}>
            {publicUrl ? (
              <Suspense fallback={<span>Loading preview</span>}>
                <PlanPreview plan={job.resolved} publicUrl={publicUrl} captionStyle={project.settings?.captionStyle} captionColors={project.settings?.captionColors} platform={project.settings?.platform || 'all'} musicVolume={project.settings?.musicVolume ?? 0} />
              </Suspense>
            ) : null}
          </div>
          <section className="card pad stack" style={{gap: 'var(--sp-2)'}}>
            <span className="label-sm">The first 3 seconds</span>
            <p className="hook-words">
              <b>{first3.map((w) => w.text).join(' ') || '(silence)'}</b> <span className="muted">{next.map((w) => w.text).join(' ')}</span>
            </p>
            {sheetUrl ? <img className="hook-sheet" src={sheetUrl} alt="Frames at 0, 0.4, 0.9, 1.5, 2.2 and 3 seconds" /> : null}
          </section>
        </div>

        <div className="stack" style={{gap: 'var(--sp-4)'}}>
          {!hook ? (
            <div className="card empty">
              <Lightning size={28} aria-hidden />
              <h3>No verdict yet</h3>
              <p className="muted">Claude reads your first words, looks at the first frames and graphics, and scores how well they stop the scroll. Fixes come with it.</p>
            </div>
          ) : (
            <>
              <section className="card pad row" style={{gap: 'var(--sp-4)', alignItems: 'center'}}>
                <ScoreRing score={hook.score} />
                <div className="stack" style={{gap: 4, flex: 1}}>
                  <b style={{fontSize: 'var(--fs-lg)'}}>{hook.verdict}</b>
                  {hook.firstWords ? <span className="muted">“{hook.firstWords}”</span> : null}
                  <span className="faint" style={{fontSize: 'var(--fs-xs)'}}>
                    Judged {new Date(hook.at).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'})}
                  </span>
                </div>
              </section>

              <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
                {hook.criteria.map((c) => (
                  <div key={c.name} className="crit">
                    <div className="row between">
                      <span style={{fontWeight: 600}}>{c.name}</span>
                      <span className="mono">{c.score}/10</span>
                    </div>
                    <div className="bar" aria-hidden>
                      <i style={{width: `${c.score * 10}%`, background: tone(c.score)}} />
                    </div>
                    <span className="help">{c.note}</span>
                  </div>
                ))}
              </section>

              <div className="grid-2">
                <section className="card pad stack" style={{gap: 'var(--sp-2)'}}>
                  <span className="label-sm">What works</span>
                  {hook.works.length ? (
                    <ul className="hook-list ok">
                      {hook.works.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted">Nothing stands out yet.</span>
                  )}
                </section>
                <section className="card pad stack" style={{gap: 'var(--sp-2)'}}>
                  <span className="label-sm">What hurts</span>
                  {hook.hurts.length ? (
                    <ul className="hook-list bad">
                      {hook.hurts.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted">Nothing major.</span>
                  )}
                </section>
              </div>

              {hook.fixes.length ? (
                <section className="stack" style={{gap: 'var(--sp-2)'}}>
                  <h3>Fixes you can apply now</h3>
                  {hook.fixes.map((f, i) => (
                    <div key={i} className="card pad fix">
                      <div className="row between wrap" style={{gap: 'var(--sp-2)'}}>
                        <div className="row wrap" style={{gap: 'var(--sp-2)'}}>
                          <b>{f.title}</b>
                          <span className="chip">{KIND_LABEL[f.kind] || f.kind}</span>
                          {f.addsWords ? (
                            <span className="chip accent" title="This puts words on screen that you did not say">
                              Adds words you did not say
                            </span>
                          ) : null}
                        </div>
                        {applied[i] ? (
                          <span className="chip ok">
                            <Check size={12} weight="bold" aria-hidden /> Applied
                          </span>
                        ) : (
                          <button className="btn secondary sm" disabled={running || hook.outdated} onClick={() => apply(i)} title={hook.outdated ? 'Judge again first: the plan changed' : undefined}>
                            {applying === i ? 'Applying' : 'Apply'}
                          </button>
                        )}
                      </div>
                      <span className="help">{f.why}</span>
                      <details>
                        <summary className="faint" style={{cursor: 'pointer', fontSize: 'var(--fs-xs)'}}>
                          What the editor will be asked
                        </summary>
                        <p className="muted" style={{fontSize: 'var(--fs-sm)', marginTop: 4}}>
                          {f.instruction}
                        </p>
                      </details>
                    </div>
                  ))}
                  {Object.keys(applied).length ? (
                    <a className="help" href={`#/project/${project.id}/edit`}>
                      Every applied fix is in the Edit history, where it can be undone.
                    </a>
                  ) : null}
                </section>
              ) : null}

              {hook.rewrites.length ? (
                <section className="stack" style={{gap: 'var(--sp-2)'}}>
                  <h3>Stronger openings to record</h3>
                  <p className="help">These need your voice: record one and replace the start of the clip.</p>
                  {hook.rewrites.map((r, i) => (
                    <div key={i} className="card pad row between" style={{gap: 'var(--sp-3)', alignItems: 'flex-start'}}>
                      <div className="stack" style={{gap: 2, flex: 1}}>
                        <b dir="auto">“{r.line}”</b>
                        <span className="help">{r.why}</span>
                      </div>
                      <button className="btn ghost sm" onClick={() => copy(r.line)} aria-label="Copy this line">
                        <Copy size={14} aria-hidden /> Copy
                      </button>
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
