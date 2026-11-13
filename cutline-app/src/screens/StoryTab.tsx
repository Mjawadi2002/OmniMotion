import {useMemo} from 'react';
import {ArrowsClockwise, Play, Waveform} from '@phosphor-icons/react';
import type {EngineInfo, Job, Project, Settings, Word} from '../lib/api';
import {fmtDur, fmtTime, go, isRtl} from '../lib/util';
import type {RunState} from '../lib/run';
import {RunPanel} from './RunPanel';

const lines = (words: Word[]) => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (/[.!?;؟]$/.test(w.text) || cur.length >= 14 || !next || next.startMs - w.endMs > 900) {
      out.push(cur);
      cur = [];
    }
  });
  return out;
};

export const StoryTab = ({project, persist, job, run, engine, settings}: {project: Project; persist: (p: Project) => Promise<void>; job: Job | null; run: {state: RunState; start: (s: 'prepare') => Promise<unknown>; cancel: () => void}; engine: EngineInfo | null; settings: Settings | null}) => {
  const set = (patch: Partial<Project['settings']>) => persist({...project, settings: {...project.settings, ...patch}});
  const stt = project.settings.stt || settings?.transcription || 'elevenlabs';
  const haveKey = engine?.elevenlabsKey;
  const needs = project.mode === 'vlog' ? !project.media.some((m) => m.role === 'voiceover') || !project.media.some((m) => m.role === 'clip') : !project.media.some((m) => m.role === 'footage');
  const ls = useMemo(() => (job?.words ? lines(job.words) : []), [job?.words]);
  const low = job?.words?.filter((w) => typeof w.conf === 'number' && w.conf < 0.55).length || 0;
  const removed = job?.cuts ? job.cuts.cuts.reduce((a, [s, e]) => a + (e - s), 0) : 0;
  const lengthMs = job?.words?.length ? job.words[job.words.length - 1].endMs : 0;
  const busy = run.state.running;

  return (
    <div className="stack" style={{gap: 'var(--sp-5)'}}>
      <div className="row between">
        <div>
          <h2>Story</h2>
          <p className="muted">OmniMotion listens to your voice, cuts the silences (never a word), and writes the transcript the plan is built from.</p>
        </div>
        {job?.prepared ? (
          <button className="btn primary" onClick={() => go(`#/project/${project.id}/plan`)}>
            Continue to Plan
          </button>
        ) : null}
      </div>

      <div className="card pad stack">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="lang">Spoken language</label>
            <select id="lang" className="select" value={project.settings.language || 'auto'} onChange={(e) => set({language: e.target.value})} disabled={busy}>
              <option value="auto">Automatic (mixed Arabic, French, English)</option>
              <option value="ar">Arabic</option>
              <option value="en">English</option>
              <option value="fr">French</option>
            </select>
            <span className="help">Automatic handles Tunisian Arabic mixed with French and English in one sentence.</span>
          </div>
          <div className="field">
            <span className="label">Transcription</span>
            <div className="seg" role="group" aria-label="Transcription engine">
              <button aria-pressed={stt === 'elevenlabs'} onClick={() => set({stt: 'elevenlabs'})} disabled={busy}>
                ElevenLabs
              </button>
              <button aria-pressed={stt === 'whisper'} onClick={() => set({stt: 'whisper'})} disabled={busy}>
                Whisper (on this computer)
              </button>
            </div>
            <span className="help">
              {stt === 'elevenlabs' ? (haveKey ? 'Your audio track is sent to ElevenLabs. Best accuracy on mixed languages.' : 'No ElevenLabs key found, so Whisper will be used. Add a key in Settings.') : 'Runs fully offline with Whisper. Slower and less accurate on mixed languages.'}
            </span>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={project.settings.cutSilence !== false} onChange={(e) => set({cutSilence: e.target.checked})} disabled={busy} />
          Cut silences (pauses longer than about 0.35 s are shortened; words are never touched)
        </label>
        <div className="row">
          <button className="btn primary" disabled={busy || needs} onClick={() => run.start('prepare')}>
            {job?.prepared ? <ArrowsClockwise size={18} aria-hidden /> : <Waveform size={18} aria-hidden />}
            {job?.prepared ? 'Transcribe again' : 'Transcribe and cut'}
          </button>
          {needs ? <span className="help">Add {project.mode === 'vlog' ? 'the narration and at least one clip' : 'your raw footage'} first.</span> : null}
        </div>
      </div>

      {run.state.step === 'prepare' ? <RunPanel run={run.state} onCancel={run.cancel} /> : null}

      {job?.prepared && job.words ? (
        <div className="split">
          <div className="card">
            <div className="row between" style={{padding: 'var(--sp-4)', borderBottom: '1px solid var(--line)'}}>
              <h3>Transcript</h3>
              {low ? <span className="chip accent">{low} uncertain word{low > 1 ? 's' : ''} underlined</span> : <span className="chip ok">No uncertain words</span>}
            </div>
            <div className="transcript">
              {ls.map((l, i) => {
                const text = l.map((w) => w.text).join(' ');
                return (
                  <div className="tline" key={i}>
                    <span className="mono ts">{fmtTime(l[0].startMs)}</span>
                    <div className={`tx ${isRtl(text) && (text.match(/[֐-ࣿ]/g) || []).length > text.length / 3 ? 'rtl' : ''}`}>
                      {l.map((w, j) => (
                        <span key={j} title={`${fmtTime(w.startMs)}${w.conf ? `  confidence ${Math.round(w.conf * 100)}%` : ''}`} className={`w ${typeof w.conf === 'number' && w.conf < 0.55 ? 'low' : ''}`}>
                          {w.text}{' '}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="stack">
            <div className="grid-2">
              <div className="card stat">
                <span className="faint">Words</span>
                <b>{job.words.length}</b>
              </div>
              <div className="card stat">
                <span className="faint">Length</span>
                <b>{fmtDur(lengthMs)}</b>
              </div>
              <div className="card stat">
                <span className="faint">Silences shortened</span>
                <b>{job.cuts?.cuts.length ?? 0}</b>
              </div>
              <div className="card stat">
                <span className="faint">Time removed</span>
                <b>{(removed / 1000).toFixed(1)} s</b>
              </div>
            </div>
            {project.mode === 'vlog' && job.clips ? (
              <div className="card pad stack">
                <h3>Your clips</h3>
                <p className="help">Each sheet shows evenly spaced frames of the clip, left to right. Claude looks at these to match clips to what you say.</p>
                {job.clips.map((c) => (
                  <div key={c.id} className="stack" style={{gap: 'var(--sp-2)'}}>
                    <div className="row between">
                      <span style={{fontWeight: 550}}>{c.name}</span>
                      <span className="faint mono">
                        {fmtDur(c.durationMs)} · {c.portrait ? 'portrait' : 'landscape'}
                      </span>
                    </div>
                    {c.sheetUrl ? <img className="sheet" src={c.sheetUrl} alt={`Frames from ${c.name}`} /> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {!job?.prepared && !busy && run.state.step !== 'prepare' ? (
        <div className="card empty muted">
          <Play size={22} aria-hidden />
          <span>The transcript appears here after you run the step above.</span>
        </div>
      ) : null}
    </div>
  );
};
