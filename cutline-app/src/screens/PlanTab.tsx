import {Suspense, lazy, useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import type {PlayerRef} from '@remotion/player';
import {CaretRight, MagicWand, Play, Plus, Sparkle, Trash} from '@phosphor-icons/react';
import {api, type Job, type Project, type Settings, type Word} from '../lib/api';
import {Dialog, fmtTime, isRtl, useToast} from '../lib/util';
import type {RunState} from '../lib/run';
import {KINDS, SLOTS, anchorFromWord, defaultModeFor, describeAnchor, finalizePlan, getPath, kindsFor, modesFor, newBeat, setPath, type Anchor, type Field} from '../lib/planModel';
import {RunPanel} from './RunPanel';
import {AiPanel} from './AiPanel';
import {StyleBar} from './StyleBar';
import {Timeline} from './Timeline';

const PlanPreview = lazy(() => import('./PlanPreview'));

// ---------------------------------------------------------------- word picker (click a spoken word to anchor a beat to it)
const WordPicker = ({words, onPick, onClose, title}: {words: Word[]; onPick: (idx: number) => void; onClose: () => void; title: string}) => {
  const lines: {start: number; ws: Word[]}[] = [];
  let cur: Word[] = [];
  let start = 0;
  words.forEach((w, i) => {
    if (!cur.length) start = i;
    cur.push(w);
    const nx = words[i + 1];
    if (/[.!?;؟]$/.test(w.text) || cur.length >= 12 || !nx) {
      lines.push({start, ws: cur});
      cur = [];
    }
  });
  return (
    <Dialog title={title} onClose={onClose} width={760}>
      <p className="help">Click the word the graphic should appear on.</p>
      <div className="card transcript" style={{maxHeight: 420}}>
        {lines.map((l) => {
          const t = l.ws.map((w) => w.text).join(' ');
          return (
            <div className="tline" key={l.start}>
              <span className="mono ts">{fmtTime(l.ws[0].startMs)}</span>
              <div className={`tx ${isRtl(t) ? 'rtl' : ''}`}>
                {l.ws.map((w, j) => (
                  <button key={j} className="w" onClick={() => (onPick(l.start + j), onClose())}>
                    {w.text}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
};

// ---------------------------------------------------------------- anchor field
const AnchorField = ({label, value, words, end, onChange}: {label: string; value: Anchor | undefined; words: Word[]; end?: boolean; onChange: (a: Anchor) => void}) => {
  const [picking, setPicking] = useState(false);
  const lead = value && typeof value === 'object' && 'at' in value ? value.lead ?? 0 : 0;
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="row" style={{gap: 'var(--sp-2)'}}>
        <button className="btn secondary sm" style={{flex: 1, justifyContent: 'flex-start', overflow: 'hidden'}} onClick={() => setPicking(true)} title="Pick a spoken word">
          <span style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>{describeAnchor(value)}</span>
        </button>
        {value && typeof value === 'object' && 'at' in value ? <input className="input sm num" style={{width: 84}} type="number" step={50} value={lead} aria-label={`${label} offset in milliseconds`} onChange={(e) => onChange({...value, lead: Number(e.target.value)})} /> : null}
      </div>
      <div className="row" style={{gap: 4}}>
        <button className="btn ghost sm" onClick={() => onChange('start')}>
          Start
        </button>
        <button className="btn ghost sm" onClick={() => onChange('end')}>
          End
        </button>
        {value && typeof value === 'object' && 'at' in value ? (
          <label className="check help">
            <input type="checkbox" checked={!!value.end} onChange={(e) => onChange({...value, end: e.target.checked})} /> end of word
          </label>
        ) : null}
      </div>
      {picking ? <WordPicker words={words} title={label} onClose={() => setPicking(false)} onPick={(i) => onChange(anchorFromWord(words, i, !!end))} /> : null}
    </div>
  );
};

// ---------------------------------------------------------------- generic fields
const Control = ({f, value, onChange, imageOptions}: {f: Field; value: any; onChange: (v: any) => void; imageOptions: string[]}) => {
  const id = useId();
  if (f.type === 'bool') {
    return (
      <label className="check">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.label}
      </label>
    );
  }
  if (f.type === 'select') {
    const opts = f.key === 'src' ? ['', ...imageOptions] : f.options || [];
    return (
      <div className="field">
        <label htmlFor={id}>{f.label}</label>
        <select id={id} className="select sm" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o || 'none'}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (f.type === 'number') {
    return (
      <div className="field">
        <label htmlFor={id}>{f.label}</label>
        <input id={id} className="input sm num" type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
      </div>
    );
  }
  if (f.type === 'list') {
    const rows: any[] = Array.isArray(value) ? value : [];
    const cols = f.cols || [];
    return (
      <div className="field wide">
        <span className="label">{f.label}</span>
        <div className="listed">
          {rows.map((r, i) => (
            <div key={i} className="li" style={{gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr)) auto`}}>
              {cols.map((c) =>
                c.type === 'select' ? (
                  <select key={c.key} className="select sm" aria-label={c.label} value={r[c.key] ?? ''} onChange={(e) => onChange(rows.map((x, j) => (j === i ? {...x, [c.key]: e.target.value} : x)))}>
                    {(c.options || []).map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input key={c.key} className="input sm" aria-label={c.label} placeholder={c.label} value={r[c.key] ?? ''} onChange={(e) => onChange(rows.map((x, j) => (j === i ? {...x, [c.key]: e.target.value} : x)))} />
                ),
              )}
              <button className="btn ghost icon sm" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <Trash size={14} aria-hidden />
              </button>
            </div>
          ))}
          <button className="btn secondary sm" style={{alignSelf: 'flex-start'}} onClick={() => onChange([...rows, Object.fromEntries(cols.map((c) => [c.key, c.type === 'select' ? c.options?.[0] ?? '' : '']))])}>
            <Plus size={14} aria-hidden /> Add row
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`field ${f.wide ? 'wide' : ''}`}>
      <label htmlFor={id}>{f.label}</label>
      <input id={id} className={`input sm ${isRtl(String(value || '')) ? 'rtl' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
};

// ---------------------------------------------------------------- beat card (a graphic)
const timeOf = (resolved: any, id: string) => {
  const g = resolved?.graphics?.find((x: any) => x.id === id);
  return g ? `${fmtTime(g.startMs)} to ${fmtTime(g.endMs)}` : 'not resolved yet';
};

const BeatCard = ({g, project, words, resolved, imageOptions, onChange, onRemove}: {g: any; project: Project; words: Word[]; resolved: any; imageOptions: string[]; onChange: (g: any) => void; onRemove: () => void}) => {
  const k = KINDS[g.kind];
  const known = !!k;
  return (
    <details className="card beat">
      <summary>
        <CaretRight size={14} aria-hidden />
        <span className="mono muted">{timeOf(resolved, g.id)}</span>
        <span style={{fontWeight: 600}}>
          {known ? k.label : g.kind}
          {g.content?.text ? <span className="muted" style={{fontWeight: 400}}>{`  ${String(g.content.text).slice(0, 36)}`}</span> : null}
        </span>
        <button className="btn ghost icon sm" aria-label={`Remove ${g.id}`} onClick={(e) => (e.preventDefault(), onRemove())}>
          <Trash size={16} aria-hidden />
        </button>
      </summary>
      <div className="editor">
        <AnchorField label="Appears at" value={g.from} words={words} onChange={(a) => onChange({...g, from: a})} />
        <AnchorField label="Leaves after" value={g.to} words={words} end onChange={(a) => onChange({...g, to: a})} />
        <div className="field">
          <label>Layout</label>
          <select className="select sm" value={g.mode || ''} onChange={(e) => onChange({...g, mode: e.target.value})}>
            {modesFor(project).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Position</label>
          <select className="select sm" value={g.slot || ''} onChange={(e) => onChange({...g, slot: e.target.value || undefined})}>
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {s || 'default window'}
              </option>
            ))}
          </select>
        </div>
        {known
          ? k.fields.map((f) => <Control key={f.key} f={f} imageOptions={imageOptions} value={getPath(g.content, f.key)} onChange={(v) => onChange({...g, content: setPath(g.content || {}, f.key, v)})} />)
          : (
            <p className="help wide">This graphic type is edited in the raw JSON view.</p>
          )}
        {['image', 'video', 'browser'].includes(g.kind) ? <Control f={{key: 'title', label: 'Address bar text', type: 'text'}} imageOptions={[]} value={g.title} onChange={(v) => onChange({...g, title: v})} /> : null}
      </div>
    </details>
  );
};

// ---------------------------------------------------------------- shot card (vlog)
const ShotCard = ({s, i, clips, words, onChange, onRemove}: {s: any; i: number; clips: NonNullable<Job['clips']>; words: Word[]; onChange: (s: any) => void; onRemove: () => void}) => {
  const clip = clips.find((c) => c.id === s.clip);
  return (
    <details className="card beat">
      <summary>
        <CaretRight size={14} aria-hidden />
        <span className="mono muted">#{i + 1}</span>
        <span style={{fontWeight: 600}}>
          {clip?.name || s.clip}
          <span className="muted" style={{fontWeight: 400}}>{`  from ${(Number(s.srcStartMs || 0) / 1000).toFixed(1)} s${s.speed && s.speed !== 1 ? `  at ${s.speed}x` : ''}`}</span>
        </span>
        <button className="btn ghost icon sm" aria-label={`Remove shot ${i + 1}`} onClick={(e) => (e.preventDefault(), onRemove())}>
          <Trash size={16} aria-hidden />
        </button>
      </summary>
      <div className="editor">
        <AnchorField label="Shot starts at" value={s.from} words={words} onChange={(a) => onChange({...s, from: a})} />
        <div className="field">
          <label>Clip</label>
          <select className="select sm" value={s.clip} onChange={(e) => onChange({...s, clip: e.target.value})}>
            {clips.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Start inside the clip</label>
          <select className="select sm" value={String(s.srcStartMs ?? '')} onChange={(e) => onChange({...s, srcStartMs: Number(e.target.value)})}>
            {(clip?.sampleTimesMs || []).map((t) => (
              <option key={t} value={t}>
                {(t / 1000).toFixed(1)} s
              </option>
            ))}
            {s.srcStartMs !== undefined && !(clip?.sampleTimesMs || []).includes(s.srcStartMs) ? <option value={s.srcStartMs}>{(s.srcStartMs / 1000).toFixed(1)} s</option> : null}
          </select>
        </div>
        <div className="field">
          <label>Speed</label>
          <input className="input sm num" type="number" step="0.1" min="0.5" max="2" value={s.speed ?? 1} onChange={(e) => onChange({...s, speed: Number(e.target.value) || 1})} />
        </div>
        <div className="field">
          <label>Transition in</label>
          <select className="select sm" value={s.fx || ''} onChange={(e) => onChange({...s, fx: e.target.value || undefined})}>
            {['', 'cut', 'zoom', 'whip', 'flash', 'glitch', 'punch', 'zoomthrough', 'slide'].map((o) => (
              <option key={o} value={o}>
                {o || 'crossfade'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Fit</label>
          <select className="select sm" value={s.fit || 'cover'} onChange={(e) => onChange({...s, fit: e.target.value})}>
            <option value="cover">Fill the frame</option>
            <option value="blur">Whole picture over a blurred copy</option>
          </select>
        </div>
      </div>
    </details>
  );
};

// ---------------------------------------------------------------- the tab
const BRIEF_IDEAS = ['Open with a strong hook.', 'Use 3D motion graphics.', 'Keep it minimal and calm.', 'Fast pace, many graphics.', 'End with a call to action.'];

export const PlanTab = ({project, job, run, reloadJob, settings, persist}: {persist?: (p: Project) => Promise<unknown>; project: Project; job: Job | null; run: {state: RunState; start: (s: 'auto' | 'plan') => Promise<unknown>; cancel: () => void}; reloadJob: () => Promise<unknown>; settings: Settings | null}) => {
  const toast = useToast();
  const words = job?.words || [];
  const [plan, setPlan] = useState<any>(null);
  const savedJson = useRef('');
  const [dirty, setDirty] = useState(false);
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const [kind, setKind] = useState(kindsFor(project)[0]);
  const [aiBusy, setAiBusy] = useState(false);
  const [brief, setBrief] = useState(project.settings?.planBrief || '');
  const [showZones, setShowZones] = useState(false);
  const [liveVol, setLiveVol] = useState<number | null>(null); // the music volume while the slider is being dragged (saved on release)
  // the preview's player, shared with the timeline: the playhead follows playback, a click on the timeline moves the preview
  const playerRef = useRef<PlayerRef | null>(null);
  const [frame, setFrame] = useState<number | null>(null);
  const onFrame = useCallback((f: number) => setFrame(f), []);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  useEffect(() => {
    if (job?.publicDir) api().media.dir(job.publicDir).then(setPublicUrl).catch(() => {});
  }, [job?.publicDir]);

  useEffect(() => {
    if (plan || !job) return;
    const base = job.plan || job.autoPlan || {defaultMode: defaultModeFor(project), graphics: []};
    savedJson.current = JSON.stringify(base);
    setPlan(base);
  }, [job, plan, project]);
  // an automatic plan finished: show it
  useEffect(() => {
    if (!run.state.running && run.state.step === 'auto' && run.state.code === 0 && job?.autoPlan && !job.plan) {
      savedJson.current = JSON.stringify(job.autoPlan);
      setPlan(job.autoPlan);
    }
  }, [run.state.running, run.state.step, run.state.code, job]);

  const imageOptions = useMemo(() => {
    const base = (n: string) => n.replace(/\.[^.]+$/, '');
    const fromMedia = project.media.filter((m) => m.kind === 'image' || (m.kind === 'video' && m.role === 'broll')).map((m) => base(m.name));
    const fromAssets = (job?.assets || []).filter((a) => a.file).map((a) => a.id);
    return [...new Set([...fromMedia, ...fromAssets])];
  }, [project.media, job?.assets]);

  if (!job) return <div className="muted">Loading</div>;
  if (!job.prepared) {
    return (
      <div className="card empty">
        <h2>Prepare the story first</h2>
        <p className="muted">The plan is written from your transcript. Run the Story step, then come back.</p>
        <a className="btn primary" href={`#/project/${project.id}/story`}>
          Go to Story
        </a>
      </div>
    );
  }
  if (!plan) return null;

  const update = (p: any) => {
    setPlan(p);
    setDirty(JSON.stringify(p) !== savedJson.current);
  };
  const graphics: any[] = plan.graphics || [];
  const titles: any[] = plan.titles || [];
  const shots: any[] = plan.shots || [];
  const vlog = project.mode === 'vlog';
  const aiOff = (settings?.aiProvider || 'claude-code') === 'off';

  const savePlan = async () => {
    await api().plan.save(project.id, finalizePlan(plan, words));
    savedJson.current = JSON.stringify(plan);
    setDirty(false);
  };
  const preview = async () => {
    try {
      await savePlan();
      await run.start('plan');
    } catch (e: any) {
      toast(e.message, 'bad');
    }
  };
  const withClaude = async () => {
    setAiBusy(true);
    try {
      if (persist && brief !== (project.settings?.planBrief || '')) await persist({...project, settings: {...project.settings, planBrief: brief}});
      const {_unused, ...p} = await api().plan.ai(project.id, brief.trim() || undefined);
      setPlan(p);
      savedJson.current = JSON.stringify(p);
      setDirty(false);
      await reloadJob();
      if (_unused && _unused.length) toast(`Claude wrote a plan, but did not place: ${_unused.join(', ')}. Add them from the list, or ask Claude in Edit to place them.`, 'bad');
      else toast('Claude wrote a plan from your transcript, using every file you attached. Review it, then preview.');
    } catch (e: any) {
      // a plan the user stopped is not an error; real failures are explained in the panel above
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setAiBusy(false);
    }
  };
  const addAt = (idx: number) => {
    const from = anchorFromWord(words, idx, false, -250);
    const to = anchorFromWord(words, idx, true, 1400);
    update({...plan, graphics: [...graphics, newBeat(project, kind, from, to, graphics)]});
  };
  const toRaw = () => {
    setRawText(JSON.stringify(plan, null, 2));
    setRaw(true);
  };
  const fromRaw = () => {
    try {
      setPlan(JSON.parse(rawText));
      setDirty(true);
      setRaw(false);
    } catch (e: any) {
      toast(`That is not valid JSON: ${e.message}`, 'bad');
    }
  };

  const resolved = job.resolved;
  const stale = dirty;
  // where the style to recreate comes from: the references attached to the project and a look studied from a reference
  const refNames = (project.media || []).filter((m) => m.role === 'reference').map((m) => m.name);
  const styleSource = [refNames.length ? (refNames.length === 1 ? `your reference ${refNames[0]}` : `your ${refNames.length} references`) : '', project.look && !['tech', 'light'].includes(project.look) ? 'your look' : ''].filter(Boolean).join(' and ');
  const running = run.state.running || aiBusy;

  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div className="row between wrap">
        <div>
          <h2>Plan</h2>
          <p className="muted">Every graphic is anchored to a word you say, so the plan survives cuts. On-screen text must come from your speech or your files.</p>
        </div>
        <div className="row wrap">
          {dirty ? <span className="chip accent">Unsaved changes</span> : null}
          <button className="btn secondary" disabled={running} onClick={() => run.start('auto')}>
            <MagicWand size={18} aria-hidden /> Automatic plan
          </button>
          <button className="btn primary" disabled={running} onClick={preview}>
            <Play size={18} aria-hidden /> Save and preview
          </button>
        </div>
      </div>

      <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
        <div className="row between wrap">
          <div>
            <h3>Direct the edit</h3>
            <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>
              Optional. Tell Claude what you want, in your own words. {styleSource ? <>It will also recreate the style of {styleSource}.</> : <>Attach a reference video in Media, or pick a look made from a reference, and Claude recreates its style.</>}
            </p>
          </div>
        </div>
        <textarea className="input" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="For example: start with a big hook on the first sentence, use the coin animation when I talk about money, keep it calm, end with a call to action." aria-label="Direction for the edit (optional)" disabled={running} />
        <div className="row wrap" style={{gap: 'var(--sp-2)'}}>
          {BRIEF_IDEAS.map((idea) => (
            <button key={idea} className="btn ghost sm" disabled={running} onClick={() => setBrief((b) => (b.trim() ? `${b.trim()} ${idea}` : idea))}>
              + {idea}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" disabled={running || aiOff} onClick={withClaude} title={aiOff ? 'Switch AI planning on in Settings' : undefined}>
            <Sparkle size={18} aria-hidden /> {aiBusy ? 'Claude is planning' : brief.trim() ? 'Plan with Claude, following this' : 'Plan with Claude'}
          </button>
          {brief ? (
            <button className="btn ghost sm" disabled={running} onClick={() => setBrief('')}>
              Clear
            </button>
          ) : null}
        </div>
      </section>

      <AiPanel job="plan" onRetry={withClaude} />

      {run.state.step === 'auto' || run.state.step === 'plan' ? <RunPanel run={run.state} onCancel={run.cancel} /> : null}

      {!vlog && words.length ? (
        <Timeline
          plan={plan}
          onChange={update}
          resolved={resolved}
          words={words}
          durationMs={resolved?.durationMs || words[words.length - 1].endMs + 500}
          playheadMs={resolved && !stale && frame !== null ? (frame / (resolved.fps || 30)) * 1000 : null}
          onSeek={resolved && !stale ? (ms) => playerRef.current?.seekTo(Math.round((ms / 1000) * (resolved.fps || 30))) : undefined}
        />
      ) : null}

      <div className="plan-grid">
        <div className="stack">
          {raw ? (
            <div className="stack">
              <textarea className="textarea" rows={26} value={rawText} onChange={(e) => setRawText(e.target.value)} spellCheck={false} aria-label="Plan JSON" />
              <div className="row">
                <button className="btn primary" onClick={fromRaw}>
                  Apply JSON
                </button>
                <button className="btn ghost" onClick={() => setRaw(false)}>
                  Back to the editor
                </button>
              </div>
            </div>
          ) : (
            <>
              {vlog ? (
                <section className="stack">
                  <div className="row between">
                    <h3>Shots ({shots.length || resolved?.shots?.length || 0})</h3>
                    {!shots.length && resolved?.shots?.length ? (
                      <button
                        className="btn secondary sm"
                        onClick={() =>
                          update({
                            ...plan,
                            shots: resolved.shots.map((s: any) => ({clip: s.clipId, from: {ms: s.startMs}, srcStartMs: s.srcStartMs, speed: s.speed, fx: s.fx, fit: s.fit})),
                          })
                        }
                      >
                        Edit the automatic cuts
                      </button>
                    ) : null}
                  </div>
                  {!shots.length ? <div className="notice">Shots are cut automatically every 2 to 3.5 s, clips in the order you filmed them. Ask Claude to plan, or edit the automatic cuts to take control.</div> : null}
                  {shots.map((s, i) => (
                    <ShotCard key={i} s={s} i={i} clips={job.clips || []} words={words} onChange={(n) => update({...plan, shots: shots.map((x, j) => (j === i ? n : x))})} onRemove={() => update({...plan, shots: shots.filter((_, j) => j !== i)})} />
                  ))}
                </section>
              ) : null}

              {!vlog && project.style === 'light' ? (
                <section className="stack">
                  <h3>Titles ({titles.length})</h3>
                  <p className="help">Titles are added automatically for every stretch of speech, so the top of the frame is never empty. Edit or add your own here.</p>
                  {titles.map((t, i) => (
                    <details key={i} className="card beat">
                      <summary>
                        <CaretRight size={14} aria-hidden />
                        <span className="mono muted">{resolved?.titles?.[i] ? `${fmtTime(resolved.titles[i].startMs)}` : ''}</span>
                        <span style={{fontWeight: 600}}>
                          {t.line1} <span className="muted" style={{fontWeight: 400}}>{t.highlight}</span>
                        </span>
                        <button className="btn ghost icon sm" aria-label="Remove title" onClick={(e) => (e.preventDefault(), update({...plan, titles: titles.filter((_, j) => j !== i)}))}>
                          <Trash size={16} aria-hidden />
                        </button>
                      </summary>
                      <div className="editor">
                        <AnchorField label="Appears at" value={t.from} words={words} onChange={(a) => update({...plan, titles: titles.map((x, j) => (j === i ? {...x, from: a} : x))})} />
                        <AnchorField label="Leaves after" value={t.to} words={words} end onChange={(a) => update({...plan, titles: titles.map((x, j) => (j === i ? {...x, to: a} : x))})} />
                        <Control f={{key: 'line1', label: 'First line', type: 'text'}} imageOptions={[]} value={t.line1} onChange={(v) => update({...plan, titles: titles.map((x, j) => (j === i ? {...x, line1: v} : x))})} />
                        <Control f={{key: 'highlight', label: 'Highlighted word', type: 'text'}} imageOptions={[]} value={t.highlight} onChange={(v) => update({...plan, titles: titles.map((x, j) => (j === i ? {...x, highlight: v} : x))})} />
                      </div>
                    </details>
                  ))}
                </section>
              ) : null}

              <section className="stack">
                <div className="row between wrap">
                  <h3>Graphics ({graphics.length})</h3>
                  <div className="row">
                    <select className="select sm" style={{width: 190}} aria-label="Graphic type to add" value={kind} onChange={(e) => setKind(e.target.value)}>
                      {kindsFor(project).map((k) => (
                        <option key={k} value={k}>
                          {KINDS[k].label}
                        </option>
                      ))}
                    </select>
                    <button className="btn secondary sm" onClick={() => setPicking('add')}>
                      <Plus size={14} aria-hidden /> Add at a word
                    </button>
                  </div>
                </div>
                <p className="help">{KINDS[kind]?.hint}</p>
                {graphics.length === 0 ? <div className="notice">No graphics yet. Run the automatic plan, ask Claude, or add one at a word you say.</div> : null}
                {graphics.map((g, i) => (
                  <BeatCard key={g.id || i} g={g} project={project} words={words} resolved={resolved} imageOptions={imageOptions} onChange={(n) => update({...plan, graphics: graphics.map((x, j) => (j === i ? n : x))})} onRemove={() => update({...plan, graphics: graphics.filter((_, j) => j !== i)})} />
                ))}
              </section>
              <div>
                <button className="btn ghost sm" onClick={toRaw}>
                  <MagicWand size={14} aria-hidden /> Edit as JSON
                </button>
              </div>
            </>
          )}
        </div>

        <div className="preview-box">
          <div className="preview-frame" style={resolved ? {padding: 0} : undefined}>
            {resolved && !stale && publicUrl ? (
              <Suspense fallback={<span>Loading preview</span>}>
                <PlanPreview plan={resolved} publicUrl={publicUrl} captionStyle={project.settings?.captionStyle} captionColors={project.settings?.captionColors} platform={project.settings?.platform || 'all'} musicVolume={liveVol ?? project.settings?.musicVolume ?? 0} showZones={showZones} playerRef={playerRef} onFrame={onFrame} />
              </Suspense>
            ) : (
              <span>{stale ? 'The plan changed. Save and preview to update the picture.' : 'Save and preview to see the edit here.'}</span>
            )}
          </div>
          <p className="help">The preview plays the same composition that is rendered. Fonts, grade and transitions match; the final render also mixes loudness.</p>
          <StyleBar project={project} persist={persist} showZones={showZones} onShowZones={setShowZones} hasMusic={!!resolved?.musicEnabled} musicNeedsRebuild={!!resolved?.musicBalanced && resolved?.musicHeadroomDb === undefined} musicVolume={liveVol ?? undefined} onMusicVolume={setLiveVol} />
        </div>
      </div>
      {picking ? <WordPicker words={words} title="Add a graphic at a word" onClose={() => setPicking(null)} onPick={addAt} /> : null}
    </div>
  );
};
