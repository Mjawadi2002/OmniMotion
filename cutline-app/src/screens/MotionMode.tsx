// Motion graphics projects: Brief (idea, format, length, reference, captions) → Script (Claude) → Voice (ElevenLabs) → Build (Agent build).
// Edit and Render are the Agent build screens.
import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, FilmStrip, Image as ImageIcon, MusicNote, Pause, Play, Plus, Robot, Sparkle, Trash, Waveform} from '@phosphor-icons/react';
import {api, type MotionLine, type MotionSettings, type Project, type Reference, type Settings, type Voice} from '../lib/api';
import {go, useToast} from '../lib/util';
import {AiPanel} from './AiPanel';
import {AgentPreview, useAgentView} from './AgentBuild';
import {CaptionSample} from './CaptionSample';

const WPS: Record<string, number> = {en: 2.7, fr: 2.6, ar: 2.2, es: 2.8, de: 2.4, it: 2.7, pt: 2.6, tr: 2.3};
const LANGS = [
  ['auto', 'Same as my idea'],
  ['en', 'English'],
  ['fr', 'French'],
  ['ar', 'Arabic'],
  ['es', 'Spanish'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['tr', 'Turkish'],
];
export const CAPTION_STYLES: [string, string, string][] = [
  ['kinetic', 'Kinetic', 'Each word animates in, key words bigger in the accent colour.'],
  ['bold', 'Bold', 'Big capital letters, the spoken word lit.'],
  ['highlight', 'Highlight', 'The spoken word sits in a coloured box.'],
  ['boxed', 'Boxed', 'White words on a dark pill.'],
  ['karaoke', 'Karaoke', 'A short line where each word lights up as it is said.'],
  ['label', 'Label', 'Cream box, ink border, hard shadow (paper style).'],
  ['minimal', 'Minimal', 'Small and quiet, lower on the frame.'],
  ['none', 'No captions', 'The motion graphics carry the words.'],
];

type P = {project: Project; persist: (p: Project) => Promise<unknown>};
const mOf = (p: Project): MotionSettings => p.motion || {aspect: '9:16', lengthS: 30};

// ---------------------------------------------------------------- Brief
export const MotionBrief = ({project, persist}: P) => {
  const toast = useToast();
  const m = mOf(project);
  const [library, setLibrary] = useState<Reference[]>([]);
  useEffect(() => {
    api().library.list().then(setLibrary).catch(() => setLibrary([]));
  }, []);
  const set = (patch: Partial<MotionSettings>) => persist({...project, motion: {...m, ...patch}});
  const refs = (project.media || []).filter((x) => x.role === 'reference' && x.kind === 'video');
  const files = (project.media || []).filter((x) => ['image', 'logo', 'screenshot'].includes(x.role));
  const music = (project.media || []).find((x) => x.role === 'music');
  const attach = async (kinds: string[], role: any) => {
    const paths = await api().media.pick(kinds);
    if (!paths.length) return;
    try {
      const r = await api().media.attach(project.id, paths.map((p) => ({path: p, role})));
      const next = {...r.project, motion: {...mOf(r.project), ...(role === 'reference' && r.added[0] ? {reference: r.added[0].path} : {})}};
      await persist(next);
    } catch (e: any) {
      toast(e.message, 'bad');
    }
  };
  const detach = async (mediaId: string) => persist({...(await api().media.detach(project.id, mediaId)), motion: m});
  const cap = m.captions || {style: 'kinetic'};
  const colors = cap.colors || {};
  const ready = String(m.idea || '').trim().length > 10;

  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div>
        <h2>Brief</h2>
        <p className="muted">Tell Claude what the video is about. Everything here guides the script and the motion design; you can change it any time.</p>
      </div>

      <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
        <label className="field">
          <span className="label">The idea</span>
          <textarea className="input" rows={5} value={m.idea || ''} onChange={(e) => set({idea: e.target.value})} placeholder="What should the viewer understand by the end? Who is it for? Any facts, steps or examples it must include. For example: why most people quit learning a language in the first month, and the 3 habits that keep you going." />
        </label>
        <label className="field">
          <span className="label">Style direction (optional)</span>
          <textarea className="input" rows={2} value={m.style || ''} onChange={(e) => set({style: e.target.value})} placeholder="For example: calm and premium, lots of white space, one blue accent, soft camera moves, no clichés." />
        </label>
        <div className="row wrap" style={{gap: 'var(--sp-4)'}}>
          <label className="field" style={{minWidth: 180}}>
            <span className="label">Format</span>
            <select className="input" value={m.aspect} onChange={(e) => set({aspect: e.target.value as any, voice: m.voice})}>
              <option value="9:16">9:16 vertical (Reels, TikTok, Shorts)</option>
              <option value="16:9">16:9 horizontal (YouTube)</option>
            </select>
          </label>
          <label className="field" style={{minWidth: 140}}>
            <span className="label">Length</span>
            <select className="input" value={m.lengthS} onChange={(e) => set({lengthS: Number(e.target.value)})}>
              <option value={30}>30 seconds</option>
              <option value={45}>45 seconds</option>
              <option value={60}>1 minute</option>
            </select>
          </label>
          <label className="field" style={{minWidth: 180}}>
            <span className="label">Language of the voice</span>
            <select className="input" value={m.language || 'auto'} onChange={(e) => set({language: e.target.value})}>
              {LANGS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
        <h3 className="row" style={{gap: 8}}>
          <FilmStrip size={18} aria-hidden /> Reference (optional)
        </h3>
        <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>A motion video whose style you want. Claude studies it frame by frame and recreates its design language for your script. Its content is never copied.</p>
        <div className="row wrap">
          <select className="input" style={{flex: 1, minWidth: 260}} value={m.reference || ''} onChange={(e) => set({reference: e.target.value || undefined})}>
            <option value="">No reference: Claude designs from the style direction</option>
            {refs.length ? (
              <optgroup label="Attached to this project">
                {refs.map((r) => (
                  <option key={r.id} value={r.path}>
                    {r.name}
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
          <button className="btn secondary" onClick={() => attach(['video'], 'reference')}>
            <Plus size={16} aria-hidden /> Add a reference video
          </button>
        </div>
      </section>

      <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
        <h3>Captions</h3>
        <div className="grid-4" role="radiogroup" aria-label="Caption style" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 'var(--sp-2)'}}>
          {CAPTION_STYLES.map(([id, label, d]) => (
            <button key={id} className="choice" role="radio" aria-checked={cap.style === id} onClick={() => set({captions: {...cap, style: id}})}>
              <CaptionSample style={id} colors={colors} />
              <span className="t">{label}</span>
              <span className="d">{d}</span>
            </button>
          ))}
        </div>
        {cap.style !== 'none' ? (
          <div className="row wrap" style={{gap: 'var(--sp-4)'}}>
            {(
              [
                ['text', 'Text'],
                ['accent', 'Highlighted word'],
                ['box', 'Box'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="row" style={{gap: 8}}>
                <input type="checkbox" checked={!!colors[k]} onChange={(e) => set({captions: {...cap, colors: {...colors, [k]: e.target.checked ? (k === 'text' ? '#FFFFFF' : k === 'accent' ? '#FFD23F' : '#111111') : undefined}}})} />
                <span className="help">{l}</span>
                {colors[k] ? <input type="color" value={colors[k]} onChange={(e) => set({captions: {...cap, colors: {...colors, [k]: e.target.value}}})} aria-label={`${l} colour`} /> : <span className="help">from the look</span>}
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
        <h3>Your files (optional)</h3>
        <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>Logos, product shots or screenshots Claude should use, and a music track (otherwise Claude picks a royalty-free bed).</p>
        <div className="row wrap">
          <button className="btn secondary" onClick={() => attach(['image'], 'image')}>
            <ImageIcon size={16} aria-hidden /> Add images or logos
          </button>
          <button className="btn secondary" onClick={() => attach(['audio'], 'music')} disabled={!!music}>
            <MusicNote size={16} aria-hidden /> Add music
          </button>
        </div>
        {[...files, ...(music ? [music] : [])].map((f) => (
          <div key={f.id} className="row between" style={{borderTop: '1px solid var(--line)', paddingTop: 6}}>
            <span>{f.name}</span>
            <button className="btn ghost icon sm" aria-label={`Remove ${f.name}`} onClick={() => detach(f.id)}>
              <Trash size={16} aria-hidden />
            </button>
          </div>
        ))}
      </section>

      <div className="row">
        <button className="btn primary" disabled={!ready} onClick={() => go(`#/project/${project.id}/script`)} title={ready ? undefined : 'Describe the idea first'}>
          Continue to Script <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Script
export const MotionScript = ({project, persist}: P) => {
  const toast = useToast();
  const m = mOf(project);
  const [busy, setBusy] = useState(false);
  const script = m.script || [];
  const words = script.map((l) => l.line).join(' ').split(/\s+/).filter(Boolean).length;
  const wps = WPS[m.scriptLanguage || m.language || 'en'] || 2.4;
  const estS = words / wps;
  const write = async () => {
    setBusy(true);
    try {
      await persist({...project, motion: m});
      const next = await api().motion.script(project.id);
      await persist(next);
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  // editing the script means the voice-over no longer matches it
  const setLine = (i: number, patch: Partial<MotionLine>) => persist({...project, motion: {...m, voice: null, script: script.map((l, k) => (k === i ? {...l, ...patch} : l))}});
  const remove = (i: number) => persist({...project, motion: {...m, voice: null, script: script.filter((_, k) => k !== i)}});
  const add = (i: number) => persist({...project, motion: {...m, voice: null, script: [...script.slice(0, i + 1), {line: '', purpose: '', visual: ''}, ...script.slice(i + 1)]}});

  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div>
        <h2>Script</h2>
        <p className="muted">Claude first says what it understood, then writes a script for {m.lengthS} seconds. Edit any line; the voice-over is made from exactly this text.</p>
      </div>
      {!String(m.idea || '').trim() ? (
        <div className="card empty">
          <h3>Describe the idea first</h3>
          <a className="btn primary" href={`#/project/${project.id}/brief`}>
            Go to Brief
          </a>
        </div>
      ) : (
        <>
          <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
            {script.length ? (
              <label className="field">
                <span className="label">Notes for a rewrite (optional)</span>
                <textarea className="input" rows={2} value={m.notes || ''} onChange={(e) => persist({...project, motion: {...m, notes: e.target.value}})} placeholder="For example: punchier hook, less jargon, end with 'Follow for part 2'." />
              </label>
            ) : null}
            <div className="row wrap">
              <button className="btn primary" disabled={busy} onClick={write}>
                <Sparkle size={18} aria-hidden /> {busy ? 'Claude is writing' : script.length ? 'Rewrite with Claude' : 'Write the script with Claude'}
              </button>
              {script.length ? (
                <span className={`chip ${Math.abs(estS - m.lengthS) / m.lengthS > 0.2 ? 'bad' : 'ok'}`}>
                  {words} words, about {Math.round(estS)} s of voice for {m.lengthS} s
                </span>
              ) : null}
            </div>
            <AiPanel job="script" onRetry={write} />
          </section>

          {m.understanding ? (
            <section className="card pad stack" style={{gap: 6}}>
              <span className="help">What Claude understood</span>
              <div style={{fontSize: 'var(--fs-lg)'}}>{m.understanding}</div>
              {m.title ? <span className="muted">Working title: {m.title}</span> : null}
            </section>
          ) : null}

          {script.length ? (
            <section className="stack" style={{gap: 'var(--sp-2)'}}>
              {script.map((l, i) => (
                <div key={i} className="card pad stack" style={{gap: 6, padding: 'var(--sp-3)'}}>
                  <div className="row between">
                    <span className="chip">
                      {i + 1}. {l.purpose || 'line'}
                    </span>
                    <span className="row">
                      <button className="btn ghost icon sm" aria-label="Add a line after this one" onClick={() => add(i)}>
                        <Plus size={16} aria-hidden />
                      </button>
                      <button className="btn ghost icon sm" aria-label="Remove this line" onClick={() => remove(i)}>
                        <Trash size={16} aria-hidden />
                      </button>
                    </span>
                  </div>
                  <textarea className="input" rows={2} value={l.line} onChange={(e) => setLine(i, {line: e.target.value})} aria-label={`Line ${i + 1}`} />
                  {l.visual ? <span className="help">Picture idea: {l.visual}</span> : null}
                </div>
              ))}
              <div className="row">
                <button className="btn primary" onClick={() => go(`#/project/${project.id}/voice`)}>
                  Continue to Voice <ArrowRight size={16} aria-hidden />
                </button>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Voice
export const MotionVoice = ({project, persist}: P) => {
  const toast = useToast();
  const m = mOf(project);
  const [data, setData] = useState<{voices: Voice[]; subscription: any; models: {id: string; label: string}[]} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    api().motion.voices().then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (m.voice?.audio) api().media.url(m.voice.audio).then((u) => setVoiceUrl(`${u}?v=${m.voice?.at || 0}`));
    else setVoiceUrl(null);
  }, [m.voice?.audio, m.voice?.at]);
  const text = (m.script || []).map((l) => l.line).join(' ');
  const sub = data?.subscription;
  const left = sub && sub.limit !== null && sub.used !== null ? sub.limit - sub.used : null;
  const voices = useMemo(() => (data?.voices || []).filter((v) => !filter || `${v.name} ${v.gender} ${v.accent} ${v.description} ${v.useCase}`.toLowerCase().includes(filter.toLowerCase())), [data, filter]);
  const preview = (v: Voice) => {
    if (!v.previewUrl) return;
    if (playing === v.id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    audio.current = new Audio(v.previewUrl);
    audio.current.onended = () => setPlaying(null);
    audio.current.play().catch(() => setPlaying(null));
    setPlaying(v.id);
  };
  const record = async () => {
    setBusy(true);
    try {
      const next = await api().motion.voice(project.id);
      await persist(next);
      toast('Voice-over ready. Listen to it, then build the video.');
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  // the voice-over is either made by ElevenLabs from the script, or your own recording (transcribed with word times; its words become the script)
  const fromRecording = m.voice?.source === 'recording' || m.scriptSource === 'recording';
  const [mode, setMode] = useState<'eleven' | 'recording'>(fromRecording ? 'recording' : 'eleven');
  const upload = async () => {
    const f = await api().media.pick(['audio']);
    if (!f[0]) return;
    setBusy(true);
    try {
      const next = await api().motion.recording(project.id, f[0]);
      await persist(next);
      toast('Your recording is transcribed. Its words are now the script, so the video follows exactly what you say.');
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const backToWritten = async () => {
    try {
      const next = await api().motion.writtenScript(project.id);
      await persist(next);
      toast('Your written script is back. Choose a voice and record it.');
    } catch (e: any) {
      toast(e.message, 'bad');
    }
  };
  const hasScript = !!(m.script && m.script.length);
  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div>
        <h2>Voice</h2>
        <p className="muted">The voice-over drives the whole video: captions and graphics land on the time of every word. Let ElevenLabs read your script, or use your own recording.</p>
      </div>
      <div className="seg" role="group" aria-label="Where the voice-over comes from" style={{alignSelf: 'flex-start'}}>
        <button aria-pressed={mode === 'eleven'} onClick={() => setMode('eleven')} disabled={busy}>
          ElevenLabs voice
        </button>
        <button aria-pressed={mode === 'recording'} onClick={() => setMode('recording')} disabled={busy}>
          My own recording
        </button>
      </div>
      {error && mode === 'eleven' ? <div className="notice bad">{error}</div> : null}
      {mode === 'recording' ? (
        <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
          <span>Use an audio file you recorded (MP3, WAV, M4A...). It is transcribed with the time of every word (Tunisian, Arabic, French, English and more are detected on their own), and its words become the script, so the video follows exactly what you say.</span>
          {hasScript && m.scriptSource !== 'recording' ? <span className="help">Your written script is kept: you can switch back to it with an ElevenLabs voice at any time.</span> : null}
          <div className="row wrap">
            <button className="btn primary" disabled={busy} onClick={upload}>
              <MusicNote size={18} aria-hidden /> {busy ? 'Transcribing your recording' : m.voice?.source === 'recording' ? 'Use another recording' : 'Choose an audio file'}
            </button>
            {m.voice?.source === 'recording' ? <span className="help">{m.voice.fileName}{m.voice.language ? `, ${m.voice.language}` : ''}</span> : null}
          </div>
          <AiPanel job="script" />
          {m.voice?.source === 'recording' && hasScript ? (
            <details>
              <summary style={{cursor: 'pointer'}}>The transcript ({m.script!.length} lines), now the script</summary>
              <ol className="stack" style={{gap: 4, marginTop: 'var(--sp-2)', paddingLeft: 20}}>
                {m.script!.map((l, i) => (
                  <li key={i} dir="auto">
                    {l.line}
                  </li>
                ))}
              </ol>
              <span className="help">A mis-heard word? Fix it in Script: the captions use the script's spelling.</span>
            </details>
          ) : null}
        </section>
      ) : !hasScript ? (
        <div className="card empty">
          <h3>Write the script first</h3>
          <p className="muted">ElevenLabs reads your script. Or choose My own recording above.</p>
          <a className="btn primary" href={`#/project/${project.id}/script`}>
            Go to Script
          </a>
        </div>
      ) : (
      <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
        {m.scriptSource === 'recording' ? (
          <div className="notice">
            <span style={{flex: 1}}>The script is the transcript of your recording. To have ElevenLabs read your written script instead, bring it back first.</span>
            <button className="btn secondary sm" onClick={backToWritten}>
              Use my written script
            </button>
          </div>
        ) : null}
        <div className="row between wrap">
          <span className="chip">{text.length} characters to read</span>
          {sub ? (
            <span className={`chip ${left !== null && left < text.length ? 'bad' : ''}`}>
              {sub.tier ? `${sub.tier} plan` : 'ElevenLabs'}
              {left !== null ? `: ${left.toLocaleString()} characters left this month` : ''}
            </span>
          ) : null}
        </div>
        <div className="row wrap" style={{gap: 'var(--sp-4)'}}>
          <label className="field" style={{minWidth: 260}}>
            <span className="label">Model</span>
            <select className="input" value={m.voiceModel || 'eleven_multilingual_v2'} onChange={(e) => persist({...project, motion: {...m, voiceModel: e.target.value}})}>
              {(data?.models || []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{minWidth: 220}}>
            <span className="label">Speed: {(m.voiceSpeed || 1).toFixed(2)}x</span>
            <input type="range" min={0.8} max={1.2} step={0.05} value={m.voiceSpeed || 1} onChange={(e) => persist({...project, motion: {...m, voiceSpeed: Number(e.target.value)}})} />
          </label>
          <label className="field" style={{minWidth: 220}}>
            <span className="label">Delivery: {(m.voiceStability ?? 0.5) < 0.4 ? 'expressive' : (m.voiceStability ?? 0.5) > 0.65 ? 'steady' : 'balanced'}</span>
            <input type="range" min={0.2} max={0.9} step={0.05} value={m.voiceStability ?? 0.5} onChange={(e) => persist({...project, motion: {...m, voiceStability: Number(e.target.value)}})} />
          </label>
        </div>
        <input className="input" placeholder="Search voices: name, accent, gender, style" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--sp-2)', maxHeight: 420, overflowY: 'auto'}}>
          {!data && !error ? <span className="muted">Loading your voices</span> : null}
          {voices.map((v) => (
            <div key={v.id} className="choice" role="radio" aria-checked={m.voiceId === v.id} tabIndex={0} onClick={() => persist({...project, motion: {...m, voiceId: v.id, voiceName: v.name}})} onKeyDown={(e) => e.key === 'Enter' && persist({...project, motion: {...m, voiceId: v.id, voiceName: v.name}})}>
              <span className="t row between">
                <span>{v.name.split(' - ')[0]}</span>
                {v.previewUrl ? (
                  <button
                    className="btn ghost icon sm"
                    aria-label={`Listen to ${v.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      preview(v);
                    }}
                  >
                    {playing === v.id ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
                  </button>
                ) : null}
              </span>
              <span className="d">{[v.gender, v.age, v.accent, v.useCase].filter(Boolean).join(' · ') || v.category}</span>
              {v.description ? <span className="d">{v.description}</span> : null}
            </div>
          ))}
        </div>
        <div className="row wrap">
          <button className="btn primary" disabled={busy || !m.voiceId || m.scriptSource === 'recording' || (left !== null && left < text.length)} onClick={record}>
            <Waveform size={18} aria-hidden /> {busy ? 'ElevenLabs is recording' : m.voice ? 'Record again' : 'Record the voice-over'}
          </button>
          {m.voiceName ? <span className="help">Voice: {m.voiceName.split(' - ')[0]}</span> : <span className="help">Choose a voice above.</span>}
        </div>
        <AiPanel job="script" />
      </section>
      )}
      {m.voice && voiceUrl ? (
        <section className="card pad stack" style={{gap: 'var(--sp-2)'}}>
          <span className="row between wrap">
            <span>
              {m.voice.source === 'recording' ? 'Your recording' : 'Voice-over'}: {(m.voice.durationMs / 1000).toFixed(1)} s, {m.voice.words} words timed
            </span>
            {m.voice.source === 'recording' ? <span className="chip">The video follows your recording's length</span> : Math.abs(m.voice.durationMs / 1000 - m.lengthS) / m.lengthS > 0.2 ? <span className="chip bad">Longer or shorter than {m.lengthS} s: shorten the script or change the speed</span> : <span className="chip ok">Fits {m.lengthS} s</span>}
          </span>
          <audio src={voiceUrl} controls style={{width: '100%'}} />
          <div className="row">
            <button className="btn primary" onClick={() => go(`#/project/${project.id}/build`)}>
              Continue to Build <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- Build
export const MotionBuild = ({project, persist, settings}: P & {settings: Settings | null}) => {
  const toast = useToast();
  const m = mOf(project);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  // Fast (Sonnet, fewer reference frames, one check round) or Best quality (Opus, every frame, up to three rounds); remembered per project
  const [speed, setSpeed] = useState<'fast' | 'best'>(((m as any).buildSpeed as 'fast' | 'best') || 'fast');
  const pickSpeed = (v: 'fast' | 'best') => {
    setSpeed(v);
    persist({...project, motion: {...m, buildSpeed: v} as any}).catch(() => {});
  };
  const {view, setView} = useAgentView(project.id);
  const provider = settings?.aiProvider || 'claude-code';
  const build = async () => {
    setBusy(true);
    try {
      const r = await api().motion.build(project.id, {notes: notes.trim() || undefined, speed});
      setView(r.view);
      await persist({...project, status: {...project.status, built: true}, settings: {...project.settings, agentActive: true}});
      toast(r.interrupted ? 'Your video is ready to watch. Claude stopped before finishing its checks: use "Finish the checks" when you can.' : 'Your video is ready to watch. Change anything in Edit, then render it in Render.');
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  // a build Claude could not finish checking (usage limit, network...): it continues in the same conversation
  const finish = async () => {
    setBusy(true);
    try {
      const r = await api().agent.continue(project.id);
      setView(r.view);
      await persist({...project, status: {...project.status, built: true}, settings: {...project.settings, agentActive: true}});
      toast(r.interrupted ? 'Claude stopped again before finishing. Try again later.' : r.clean ? 'Claude finished its checks: no problems left.' : 'Claude finished its checks and fixed what it found.');
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const why = provider !== 'claude-code' ? 'Building needs Claude Code: in Settings, connect Claude with your Claude account.' : !m.voice ? 'Record the voice-over first.' : '';
  const wide = m.aspect === '16:9';
  const [check, setCheck] = useState<{rounds: number; clean: boolean; interrupted: string | null; canContinue: boolean; previewMissing?: boolean; running?: boolean; writeStopped?: boolean} | null>(null);
  useEffect(() => {
    api().agent.check(project.id).then(setCheck, () => setCheck(null));
  }, [project.id, view?.built, busy]);
  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div>
        <h2>Build</h2>
        <p className="muted">Claude reads the onetake method, studies your reference if you chose one, picks a concept, and animates every frame to your voice-over. It checks its own frames and fixes what is wrong, then you get a live preview with its sound. It uses your Claude plan; keep OmniMotion open while it works.</p>
      </div>
      <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
        <div className="row wrap">
          <span className="chip">{m.aspect} · {m.lengthS === 60 ? '1 min' : `${m.lengthS} s`}</span>
          <span className="chip">{(m.script || []).length} script lines</span>
          {m.voice ? <span className="chip">Voice {(m.voice.durationMs / 1000).toFixed(1)} s</span> : null}
          <span className="chip">Captions: {CAPTION_STYLES.find((c) => c[0] === (m.captions?.style || 'kinetic'))?.[1]}</span>
          <span className="chip">{m.reference ? 'With a reference' : 'No reference'}</span>
        </div>
        <div className="stack" style={{gap: 6}}>
          <span className="label">Speed</span>
          <div className="seg" role="group" aria-label="Build speed" style={{alignSelf: 'flex-start'}}>
            <button aria-pressed={speed === 'fast'} onClick={() => pickSpeed('fast')} disabled={busy}>
              Fast
            </button>
            <button aria-pressed={speed === 'best'} onClick={() => pickSpeed('best')} disabled={busy}>
              Best quality
            </button>
          </div>
          <span className="help">{speed === 'fast' ? 'Sonnet, 16 frames of the reference, one check round. Usually several times quicker; fix anything afterwards in Edit.' : 'Opus, every frame of the reference, up to three check rounds. The most refined result, and the slowest: often 20 to 45 minutes.'}</span>
        </div>
        <label className="field">
          <span className="label">Last words for Claude (optional)</span>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="For example: one continuous camera move through the whole video, end on the title." disabled={busy} />
        </label>
        <div className="row wrap">
          <button className="btn primary" disabled={busy || !!why} onClick={build} title={why || undefined}>
            <Robot size={18} aria-hidden /> {busy ? 'Claude is animating your video' : view ? 'Build again from scratch' : 'Build with Claude'}
          </button>
          {why ? <span className="help">{why}</span> : null}
        </div>
        <AiPanel job="agent" onRetry={build} />
      </section>
      {!busy && check && check.writeStopped && !view ? (
        <div className="notice">
          <span style={{flex: 1}}>The last build stopped while Claude was still writing, so there is nothing to check yet. Click Build with Claude to start it again.</span>
        </div>
      ) : null}
      {!busy && check && check.canContinue && !check.running ? (
        <div className="notice">
          <span style={{flex: 1}}>
            {check.interrupted ? `Claude stopped during its checks: ${check.interrupted}.` : 'Claude has not finished checking this video.'} It went through {check.rounds} of {(check as any).maxRounds || 3} check rounds. {check.previewMissing ? 'Its work is kept, but there is no preview yet.' : 'The preview below is the video as it is now.'} Claude can pick up exactly where it stopped.
          </span>
          <button className="btn secondary sm" onClick={finish} disabled={provider !== 'claude-code'}>
            Finish the checks
          </button>
        </div>
      ) : null}
      {view && !busy ? (
        <section className="row wrap" style={{gap: 'var(--sp-4)', alignItems: 'flex-start'}}>
          <AgentPreview url={view.previewUrl} aspect={wide ? '16 / 9' : '9 / 16'} width={wide ? 640 : 360} />
          <div className="stack" style={{gap: 'var(--sp-2)', maxWidth: 360}}>
            <span>Your motion graphics video</span>
            <div className="row wrap">
              <a className="btn secondary sm" href={`#/project/${project.id}/edit`}>
                Change it in Edit
              </a>
              <a className="btn primary sm" href={`#/project/${project.id}/render`}>
                Render it
              </a>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};
