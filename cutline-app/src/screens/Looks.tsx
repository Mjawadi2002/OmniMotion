import {Suspense, lazy, useEffect, useMemo, useState} from 'react';
import {CopySimple, PencilSimple, Plus, SpinnerGap, Trash} from '@phosphor-icons/react';
import {api, type Look, type LookGrade, type LookMeta, type Reference} from '../lib/api';
import {AiPanel} from './AiPanel';
import {BlueprintView} from './BlueprintView';
import {Dialog, useAsync, useToast} from '../lib/util';

const LookPreview = lazy(() => import('./LookPreview'));

type Draft = {id?: string; label: string; family: 'tech' | 'light'; roles: Record<string, string>; fonts: Record<string, string>; grade?: LookGrade; notes?: string; summary?: string; blueprint?: any; style?: any; facts?: any; sfx?: any};

const HEX = /^#[0-9a-fA-F]{6}$/;

// the colours and fonts a look actually uses: its own values laid over the base of its family
export const effective = (meta: LookMeta, d: Pick<Draft, 'family' | 'roles' | 'fonts' | 'grade'>) => ({
  family: d.family,
  roles: {...meta.base[d.family], ...d.roles},
  fonts: d.fonts,
  grade: d.grade || meta.baseGrade[d.family],
});

export const Thumb = ({look, meta}: {look: Pick<Draft, 'family' | 'roles' | 'fonts' | 'grade'>; meta: LookMeta}) => (
  <div className="look-thumb">
    <Suspense fallback={<div className="look-prev-wait">Preview</div>}>
      <LookPreview look={effective(meta, look)} still />
    </Suspense>
  </div>
);

// ---------------------------------------------------------------- picker (used when creating a project and on the Render step)
export const LookPicker = ({looks, meta, value, onChange, family}: {looks: Look[]; meta: LookMeta; value: string; onChange: (l: Look) => void; family?: 'tech' | 'light'}) => (
  <div className="look-pick" role="radiogroup" aria-label="Look">
    {looks
      .filter((l) => !family || l.family === family)
      .map((l) => (
        <button key={l.id} className="look-opt" role="radio" aria-checked={value === l.id} onClick={() => onChange(l)}>
          <Thumb look={l} meta={meta} />
          <span className="t">{l.label}</span>
          <span className="faint" style={{fontSize: 'var(--fs-xs)'}}>
            {l.family === 'tech' ? 'Dark stage' : 'Paper stage'}
            {l.builtin ? '' : ' · yours'}
          </span>
        </button>
      ))}
  </div>
);

// ---------------------------------------------------------------- editor
const FONT_SLOTS: {label: string; keys: string[]; kinds: string[]; help: string}[] = [
  {label: 'Captions and headlines', keys: ['display', 'heading', 'body'], kinds: ['sans', 'display'], help: 'Used for captions, word slams, titles and cards.'},
  {label: 'Accent serif', keys: ['serif'], kinds: ['serif', 'display', 'sans'], help: 'Names, highlighted words and quotes.'},
  {label: 'Numbers', keys: ['numeric'], kinds: ['sans', 'display'], help: 'Counters and prices.'},
  {label: 'Arabic', keys: ['arabic', 'arabicHeading'], kinds: ['arabic'], help: 'Arabic captions and headings.'},
];

const Slider = ({label, value, min, max, step, onChange}: {label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void}) => (
  <div className="field">
    <label>
      {label} <span className="faint mono">{value.toFixed(2)}</span>
    </label>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
  </div>
);

export const LookEditor = ({initial, meta, onClose, onSaved}: {initial: Draft; meta: LookMeta; onClose: () => void; onSaved: (l: Look) => void}) => {
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const groups = meta.groups[d.family];
  const eff = useMemo(() => effective(meta, d), [meta, d]);
  const setRole = (role: string, v: string) => setD((x) => ({...x, roles: {...x.roles, [role]: v}}));
  const setFont = (keys: string[], family: string) =>
    setD((x) => {
      const fonts = {...x.fonts};
      for (const k of keys) {
        if (family) fonts[k] = family;
        else delete fonts[k];
      }
      return {...x, fonts};
    });
  const setGrade = (patch: Partial<LookGrade>) => setD((x) => ({...x, grade: {...eff.grade, ...patch}}));
  const save = async () => {
    try {
      const saved = await api().looks.save({id: d.id, label: d.label.trim() || 'My look', family: d.family, roles: eff.roles, fonts: d.fonts, grade: eff.grade, notes: d.notes, summary: d.summary, blueprint: d.blueprint, style: d.style, facts: d.facts, sfx: d.sfx});
      toast(`Saved "${saved.label}".`);
      onSaved(saved);
    } catch (e: any) {
      toast(e.message, 'bad');
    }
  };
  return (
    <Dialog
      title={initial.id ? 'Edit look' : 'New look'}
      onClose={onClose}
      width={1040}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save look
          </button>
        </>
      }
    >
      <div className="look-editor">
        <div className="stack" style={{gap: 'var(--sp-5)'}}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="ln">Name</label>
              <input id="ln" className="input" value={d.label} onChange={(e) => setD({...d, label: e.target.value})} />
            </div>
            <div className="field">
              <span className="label">Layout family</span>
              <div className="seg" role="group" aria-label="Layout family" style={{alignSelf: 'flex-start'}}>
                <button aria-pressed={d.family === 'tech'} onClick={() => setD({...d, family: 'tech'})}>
                  Dark stage
                </button>
                <button aria-pressed={d.family === 'light'} onClick={() => setD({...d, family: 'light'})}>
                  Paper stage
                </button>
              </div>
              <span className="help">Where things sit and how they move is set by the family. Colours, fonts and grade are yours.</span>
            </div>
          </div>

          {d.notes ? (
            <div className="notice">
              <div>
                <div style={{fontWeight: 600, marginBottom: 2}}>What Claude saw</div>
                <div>{d.notes}</div>
              </div>
            </div>
          ) : null}

          <BlueprintView blueprint={d.blueprint} style={d.style} facts={d.facts} />

          <section className="stack">
            <h4>Colours</h4>
            {groups.map((g) => (
              <div key={g.title} className="stack" style={{gap: 'var(--sp-2)'}}>
                <span className="label">{g.title}</span>
                <div className="rolegrid">
                  {g.roles.map(([role, label]) => {
                    const v = eff.roles[role] || '#000000';
                    return (
                      <label key={role} className="rolerow">
                        <input type="color" value={HEX.test(v) ? v : '#000000'} onChange={(e) => setRole(role, e.target.value)} aria-label={label} />
                        <span style={{flex: 1}}>{label}</span>
                        <input className="input sm mono hexin" value={v} aria-label={`${label} hex`} onChange={(e) => HEX.test(e.target.value) && setRole(role, e.target.value)} />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="stack">
            <h4>Fonts</h4>
            <div className="grid-2">
              {FONT_SLOTS.map((s) => {
                const current = d.fonts[s.keys[0]] || meta.baseFonts[s.keys[0]] || '';
                const options = meta.catalog.filter((c) => s.kinds.includes(c.kind));
                return (
                  <div key={s.label} className="field">
                    <label htmlFor={`fs-${s.keys[0]}`}>{s.label}</label>
                    <select id={`fs-${s.keys[0]}`} className="select" value={current} style={{fontFamily: `"${current}", var(--font-ui)`}} onChange={(e) => setFont(s.keys, e.target.value)}>
                      {options.map((o) => (
                        <option key={o.family} value={o.family}>
                          {o.family}
                        </option>
                      ))}
                    </select>
                    <span className="help">{s.help}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="stack">
            <h4>Picture grade</h4>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="tint">Tint colour</label>
                <div className="row">
                  <input id="tint" type="color" value={eff.grade.tint} onChange={(e) => setGrade({tint: e.target.value})} className="tintin" />
                  <span className="mono muted">{eff.grade.tint}</span>
                </div>
              </div>
              <Slider label="Tint strength" value={eff.grade.tintAlpha} min={0} max={0.2} step={0.01} onChange={(v) => setGrade({tintAlpha: v})} />
              <Slider label="Contrast" value={eff.grade.contrast} min={0.9} max={1.25} step={0.01} onChange={(v) => setGrade({contrast: v})} />
              <Slider label="Colour" value={eff.grade.saturate} min={0.7} max={1.4} step={0.01} onChange={(v) => setGrade({saturate: v})} />
              <Slider label="Vignette" value={eff.grade.vignette} min={0} max={0.6} step={0.01} onChange={(v) => setGrade({vignette: v})} />
            </div>
          </section>
        </div>

        <div className="look-side">
          <div className="look-live">
            <Suspense fallback={<div className="look-prev-wait">Preparing preview</div>}>
              <LookPreview look={eff} />
            </Suspense>
          </div>
          <p className="help">This is the real composition, not a mock-up. Press play to watch the captions, a word slam, a pill list and a quote card in this look. It uses your latest footage when there is some.</p>
        </div>
      </div>
    </Dialog>
  );
};

// ---------------------------------------------------------------- creator: from a reference, from words, or from scratch
const Creator = ({meta, onClose, onDraft}: {meta: LookMeta; onClose: () => void; onDraft: (d: Draft) => void}) => {
  const toast = useToast();
  const [way, setWay] = useState<'reference' | 'words' | 'scratch'>('reference');
  const [refs, setRefs] = useState<Reference[] | null>(null);
  const [refPath, setRefPath] = useState<string>('');
  const [words, setWords] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fam, setFam] = useState<'tech' | 'light'>('tech');
  useEffect(() => {
    api().library.list().then(setRefs).catch(() => setRefs([]));
  }, []);
  const build = async () => {
    setBusy(true);
    try {
      if (way === 'scratch') {
        onDraft({label: name.trim() || 'My look', family: fam, roles: {}, fonts: {}});
        return;
      }
      const r = await api().looks.ai(way === 'reference' ? {referencePath: refPath, name: name.trim() || undefined} : {description: words, name: name.trim() || undefined});
      onDraft({label: r.label, family: r.family, roles: r.roles, fonts: r.fonts, grade: r.grade, notes: r.notes, summary: r.summary, blueprint: r.blueprint, style: r.style, facts: r.facts, sfx: r.sfx});
    } catch (e: any) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const ready = way === 'scratch' || (way === 'reference' && !!refPath) || (way === 'words' && words.trim().length > 8);
  return (
    <Dialog
      title="Create a look"
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" disabled={!ready || busy} onClick={build}>
            {busy ? (
              <>
                <SpinnerGap size={16} className="spin" aria-hidden /> Studying it
              </>
            ) : way === 'scratch' ? (
              'Continue'
            ) : (
              'Build the look'
            )}
          </button>
        </>
      }
    >
      <div className="seg" role="group" aria-label="How to start" style={{alignSelf: 'flex-start'}}>
        <button aria-pressed={way === 'reference'} onClick={() => setWay('reference')}>
          From a reference
        </button>
        <button aria-pressed={way === 'words'} onClick={() => setWay('words')}>
          Describe it
        </button>
        <button aria-pressed={way === 'scratch'} onClick={() => setWay('scratch')}>
          From scratch
        </button>
      </div>

      <AiPanel job="look" compact />

      {way === 'reference' ? (
        <div className="stack">
          <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>
            Claude looks at frames from the video and the colours measured in them, then sets colours, fonts and picture grade to match. The layout stays one of the two families, and it tells you what it could not match.
          </p>
          <div className="refpick">
            {(refs || []).map((r) => (
              <button key={r.id} className="refopt" aria-pressed={refPath === r.path} onClick={() => setRefPath(r.path)}>
                {r.sheetUrl ? <img src={r.sheetUrl} alt="" /> : null}
                <span>{r.name}</span>
              </button>
            ))}
            {refs === null ? <span className="muted">Reading your references</span> : null}
          </div>
          <div className="row">
            <button
              className="btn secondary sm"
              onClick={async () => {
                const f = await api().media.pick(['video']);
                if (f[0]) setRefPath(f[0]);
              }}
            >
              <Plus size={14} aria-hidden /> Choose another video
            </button>
            {refPath && !(refs || []).some((r) => r.path === refPath) ? <span className="faint mono" style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>{refPath}</span> : null}
          </div>
        </div>
      ) : null}
      {way === 'words' ? (
        <div className="field">
          <label htmlFor="desc">Describe the look</label>
          <textarea id="desc" className="textarea" style={{fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-md)'}} rows={4} value={words} placeholder="For example: deep green and warm orange on cream, a confident serif for headlines, calm and premium" onChange={(e) => setWords(e.target.value)} />
        </div>
      ) : null}
      {way === 'scratch' ? (
        <div className="field">
          <span className="label">Start from</span>
          <div className="seg" role="group" aria-label="Start from" style={{alignSelf: 'flex-start'}}>
            <button aria-pressed={fam === 'tech'} onClick={() => setFam('tech')}>
              Tech
            </button>
            <button aria-pressed={fam === 'light'} onClick={() => setFam('light')}>
              Light
            </button>
          </div>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="nm">Name (optional)</label>
        <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </Dialog>
  );
};

// ---------------------------------------------------------------- screen
export const Looks = () => {
  const toast = useToast();
  const looks = useAsync(() => api().looks.list(), []);
  const meta = useAsync(() => api().looks.meta(), []);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);

  const remove = async (l: Look) => {
    if (!confirm(`Delete the look "${l.label}"? Projects that use it fall back to the plain Tech or Light look.`)) return;
    await api().looks.remove(l.id);
    toast('Look deleted.');
    looks.reload();
  };
  const dup = (l: Look) => setEditing({label: `${l.label} copy`, family: l.family, roles: l.roles, fonts: l.fonts, grade: l.grade});

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Looks</h1>
          <p>A look is the colours, fonts and picture grade of an edit. Build your own from scratch, describe one in words, or let Claude study a reference video and match it.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)} disabled={!meta.data}>
          <Plus size={18} aria-hidden /> New look
        </button>
      </div>
      {meta.error ? <div className="notice bad">{meta.error}</div> : null}
      <div className="look-grid">
        {meta.data &&
          (looks.data || []).map((l) => (
            <article key={l.id} className="card look-card">
              <Thumb look={l} meta={meta.data!} />
              <div className="stack" style={{gap: 'var(--sp-2)', padding: 'var(--sp-4)'}}>
                <div className="row between">
                  <h3 style={{fontSize: 'var(--fs-md)'}}>{l.label}</h3>
                  <span className="chip">{l.family === 'tech' ? 'Dark stage' : 'Paper stage'}</span>
                </div>
                <p className="muted" style={{fontSize: 'var(--fs-sm)', minHeight: 40}}>
                  {l.summary || (l.builtin ? 'Built in.' : 'Custom look.')}
                </p>
                <div className="row wrap">
                  {!l.builtin ? (
                    <button className="btn secondary sm" onClick={() => setEditing({id: l.id, label: l.label, family: l.family, roles: l.roles, fonts: l.fonts, grade: l.grade, notes: l.notes, summary: l.summary, blueprint: l.blueprint, style: l.style, facts: l.facts, sfx: l.sfx})}>
                      <PencilSimple size={14} aria-hidden /> Edit
                    </button>
                  ) : null}
                  <button className="btn ghost sm" onClick={() => dup(l)}>
                    <CopySimple size={14} aria-hidden /> Duplicate
                  </button>
                  {!l.builtin ? (
                    <button className="btn ghost sm" onClick={() => remove(l)}>
                      <Trash size={14} aria-hidden /> Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
      </div>
      {creating && meta.data ? <Creator meta={meta.data} onClose={() => setCreating(false)} onDraft={(d) => (setCreating(false), setEditing(d))} /> : null}
      {editing && meta.data ? <LookEditor initial={editing} meta={meta.data} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), looks.reload())} /> : null}
    </div>
  );
};
