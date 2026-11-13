// The timeline of an Agent build: every card, title, motion graphic, layout section and end card Claude placed (beats.json),
// one lane per track. Drag a block to move it, drag its edges to change when it starts or ends; it snaps to your words (hold Alt
// for free timing). Each change is saved, the preview rebuilds in about a second, and it can be undone like any other change.
import {useEffect, useMemo, useRef, useState} from 'react';
import {MagnifyingGlassMinus, MagnifyingGlassPlus} from '@phosphor-icons/react';
import type {AgentBeat} from '../lib/api';

type Word = {t: string; s: number; e: number};
type Drag = {id: string; mode: 'move' | 'start' | 'end'; x0: number; s0: number; e0: number; s: number; e: number; free: boolean; moved: boolean};

const LANE_H = 30;
const RULER_H = 22;
const CAP_H = 24;
const MIN_MS = 300;
const ORDER = ['Layout', 'Titles', 'Cards', 'Motion', 'Stickers', 'End'];
const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

export const BeatsTimeline = ({beats, words, durationMs, playheadMs, busy, onSeek, onCommit}: {beats: AgentBeat[]; words: Word[]; durationMs: number; playheadMs: number | null; busy: boolean; onSeek: (ms: number) => void; onCommit: (beats: AgentBeat[], label: string) => void}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    if (pps || !scrollRef.current || !durationMs) return;
    const w = scrollRef.current.clientWidth - 16;
    setPps(Math.max(12, Math.min(160, w / (durationMs / 1000))));
  }, [pps, durationMs]);

  const tracks = useMemo(() => {
    const names = [...new Set(beats.map((b) => b.track || 'Other'))];
    return names.sort((a, b) => (ORDER.indexOf(a) < 0 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b)) || a.localeCompare(b));
  }, [beats]);
  // blocks that overlap in time on one track go on separate rows of that lane
  const layout = useMemo(() => {
    const rows: Record<string, number> = {};
    const laneRows: Record<string, number> = {};
    for (const t of tracks) {
      const ends: number[] = [];
      for (const b of beats.filter((x) => (x.track || 'Other') === t).sort((a, z) => a.startMs - z.startMs)) {
        let r = ends.findIndex((e) => e <= b.startMs);
        if (r < 0) {
          r = ends.length;
          ends.push(0);
        }
        ends[r] = b.endMs;
        rows[b.id] = r;
      }
      laneRows[t] = Math.max(1, ends.length);
    }
    let y = RULER_H + CAP_H;
    const laneY: Record<string, number> = {};
    for (const t of tracks) {
      laneY[t] = y;
      y += laneRows[t] * LANE_H;
    }
    return {rows, laneRows, laneY, height: y + 6};
  }, [beats, tracks]);

  const px = (ms: number) => (ms / 1000) * (pps || 20);
  const width = Math.max(px(durationMs) + 40, 200);
  const starts = useMemo(() => words.map((w) => w.s), [words]);
  const ends = useMemo(() => words.map((w) => w.e), [words]);
  const snap = (ms: number, list: number[], free: boolean) => {
    if (free || !list.length) return Math.round(ms / 10) * 10;
    let best = list[0];
    for (const v of list) if (Math.abs(v - ms) < Math.abs(best - ms)) best = v;
    return Math.abs(best - ms) <= 400 ? best : Math.round(ms / 10) * 10;
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dms = ((e.clientX - drag.x0) / (pps || 20)) * 1000;
      const free = e.altKey;
      let s = drag.s0;
      let en = drag.e0;
      if (drag.mode === 'move') {
        s = snap(Math.max(0, drag.s0 + dms), starts, free);
        en = s + (drag.e0 - drag.s0);
      } else if (drag.mode === 'start') s = Math.min(snap(Math.max(0, drag.s0 + dms), starts, free), drag.e0 - MIN_MS);
      else en = Math.max(snap(drag.e0 + dms, ends, free), drag.s0 + MIN_MS);
      en = Math.min(en, durationMs + 2000);
      setDrag({...drag, s, e: en, free, moved: drag.moved || Math.abs(e.clientX - drag.x0) > 3});
    };
    const onUp = () => {
      const d = drag;
      setDrag(null);
      if (!d.moved) return;
      const b = beats.find((x) => x.id === d.id);
      if (!b || (b.startMs === d.s && b.endMs === d.e)) return;
      const verb = d.mode === 'move' ? `Moved "${b.label}" to ${fmt(d.s)}` : d.mode === 'start' ? `"${b.label}" now starts at ${fmt(d.s)}` : `"${b.label}" now ends at ${fmt(d.e)}`;
      onCommit(
        beats.map((x) => (x.id === d.id ? {...x, startMs: d.s, endMs: d.e} : x)),
        verb,
      );
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, {once: true});
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, pps, beats, starts, ends, durationMs]);

  const begin = (e: React.PointerEvent, b: AgentBeat, mode: Drag['mode']) => {
    if (busy) return;
    e.stopPropagation();
    e.preventDefault();
    setSel(b.id);
    setDrag({id: b.id, mode, x0: e.clientX, s0: b.startMs, e0: b.endMs, s: b.startMs, e: b.endMs, free: e.altKey, moved: false});
  };
  const seekAt = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onSeek(Math.max(0, ((e.clientX - r.left) / (pps || 20)) * 1000));
  };

  const ticks: number[] = [];
  const step = pps > 60 ? 1000 : pps > 25 ? 2000 : 5000;
  for (let t = 0; t <= durationMs + 2000; t += step) ticks.push(t);
  const selected = beats.find((b) => b.id === sel);

  return (
    <section className="card timeline">
      <div className="tl-head row between wrap">
        <div>
          <h3>Timeline</h3>
          <p className="help">Drag a block to move it, its edges to change when it starts or ends. It snaps to your words; hold Alt for free timing. Click the ruler to move the preview there.</p>
        </div>
        <div className="row">
          <button className="btn ghost icon sm" aria-label="Zoom out" onClick={() => setPps((p) => Math.max(8, (p || 20) / 1.4))}>
            <MagnifyingGlassMinus size={16} aria-hidden />
          </button>
          <button className="btn ghost icon sm" aria-label="Zoom in" onClick={() => setPps((p) => Math.min(400, (p || 20) * 1.4))}>
            <MagnifyingGlassPlus size={16} aria-hidden />
          </button>
        </div>
      </div>
      <div className="tl-body">
        <div className="tl-labels" style={{height: layout.height}}>
          <span style={{top: RULER_H, height: CAP_H}}>Words</span>
          {tracks.map((t) => (
            <span key={t} style={{top: layout.laneY[t], height: layout.laneRows[t] * LANE_H}}>
              {t}
            </span>
          ))}
        </div>
        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-canvas" style={{width, height: layout.height}}>
            <div className="tl-ruler" style={{width}} onClick={seekAt}>
              {ticks.map((t) => (
                <div key={t} className="tl-tick" style={{left: px(t)}}>
                  {fmt(t).replace(/\.0$/, '')}
                </div>
              ))}
            </div>
            <div className="tl-lane" style={{top: RULER_H, height: CAP_H}} onClick={seekAt}>
              {words.map((w, i) => (
                <div key={i} className="tl-word" style={{left: px(w.s), top: 6}} title={`${w.t} at ${fmt(w.s)}`}>
                  {pps > 45 ? w.t : ''}
                </div>
              ))}
            </div>
            {tracks.map((t) => (
              <div key={t} className="tl-lane" style={{top: layout.laneY[t], height: layout.laneRows[t] * LANE_H}} onClick={seekAt} />
            ))}
            {beats.map((b) => {
              const live = drag && drag.id === b.id ? {s: drag.s, e: drag.e} : {s: b.startMs, e: b.endMs};
              const t = b.track || 'Other';
              return (
                <div
                  key={b.id}
                  className="tl-block"
                  data-kind={t === 'Motion' ? 'motion' : t === 'Stickers' || t === 'End' ? 'slam' : undefined}
                  data-sel={sel === b.id ? '' : undefined}
                  title={`${b.label}\n${fmt(live.s)} to ${fmt(live.e)}`}
                  style={{left: px(live.s), width: Math.max(10, px(live.e - live.s)), top: layout.laneY[t] + layout.rows[b.id] * LANE_H + 3, height: LANE_H - 6, opacity: busy ? 0.6 : 1}}
                  onPointerDown={(e) => begin(e, b, 'move')}
                  onDoubleClick={() => onSeek(b.startMs)}
                >
                  <span className="tl-edge" onPointerDown={(e) => begin(e, b, 'start')} />
                  <span className="tl-text">{b.label}</span>
                  <span className="tl-edge" onPointerDown={(e) => begin(e, b, 'end')} />
                </div>
              );
            })}
            {playheadMs !== null ? <div className="tl-playhead" style={{left: px(playheadMs), height: layout.height}} /> : null}
          </div>
        </div>
      </div>
      <div className="tl-foot row between wrap">
        <span className="muted">{drag ? `${fmt(drag.s)} to ${fmt(drag.e)}${drag.free ? ' (free timing)' : ''}` : selected ? `${selected.label}: ${fmt(selected.startMs)} to ${fmt(selected.endMs)}. Double-click a block to jump to it.` : `${beats.length} timed elements. Double-click a block to jump to it.`}</span>
        {busy ? <span className="help">Rebuilding the preview</span> : null}
      </div>
    </section>
  );
};
