// What the deep study of a reference found: measured facts, components, motion graphics, animations, transitions, effects, captions, the recipe the
// editor follows, what is applied automatically, and what OmniMotion cannot reproduce.
const pct = (v: number | null | undefined) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '');
const list = (v: any) => (Array.isArray(v) ? v : []);

const Engine = ({e}: {e?: string}) => (e && e !== 'none' ? <span className="chip ok" style={{marginLeft: 6}}>{String(e).replace(/^motion:/, 'motion · ')}</span> : e === 'none' ? <span className="chip" style={{marginLeft: 6}}>no equivalent</span> : null);

const Section = ({title, children, open = false}: {title: string; children: any; open?: boolean}) => (
  <details open={open} className="card pad" style={{padding: 'var(--sp-3) var(--sp-4)'}}>
    <summary style={{cursor: 'pointer', fontWeight: 600}}>{title}</summary>
    <div className="stack" style={{gap: 'var(--sp-2)', marginTop: 'var(--sp-3)'}}>
      {children}
    </div>
  </details>
);

export const BlueprintView = ({blueprint: bp, style, facts}: {blueprint: any; style?: any; facts?: any}) => {
  if (!bp) return null;
  const f = facts || {};
  const tt = f.transitionTypes ? Object.entries(f.transitionTypes).map(([k, v]) => `${v} ${k}`).join(', ') : '';
  return (
    <section className="stack" style={{gap: 'var(--sp-3)'}}>
      <h4>What the reference does</h4>
      {bp.summary ? <p className="muted">{bp.summary}</p> : null}

      <div className="row wrap">
        {f.cutsPerMinute !== undefined ? <span className="chip">{f.cutsPerMinute} cuts a minute</span> : null}
        {f.averageShotSec ? <span className="chip">shots of {f.averageShotSec} s</span> : null}
        {tt ? <span className="chip">{tt}</span> : null}
        {f.graphicsPerMinute !== undefined ? <span className="chip">{f.graphicsPerMinute} graphics a minute</span> : null}
        {f.averageGraphicSec ? <span className="chip">each on screen {f.averageGraphicSec} s</span> : null}
        {f.punchInsPerMinute ? <span className="chip">{f.punchInsPerMinute} zoom punch-ins a minute</span> : null}
        {f.captions ? <span className="chip">captions change every {f.captions.cadenceMs} ms</span> : null}
        {f.audio && f.audio.bpm ? <span className="chip">music {f.audio.bpm} BPM{f.audio.cutsOnBeat !== null && f.audio.cutsOnBeat !== undefined ? `, ${pct(f.audio.cutsOnBeat)} of cuts on the beat` : ''}</span> : null}
      </div>

      {list(bp.editRecipe).length ? (
        <Section title="How OmniMotion will recreate it" open>
          <ol style={{margin: 0, paddingLeft: 20}}>
            {list(bp.editRecipe).map((r: string, i: number) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
          {style ? (
            <p className="help">
              Applied automatically: {style.transitions?.length ? `transitions ${style.transitions.join(', ')}; ` : ''}graphics stay about {Math.round((style.pacing?.graphicHoldMs || 0) / 100) / 10} s{style.motionPerMinute ? `; about ${style.motionPerMinute} motion graphics a minute` : ''}
              {style.sfx ? `; sound kit ${style.sfx.kit}, ${style.sfx.density}` : ''}
              {style.captions ? `; captions ${style.captions.karaoke ? 'with' : 'without'} karaoke highlight` : ''}.
            </p>
          ) : null}
        </Section>
      ) : null}

      {list(bp.components).length ? (
        <Section title={`Components (${list(bp.components).length})`}>
          {list(bp.components).map((c: any, i: number) => (
            <div key={i}>
              <b>{c.name}</b>
              <Engine e={c.engine} />
              <div className="help">
                {[c.looks, c.animation && `Moves: ${c.animation}`, c.when && `When: ${c.when}`, c.where && `Where: ${c.where}`, c.perMinute && `${c.perMinute} a minute`].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </Section>
      ) : null}

      {list(bp.motionGraphics).length ? (
        <Section title={`Motion graphics (${list(bp.motionGraphics).length})`}>
          {list(bp.motionGraphics).map((m: any, i: number) => (
            <div key={i}>
              <b>{m.what}</b> <span className="chip">{m.dimension}</span>
              <Engine e={m.engine} />
              {m.animation ? <div className="help">{m.animation}</div> : null}
            </div>
          ))}
        </Section>
      ) : null}

      {list(bp.transitions).length || list(bp.effects).length || bp.animationFeel ? (
        <Section title="Transitions, animations and effects">
          {list(bp.transitions).map((t: any, i: number) => (
            <div key={`t${i}`}>
              <b>{t.type}</b> {typeof t.share === 'number' ? <span className="faint">{pct(t.share)}</span> : null}
              <Engine e={t.engine ? `transition: ${t.engine}` : undefined} />
              {t.notes ? <div className="help">{t.notes}</div> : null}
            </div>
          ))}
          {bp.animationFeel ? (
            <div>
              <b>Animation feel</b>: {[bp.animationFeel.easing, bp.animationFeel.speed].filter(Boolean).join(', ')}
              {bp.animationFeel.notes ? <div className="help">{bp.animationFeel.notes}</div> : null}
            </div>
          ) : null}
          {list(bp.effects).map((x: any, i: number) => (
            <div key={`e${i}`}>
              <b>{x.name}</b>
              <Engine e={x.engine} />
              {x.notes ? <div className="help">{x.notes}</div> : null}
            </div>
          ))}
        </Section>
      ) : null}

      {bp.captions || bp.layout ? (
        <Section title="Captions and layout">
          {bp.captions ? (
            <div>
              <b>Captions</b>: {[bp.captions.position, bp.captions.wordsPerChunk && `${bp.captions.wordsPerChunk} words at a time`, bp.captions.karaoke ? 'karaoke highlight' : null, bp.captions.emphasis].filter(Boolean).join(' · ')}
            </div>
          ) : null}
          {bp.layout ? (
            <div>
              <b>Layout</b>: {bp.layout}
            </div>
          ) : null}
        </Section>
      ) : null}

      {list(bp.cannotReproduce).length ? (
        <Section title="Not possible in OmniMotion yet">
          <ul style={{margin: 0, paddingLeft: 20}}>
            {list(bp.cannotReproduce).map((r: string, i: number) => (
              <li key={i} className="muted">
                {r}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </section>
  );
};
