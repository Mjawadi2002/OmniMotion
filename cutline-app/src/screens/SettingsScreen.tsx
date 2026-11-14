import {useEffect, useState, type ReactNode} from 'react';
import {CheckCircle, Warning, XCircle} from '@phosphor-icons/react';
import {api, type EngineInfo, type GatewayStatus, type Settings} from '../lib/api';
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

const KeyField = ({label, has, name, onChange, help}: {label: string; has: boolean; name: 'elevenlabs' | 'anthropic' | 'freellm'; onChange: () => void; help: string}) => {
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

      <FreeModels settings={settings} save={save} onChange={onChange} />

      <MemorySection settings={settings} save={save} />

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

// Free models: the gateway built into OmniMotion (FreeLLMAPI, nothing to install) with the free keys the user adds here,
// or the user's own FreeLLMAPI. Only OmniMotion uses it.
const PRESET_MODELS = ['auto:smart', 'auto', 'auto:fast'];
const FreeModels = ({settings, save, onChange}: {settings: Settings; save: (p: any) => Promise<void>; onChange: () => void}) => {
  const [res, setRes] = useState<{ok: boolean; message: string} | null>(null);
  const [testing, setTesting] = useState(false);
  const mode = settings.llmMode || 'claude';
  const source = settings.freeSource || 'builtin';
  const model = settings.freeModel || 'auto:smart';
  const preset = PRESET_MODELS.includes(model);
  const test = async () => {
    setTesting(true);
    setRes(null);
    try {
      setRes(await api().free.test());
    } catch (e: any) {
      setRes({ok: false, message: e.message});
    } finally {
      setTesting(false);
    }
  };
  return (
    <Section
      title="Free models"
      desc="Run OmniMotion's AI work on free models when you want, or when your Claude limit is reached. The free model gateway is built into OmniMotion: you only add the free keys you get from each provider. Only OmniMotion uses it; your system and your Claude setup are not changed."
    >
      <div className="field">
        <span className="label">Which AI does the work</span>
        <div className="seg" role="group" aria-label="Which AI does the work" style={{alignSelf: 'flex-start'}}>
          <button aria-pressed={mode === 'claude'} onClick={() => save({llmMode: 'claude'})}>
            Claude only
          </button>
          <button aria-pressed={mode === 'fallback'} onClick={() => save({llmMode: 'fallback'})}>
            Claude, then free
          </button>
          <button aria-pressed={mode === 'free'} onClick={() => save({llmMode: 'free'})}>
            Free only
          </button>
        </div>
        <span className="help">
          {mode === 'claude'
            ? 'Everything uses your Claude plan.'
            : mode === 'fallback'
              ? 'Claude does the work; when your Claude limit is reached, the same job continues on free models in the same conversation, from where Claude stopped.'
              : 'Everything uses the free models, never your Claude plan.'}
        </span>
      </div>
      {mode !== 'claude' ? (
        <>
          <div className="notice">
            <span style={{flex: 1}}>
              The method, rules and checks stay exactly the same, but free models are weaker than Claude: scripts, edits and reports usually go well; full animation builds are rougher and slower, and free tiers have daily limits. Each provider's terms still apply to the keys you add.
            </span>
          </div>
          <div className="field">
            <span className="label">Gateway</span>
            <div className="seg" role="group" aria-label="Free model gateway" style={{alignSelf: 'flex-start'}}>
              <button aria-pressed={source === 'builtin'} onClick={() => save({freeSource: 'builtin'})}>
                Built into OmniMotion
              </button>
              <button aria-pressed={source === 'external'} onClick={() => save({freeSource: 'external'})}>
                My own FreeLLMAPI
              </button>
            </div>
          </div>
          {source === 'builtin' ? (
            <BuiltinGateway />
          ) : (
            <>
              <div className="field">
                <label htmlFor="free-base">Gateway address</label>
                <input id="free-base" className="input" defaultValue={settings.freeBase || 'http://127.0.0.1:3001'} placeholder="http://127.0.0.1:3001" onBlur={(e) => save({freeBase: e.target.value.trim()})} />
                <span className="help">Where your FreeLLMAPI runs (the default port is 3001).</span>
              </div>
              <KeyField label="FreeLLMAPI key" name="freellm" has={!!settings.hasKeys.freellm} onChange={onChange} help="The unified key from your FreeLLMAPI dashboard (it starts with freellmapi-)." />
            </>
          )}
          <div className="field">
            <label htmlFor="free-model">Model</label>
            <select id="free-model" className="input" value={preset ? model : 'custom'} onChange={(e) => e.target.value !== 'custom' && save({freeModel: e.target.value})}>
              <option value="auto:smart">Smartest available (auto:smart)</option>
              <option value="auto">Balanced (auto)</option>
              <option value="auto:fast">Fastest (auto:fast)</option>
              <option value="custom">A specific model (type it below)</option>
            </select>
            <input className="input" defaultValue={preset ? '' : model} placeholder="Optional: a model id from the gateway" onBlur={(e) => e.target.value.trim() && save({freeModel: e.target.value.trim()})} />
            <span className="help">The gateway picks among the providers you added; the smartest fits OmniMotion's work best.</span>
          </div>
          <div className="row wrap">
            <button className="btn primary" disabled={testing || (source === 'external' && !settings.hasKeys.freellm)} onClick={test}>
              {testing ? 'Testing' : 'Test the gateway'}
            </button>
          </div>
          {res ? (
            <div className={`notice ${res.ok ? '' : 'bad'}`} role="status">
              {res.ok ? <CheckCircle size={18} color="var(--ok)" aria-hidden /> : <XCircle size={18} color="var(--danger)" aria-hidden />}
              <span>{res.message}</span>
            </div>
          ) : null}
        </>
      ) : null}
    </Section>
  );
};

// the providers to add keys for, each with its official key page and what it is good for
const BuiltinGateway = () => {
  const toast = useToast();
  const [st, setSt] = useState<GatewayStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = () =>
    api()
      .gateway.status()
      .then((x) => {
        setSt(x);
        setErr(null);
      })
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);
  const add = async (platform: string) => {
    setBusy(platform);
    try {
      await api().gateway.addKey(platform, drafts[platform] || '');
      setDrafts((d) => ({...d, [platform]: ''}));
      toast('Key added. The gateway checks it in the background.');
      await load();
    } catch (e: any) {
      toast(e.message, 'bad');
    } finally {
      setBusy(null);
    }
  };
  const remove = async (id: number) => {
    await api().gateway.removeKey(id);
    await load();
  };
  if (err) return <div className="notice bad">The built-in gateway did not start: {err}</div>;
  if (!st) return <span className="muted">Starting the built-in gateway</span>;
  if (st.missing) return <div className="notice bad">This build of OmniMotion does not include the free model gateway.</div>;
  return (
    <div className="stack" style={{gap: 'var(--sp-2)'}}>
      <span className="help">
        {st.usablePlatforms && st.usablePlatforms.length
          ? `Running. Keys for ${st.usablePlatforms.length} provider${st.usablePlatforms.length === 1 ? '' : 's'}; add more for more free capacity (when one provider hits its limit, the next one answers).`
          : 'Running. Add at least one free key below: Google AI Studio and Groq are the best start.'}
      </span>
      {(st.providers || []).map((p) => (
        <div key={p.platform} className="card pad stack" style={{gap: 'var(--sp-2)'}}>
          <div className="row between wrap" style={{gap: 'var(--sp-2)'}}>
            <b>{p.name}</b>
            <button className="btn ghost sm" onClick={() => api().shell.external(p.url)}>
              Get a free key
            </button>
          </div>
          <span className="help">
            {p.good}
            {p.note ? ` ${p.note}` : ''}
          </span>
          {p.keys.map((k) => (
            <div key={k.id} className="row between" style={{gap: 'var(--sp-2)'}}>
              <span className="mono" style={{fontSize: 'var(--fs-sm)'}}>
                {k.masked} <span className="faint">{k.status === 'healthy' || k.status === 'ok' ? 'working' : k.status === 'unknown' ? 'checking' : k.status}</span>
              </span>
              <button className="btn ghost sm" onClick={() => remove(k.id)}>
                Remove
              </button>
            </div>
          ))}
          <div className="row" style={{gap: 'var(--sp-2)'}}>
            <input className="input" type="password" autoComplete="off" placeholder={`Paste your ${p.name} key`} value={drafts[p.platform] || ''} onChange={(e) => setDrafts((d) => ({...d, [p.platform]: e.target.value}))} />
            <button className="btn primary" disabled={busy === p.platform || !(drafts[p.platform] || '').trim()} onClick={() => add(p.platform)}>
              {busy === p.platform ? 'Adding' : 'Add'}
            </button>
          </div>
        </div>
      ))}
      <span className="help">Keys are stored encrypted on this computer, by the gateway inside OmniMotion. FreeLLMAPI (MIT, by Tashfeen Ahmed) powers it.</span>
    </div>
  );
};

// What Claude remembers: your own note, and what each project has learned (recorded by the app, no extra AI calls)
const MemorySection = ({settings, save}: {settings: Settings; save: (p: any) => Promise<void>}) => {
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [projects, setProjects] = useState<{id: string; name: string}[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<{at: number; kind: string; text: string}[]>([]);
  const load = () => {
    api().memory.counts().then(setCounts).catch(() => {});
    api().projects.list().then((l: any[]) => setProjects(l.map((p) => ({id: p.id, name: p.name})))).catch(() => {});
  };
  useEffect(load, []);
  const show = async (id: string) => {
    if (open === id) return setOpen(null);
    setItems(await api().memory.read(id));
    setOpen(id);
  };
  const clear = async (id: string) => {
    await api().memory.forget(id);
    toast('This project memory is cleared.');
    setOpen(null);
    load();
  };
  const withMemory = projects.filter((p) => counts[p.id]);
  return (
    <Section
      title="Memory"
      desc="So Claude does not ask again or redo what was settled. OmniMotion keeps it on this computer: your note below, and for each project the changes you asked for and what was done, undos, spelling fixes and builds. It is given to Claude at the start of each new job; no extra AI calls."
    >
      <div className="field">
        <label htmlFor="mem-note">Always remember (about you and your videos)</label>
        <textarea id="mem-note" className="input" rows={3} defaultValue={settings.memoryNote || ''} placeholder="For example: I am a Tunisian creator in Greece; my handle is @...; captions never in all caps; my audience speaks Tunisian Arabic and French." onBlur={(e) => save({memoryNote: e.target.value.slice(0, 1500)})} />
        <span className="help">Saved when you leave the box. Keep it short: it goes into every job.</span>
      </div>
      <div className="stack" style={{gap: 'var(--sp-2)'}}>
        <span className="label">What each project remembers</span>
        {withMemory.length ? (
          withMemory.map((p) => (
            <div key={p.id} className="card pad stack" style={{gap: 'var(--sp-2)'}}>
              <div className="row between wrap">
                <span>
                  {p.name} <span className="faint">({counts[p.id]})</span>
                </span>
                <span className="row" style={{gap: 4}}>
                  <button className="btn ghost sm" onClick={() => show(p.id)}>
                    {open === p.id ? 'Hide' : 'Show'}
                  </button>
                  <button className="btn ghost sm" onClick={() => clear(p.id)}>
                    Clear
                  </button>
                </span>
              </div>
              {open === p.id ? (
                <ul className="stack" style={{gap: 4, margin: 0, paddingLeft: 18, fontSize: 'var(--fs-sm)'}}>
                  {items.map((it, i) => (
                    <li key={i}>
                      <span className="faint">
                        {new Date(it.at).toLocaleDateString()} {it.kind}:
                      </span>{' '}
                      {it.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        ) : (
          <span className="help">Nothing yet: projects start remembering as you plan, change and build them.</span>
        )}
      </div>
    </Section>
  );
};
