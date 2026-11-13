import {useEffect, useState} from 'react';
import {ArrowLeft, Copy, DownloadSimple, FilmStrip, Link as LinkIcon, MagnifyingGlass, PaintBrush, Stack, Trash, Warning} from '@phosphor-icons/react';
import {api, type Analysis, type AnalysisSummary} from '../lib/api';
import {fmtDate, go, isRtl, useToast} from '../lib/util';
import {useAiRun} from '../lib/aiRun';
import {AiPanel} from './AiPanel';
import {BlueprintView} from './BlueprintView';

const tone = (n: number) => (n >= 8 ? 'var(--ok)' : n >= 5 ? 'var(--accent)' : 'var(--bad, #ff4d4d)');
const num = (n?: number | null) => (n === null || n === undefined ? null : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
const BEAT_COLOR: Record<string, string> = {hook: '#FF4D4D', setup: '#7C8CFF', problem: '#FF9F43', value: '#2ED573', proof: '#1E90FF', story: '#A55EEA', twist: '#FFD32A', payoff: '#26DE81', cta: '#FF6B9A'};

const Score = ({score}: {score: number}) => {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width={76} height={76} viewBox="0 0 76 76" role="img" aria-label={`Hook score ${score} out of 10`} style={{flex: 'none'}}>
      <circle cx={38} cy={38} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={7} />
      <circle cx={38} cy={38} r={r} fill="none" stroke={tone(score)} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${(c * score) / 10} ${c}`} transform="rotate(-90 38 38)" />
      <text x={38} y={44} textAnchor="middle" fontSize={21} fontWeight={800} fill="var(--text)">
        {Math.round(score * 10) / 10}
      </text>
    </svg>
  );
};

const CopyBtn = ({text, label = 'Copy'}: {text: string; label?: string}) => {
  const toast = useToast();
  return (
    <button
      className="btn ghost sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast('Copied.');
        } catch {
          toast('Could not copy.', 'bad');
        }
      }}
    >
      <Copy size={14} aria-hidden /> {label}
    </button>
  );
};

const Section = ({title, children, aside}: {title: string; children: React.ReactNode; aside?: React.ReactNode}) => (
  <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
    <div className="row between wrap" style={{gap: 'var(--sp-2)'}}>
      <h3>{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

const Bullets = ({items, kind}: {items: string[]; kind?: 'ok' | 'bad'}) =>
  items.length ? (
    <ul className={`hook-list ${kind || ''}`}>
      {items.map((x, i) => (
        <li key={i} dir="auto">
          {x}
        </li>
      ))}
    </ul>
  ) : (
    <span className="muted">Nothing noted.</span>
  );

// ---------------------------------------------------------------- the report of one video
const Report = ({id}: {id: string}) => {
  const toast = useToast();
  const [a, setA] = useState<Analysis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'look' | 'library' | null>(null);
  useEffect(() => {
    api().analyze.get(id).then(setA, (e) => setErr(e.message));
  }, [id]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!a) return <p className="muted">Loading the analysis</p>;
  const r = a.report;
  const m = a.meta || ({platform: 'Web'} as Analysis['meta']);
  const v = a.voice;
  const f = a.facts || {};
  const title = m.title || a.source.url || a.source.file || 'Video';

  const makeLook = async () => {
    if (!a.video) return;
    setBusy('look');
    try {
      const look = await api().looks.ai({referencePath: a.video, name: m.title ? `Like ${m.uploader || m.title}`.slice(0, 50) : undefined});
      const saved = await api().looks.save({...look});
      toast(`Look "${saved.label}" saved. Choose it for a project in Looks or when you create one.`);
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
    } finally {
      setBusy(null);
    }
  };
  const addLibrary = async () => {
    if (!a.video) return;
    setBusy('library');
    try {
      await api().library.add(a.video);
      toast('Added to your Library.');
    } catch (e: any) {
      toast(e.message, 'bad');
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!confirm('Delete this analysis and its downloaded video? This cannot be undone.')) return;
    await api().analyze.remove(a.id);
    go('#/analyze');
  };
  const sheetText = r
    ? [`# Style sheet: ${title}`, '', `Hook: ${r.hook.template}`, '', ...Object.entries(r.styleSheet).filter(([, x]) => x).map(([k, x]) => `- ${k}: ${x}`), '', 'Take:', ...r.steal.map((s) => `- ${s}`), '', 'Script:', r.scriptTemplate].join('\n')
    : '';
  const totalSec = m.durationSec || f.durationSec || Math.max(1, ...(r?.structure || []).map((s) => s.toSec));

  return (
    <div className="page">
      <a className="row" href="#/analyze" style={{gap: 6, width: 'fit-content'}}>
        <ArrowLeft size={16} aria-hidden /> All analyses
      </a>
      <div className="page-head">
        <div style={{minWidth: 0}}>
          <h1 dir="auto" style={{overflowWrap: 'anywhere'}}>
            {title}
          </h1>
          <div className="row wrap" style={{gap: 'var(--sp-2)', marginTop: 'var(--sp-2)'}}>
            <span className="chip accent">{m.platform}</span>
            {m.uploader ? <span className="chip">{m.uploader}</span> : null}
            {m.followers ? <span className="chip mono">{num(m.followers)} followers</span> : null}
            {m.views ? <span className="chip mono">{num(m.views)} views</span> : null}
            {m.likes ? <span className="chip mono">{num(m.likes)} likes</span> : null}
            {m.comments ? <span className="chip mono">{num(m.comments)} comments</span> : null}
            {m.engagement !== undefined ? <span className="chip mono" title="(likes + comments) / views">{m.engagement}% engagement</span> : null}
            {m.durationSec ? <span className="chip mono">{m.durationSec}s</span> : null}
            {m.uploadDate ? <span className="chip mono">{m.uploadDate}</span> : null}
          </div>
        </div>
        <div className="row wrap" style={{gap: 'var(--sp-2)'}}>
          <button className="btn primary" onClick={makeLook} disabled={!a.video || busy !== null} title="Colours, fonts, grade, sound and the style blueprint of this video">
            <PaintBrush size={18} aria-hidden /> {busy === 'look' ? 'Making the look' : 'Make a look from it'}
          </button>
          <button className="btn secondary" onClick={addLibrary} disabled={!a.video || busy !== null}>
            <Stack size={18} aria-hidden /> Add to Library
          </button>
          {m.webpage && /^https:\/\//.test(m.webpage) ? (
            <button className="btn ghost" onClick={() => api().shell.external(m.webpage!)}>
              <LinkIcon size={18} aria-hidden /> Open original
            </button>
          ) : null}
          <button className="btn ghost" onClick={remove} aria-label="Delete this analysis">
            <Trash size={18} aria-hidden />
          </button>
        </div>
      </div>

      <AiPanel job="look" />
      {a.status !== 'done' ? (
        <div className="notice bad">
          <Warning size={18} aria-hidden style={{flex: 'none'}} />
          <span>{a.status === 'failed' ? `This analysis did not finish: ${a.error || 'unknown error'}` : 'This analysis is still running or was interrupted.'}</span>
        </div>
      ) : null}

      <div className="hook-grid">
        <div className="stack ana-side" style={{gap: 'var(--sp-3)'}}>
          {a.videoUrl ? <video className="ana-video" src={a.videoUrl} controls playsInline preload="metadata" poster={a.thumbUrl || undefined} /> : null}
          {a.palette?.length ? (
            <section className="card pad stack" style={{gap: 'var(--sp-2)'}}>
              <span className="label-sm">Colours measured from the frames</span>
              <div className="swatches">
                {a.palette.map((c) => (
                  <span className="sw" key={c.hex}>
                    <i style={{background: c.hex}} />
                    <span className="mono">{c.hex}</span>
                    <span className="faint">{c.share}%</span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          <section className="card pad stack" style={{gap: 'var(--sp-2)'}}>
            <span className="label-sm">The edit, measured</span>
            <div className="ana-facts">
              {[
                ['Cuts per minute', f.cutsPerMinute],
                ['Average shot', f.averageShotSec !== undefined ? `${f.averageShotSec}s` : null],
                ['Graphics per minute', f.graphicsPerMinute],
                ['Graphic stays', f.averageGraphicSec !== undefined ? `${f.averageGraphicSec}s` : null],
                ['Zoom punch-ins / min', f.punchInsPerMinute],
                ['Music tempo', f.audio?.bpm ? `${f.audio.bpm} BPM${f.audio.steadyBeat ? '' : ' (unsure)'}` : null],
                ['Cuts on the beat', f.audio?.cutsOnBeat !== null && f.audio?.cutsOnBeat !== undefined ? `${Math.round(f.audio.cutsOnBeat * 100)}%` : null],
                ['Captions change every', f.captions?.cadenceMs ? `${f.captions.cadenceMs} ms` : null],
              ]
                .filter(([, x]) => x !== null && x !== undefined)
                .map(([k, x]) => (
                  <div key={k as string}>
                    <span className="faint">{k}</span>
                    <b className="mono">{x as any}</b>
                  </div>
                ))}
            </div>
            {f.transitionTypes && Object.keys(f.transitionTypes).length ? (
              <span className="help">Transitions: {Object.entries(f.transitionTypes).map(([k, n]) => `${n} ${k}`).join(', ')}</span>
            ) : null}
          </section>
        </div>

        <div className="stack" style={{gap: 'var(--sp-4)', minWidth: 0}}>
          {r ? (
            <>
              <section className="card pad">
                <p dir="auto" style={{fontSize: 'var(--fs-md)', lineHeight: 1.55}}>
                  {r.summary}
                </p>
              </section>

              <Section title="The hook" aside={<CopyBtn text={r.hook.template} label="Copy the template" />}>
                <div className="row" style={{gap: 'var(--sp-4)', alignItems: 'center'}}>
                  <Score score={r.hook.score} />
                  <div className="stack" style={{gap: 4, minWidth: 0}}>
                    {r.hook.type ? <span className="chip accent" style={{width: 'fit-content'}}>{r.hook.type}</span> : null}
                    <b dir="auto" style={{fontSize: 'var(--fs-lg)'}}>
                      “{r.hook.firstWords}”
                    </b>
                    {r.hook.translation && r.hook.translation !== r.hook.firstWords ? <span className="muted">{r.hook.translation}</span> : null}
                  </div>
                </div>
                {a.hookUrl ? <img className="hook-sheet" src={a.hookUrl} alt="Frames at 0, 0.4, 0.9, 1.5, 2.2 and 3 seconds" /> : null}
                {r.hook.visual ? (
                  <p>
                    <span className="label-sm">What you see </span>
                    {r.hook.visual}
                  </p>
                ) : null}
                <p>
                  <span className="label-sm">Why it works </span>
                  {r.hook.whyItWorks}
                </p>
                {r.hook.techniques.length ? (
                  <div className="row wrap" style={{gap: 6}}>
                    {r.hook.techniques.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
                {r.hook.template ? (
                  <div className="ana-quote" dir="auto">
                    {r.hook.template}
                  </div>
                ) : null}
              </Section>

              {r.structure.length ? (
                <Section title="Structure">
                  <div className="ana-beats" aria-hidden>
                    {r.structure.map((s, i) => (
                      <i key={i} style={{left: `${(s.fromSec / totalSec) * 100}%`, width: `${Math.max(1, ((s.toSec - s.fromSec) / totalSec) * 100)}%`, background: BEAT_COLOR[s.beat] || 'var(--primary)'}} title={s.beat} />
                    ))}
                  </div>
                  <div className="stack" style={{gap: 6}}>
                    {r.structure.map((s, i) => (
                      <div key={i} className="row" style={{gap: 'var(--sp-3)', alignItems: 'baseline'}}>
                        <span className="mono faint" style={{minWidth: 84}}>
                          {s.fromSec}s to {s.toSec}s
                        </span>
                        <span className="chip" style={{borderColor: BEAT_COLOR[s.beat], minWidth: 64, justifyContent: 'center'}}>
                          {s.beat}
                        </span>
                        <span dir="auto">{s.what}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : null}

              <div className="grid-2">
                <Section title="Theme">
                  {r.theme.colors.length ? (
                    <div className="stack" style={{gap: 6}}>
                      {r.theme.colors.map((c) => (
                        <div key={c.hex + c.role} className="row" style={{gap: 'var(--sp-2)', alignItems: 'center'}}>
                          <i className="ana-dot" style={{background: c.hex}} />
                          <span className="mono">{c.hex}</span>
                          <b>{c.role}</b>
                          <span className="muted">{c.feel}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {[
                    ['Mood', r.theme.mood],
                    ['Type', r.theme.typography],
                    ['Grade', r.theme.grade],
                  ].map(([k, x]) =>
                    x ? (
                      <p key={k}>
                        <span className="label-sm">{k} </span>
                        {x}
                      </p>
                    ) : null,
                  )}
                </Section>

                <Section title="Tone of voice">
                  {v ? (
                    <div className="ana-facts">
                      <div>
                        <span className="faint">Pitch</span>
                        <b>{v.labels.pitch}</b>
                      </div>
                      <div>
                        <span className="faint">Energy</span>
                        <b>{v.labels.energy}</b>
                      </div>
                      <div>
                        <span className="faint">Pace</span>
                        <b>{v.wordsPerMinute ? `${v.wordsPerMinute} words/min (${v.labels.pace})` : v.labels.pace}</b>
                      </div>
                      {v.pauseSharePercent !== null ? (
                        <div>
                          <span className="faint">Pauses</span>
                          <b>
                            {v.pauseSharePercent}% of the time, {v.longPauses} long
                          </b>
                        </div>
                      ) : null}
                      {v.first3sLouderByDb !== null ? (
                        <div>
                          <span className="faint">First 3 seconds</span>
                          <b>
                            {v.first3sLouderByDb > 0 ? '+' : ''}
                            {v.first3sLouderByDb} dB vs the rest
                          </b>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="muted">The voice could not be measured.</span>
                  )}
                  {[
                    ['Delivery', r.tone.delivery],
                    ['Emotion', r.tone.emotion],
                  ].map(([k, x]) =>
                    x ? (
                      <p key={k}>
                        <span className="label-sm">{k} </span>
                        {x}
                      </p>
                    ) : null,
                  )}
                  {r.tone.howToCopy ? <div className="ana-quote">{r.tone.howToCopy}</div> : null}
                </Section>
              </div>

              <Section title="Editing, transitions and motion">
                {Object.entries({Rhythm: r.editing.rhythm, Transitions: r.editing.transitions, Animations: r.editing.animations, 'Motion graphics': r.editing.motionGraphics, Captions: r.editing.captions, Sound: r.editing.sound}).map(([k, x]) =>
                  x ? (
                    <p key={k}>
                      <span className="label-sm">{k} </span>
                      {x}
                    </p>
                  ) : null,
                )}
                {a.blueprint ? (
                  <details>
                    <summary style={{cursor: 'pointer', fontWeight: 600}}>Full style blueprint (every component, animation and effect found)</summary>
                    <div style={{marginTop: 'var(--sp-3)'}}>
                      <BlueprintView blueprint={a.blueprint} style={a.style} facts={a.facts} />
                    </div>
                  </details>
                ) : null}
              </Section>

              <div className="grid-2">
                <Section title="What to take for your reels">
                  <Bullets items={r.steal} kind="ok" />
                </Section>
                <Section title="Why it performs">
                  <Bullets items={r.whyItPerforms} />
                  {r.audience ? (
                    <p>
                      <span className="label-sm">Audience </span>
                      {r.audience}
                    </p>
                  ) : null}
                  {r.cta ? (
                    <p dir="auto">
                      <span className="label-sm">Call to action </span>
                      {r.cta}
                    </p>
                  ) : null}
                </Section>
              </div>
              {r.avoid.length ? (
                <Section title="Do not copy">
                  <Bullets items={r.avoid} kind="bad" />
                </Section>
              ) : null}

              {r.scriptTemplate ? (
                <Section title="Script template" aside={<CopyBtn text={r.scriptTemplate} />}>
                  <pre className="ana-pre" dir="auto">
                    {r.scriptTemplate}
                  </pre>
                </Section>
              ) : null}

              <Section title="Style sheet" aside={<CopyBtn text={sheetText} label="Copy the style sheet" />}>
                <div className="ana-facts wide">
                  {Object.entries({Captions: r.styleSheet.captions, Layout: r.styleSheet.layout, Pacing: r.styleSheet.pacing, Colours: r.styleSheet.colors, Sound: r.styleSheet.sound, Motion: r.styleSheet.motion})
                    .filter(([, x]) => x)
                    .map(([k, x]) => (
                      <div key={k}>
                        <span className="faint">{k}</span>
                        <span>{x}</span>
                      </div>
                    ))}
                </div>
                <span className="help">"Make a look from it" turns this into a look the engine applies: colours, fonts, grade, sound kit, and the blueprint that guides the plan.</span>
              </Section>
            </>
          ) : null}

          {a.transcript ? (
            <Section title="Transcript" aside={a.transcript.text ? <CopyBtn text={a.transcript.text} /> : undefined}>
              {a.transcript.text ? (
                <p dir="auto" className={isRtl(a.transcript.text) ? 'rtl' : undefined} style={{whiteSpace: 'pre-wrap', lineHeight: 1.6}}>
                  {a.transcript.text}
                </p>
              ) : (
                <span className="muted">{a.transcript.note || 'No speech found.'}</span>
              )}
              {a.transcript.language ? <span className="help">Language detected: {a.transcript.language}</span> : null}
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- paste a link, see past analyses
const Start = () => {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [cookies, setCookies] = useState('');
  const [items, setItems] = useState<AnalysisSummary[] | null>(null);
  const [yt, setYt] = useState<{ok: boolean; version?: string; how?: string} | null>(null);
  const [installing, setInstalling] = useState(false);
  const live = useAiRun('analyze');
  const running = !!live?.running;
  const load = () => api().analyze.list().then(setItems, () => setItems([]));
  useEffect(() => {
    load();
    api().analyze.ytdlp().then(setYt, () => setYt({ok: false}));
  }, []);
  useEffect(() => {
    if (live && !live.running) load();
  }, [live?.running]);

  const start = async (req: {url?: string; file?: string; cookies?: string}) => {
    try {
      const {id} = await api().analyze.start(req);
      go(`#/analyze/${id}`);
    } catch (e: any) {
      if (!/stopped/i.test(e.message)) toast(e.message, 'bad');
      load();
    }
  };
  const fromLink = () => {
    const u = url.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) return toast('Paste the full link of one video (it starts with https://).', 'bad');
    start({url: u, cookies: cookies || undefined});
  };
  const fromFile = async () => {
    const f = await api().media.pick(['video']);
    if (f[0]) start({file: f[0]});
  };
  const install = async () => {
    setInstalling(true);
    try {
      setYt(await api().analyze.install());
      toast('yt-dlp is installed.');
    } catch (e: any) {
      toast(e.message, 'bad');
    } finally {
      setInstalling(false);
    }
  };
  const remove = async (id: string) => {
    if (!confirm('Delete this analysis and its downloaded video? This cannot be undone.')) return;
    await api().analyze.remove(id);
    load();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Analyze</h1>
          <p>Paste the link of a reel, a TikTok or a YouTube video. OmniMotion downloads it, studies its hook, structure, colours, transitions, animations and motion graphics, listens to the voice, and tells you what to take from it. Then make a look from it in one click.</p>
        </div>
      </div>

      <section className="card pad stack" style={{gap: 'var(--sp-3)'}}>
        <form
          className="row wrap"
          style={{gap: 'var(--sp-2)'}}
          onSubmit={(e) => {
            e.preventDefault();
            fromLink();
          }}
        >
          <input className="input" style={{flex: 1, minWidth: 260}} type="url" inputMode="url" placeholder="https://www.instagram.com/reel/...   or a TikTok or YouTube link" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Video link" disabled={running} />
          <button className="btn primary" type="submit" disabled={running || !url.trim() || !yt?.ok}>
            <MagnifyingGlass size={18} aria-hidden /> {running ? 'Analyzing' : 'Analyze'}
          </button>
        </form>
        <div className="row wrap between" style={{gap: 'var(--sp-3)', alignItems: 'center'}}>
          <div className="row wrap" style={{gap: 'var(--sp-2)', alignItems: 'center'}}>
            <label className="label-sm" htmlFor="cookies">
              Use my browser sign-in
            </label>
            <select id="cookies" className="select sm" style={{width: 'auto'}} value={cookies} onChange={(e) => setCookies(e.target.value)} disabled={running}>
              <option value="">No (public videos)</option>
              <option value="chrome">Chrome</option>
              <option value="edge">Edge</option>
              <option value="firefox">Firefox</option>
              <option value="brave">Brave</option>
              <option value="opera">Opera</option>
            </select>
          </div>
          <button className="btn ghost sm" onClick={fromFile} disabled={running}>
            <FilmStrip size={16} aria-hidden /> Analyze a file instead
          </button>
        </div>
        <span className="help">Instagram often asks to be signed in: pick the browser where you are signed in to it. The sign-in is read on this computer only and is never sent anywhere else. Only analyze videos you are allowed to download.</span>
        {yt && !yt.ok ? (
          <div className="notice">
            <Warning size={18} aria-hidden style={{flex: 'none'}} />
            <span style={{flex: 1}}>Downloading from links needs yt-dlp, a free open-source downloader. Install the official Windows version (about 18 MB, from the yt-dlp project on GitHub).</span>
            <button className="btn secondary sm" onClick={install} disabled={installing}>
              <DownloadSimple size={14} aria-hidden /> {installing ? 'Installing' : 'Install yt-dlp'}
            </button>
          </div>
        ) : yt?.ok ? (
          <span className="faint" style={{fontSize: 'var(--fs-xs)'}}>
            yt-dlp {yt.version} ({yt.how})
          </span>
        ) : null}
      </section>

      <AiPanel job="analyze" />

      {items && items.length ? (
        <div className="grid-cards" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))'}}>
          {items.map((it) => (
            <article key={it.id} className="card ana-card">
              <a href={`#/analyze/${it.id}`} className="ana-thumb" aria-label={`Open the analysis of ${it.meta?.title || 'this video'}`}>
                {it.thumbUrl ? <img src={it.thumbUrl} alt="" loading="lazy" /> : <FilmStrip size={32} aria-hidden />}
                {it.hookScore !== null ? (
                  <span className="ana-score" style={{background: tone(it.hookScore)}} title="Hook score">
                    {it.hookScore}
                  </span>
                ) : null}
              </a>
              <div className="stack" style={{padding: 'var(--sp-3) var(--sp-4) var(--sp-4)', gap: 'var(--sp-2)'}}>
                <a href={`#/analyze/${it.id}`} className="ana-title" dir="auto">
                  {it.meta?.title || it.source.url || it.source.file || 'Video'}
                </a>
                <div className="row wrap" style={{gap: 6}}>
                  <span className="chip accent">{it.meta?.platform || 'Web'}</span>
                  {it.meta?.views ? <span className="chip mono">{num(it.meta.views)} views</span> : null}
                  {it.status === 'failed' ? <span className="chip" style={{color: 'var(--bad, #ff4d4d)'}}>Failed</span> : it.status === 'working' ? <span className="chip">Not finished</span> : null}
                </div>
                {it.status === 'failed' && it.error ? <span className="help">{it.error}</span> : null}
                <div className="row between">
                  <span className="faint" style={{fontSize: 'var(--fs-xs)'}}>
                    {fmtDate(it.createdAt)}
                  </span>
                  <button className="btn ghost sm" onClick={() => remove(it.id)} aria-label="Delete this analysis" disabled={running && it.status === 'working'}>
                    <Trash size={14} aria-hidden />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : items ? (
        <div className="card empty">
          <MagnifyingGlass size={28} aria-hidden />
          <h3>No analyses yet</h3>
          <p className="muted">Paste a link above. A one-minute reel takes about two to five minutes: downloading, measuring every frame, transcribing, and two passes by Claude.</p>
        </div>
      ) : null}
    </div>
  );
};

export const Analyze = ({id}: {id?: string}) => (id ? <Report key={id} id={id} /> : <Start />);
