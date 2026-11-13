import {useState, type ReactNode} from 'react';
import {CheckCircle, Warning, XCircle} from '@phosphor-icons/react';
import {api, type EngineInfo, type Settings} from '../lib/api';
import {useToast} from '../lib/util';
import {ClaudeConnect} from './ClaudeConnect';

const Section = ({title, desc, children}: {title: string; desc: string; children: ReactNode}) => (
  <section className="section">
    <div className="what">
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
    <div className="stack">{children}</div>
  </section>
);

const KeyField = ({label, has, name, onChange, help}: {label: string; has: boolean; name: 'elevenlabs' | 'anthropic'; onChange: () => void; help: string}) => {
  const toast = useToast();
  const [v, setV] = useState('');
  const save = async () => {
    try {
      await api().settings.secret(name, v.trim());
      setV('');
      toast(`${label} saved to this computer's secure storage.`);
      onChange();
    } catch (e: any) {
      toast(e.message, 'bad');
    }
  };
  const clear = async () => {
    await api().settings.secret(name, '');
    toast(`${label} removed.`);
    onChange();
  };
  return (
    <div className="field">
      <label htmlFor={`k-${name}`}>{label}</label>
      <div className="row">
        <input id={`k-${name}`} className="input" type="password" autoComplete="off" value={v} placeholder={has ? 'Saved. Paste a new key to replace it.' : 'Paste your key'} onChange={(e) => setV(e.target.value)} />
        <button className="btn primary" disabled={!v.trim()} onClick={save}>
          Save
        </button>
        {has ? (
          <button className="btn secondary" onClick={clear}>
            Remove
          </button>
        ) : null}
      </div>
      <span className="help">{has ? 'A key is saved.' : help}</span>
    </div>
  );
};

const Check = ({ok, warn, label, detail}: {ok: boolean; warn?: boolean; label: string; detail?: string}) => (
  <div className="it">
    {ok ? <CheckCircle size={18} weight="fill" color="var(--ok)" aria-hidden /> : warn ? <Warning size={18} color="var(--accent)" aria-hidden /> : <XCircle size={18} color="var(--danger)" aria-hidden />}
    <span style={{flex: 1}}>{label}</span>
    <span className="faint" style={{fontSize: 'var(--fs-xs)'}}>
      {detail}
    </span>
  </div>
);

export const SettingsScreen = ({settings, engine, onChange}: {settings: Settings | null; engine: EngineInfo | null; onChange: () => void}) => {
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ok: boolean; message: string} | null>(null);
  if (!settings) return <div className="page muted">Loading</div>;
  const save = async (patch: any) => {
    await api().settings.save(patch);
    onChange();
  };
  const choose = async (key: 'workspaceRoot' | 'enginePath') => {
    const f = await api().shell.folder();
    if (f) await save({[key]: f});
  };
  const test = async (provider: 'claude-code' | 'api') => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await api().ai.test(provider));
    } catch (e: any) {
      setResult({ok: false, message: e.message});
    } finally {
      setTesting(false);
    }
  };
  const provider = settings.aiProvider;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Keys are stored with your operating system's secure storage and are never written to a project.</p>
        </div>
      </div>

      <Section title="Appearance" desc="Follow your system or pick a theme.">
        <div className="seg" role="group" aria-label="Theme" style={{alignSelf: 'flex-start'}}>
          {(['system', 'dark', 'light'] as const).map((t) => (
            <button key={t} aria-pressed={settings.theme === t} onClick={() => save({theme: t})}>
              {t === 'system' ? 'System' : t === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Transcription" desc="How your voice becomes text. Choose per computer; each project can override it.">
        <div className="field">
          <span className="label">Engine</span>
          <div className="seg" role="group" aria-label="Transcription engine" style={{alignSelf: 'flex-start'}}>
            <button aria-pressed={settings.transcription === 'elevenlabs'} onClick={() => save({transcription: 'elevenlabs'})}>
              ElevenLabs
            </button>
            <button aria-pressed={settings.transcription === 'whisper'} onClick={() => save({transcription: 'whisper'})}>
              Whisper (on this computer)
            </button>
          </div>
          <span className="help">
            {settings.transcription === 'elevenlabs' ? 'Most accurate on Tunisian Arabic mixed with French and English. The audio track is uploaded to ElevenLabs.' : 'Everything stays on this computer. Slower, and weaker on mixed languages.'}
          </span>
        </div>
        <KeyField label="ElevenLabs API key" name="elevenlabs" has={settings.hasKeys.elevenlabs} onChange={onChange} help={engine?.elevenlabsKey ? 'No key saved here, but the engine already has one in its .env file.' : 'Without a key, OmniMotion falls back to Whisper automatically.'} />
      </Section>

      <Section title="Claude" desc="Claude reads your transcript and writes the edit plan: which graphics, where, and for vlogs which clip fits each line.">
        <div className="field">
          <span className="label">Connect with</span>
          <div className="seg" role="group" aria-label="Claude connection" style={{alignSelf: 'flex-start'}}>
            <button aria-pressed={provider === 'claude-code'} onClick={() => save({aiProvider: 'claude-code'})}>
              Claude account
            </button>
            <button aria-pressed={provider === 'api'} onClick={() => save({aiProvider: 'api'})}>
              API key
            </button>
            <button aria-pressed={provider === 'off'} onClick={() => save({aiProvider: 'off'})}>
              Off
            </button>
          </div>
        </div>
        {provider === 'claude-code' ? <ClaudeConnect onChange={onChange} /> : null}
        {provider === 'api' ? (
          <div className="stack" style={{gap: 'var(--sp-3)'}}>
            <KeyField label="Anthropic API key" name="anthropic" has={settings.hasKeys.anthropic} onChange={onChange} help="Create a key in the Anthropic Console. Usage is billed to that account." />
            <div className="field">
              <label htmlFor="model">Model (optional)</label>
              <input id="model" className="input" defaultValue={settings.aiModel} placeholder="claude-sonnet-5-5" onBlur={(e) => save({aiModel: e.target.value.trim()})} />
            </div>
            <div>
              <button className="btn primary" disabled={testing || !settings.hasKeys.anthropic} onClick={() => test('api')}>
                {testing ? 'Testing' : 'Test connection'}
              </button>
            </div>
          </div>
        ) : null}
        {provider === 'off' ? <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>Planning with Claude is off. The automatic plan and the manual editor still work.</p> : null}
        {result ? (
          <div className={`notice ${result.ok ? '' : 'bad'}`} role="status">
            {result.ok ? <CheckCircle size={18} color="var(--ok)" aria-hidden /> : <XCircle size={18} color="var(--danger)" aria-hidden />}
            <span>{result.ok ? 'Connected.' : result.message}</span>
          </div>
        ) : null}
      </Section>

      <Section title="Folders" desc="Where projects live and where the editing engine is installed.">
        <div className="field">
          <label>Projects folder</label>
          <div className="row">
            <input className="input" readOnly value={settings.workspaceRoot} />
            <button className="btn secondary" onClick={() => choose('workspaceRoot')}>
              Choose
            </button>
          </div>
        </div>
        <div className="field">
          <label>Engine folder (video-studio)</label>
          <div className="row">
            <input className="input" readOnly value={engine?.root || settings.enginePath || ''} />
            {engine?.bundled ? null : (
              <button className="btn secondary" onClick={() => choose('enginePath')}>
                Choose
              </button>
            )}
          </div>
          {engine && !engine.ok ? (
            <div className="notice bad" role="alert">
              <span>
                The editing engine was not found. Choose the <b>video-studio</b> folder, the one that contains <span className="mono">.claudeskillsedit-style</span>. Until then Looks, planning and rendering cannot work.
              </span>
            </div>
          ) : null}
          <span className="help">
            {engine?.bundled
              ? 'The editing engine is built into OmniMotion, together with Node and ffmpeg, so nothing else needs to be installed.'
              : 'The folder that contains .claude/skills/edit-style. OmniMotion looks for it on its own; choose it here if it cannot.'}
          </span>
        </div>
      </Section>

      <Section title="System check" desc="What OmniMotion needs on this computer to edit and render.">
        <div className="card checklist" style={{padding: '0 var(--sp-4)'}}>
          <Check ok={!!engine?.ok} label="Editing engine" detail={engine?.ok ? 'found' : 'not found'} />
          <Check ok={!!engine?.node} label="Node.js" detail="runs the engine and the renderer" />
          <Check ok={!!engine?.ffmpeg} label="FFmpeg" detail="cuts, mixes and encodes" />
          <Check ok={!!engine?.python && !!engine?.cutoutModel} warn label="Pop-out head" detail={engine?.python && engine?.cutoutModel ? 'Python and cut-out model found' : 'optional: needs Python and the cut-out model'} />
          <Check ok={!!engine?.whisperModel} warn label="Whisper on this computer" detail={engine?.whisperModel ? 'found' : 'optional: used when ElevenLabs is off'} />
          <Check ok={!!engine?.claudeCli} warn label="Claude Code" detail={engine?.claudeCli ? 'found' : 'optional: for planning with your Claude account'} />
        </div>
      </Section>

      <Section title="New project defaults" desc="What the New project dialog starts with.">
        <div className="row wrap">
          <div className="seg" role="group" aria-label="Default mode">
            {(['talking', 'vlog'] as const).map((m) => (
              <button key={m} aria-pressed={settings.defaults.mode === m} onClick={() => save({defaults: {mode: m}})}>
                {m === 'talking' ? 'Talking head' : 'Vlog'}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Default look">
            {(['tech', 'light'] as const).map((m) => (
              <button key={m} aria-pressed={settings.defaults.style === m} onClick={() => save({defaults: {style: m}})}>
                {m === 'tech' ? 'Tech' : 'Light'}
              </button>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
};
