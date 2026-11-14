// Agent build: Claude rebuilds a reference's whole edit on this footage and checks its own frames. The result is a live preview
// (a sandboxed page: Claude's code never runs inside the app), changed in plain words in Edit (with undo) and rendered in Render.
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowCounterClockwise, FilmReel, FolderOpen, PaperPlaneRight, Robot} from '@phosphor-icons/react';
import {api, type AgentBeat, type Job, type Project, type Reference, type Settings} from '../lib/api';
import {BeatsTimeline} from './BeatsTimeline';
import {useToast} from '../lib/util';
import {AiPanel} from './AiPanel';

export type AgentView = {previewUrl: string; history: {n: number; instruction: string; summary: string; undone: boolean; at: number}[]; built: number; check?: {rounds: number; clean: boolean; interrupted: string | null; canContinue: boolean} | null};

export const useAgentView = (projectId: string) => {
  const [view, setView] = useState<AgentView | null>(null);
  const reload = useCallback(() => api().agent.state(projectId).then(setView).catch(() => setView(null)), [projectId]);
  useEffect(() => {
    reload();
  }, [reload]);
  return {view, setView, reload};
};

// the live preview: its own page in a sandboxed frame (scripts only, no access to the app or its files).
// The page reports "ready" or what broke through postMessage, the only channel out of the sandbox.
export const AgentPreview = ({url, width = 360, aspect = '9 / 16', onFrame, seekRef}: {url: string; width?: number; aspect?: string; onFrame?: (ms: number) => void; seekRef?: {current: ((ms: number) => void) | null}}) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<{type: 'loading' | 'ready' | 'error'; message?: string}>({type: 'loading'});
  useEffect(() => {
    setStatus({type: 'loading'});
    const onMsg = (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data || {};
      if (d.source !== 'omnimotion-agent-preview') return;
      if (d.type === 'ready') setStatus((s) => (s.type === 'error' ? s : {type: 'ready'}));
      if (d.type === 'frame' && onFrame) onFrame(Number(d.message) || 0);
      if (d.type === 'error') {
        console.error('[agent preview]', d.message);
        setStatus({type: 'error', message: d.message});
      }
    };
    window.addEventListener('message', onMsg);
    if (seekRef) seekRef.current = (ms: number) => ref.current?.contentWindow?.postMessage({source: 'omnimotion-app', type: 'seek', ms}, '*');
    return () => window.removeEventListener('message', onMsg);
  }, [url, onFrame]);
  return (
    <div className="stack" style={{gap: 6, width, maxWidth: '100%'}}>
      <iframe ref={ref} title="Agent build preview" src={url} sandbox="allow-scripts" style={{width: '100%', aspectRatio: aspect, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: '#05070f', display: 'block'}} />
      {status.type === 'error' ? <div className="notice bad">The preview stopped: {status.message}. Describe the problem in Edit and Claude will fix it.</div> : null}
    </div>
  );
};

export const AgentBuild = ({project, job, settings, busy, persist}: {project: Project; job: Job; settings: Settings | null; busy: boolean; persist?: (p: Project) => Promise<unknown>}) => {
  const toast = useToast();
  const projectRefs = (project.media || []).filter((m) => m.role === 'reference' && m.kind === 'video');
  const [library, setLibrary] = useState<Reference[]>([]);
  const [reference, setReference] = useState<string>(project.settings?.agentReference || projectRefs[0]?.path || '');
  const [notes, setNotes] = useState<string>(project.settings?.agentNotes || '');
  const [working, setWorking] = useState(false);
  const [speed, setSpeed] = useState<'fast' | 'best'>((project.settings as any)?.agentSpeed === 'best' ? 'best' : 'fast');
  const {view, setView} = useAgentView(project.id);
  const provider = settings?.aiProvider || 'claude-code';

  useEffect(() => {
    api().library.list().then(setLibrary).catch(() => setLibrary([]));
  }, []);
  useEffect(() => {
    if (!reference && projectRefs[0]) setReference(projectRefs[0].path);
  }, [projectRefs.length]);

  const build = async () => {
    if (!reference) return toast('Choose a reference video first (attach one in Media, or add it to the Library).', 'bad');
    setWorking(true);
    try {
      if (persist) await persist({...project, settings: {...project.settings, agentReference: reference, agentNotes: notes, agentSpeed: speed} as any});
      const r = await api().agent.build(project.id, {reference, notes: notes.trim() || undefined, speed});
      setView(r.view);
      if (persist) await persist({...project, settings: {...project.settings, agentReference: reference, agentNotes: notes, agentActive: true}});
      toast('Your edit is ready to watch. Change anything in Edit, then render it in Render.');
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setWorking(false);
    }
  };

  const disabledWhy = provider !== 'claude-code' ? 'Agent build needs Claude Code: in Settings, connect Claude with your Claude account.' : !job.words ? 'Run the Story step first.' : '';

  return (
    <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
      <div>
        <h3 className="row" style={{gap: 8}}>
          <Robot size={20} aria-hidden /> Recreate a reference (Agent build)
        </h3>
        <p className="muted" style={{fontSize: 'var(--fs-sm)', maxWidth: 760}}>
          Claude studies the reference frame by frame and builds this edit from scratch in the same style: captions, layouts, cards, transitions and motion graphics, even ones the built-in looks don't have. It checks its own frames and fixes overlaps and anything covering your face. You get a live preview to watch, change in Edit, and render in Render. It uses your Claude plan; keep OmniMotion open while it works.
        </p>
      </div>

      <label className="stack" style={{gap: 6}}>
        <span className="help">Reference video</span>
        <select className="input" value={reference} onChange={(e) => setReference(e.target.value)} disabled={working || busy}>
          <option value="">Choose a reference</option>
          {projectRefs.length ? (
            <optgroup label="Attached to this project">
              {projectRefs.map((m) => (
                <option key={m.id} value={m.path}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {library.length ? (
            <optgroup label="Library">
              {library.map((r) => (
                <option key={r.id} value={r.path}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>

      <div className="stack" style={{gap: 6}}>
        <span className="help">Speed</span>
        <div className="seg" role="group" aria-label="Build speed" style={{alignSelf: 'flex-start'}}>
          <button aria-pressed={speed === 'fast'} onClick={() => setSpeed('fast')} disabled={working || busy}>
            Fast
          </button>
          <button aria-pressed={speed === 'best'} onClick={() => setSpeed('best')} disabled={working || busy}>
            Best quality
          </button>
        </div>
        <span className="help">{speed === 'fast' ? 'Sonnet, 16 frames of the reference, one check round. Usually several times quicker; fix anything afterwards in Edit.' : 'Opus, every frame of the reference, up to three check rounds. The most refined result, and the slowest: often 20 to 45 minutes.'}</span>
      </div>

      <label className="stack" style={{gap: 6}}>
        <span className="help">Notes for Claude (optional)</span>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder='For example: keep my original colours, spell "Stan Lee" correctly, end with a Follow card.' disabled={working || busy} />
      </label>

      <div className="row wrap">
        <button className="btn primary" disabled={working || busy || !!disabledWhy || !reference} onClick={build} title={disabledWhy || undefined}>
          <Robot size={18} aria-hidden /> {working ? 'Claude is building your edit' : view ? 'Build again from scratch' : 'Build with Claude'}
        </button>
        {disabledWhy ? <span className="help">{disabledWhy}</span> : null}
      </div>

      <AiPanel job="agent" onRetry={build} />

      {view && !working ? (
        <div className="row wrap" style={{gap: 'var(--sp-4)', alignItems: 'flex-start'}}>
          <AgentPreview url={view.previewUrl} />
          <div className="stack" style={{gap: 'var(--sp-2)', maxWidth: 360}}>
            <span className="row" style={{gap: 8}}>
              <FilmReel size={18} aria-hidden /> Your Agent build
            </span>
            <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>
              {project.settings?.agentActive ? 'Edit and Render now work on this build.' : 'Edit and Render use the regular plan. Switch to this build to change and render it.'}
            </p>
            <div className="row wrap">
              <a className="btn secondary sm" href={`#/project/${project.id}/edit`}>
                Change it in Edit
              </a>
              <a className="btn primary sm" href={`#/project/${project.id}/render`}>
                Render it
              </a>
            </div>
            {persist ? (
              <button className="btn ghost sm" onClick={async () => persist({...project, settings: {...project.settings, agentActive: !project.settings?.agentActive}})}>
                {project.settings?.agentActive ? 'Use the regular plan instead' : 'Use this Agent build in Edit and Render'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};

const AGENT_EXAMPLES = ['Make the captions a bit bigger', 'Show the hook title one second longer', 'Remove the stamp at the end', 'Use a calmer music bed', 'Move the step tracker lower'];

// Edit tab for an Agent build: plain-words changes, each one undoable, the preview rebuilds after each
export const AgentEdit = ({project, persist, buildTab = 'plan'}: {project: Project; persist?: (p: Project) => Promise<unknown>; buildTab?: string}) => {
  const toast = useToast();
  const {view, setView} = useAgentView(project.id);
  const [timeline, setTimeline] = useState<{beats: AgentBeat[]; words: {t: string; s: number; e: number}[]; videoMs: number; width: number; height: number} | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const seekRef = useRef<((ms: number) => void) | null>(null);
  const loadBeats = useCallback(() => api().agent.beats(project.id).then(setTimeline).catch(() => setTimeline(null)), [project.id]);
  useEffect(() => {
    loadBeats();
  }, [loadBeats, view?.built]);
  const onFrame = useCallback((ms: number) => setPlayhead(ms), []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (instruction: string) => {
    if (!instruction.trim()) return;
    setBusy(true);
    try {
      const r = await api().agent.edit(project.id, instruction.trim());
      setView(r.view);
      setText('');
      await loadBeats();
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    setBusy(true);
    try {
      const r = await api().agent.undo(project.id);
      setView(r.view);
      await loadBeats();
    } catch (e: any) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  if (!view) {
    return (
      <div className="card empty">
        <h2>No Agent build yet</h2>
        <p className="muted">{buildTab === 'build' ? 'Build the video first.' : 'Build one in Plan (Recreate a reference), or switch back to the regular plan.'}</p>
        <div className="row">
          <a className="btn primary" href={`#/project/${project.id}/${buildTab}`}>
            {buildTab === 'build' ? 'Go to Build' : 'Go to Plan'}
          </a>
          {persist && buildTab !== 'build' ? (
            <button className="btn secondary" onClick={() => persist({...project, settings: {...project.settings, agentActive: false}})}>
              Use the regular plan
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  const live = view.history.filter((h) => !h.undone);
  const commitBeats = async (next: AgentBeat[], label: string) => {
    setBusy(true);
    try {
      const r = await api().agent.saveBeats(project.id, next, label);
      if (r.view) setView(r.view);
      await loadBeats();
    } catch (e: any) {
      toast(e.message, 'bad');
      await loadBeats();
    } finally {
      setBusy(false);
    }
  };
  const enableTimeline = async () => {
    setBusy(true);
    try {
      const r = await api().agent.enableTimeline(project.id);
      setView(r.view);
      await loadBeats();
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div>
        <h2>Edit</h2>
        <p className="muted">Your Agent build. Say what to change in your own words: Claude changes the edit and the preview rebuilds. Every change can be undone.</p>
      </div>
      <div className="row wrap" style={{gap: 'var(--sp-5)', alignItems: 'flex-start'}}>
        <AgentPreview url={view.previewUrl} aspect={timeline && timeline.width > timeline.height ? '16 / 9' : '9 / 16'} width={timeline && timeline.width > timeline.height ? 560 : 360} onFrame={onFrame} seekRef={seekRef} />
        <div className="stack" style={{gap: 'var(--sp-3)', flex: 1, minWidth: 300}}>
          <div className="row wrap" style={{gap: 'var(--sp-2)'}}>
            {AGENT_EXAMPLES.map((x) => (
              <button key={x} className="btn ghost sm" disabled={busy} onClick={() => setText(x)}>
                {x}
              </button>
            ))}
          </div>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder='For example: make the "Stan Lee" title appear one second earlier, and use a yellow highlight instead of red.' disabled={busy} onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && send(text)} />
          <div className="row wrap">
            <button className="btn primary" disabled={busy || !text.trim()} onClick={() => send(text)}>
              <PaperPlaneRight size={18} aria-hidden /> {busy ? 'Claude is working' : 'Make this change'}
            </button>
            <button className="btn secondary" disabled={busy || !live.length} onClick={undo}>
              <ArrowCounterClockwise size={18} aria-hidden /> Undo last change
            </button>
          </div>
          <AiPanel job="edit" />
          {view.history.length ? (
            <div className="stack" style={{gap: 6}}>
              <span className="help">Changes</span>
              {[...view.history].reverse().map((h) => (
                <div key={h.n} className="card pad" style={{opacity: h.undone ? 0.5 : 1, padding: 'var(--sp-3)'}}>
                  <div style={{fontWeight: 600, textDecoration: h.undone ? 'line-through' : undefined}}>{/^Make the timeline editable/.test(h.instruction) ? 'Made the timeline editable' : h.instruction.length > 140 ? `${h.instruction.slice(0, 140)}…` : h.instruction}</div>
                  {h.summary ? <div className="muted" style={{fontSize: 'var(--fs-sm)'}}>{h.summary}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {timeline && timeline.beats.length ? (
        <BeatsTimeline beats={timeline.beats} words={timeline.words} durationMs={timeline.videoMs} playheadMs={playhead} busy={busy} onSeek={(ms) => seekRef.current?.(ms)} onCommit={commitBeats} />
      ) : timeline ? (
        <section className="card pad stack" style={{gap: 'var(--sp-2)'}}>
          <h3>Timeline</h3>
          <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>This build was made before the editable timeline existed. Claude can move its timings onto the timeline without changing how anything looks (a minute or two).</p>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={enableTimeline}>
              Make the timeline editable
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
};

// Render tab for an Agent build
export const AgentRender = ({project, buildTab = 'plan'}: {project: Project; buildTab?: string}) => {
  const toast = useToast();
  const {view} = useAgentView(project.id);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{out: string; url: string} | null>(null);
  const [workers, setWorkers] = useState(2);
  useEffect(() => {
    api().agent.last(project.id).then(setDone).catch(() => setDone(null));
  }, [project.id]);
  const render = async () => {
    setBusy(true);
    try {
      const r = await api().agent.render(project.id, {concurrency: workers});
      setDone({out: r.out, url: r.url});
      toast('Your video is rendered and mixed to -14 LUFS.');
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div>
        <h2>Render</h2>
        <p className="muted">Renders your Agent build at 1080x1920, then mixes your voice, the music and the sound effects to -14 LUFS (true peak under -1.5 dBTP). The video goes to the project's output folder.</p>
      </div>
      {!view ? (
        <div className="card empty">
          <h3>Nothing built yet</h3>
          <a className="btn primary" href={`#/project/${project.id}/${buildTab}`}>
            {buildTab === 'build' ? 'Go to Build' : 'Go to Plan'}
          </a>
        </div>
      ) : (
        <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
          <label className="row" style={{gap: 8}}>
            <span className="help">Render workers</span>
            <select className="input" style={{width: 160}} value={workers} onChange={(e) => setWorkers(Number(e.target.value))} disabled={busy}>
              {[1, 2, 3, 4, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === 2 ? ' (recommended)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={render}>
              <FilmReel size={18} aria-hidden /> {busy ? 'Rendering' : 'Render video'}
            </button>
          </div>
          <AiPanel job="agent" />
          {done && !busy ? (
            <div className="stack" style={{gap: 'var(--sp-2)'}}>
              <div className="row between wrap">
                <span>Latest render</span>
                <button className="btn ghost sm" onClick={() => api().shell.reveal(done.out)}>
                  <FolderOpen size={16} aria-hidden /> Show in folder
                </button>
              </div>
              <video src={done.url} controls style={{width: project.motion?.aspect === '16:9' ? 'min(640px, 100%)' : 'min(360px, 100%)', borderRadius: 'var(--r-md)', background: '#000'}} />
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
};
