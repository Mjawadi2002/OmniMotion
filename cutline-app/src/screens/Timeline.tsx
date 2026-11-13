import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowArcLeft, ArrowArcRight, Check, MagnifyingGlassMinus, MagnifyingGlassPlus, PencilSimple, Trash, X} from '@phosphor-icons/react';
import type {Word} from '../lib/api';
import {KINDS, anchorFromWord, makeAnchorResolver, nearestWord} from '../lib/planModel';

type Block = {i: number; id: string; kind: string; label: string; start: number; end: number; lane: 'motion' | 'graphics'; row: number};
type Drag = {i: number; mode: 'move' | 'start' | 'end'; x0: number; start0: number; end0: number; start: number; end: number; free: boolean; moved: boolean};

const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
const LANE_H = 30;
const MIN_MS = 400;

const textOf = (g: any) => {
  const c = g.content || {};
  if (g.kind === 'motion') return c.label || c.scene || 'motion';
  return c.text || c.word || c.heading || c.value || c.name || g.title || (Array.isArray(c.items) ? c.items.map((x: any) => x.text || x.label || x.value).filter(Boolean).join(', ') : '') || '';
};

// pack blocks that overlap in time into separate rows of the same lane
const pack = (blocks: Block[]) => {
  const rows: number[] = [];
  for (const b of [...blocks].sort((a, z) => a.start - z.start)) {
    let r = rows.findIndex((endMs) => endMs <= b.start);
    if (r < 0) {
      r = rows.length;
      rows.push(0);
    }
    rows[r] = b.end;
    b.row = r;
  }
  return Math.max(1, rows.length);
};

// The plan on a timeline: graphics and motion graphics as blocks you can move and resize (they snap to your words), with the captions, the layout
// changes and transitions, the sound effects and the music under them, and the playhead of the preview.
export const Timeline = ({plan, onChange, resolved, words, durationMs, playheadMs, onSeek}: {plan: any; onChange: (p: any) => void; resolved: any; words: Word[]; durationMs: number; playheadMs: number | null; onSeek?: (ms: number) => void}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(0); // pixels per second (0 until fitted)
  const [sel, setSel] = useState<number | null>(null);
  // the caption being edited: its index in the resolved chunks and the text of each of its words
  const [capSel, setCapSel] = useState<number | null>(null);
  const [capDraft, setCapDraft] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const undo = useRef<any[]>([]);
  const redo = useRef<any[]>([]);
  const [, bump] = useState(0);

  // fit the whole video in the visible width the first time
  useEffect(() => {
    if (pps || !scrollRef.current || !durationMs) return;
    const w = scrollRef.current.clientWidth - 16;
    setPps(Math.max(12, Math.min(160, w / (durationMs / 1000))));
  }, [pps, durationMs]);

  const resolve = useMemo(() => makeAnchorResolver(words, durationMs), [words, durationMs]);
  const graphics: any[] = plan.graphics || [];
  const blocks = useMemo(() => {
    const out: Block[] = graphics.map((g, i) => {
      const id = g.id || `g${i}`;
      const r = (resolved?.graphics || []).find((x: any) => x.id === id);
      const start = resolve(g.from, 0, r ? r.startMs : 0);
      const end = resolve(g.to, start, r ? r.endMs : start + 2200);
      return {i, id, kind: g.kind, label: textOf(g), start, end: Math.max(end, start + 200), lane: g.kind === 'motion' ? 'motion' : 'graphics', row: 0};
    });
    if (drag) {
      const b = out.find((x) => x.i === drag.i);
      if (b) {
        b.start = drag.start;
        b.end = drag.end;
      }
    }
    return out;
  }, [graphics, resolved, resolve, drag]);
  const motionRows = pack(blocks.filter((b) => b.lane === 'motion'));
  const graphicRows = pack(blocks.filter((b) => b.lane === 'graphics'));

  const px = (ms: number) => (ms / 1000) * pps;
  const width = Math.max(1, px(durationMs));

  const commit = useCallback(
    (next: any) => {
      undo.current.push(plan);
      if (undo.current.length > 50) undo.current.shift();
      redo.current = [];
      onChange(next);
      bump((n) => n + 1);
    },
    [plan, onChange],
  );
  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(plan);
    onChange(prev);
    bump((n) => n + 1);
  };
  const doRedo = () => {
    const nxt = redo.current.pop();
    if (!nxt) return;
    undo.current.push(plan);
    onChange(nxt);
    bump((n) => n + 1);
  };

  // anchors for a new time: the nearest word (the plan stays tied to your speech), or the exact time when Alt is held
  const anchorsFor = (start: number, end: number, free: boolean) => {
    if (free || !words.length) return {from: {ms: Math.round(start)}, to: {ms: Math.round(end)}};
    const si = nearestWord(words, start, false);
    let ei = nearestWord(words, end, true);
    if (words[ei].endMs <= words[si].startMs + 250) ei = Math.min(words.length - 1, si + 1);
    return {from: anchorFromWord(words, si, false, 0), to: anchorFromWord(words, ei, true, 0)};
  };
  const setTimes = (i: number, start: number, end: number, free: boolean) => {
    const a = anchorsFor(start, end, free);
    commit({...plan, graphics: graphics.map((g, j) => (j === i ? {...g, from: a.from, to: a.to} : g))});
  };
  const remove = (i: number) => {
    commit({...plan, graphics: graphics.filter((_, j) => j !== i)});
    setSel(null);
  };

  // the time a dragged edge or block shows while moving: snapped to words unless Alt is held
  const snapped = (ms: number, end: boolean, free: boolean) => {
    if (free || !words.length) return ms;
    const i = nearestWord(words, ms, end);
    return end ? words[i].endMs : words[i].startMs;
  };

  const onPointerDown = (e: React.PointerEvent, b: Block) => {
    e.stopPropagation();
    const edge = (e.target as HTMLElement).dataset.edge as 'start' | 'end' | undefined;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // no capture (rare): the drag still follows the canvas
    }
    setSel(b.i);
    setDrag({i: b.i, mode: edge || 'move', x0: e.clientX, start0: b.start, end0: b.end, start: b.start, end: b.end, free: e.altKey, moved: false});
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const d = ((e.clientX - drag.x0) / pps) * 1000;
    const free = e.altKey;
    let {start, end} = drag;
    if (drag.mode === 'move') {
      const len = drag.end0 - drag.start0;
      start = Math.max(0, Math.min(durationMs - len, drag.start0 + d));
      start = snapped(start, false, free);
      end = Math.min(durationMs, start + len);
    } else if (drag.mode === 'start') {
      start = snapped(Math.max(0, Math.min(drag.end0 - MIN_MS, drag.start0 + d)), false, free);
      if (start > drag.end0 - MIN_MS) start = drag.end0 - MIN_MS;
    } else {
      end = snapped(Math.min(durationMs, Math.max(drag.start0 + MIN_MS, drag.end0 + d)), true, free);
      if (end < drag.start0 + MIN_MS) end = drag.start0 + MIN_MS;
    }
    setDrag({...drag, start, end, free, moved: drag.moved || Math.abs(e.clientX - drag.x0) > 3});
  };
  const onPointerUp = () => {
    if (!drag) return;
    if (drag.moved) setTimes(drag.i, drag.start, drag.end, drag.free);
    else onSeek && onSeek(drag.start0 + 1);
    setDrag(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const z = e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey);
    if (z && !e.shiftKey) return e.preventDefault(), doUndo();
    if ((z && e.shiftKey) || (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey))) return e.preventDefault(), doRedo();
    if (sel === null) return;
    const b = blocks.find((x) => x.i === sel);
    if (!b) return;
    if (e.key === 'Delete' || e.key === 'Backspace') return e.preventDefault(), remove(sel);
    if (e.key === 'Escape') return setSel(null);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // nudge to the previous / next word, keeping the length
      e.preventDefault();
      const len = b.end - b.start;
      const cur = nearestWord(words, b.start, false);
      const ni = Math.max(0, Math.min(words.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      const start = words[ni].startMs;
      setTimes(sel, start, Math.min(durationMs, start + len), false);
    }
  };

  // ruler: a mark every 1, 2, 5 or 10 s depending on the zoom; words written in when there is room
  const step = pps >= 90 ? 1 : pps >= 45 ? 2 : pps >= 18 ? 5 : 10;
  const ticks = [];
  for (let s = 0; s * 1000 <= durationMs; s += step) ticks.push(s);
  const showWords = pps >= 70;

  const selB = sel !== null ? blocks.find((b) => b.i === sel) : null;
  const chunks: any[] = resolved?.chunks || [];
  // caption words are matched to the transcript by time; an edit is a word fix (plan.wordFixes, by transcript index), applied to the captions,
  // the anchors and every graphic that uses the word, and kept in the plan's history like any other change
  const fixes: Record<string, string> = plan.wordFixes || {};
  const wordIndexOf = (w: any) => {
    let best = -1;
    let d = Infinity;
    words.forEach((x, i) => {
      const dd = Math.abs(x.startMs - w.startMs);
      if (dd < d) {
        d = dd;
        best = i;
      }
    });
    return best < 0 || d > 400 ? null : (words[best].srcIdx ?? best);
  };
  const shownText = (w: any) => {
    const k = wordIndexOf(w);
    return k !== null && fixes[k] ? fixes[k] : w.text;
  };
  const openCaption = (i: number) => {
    setSel(null);
    setCapSel(i);
    setCapDraft(chunks[i].words.map(shownText));
  };
  const capChunk = capSel !== null ? chunks[capSel] : null;
  const applyCaption = () => {
    if (!capChunk) return;
    const next = {...fixes};
    capChunk.words.forEach((w: any, j: number) => {
      const k = wordIndexOf(w);
      const t = String(capDraft[j] ?? '').trim().replace(/\s+/g, ' ');
      if (k === null || !t) return;
      if (t === w.text) delete next[k];
      else next[k] = t;
    });
    commit({...plan, wordFixes: next});
    setCapSel(null);
  };
  const layouts: any[] = resolved?.layouts || [];
  const sfx: any[] = resolved?.sfx || [];
  const lanes = [
    {key: 'captions', label: 'Captions', rows: 1},
    {key: 'motion', label: 'Motion', rows: motionRows},
    {key: 'graphics', label: 'Graphics', rows: graphicRows},
    {key: 'layout', label: 'Layout', rows: 1},
    {key: 'sound', label: 'Sound', rows: 1},
  ];
  const laneTop: Record<string, number> = {};
  let y = 26;
  for (const l of lanes) {
    laneTop[l.key] = y;
    y += l.rows * LANE_H + 6;
  }
  const totalH = y;

  const blockEl = (b: Block) => {
    const top = laneTop[b.lane] + b.row * LANE_H + 3;
    const isSel = sel === b.i;
    return (
      <div
        key={b.id + b.i}
        className="tl-block"
        data-kind={b.kind}
        data-sel={isSel || undefined}
        style={{left: px(b.start), width: Math.max(10, px(b.end) - px(b.start)), top, height: LANE_H - 6}}
        title={`${KINDS[b.kind]?.label || b.kind}${b.label ? `: ${b.label}` : ''}  ${fmt(b.start)} to ${fmt(b.end)}`}
        onPointerDown={(e) => onPointerDown(e, b)}
        role="button"
        aria-label={`${KINDS[b.kind]?.label || b.kind} ${b.label}, ${fmt(b.start)} to ${fmt(b.end)}`}
        aria-pressed={isSel}
      >
        <span className="tl-edge" data-edge="start" />
        <span className="tl-text">{b.label || KINDS[b.kind]?.label || b.kind}</span>
        <span className="tl-edge" data-edge="end" />
      </div>
    );
  };

  return (
    <section className="card timeline" aria-label="Timeline">
      <div className="tl-head row between wrap">
        <div className="row" style={{gap: 'var(--sp-3)'}}>
          <h3>Timeline</h3>
          <span className="help">Drag a block to move it, its edges to change when it starts or ends. It snaps to your words; hold Alt for free timing.</span>
        </div>
        <div className="row" style={{gap: 4}}>
          <button className="btn ghost icon sm" onClick={doUndo} disabled={!undo.current.length} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
            <ArrowArcLeft size={16} aria-hidden />
          </button>
          <button className="btn ghost icon sm" onClick={doRedo} disabled={!redo.current.length} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)">
            <ArrowArcRight size={16} aria-hidden />
          </button>
          <button className="btn ghost icon sm" onClick={() => setPps((p) => Math.max(8, p / 1.5))} aria-label="Zoom out" title="Zoom out">
            <MagnifyingGlassMinus size={16} aria-hidden />
          </button>
          <button className="btn ghost icon sm" onClick={() => setPps((p) => Math.min(400, p * 1.5))} aria-label="Zoom in" title="Zoom in">
            <MagnifyingGlassPlus size={16} aria-hidden />
          </button>
        </div>
      </div>

      <div className="tl-body">
        <div className="tl-labels" style={{height: totalH}}>
          {lanes.map((l) => (
            <span key={l.key} style={{top: laneTop[l.key], height: l.rows * LANE_H}}>
              {l.label}
            </span>
          ))}
        </div>
        <div className="tl-scroll" ref={scrollRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Timeline tracks. Arrow keys move the selected block by one word, Delete removes it.">
          <div
            className="tl-canvas"
            style={{width, height: totalH}}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerDown={(e) => {
              const t = e.target as HTMLElement;
              if (t !== e.currentTarget && !t.classList.contains('tl-ruler') && !t.classList.contains('tl-lane') && !t.classList.contains('tl-tick') && !t.classList.contains('tl-word')) return;
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setSel(null);
              onSeek && onSeek(((e.clientX - r.left) / pps) * 1000);
            }}
          >
            <div className="tl-ruler" style={{width}}>
              {ticks.map((s) => (
                <span key={s} className="tl-tick" style={{left: px(s * 1000)}}>
                  {fmt(s * 1000).replace(/\.0$/, '')}
                </span>
              ))}
              {showWords
                ? words.map((w, i) => (
                    <span key={i} className="tl-word" style={{left: px(w.startMs)}}>
                      {w.text}
                    </span>
                  ))
                : null}
            </div>
            {lanes.map((l) => (
              <div key={l.key} className="tl-lane" style={{top: laneTop[l.key], height: l.rows * LANE_H}} />
            ))}
            {chunks.map((c, i) => (
              <div
                key={`c${i}`}
                className="tl-chunk"
                data-sel={capSel === i || undefined}
                data-fixed={c.words.some((w: any) => shownText(w) !== w.text) || undefined}
                style={{left: px(c.startMs), width: Math.max(2, px(c.endMs) - px(c.startMs) - 1), top: laneTop.captions + 6, height: LANE_H - 12}}
                title={`${c.words.map(shownText).join(' ')}  (click to edit)`}
                role="button"
                aria-label={`Caption: ${c.words.map(shownText).join(' ')}. Edit`}
                onClick={() => openCaption(i)}
              >
                {px(c.endMs) - px(c.startMs) > 40 ? c.words.map(shownText).join(' ') : ''}
              </div>
            ))}
            {blocks.map(blockEl)}
            {layouts.map((l, i) => (
              <div key={`l${i}`} className="tl-layout" data-mode={String(l.mode).includes('Head') ? 'head' : 'demo'} style={{left: px(l.startMs), width: Math.max(2, px(l.endMs) - px(l.startMs) - 1), top: laneTop.layout + 4, height: LANE_H - 8}} title={`${l.mode}${l.transition ? `, enters with ${l.transition}` : ''}`}>
                {i > 0 && l.transition ? <i className="tl-tr" title={l.transition} /> : null}
                {px(l.endMs) - px(l.startMs) > 50 ? (String(l.mode).includes('Head') ? 'You' : 'Demo') : ''}
              </div>
            ))}
            {resolved?.musicEnabled ? <div className="tl-music" style={{left: 0, width, top: laneTop.sound + LANE_H - 9, height: 5}} title="Music" /> : null}
            {sfx.map((s, i) => (
              <i key={`s${i}`} className="tl-sfx" style={{left: px(s.atMs), top: laneTop.sound + 5}} title={`${s.type}${s.why ? `: ${s.why}` : ''} at ${fmt(s.atMs)}`} />
            ))}
            {playheadMs !== null ? <div className="tl-playhead" style={{left: px(playheadMs), height: totalH}} /> : null}
          </div>
        </div>
      </div>

      <div className="tl-foot row between wrap">
        {capChunk ? (
          <form
            className="tl-capedit"
            onSubmit={(e) => {
              e.preventDefault();
              applyCaption();
            }}
          >
            <span className="row" style={{gap: 6, alignItems: 'center'}}>
              <PencilSimple size={14} aria-hidden />
              <b>Caption</b>
              <span className="mono muted">{fmt(capChunk.startMs)}</span>
            </span>
            <span className="tl-capwords">
              {capChunk.words.map((w: any, j: number) => (
                <input
                  key={j}
                  className="input sm"
                  dir="auto"
                  value={capDraft[j] ?? ''}
                  onChange={(e) => setCapDraft((d) => d.map((x, k) => (k === j ? e.target.value : x)))}
                  onKeyDown={(e) => e.key === 'Escape' && setCapSel(null)}
                  aria-label={`Word ${j + 1}, said as "${w.text}"`}
                  title={`Said as "${w.text}"`}
                  size={Math.max(3, String(capDraft[j] ?? '').length + 1)}
                  autoFocus={j === 0}
                />
              ))}
            </span>
            <span className="row" style={{gap: 4}}>
              <button className="btn primary sm" type="submit">
                <Check size={14} aria-hidden /> Apply
              </button>
              <button className="btn ghost sm" type="button" onClick={() => setCapSel(null)} aria-label="Cancel">
                <X size={14} aria-hidden />
              </button>
            </span>
            <span className="help" style={{flexBasis: '100%'}}>One box per spoken word. The fix applies everywhere this word appears on screen; then Save and preview.</span>
          </form>
        ) : selB ? (
          <>
            <span>
              <b>{KINDS[selB.kind]?.label || selB.kind}</b>
              {selB.label ? <span className="muted"> · {selB.label}</span> : null}
              <span className="mono muted">
                {' '}
                · {fmt(selB.start)} to {fmt(selB.end)}
              </span>
            </span>
            <span className="row" style={{gap: 4}}>
              <span className="help">Arrows move it word by word</span>
              <button className="btn ghost sm" onClick={() => remove(selB.i)}>
                <Trash size={14} aria-hidden /> Remove
              </button>
            </span>
          </>
        ) : (
          <span className="help">Click a block to select it, or a caption to edit its words. Click the ruler or an empty spot to move the preview there.</span>
        )}
      </div>
    </section>
  );
};
