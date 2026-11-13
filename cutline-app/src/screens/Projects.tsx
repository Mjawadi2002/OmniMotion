import {useEffect, useState} from 'react';
import {FilmSlate, Plus, Trash, FolderOpen, Shapes, UserFocus, VideoCamera} from '@phosphor-icons/react';
import {api, type Mode, type Project, type Settings, type Style} from '../lib/api';
import {Dialog, fmtDate, go, useAsync, useToast} from '../lib/util';
import {LookPicker} from './Looks';

const StepsMini = ({p}: {p: Project}) => {
  const done = [p.media.length > 0, !!p.status?.prepared, !!p.status?.planned, p.outputs.length > 0];
  return (
    <div className="steps-mini" aria-label="Progress">
      {done.map((d, i) => (
        <i key={i} className={d ? 'on' : ''} />
      ))}
    </div>
  );
};

const Thumb = ({p}: {p: Project}) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const m = p.media.find((x) => x.kind === 'video');
    if (m) api().media.poster(m.path).then(setSrc).catch(() => {});
  }, [p.media]);
  return <div className="thumb">{src ? <img src={src} alt="" /> : <FilmSlate size={32} aria-hidden />}</div>;
};

export const NewProject = ({defaults, onClose}: {defaults?: Settings['defaults']; onClose: () => void}) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>(defaults?.mode || 'talking');
  const [style, setStyle] = useState<Style>(defaults?.style || 'tech');
  const [popout, setPopout] = useState(false);
  const [lookId, setLookId] = useState('tech');
  const [aspect, setAspect] = useState<'9:16' | '16:9'>('9:16');
  const [lengthS, setLengthS] = useState(30);
  const lookData = useAsync(() => api().looks.list(), []);
  const metaData = useAsync(() => api().looks.meta(), []);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const p = await api().projects.create({name: name.trim() || 'Untitled project', mode, style, popout: mode === 'talking' && style === 'light' && popout, look: mode === 'motion' || ['tech', 'light'].includes(lookId) ? undefined : lookId, motion: mode === 'motion' ? {aspect, lengthS} : undefined});
      go(`#/project/${p.id}/${mode === 'motion' ? 'brief' : 'media'}`);
      onClose();
    } catch (e: any) {
      toast(e.message, 'bad');
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="New project"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={create}>
            Create project
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="pn">Name</label>
        <input id="pn" className="input" autoFocus value={name} placeholder="For example: Athens first week" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      </div>
      <div className="field">
        <span className="label" id="mode-l">
          What are you editing
        </span>
        <div className="grid-2" role="radiogroup" aria-labelledby="mode-l">
          <button className="choice" role="radio" aria-checked={mode === 'talking'} onClick={() => setMode('talking')}>
            <span className="t">
              <UserFocus size={20} aria-hidden /> Talking head
            </span>
            <span className="d">One raw clip of you speaking. Captions, zooms and graphics are built from what you say.</span>
          </button>
          <button className="choice" role="radio" aria-checked={mode === 'vlog'} onClick={() => setMode('vlog')}>
            <span className="t">
              <VideoCamera size={20} aria-hidden /> Vlog
            </span>
            <span className="d">A voice recording plus a set of clips. The clips are cut full screen to your voice.</span>
          </button>
          <button className="choice" role="radio" aria-checked={mode === 'motion'} onClick={() => setMode('motion')}>
            <span className="t">
              <Shapes size={20} aria-hidden /> Motion graphics
            </span>
            <span className="d">No camera. Describe an idea: Claude writes the script, ElevenLabs voices it, and Claude animates every frame.</span>
          </button>
        </div>
      </div>
      {mode === 'motion' ? (
        <>
          <div className="field">
            <span className="label" id="aspect-l">
              Format
            </span>
            <div className="grid-2" role="radiogroup" aria-labelledby="aspect-l">
              <button className="choice" role="radio" aria-checked={aspect === '9:16'} onClick={() => setAspect('9:16')}>
                <span className="t">9:16 vertical</span>
                <span className="d">Reels, TikTok, Shorts (1080x1920)</span>
              </button>
              <button className="choice" role="radio" aria-checked={aspect === '16:9'} onClick={() => setAspect('16:9')}>
                <span className="t">16:9 horizontal</span>
                <span className="d">YouTube, presentations (1920x1080)</span>
              </button>
            </div>
          </div>
          <div className="field">
            <span className="label" id="len-l">
              Length
            </span>
            <div className="row" role="radiogroup" aria-labelledby="len-l">
              {[30, 45, 60].map((n) => (
                <button key={n} className={`btn ${lengthS === n ? 'primary' : 'secondary'}`} role="radio" aria-checked={lengthS === n} onClick={() => setLengthS(n)}>
                  {n === 60 ? '1 min' : `${n} s`}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
      {mode !== 'motion' ? (
      <div className="field">
        <span className="label" id="style-l">
          Look
        </span>
        {lookData.data && metaData.data ? (
          <LookPicker looks={lookData.data} meta={metaData.data} value={lookId} family={mode === 'vlog' ? 'tech' : undefined} onChange={(l) => (setLookId(l.id), setStyle(l.family))} />
        ) : (
          <span className="muted">Preparing previews</span>
        )}
        <a href="#/looks" className="help" onClick={onClose}>
          Create your own look, from a reference or in words
        </a>
        {mode === 'talking' && style === 'light' ? (
          <label className="check" style={{marginTop: 8}}>
            <input type="checkbox" checked={popout} onChange={(e) => setPopout(e.target.checked)} />
            Pop-out head: your head rises above the card. Cuts you out locally, about 10 minutes per minute of video.
          </label>
        ) : null}
      </div>
      ) : null}
    </Dialog>
  );
};

export const Projects = ({settings}: {settings: Settings | null}) => {
  const toast = useToast();
  const {data, reload, loading} = useAsync(() => api().projects.list(), []);
  const [creating, setCreating] = useState(false);
  const remove = async (p: Project) => {
    if (!confirm(`Delete "${p.name}" from OmniMotion? Your original files are not touched; the copies in the project folder stay on disk.`)) return;
    await api().projects.remove(p.id);
    toast('Project removed from the list.');
    reload();
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p>Each project keeps its own copies of your footage, the plan, and the finished videos.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={18} aria-hidden /> New project
        </button>
      </div>
      {!loading && data && data.length === 0 ? (
        <div className="card empty">
          <h2>Start your first edit</h2>
          <p className="muted" style={{maxWidth: '60ch'}}>
            Choose what you are editing, add your footage, and OmniMotion transcribes your voice, cuts the silences, writes the graphics from your own words, and renders a finished short.
          </p>
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden /> New project
          </button>
        </div>
      ) : (
        <div className="grid-cards">
          {(data || []).map((p) => (
            <div key={p.id} className="card link pcard" role="link" tabIndex={0} onClick={() => go(`#/project/${p.id}/media`)} onKeyDown={(e) => e.key === 'Enter' && go(`#/project/${p.id}/media`)}>
              <Thumb p={p} />
              <div className="meta">
                <h3>{p.name}</h3>
                <div className="row wrap">
                  <span className="chip">{p.mode === 'vlog' ? 'Vlog' : p.mode === 'motion' ? `Motion graphics ${p.motion?.aspect || '9:16'}` : 'Talking head'}</span>
                  {p.mode === 'talking' ? <span className="chip">{p.style === 'light' ? 'Light' : 'Tech'}</span> : null}
                  {p.outputs.length ? <span className="chip ok">{p.outputs.length} render{p.outputs.length > 1 ? 's' : ''}</span> : null}
                </div>
                <StepsMini p={p} />
                <div className="row between">
                  <span className="faint" style={{fontSize: 'var(--fs-xs)'}}>
                    Updated {fmtDate(p.updatedAt)}
                  </span>
                  <span className="row" style={{gap: 2}}>
                    <button className="btn ghost icon sm" aria-label={`Open ${p.name} folder`} onClick={(e) => (e.stopPropagation(), api().shell.open(p.dir))}>
                      <FolderOpen size={16} aria-hidden />
                    </button>
                    <button className="btn ghost icon sm" aria-label={`Delete ${p.name}`} onClick={(e) => (e.stopPropagation(), remove(p))}>
                      <Trash size={16} aria-hidden />
                    </button>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {creating ? <NewProject defaults={settings?.defaults} onClose={() => setCreating(false)} /> : null}
    </div>
  );
};

