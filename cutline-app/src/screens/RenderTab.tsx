import {useEffect, useState} from 'react';
import {FileText, FolderOpen, Play, VideoCamera} from '@phosphor-icons/react';
import {api, type EngineInfo, type Job, type Project} from '../lib/api';
import {useAsync} from '../lib/util';
import {fmtDate, go} from '../lib/util';
import type {RunState} from '../lib/run';
import {RunPanel} from './RunPanel';

const Output = ({o}: {o: Project['outputs'][number]}) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    api().media.url(o.file).then(setSrc).catch(() => {});
  }, [o.file]);
  const name = o.file.split(/[\\/]/).pop();
  return (
    <div className="card" style={{display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: 'var(--sp-4)', padding: 'var(--sp-4)'}}>
      <div style={{aspectRatio: '9 / 16', background: '#000', borderRadius: 'var(--r-sm)', overflow: 'hidden'}}>
        {src ? <video src={src} controls preload="metadata" style={{width: '100%', height: '100%'}} aria-label={`Preview of ${name}`} /> : null}
      </div>
      <div className="stack" style={{gap: 'var(--sp-3)'}}>
        <div>
          <h3 style={{wordBreak: 'break-all'}}>{name}</h3>
          <p className="faint" style={{fontSize: 'var(--fs-xs)'}}>
            {o.label} · {fmtDate(o.at)}
          </p>
        </div>
        <div className="row wrap">
          <button className="btn secondary sm" onClick={() => api().shell.open(o.file)}>
            <Play size={14} aria-hidden /> Open in your player
          </button>
          <button className="btn secondary sm" onClick={() => api().shell.reveal(o.file)}>
            <FolderOpen size={14} aria-hidden /> Show in folder
          </button>
          <button className="btn ghost sm" onClick={() => api().shell.open(o.file.replace(/\.mp4$/, '_report.md'))}>
            <FileText size={14} aria-hidden /> Edit report
          </button>
        </div>
      </div>
    </div>
  );
};

export const RenderTab = ({project, job, run, engine, persist}: {project: Project; job: Job | null; run: {state: RunState; start: (s: 'render', o?: Record<string, unknown>) => Promise<unknown>; cancel: () => void}; engine: EngineInfo | null; persist: (p: Project) => Promise<void>}) => {
  const [conc, setConc] = useState(2);
  const looks = useAsync(() => api().looks.list(), []);
  const changeLook = async (id: string) => {
    const l = (looks.data || []).find((x) => x.id === id);
    if (!l) return;
    await persist({...project, style: l.family, look: ['tech', 'light'].includes(l.id) ? undefined : l.id});
  };
  const set = (patch: Partial<Project['settings']>) => persist({...project, settings: {...project.settings, ...patch}});
  const busy = run.state.running;
  const needsCutout = project.mode === 'talking' && project.style === 'light' && project.popout;
  const cutoutBlocked = needsCutout && engine && (!engine.cutoutModel || !engine.python);
  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div>
        <h2>Render</h2>
        <p className="muted">Renders the finished video, then mixes the audio to -14 LUFS with a true peak under -1 dBTP. The result goes to the project's output folder.</p>
      </div>

      {!job?.prepared ? (
        <div className="card empty">
          <h2>Nothing to render yet</h2>
          <p className="muted">Run the Story step first so there is a transcript and cuts.</p>
          <button className="btn primary" onClick={() => go(`#/project/${project.id}/story`)}>
            Go to Story
          </button>
        </div>
      ) : (
        <div className="card pad stack">
          <div className="grid-2">
            <div className="stack" style={{gap: 'var(--sp-2)'}}>
              <h4>What will be rendered</h4>
              <div className="row wrap">
                <span className="chip">{project.mode === 'vlog' ? 'Vlog' : 'Talking head'}</span>
                {project.mode === 'talking' ? <span className="chip">{project.style === 'light' ? 'Light look' : 'Tech look'}</span> : <span className="chip">Warm grade</span>}
                {needsCutout ? <span className="chip accent">Pop-out head</span> : null}
                <span className="chip">{project.settings.cutSilence !== false ? 'Silences cut' : 'Silences kept'}</span>
                <span className="chip">{job.plan ? 'Your plan' : 'Automatic plan'}</span>
              </div>
              {!job.plan ? <p className="help">No plan has been saved, so the automatic baseline is used. Open Plan to write or edit one.</p> : null}
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="music">Music</label>
                <select id="music" className="select" value={project.settings.music} onChange={(e) => set({music: e.target.value as 'on' | 'off'})} disabled={busy}>
                  <option value="on">Royalty-free bed</option>
                  <option value="off">No music</option>
                </select>
              </div>
              {project.settings.music !== 'off' ? (
                <div className="field">
                  <label htmlFor="mlevel">Music level</label>
                  <select id="mlevel" className="select" value={project.settings.musicLevel || 'auto'} onChange={(e) => set({musicLevel: e.target.value as 'auto' | 'subtle' | 'balanced' | 'prominent'})} disabled={busy}>
                    <option value="auto">Automatic (your own track is clearly heard)</option>
                    <option value="subtle">Subtle: barely there</option>
                    <option value="balanced">Balanced</option>
                    <option value="prominent">Prominent</option>
                  </select>
                  {job.resolved?.musicPick ? (
                    <span className="help">
                      Using {Math.floor(job.resolved.musicPick.startMs / 60000)}:{String(Math.floor((job.resolved.musicPick.startMs % 60000) / 1000)).padStart(2, '0')} to {Math.floor(job.resolved.musicPick.endMs / 60000)}:{String(Math.floor((job.resolved.musicPick.endMs % 60000) / 1000)).padStart(2, '0')} of your track ({job.resolved.musicPick.bpm} BPM): {job.resolved.musicPick.reason}. Always under your voice.
                    </span>
                  ) : (
                    <span className="help">Under your voice, and dipping while you speak. The best part of your track is found for you.</span>
                  )}
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="sfx">Sound effects</label>
                <select id="sfx" className="select" value={project.settings.sfx || 'auto'} onChange={(e) => set({sfx: e.target.value as 'auto' | 'off' | 'minimal' | 'normal' | 'rich'})} disabled={busy}>
                  <option value="auto">Automatic: matches the look</option>
                  <option value="minimal">Few: only the strong moments</option>
                  <option value="normal">Normal</option>
                  <option value="rich">Many</option>
                  <option value="off">None</option>
                </select>
                <span className="help">Placed on the visuals, always quieter than your voice.</span>
              </div>
              <div className="field">
                <label htmlFor="look">Look</label>
                <select id="look" className="select" value={project.look || project.style} onChange={(e) => changeLook(e.target.value)} disabled={busy || project.mode === 'vlog' && false}>
                  {(looks.data || []).filter((l) => project.mode !== 'vlog' || l.family === 'tech').map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="conc">Render workers</label>
                <select id="conc" className="select" value={conc} onChange={(e) => setConc(Number(e.target.value))} disabled={busy}>
                  <option value={1}>1 (lowest memory)</option>
                  <option value={2}>2 (recommended)</option>
                  <option value={4}>4 (fastest, needs free memory)</option>
                </select>
              </div>
            </div>
          </div>
          {cutoutBlocked ? <div className="notice bad">The pop-out head needs Python and the person-cutout model (models/u2net_human_seg.onnx in the engine folder). Turn the pop-out off in the project, or add them.</div> : null}
          <div className="row">
            <button className="btn primary" disabled={busy || !!cutoutBlocked} onClick={() => run.start('render', {concurrency: conc})}>
              <VideoCamera size={18} aria-hidden /> Render video
            </button>
            {needsCutout ? <span className="help">The cut-out runs once per clip and takes several minutes.</span> : null}
          </div>
        </div>
      )}

      {run.state.step === 'render' ? <RunPanel run={run.state} onCancel={run.cancel} /> : null}

      {project.outputs.length ? (
        <section className="stack">
          <h2>Finished videos</h2>
          {project.outputs.map((o) => (
            <Output key={o.file} o={o} />
          ))}
        </section>
      ) : null}
    </div>
  );
};
