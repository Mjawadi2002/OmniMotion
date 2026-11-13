import {Plus, Trash} from '@phosphor-icons/react';
import {api} from '../lib/api';
import {fmtDur, useAsync, useToast} from '../lib/util';

export const Library = () => {
  const toast = useToast();
  const {data, loading, reload, error} = useAsync(() => api().library.list(), []);
  const add = async () => {
    const f = await api().media.pick(['video']);
    for (const p of f) await api().library.add(p);
    if (f.length) {
      toast(`${f.length} reference${f.length > 1 ? 's' : ''} added.`);
      reload();
    }
  };
  const remove = async (id: string) => {
    await api().library.remove(id);
    reload();
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Library</h1>
          <p>The reference videos behind the looks. Colours are measured from the frames, not chosen by eye. Add your own references to keep them in one place.</p>
        </div>
        <button className="btn primary" onClick={add}>
          <Plus size={18} aria-hidden /> Add reference
        </button>
      </div>
      {error ? <div className="notice bad">{error}</div> : null}
      {loading && !data ? <p className="muted">Reading the references and measuring their colours</p> : null}
      <div className="grid-cards" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))'}}>
        {(data || []).map((r) => (
          <article key={r.id} className="card ref" style={{overflow: 'hidden'}}>
            {r.sheetUrl ? (
              <div className="sheetwrap">
                <img className="sheet" src={r.sheetUrl} alt={`Frames from ${r.name}`} />
              </div>
            ) : null}
            <div className="stack" style={{padding: 'var(--sp-4)', gap: 'var(--sp-3)'}}>
              <h3 style={{fontSize: 'var(--fs-md)', lineHeight: 1.35}}>{r.name}</h3>
              <div className="row wrap">
                {r.builtin ? <span className="chip accent">Built in</span> : <span className="chip">Yours</span>}
                {r.durationMs ? <span className="chip mono">{fmtDur(r.durationMs)}</span> : null}
                {r.width ? <span className="chip mono">{r.width}x{r.height}</span> : null}
              </div>
              {r.palette?.length ? (
                <div className="swatches" aria-label="Measured colours">
                  {r.palette.map((c) => (
                    <span className="sw" key={c.hex}>
                      <i style={{background: c.hex}} />
                      <span className="mono">{c.hex}</span>
                      <span className="faint">{c.share}%</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {r.error ? <span className="help">{r.error}</span> : null}
              <div className="row">
                <button className="btn secondary sm" onClick={() => api().shell.open(r.path)}>
                  Play
                </button>
                {!r.builtin ? (
                  <button className="btn ghost sm" onClick={() => remove(r.id)}>
                    <Trash size={14} aria-hidden /> Remove
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="help" style={{maxWidth: '70ch'}}>
        The Tech and Light looks are fixed to the built-in references. A reference you add here is stored and measured. To use one for a project, attach it in that project's Media step, where Claude sees its name when it plans. It does not change the look by itself.
      </p>
    </div>
  );
};
