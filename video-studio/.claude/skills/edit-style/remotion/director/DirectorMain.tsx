// @ts-nocheck
// Director composition: renders a resolved edit plan (plan.json built by scripts/director.mjs) in the style of the two reference videos.
import React, {useEffect, useMemo} from 'react';
import {AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {withAlpha} from '../../shared/color.js';
import {buildTheme, CONFIG, ThemeContext, ease, fontFor, lineIsRtl, measureText, progress, useGeo, useTheme} from '../core';
import {Music, Sfx} from '../Effects';
import {loadFonts} from '../fonts';
import {D, DirCaptions, SectionCard, TitleBlock, useT} from './bits';
import {WindowCard} from './window';
import {TechStage, TopBar, TransitionFx, transitionState} from './tech';
import {VlogLayer} from './vlog';
import {effectiveLayout, placeRect, safeZoneOf} from './placement';

const lerp = (a, b, t) => a + (b - a) * t;

const useNoise = (size, dots, seed) =>
  useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    let s = seed;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < dots; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.7)' : 'rgba(40,60,90,0.5)';
      g.beginPath();
      g.arc(r() * size, r() * size, 0.5 + r() * 1.3, 0, Math.PI * 2);
      g.fill();
    }
    return c.toDataURL('image/png');
  }, [size, dots, seed]);

const stageColor = (roles, stage) => (stage === 'paper' ? roles.paper : stage === 'white' ? roles.card : roles.backdrop);

const Stage = ({stage, geo, roles}) => {
  if (stage === 'tech') return <TechStage />;
  if (stage === 'black') return <AbsoluteFill style={{background: '#000'}} />;
  const noise = useNoise(D.stageBg.paperTexture.size, D.stageBg.paperTexture.dots, 11);
  const base = stageColor(roles, stage);
  const light = stage === 'paper' || stage === 'white';
  return (
    <AbsoluteFill style={{background: base}}>
      {stage === 'paper' ? (
        <>
          <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 18% 12%, ${withAlpha('#FFFFFF', 0.75)} 0%, transparent 55%), radial-gradient(ellipse at 85% 70%, ${withAlpha(roles.accent, 0.07)} 0%, transparent 60%)`}} />
          {noise ? <div style={{position: 'absolute', inset: 0, backgroundImage: `url(${noise})`, backgroundSize: `${D.stageBg.paperTexture.size}px`, opacity: D.stageBg.paperTexture.alpha * 6}} /> : null}
        </>
      ) : null}
      {!light ? <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 38%, transparent 30%, ${withAlpha('#000000', D.stageBg.vignette)} 100%)`}} /> : null}
    </AbsoluteFill>
  );
};

// The footage framed around the speaker's face (plan.media.face, measured by scripts/lib/faceFrame.mjs) inside a box of cw x ch, as a cover crop:
// the whole head, with room for the hair above the face box, stays inside the box, and the face sits a little above the middle when there is room.
// Returns the object-position (0..1) and where the face lands in the box (the origin for zooms), or null to keep the fixed framing.
const faceFraming = (face, cw: number, ch: number) => {
  if (!face || !(face.aspect > 0) || !(face.h > 0) || cw <= 0 || ch <= 0) return null;
  const Hs = Math.max(ch, cw / face.aspect); // the footage's height once it covers the box
  const Ws = face.aspect * Hs;
  const Oy = Hs - ch;
  const Ox = Ws - cw;
  const fc = face.cy * Hs;
  const fh = face.h * Hs;
  const headTop = fc - fh * 0.5 - fh * 0.18; // the face box starts around the hairline
  const offY = Math.min(Math.max(0, Oy), Math.max(0, Math.min(headTop - 0.03 * ch, fc - 0.45 * ch)));
  const offX = Math.min(Math.max(0, Ox), Math.max(0, face.cx * Ws - 0.5 * cw));
  return {px: Ox > 0.5 ? offX / Ox : 0.5, py: Oy > 0.5 ? offY / Oy : 0.5, ox: Math.min(1, Math.max(0, (face.cx * Ws - offX) / cw)), oy: Math.min(1, Math.max(0, (fc - offY) / ch))};
};

// One video element plays the footage (and its audio) for the whole film; it morphs between the head card, the blurred dark backdrop and hidden.
const VideoLayer = ({plan, mode, prevMode, tp, boost = 0}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const {roles} = useTheme();
  if (plan.media.kind !== 'video') return null;
  const W = geo.width;
  const H = geo.height;
  const spec = (m) => {
    const L = D.layouts[m];
    if (m === 'lightHead') {
      const h = L.head;
      return {x: h.x * W, y: h.y * H, w: h.w * W, h: h.h * H, r: h.radius * W, blur: 0, bright: 1, op: 1, scale: 1, outline: 1, pop: (plan.media.cutout ? (h.pop || 0) : 0) * H};
    }
    if (m === 'darkDemo') return {x: 0, y: 0, w: W, h: H, r: 0, blur: D.stageBg.backdropBlurH * H, bright: D.stageBg.backdropBrightness, op: 1, scale: D.stageBg.backdropScale, outline: 0, pop: 0};
    if (m === 'techHead') return {x: 0, y: 0, w: W, h: H, r: 0, blur: 0, bright: 1, op: 1, scale: 1, outline: 0, pop: 0};
    if (m === 'techDemo') return {x: 0, y: 0, w: W, h: H, r: 0, blur: 0, bright: 1, op: 0, scale: 1, outline: 0, pop: 0};
    if (m === 'fullHead') return {x: 0, y: 0, w: W, h: H, r: 0, blur: 0, bright: 1, op: 1, scale: 1, outline: 0, pop: 0};
    const h = D.layouts.lightHead.head;
    return {x: h.x * W, y: h.y * H, w: h.w * W, h: h.h * H, r: h.radius * W, blur: 0, bright: 1, op: 0, scale: 1, outline: 0, pop: 0};
  };
  const a = spec(prevMode);
  const b = spec(mode);
  const e = tp;
  const s = {};
  Object.keys(b).forEach((k) => (s[k] = lerp(a[k], b[k], e)));
  const crop = CONFIG.layouts.headCrop;
  const segs = !plan.media.voiceover && plan.media.segments && plan.media.segments.length ? plan.media.segments : [{srcStartF: 0, outStartF: 0, durF: Math.ceil((plan.durationMs * geo.fps) / 1000)}];
  const xf = Math.max(1, CONFIG.pacing.silence.crossfadeFrames);
  const muted = !!plan.media.voiceover;
  const tMs = (frame / geo.fps) * 1000;
  const grade = (plan.look && plan.look.grade) || (D.grade && D.grade[plan.gradeName || plan.palette]) || null;
  const gradeCss = grade ? ` contrast(${grade.contrast}) saturate(${grade.saturate}) brightness(${grade.brightness})` : '';
  const kb = 1 + 0.03 * Math.min(1, (tMs % 6000) / 6000);
  // punch-ins / zoom-outs from plan.zooms: ramp in, hold, ramp out (jump-cut hiding at silence seams + emphasis moments)
  const Z = D.zoom;
  let zoom = 1;
  if (Z && Z.enabled) {
    for (const z of plan.zooms || []) {
      if (tMs < z.startMs - Z.rampMs || tMs > z.endMs + Z.rampMs) continue;
      const up = ease('outCubic')(Math.min(1, Math.max(0, (tMs - z.startMs) / Z.rampMs)));
      const down = ease('inOutCubic')(Math.min(1, Math.max(0, (tMs - z.endMs) / Z.rampMs)));
      zoom = Math.max(zoom, 1 + (z.scale - 1) * up * (1 - down));
    }
  }
  // while the head pops out, show the picture from higher up so the top of the head is not cropped
  const popPx = (D.layouts.lightHead.head.pop || 0) * H;
  // framed around the face when it was found, else the fixed crop of the layouts
  const ff = faceFraming(plan.media.face, s.w, s.h);
  const baseY = ff ? ff.py : crop.objectPositionY;
  const posX = ff ? ff.px : crop.objectPositionX;
  const posY = popPx > 0 && plan.media.cutout ? lerp(baseY, D.layouts.lightHead.head.popObjectY, Math.min(1, s.pop / popPx)) : baseY;
  const origin = ff ? `${ff.ox * 100}% ${ff.oy * 100}%` : `50% ${(Z?.originY ?? 0.35) * 100}%`; // punch-ins zoom toward the face
  const inner = (file, transparent) => (
    <div style={{position: 'absolute', inset: 0, transform: `scale(${s.scale * kb * zoom * (1 + boost)})`, transformOrigin: origin, filter: (s.blur > 0.3 || s.bright < 0.99 ? `blur(${s.blur}px) brightness(${s.bright})` : '') + gradeCss || undefined}}>
      {segs.map((sg, i) => (
        <Sequence key={i} from={sg.outStartF} durationInFrames={sg.durF} layout="none">
          <OffthreadVideo src={staticFile(file)} startFrom={sg.srcStartF} muted={muted || transparent} transparent={!!transparent} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${posX * 100}% ${posY * 100}%`}} volume={segs.length > 1 ? (f) => Math.min(1, (f + 1) / xf, (sg.durF - f) / xf) : 1} />
        </Sequence>
      ))}
    </div>
  );
  const overlays = grade && s.op > 0.5 ? (
    <>
      <div style={{position: 'absolute', inset: 0, background: grade.tint, opacity: grade.tintAlpha, mixBlendMode: 'soft-light', pointerEvents: 'none'}} />
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(0,0,0,${grade.vignette}) 100%)`, pointerEvents: 'none'}} />
    </>
  ) : null;
  const ow = Math.max(3, 0.006 * W);
  if (s.pop > 1 && plan.media.cutout) {
    // pop-out: the card shows the full picture, the cut-out layer (same geometry, taller) lets the head rise above the card edge
    return (
      <div style={{position: 'absolute', left: s.x, top: s.y - s.pop, width: s.w, height: s.h + s.pop, opacity: s.op}}>
        <div style={{position: 'absolute', inset: 0, overflow: 'hidden', clipPath: `inset(${s.pop}px 0 0 0 round ${s.r}px ${s.r}px 0 0)`}}>
          {inner(plan.media.file, false)}
          {overlays}
        </div>
        <div style={{position: 'absolute', left: 0, right: 0, top: s.pop, bottom: 0, borderRadius: `${s.r}px ${s.r}px 0 0`, border: `${ow}px solid ${roles.outline}`, borderBottom: 'none', boxShadow: `0 0 ${0.03 * H}px ${withAlpha(roles.glow, 0.35)}`, boxSizing: 'border-box', pointerEvents: 'none'}} />
        <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>{inner(plan.media.cutout, true)}</div>
      </div>
    );
  }
  return (
    <div style={{position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h, borderRadius: `${s.r}px ${s.r}px ${0}px ${0}px`, overflow: 'hidden', opacity: s.op, boxSizing: 'border-box', border: s.outline > 0.5 ? `${ow}px solid ${roles.outline}` : undefined, borderBottom: 'none', boxShadow: s.outline > 0.5 ? `0 0 ${0.03 * H}px ${withAlpha(roles.glow, 0.35)}` : undefined}}>
      {inner(plan.media.file, false)}
      {overlays}
    </div>
  );
};

// where a motion graphic goes when the plan gives no slot: the free area above the speaker (the top and mid slots together), else the layout's window
const motionRect = (L, geo) => {
  if (L.slots && L.slots.top && L.slots.mid) {
    const a = L.slots.top;
    const b = L.slots.mid;
    const x = Math.min(a.x, b.x);
    return {x: x * geo.width, y: a.y * geo.height, w: (Math.max(a.x + a.w, b.x + b.w) - x) * geo.width, h: (b.y + b.h - a.y) * geo.height};
  }
  const s = L.window || D.layouts.lightHead.window;
  return {x: s.x * geo.width, y: s.y * geo.height, w: s.w * geo.width, h: s.h * geo.height};
};

// every graphic ends inside the platform safe zone and off the caption line (see placement.ts)
const slotRect = (mode, g, geo, plan, lay) => clearFace(placeRect(slotRect0(mode, g, geo), lay, plan, geo), mode, g, geo, plan);

// a graphic above the speaker never covers the face: when the footage fills the frame and the face was measured (plan.media.face), a graphic
// that reaches the face moves into the free band between the platform's top bar and the top of the face (when that band is tall enough),
// otherwise it keeps its place. Deliberate takeovers (slot full) and graphics below the face are left alone.
const HEAD_FULL = new Set(['techHead', 'fullHead']);
const clearFace = (r, mode, g, geo, plan) => {
  const f = plan.media && plan.media.face;
  if (!f || !HEAD_FULL.has(mode) || g.slot === 'full' || g.slot === 'lower') return r;
  const faceTop = (f.cy - f.h * 0.5 - 0.012) * geo.height;
  const faceBottom = (f.cy + f.h * 0.5) * geo.height;
  if (r.y + r.h <= faceTop || r.y >= faceBottom) return r;
  const z = safeZoneOf(plan);
  const top = Math.max(0.02, z ? z.top : 0.02) * geo.height;
  const room = faceTop - top;
  if (room < 0.085 * geo.height) return r;
  return {...r, y: top, h: Math.min(r.h, room)};
};
const slotRect0 = (mode, g, geo) => {
  const L = D.layouts[mode];
  if (g.kind === 'motion' && !g.slot) return motionRect(L, geo);
  if (g.slot && L.slots && L.slots[g.slot]) {
    const q = L.slots[g.slot];
    return {x: q.x * geo.width, y: q.y * geo.height, w: q.w * geo.width, h: q.h * geo.height};
  }
  const key = g.slot === 'tile' ? 'tile' : g.large && L.windowLarge ? 'windowLarge' : 'window';
  const base = L.window || D.layouts.lightHead.window;
  if (key === 'tile') {
    const w = L.window || base;
    const t = L.tile;
    return {x: (w.x + w.w * 0.2) * geo.width, y: t.y * geo.height, w: w.w * 0.6 * geo.width, h: t.h * geo.height};
  }
  const s = L[key] || base;
  return {x: s.x * geo.width, y: s.y * geo.height, w: s.w * geo.width, h: s.h * geo.height};
};

const Ghost = ({ghosts, lay}) => {
  const {tMs, geo} = useT();
  const theme = useTheme();
  if (!D.fill || !(lay.stage === 'paper' || lay.stage === 'white')) return null;
  const g = (ghosts || []).find((x) => tMs >= x.startMs && tMs < x.endMs);
  if (!g) return null;
  const F = D.fill.ghost;
  const text = String(g.text).toUpperCase();
  const f = fontFor(theme, 'heading', text);
  let size = F.sizeW * geo.width;
  const wMeasure = measureText(text, size, f.family, f.weight);
  if (wMeasure > geo.width * 0.98) size *= (geo.width * 0.98) / wMeasure;
  const p = (tMs - g.startMs) / Math.max(1, g.endMs - g.startMs);
  const fade = Math.min(1, (tMs - g.startMs) / 350, (g.endMs - tMs) / 350);
  return <div style={{position: 'absolute', left: 0, width: '100%', top: F.topH * geo.height, textAlign: 'center', transform: `translateX(${(p - 0.5) * 2 * F.driftW * geo.width}px) rotate(${F.rotDeg}deg)`, fontFamily: f.family, fontWeight: f.weight, fontSize: size, lineHeight: 1, color: withAlpha(theme.roles.accent, F.alpha * fade), whiteSpace: 'nowrap', pointerEvents: 'none', direction: /[؀-ۿ]/.test(text) ? 'rtl' : 'ltr'}}>{text}</div>;
};

const Scene = ({plan}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const {roles} = theme;
  const tMs = (frame / geo.fps) * 1000;
  const segs = plan.layouts;
  let idx = 0;
  segs.forEach((s, i) => {
    if (s.startMs <= tMs) idx = i;
  });
  const cur = segs[idx];
  const prev = segs[Math.max(0, idx - 1)];
  const tp = idx === 0 ? 1 : ease('inOutCubic')(Math.min(1, Math.max(0, (tMs - cur.startMs) / D.transitions.layoutMs)));
  const mode = cur.mode;
  // a look studied from a reference may set the caption style (karaoke highlight, size)
  // the caption as drawn: the layout, the chosen caption style and the platform safe zone
  const lay = effectiveLayout(mode, plan);
  const stageNow = <Stage stage={lay.stage} geo={geo} roles={roles} />;
  const stagePrev = idx > 0 && tp < 1 ? <Stage stage={D.layouts[prev.mode].stage} geo={geo} roles={roles} /> : null;
  const active = plan.graphics.filter((g) => tMs >= g.startMs - 30 && tMs < g.endMs + 10);
  const title = plan.titles.find((t) => tMs >= t.startMs && tMs < t.endMs);
  const sec = plan.sections.find((t) => tMs >= t.startMs && tMs < t.endMs);
  return (
    <AbsoluteFill>
      {stagePrev}
      <div style={{position: 'absolute', inset: 0, opacity: tp}}>{stageNow}</div>
      <Ghost ghosts={plan.ghosts} lay={lay} />
      {plan.shots && plan.shots.length ? <VlogLayer plan={plan} /> : null}
      <VideoLayer plan={plan} mode={mode} prevMode={prev.mode} tp={tp} boost={(() => { const ts = transitionState(plan.layouts, tMs); return ts && ts.kind === 'zoomthrough' ? D.transitions.zoomBoost * ts.bell : 0; })()} />
      {title && (mode === 'lightHead' || mode === 'lightSection') ? <TitleBlock title={title} startMs={title.startMs} endMs={title.endMs} lay={{...lay, stage: lay.stage}} /> : null}
      {sec ? <SectionCard sec={sec} startMs={sec.startMs} endMs={sec.endMs} lay={lay} /> : null}
      {active.map((g) => <WindowCard key={g.id} g={g} rect={slotRect(mode, g, geo, plan, lay)} badge={g.badge} />)}
      {lay.stage === 'tech' ? <TopBar durationMs={plan.durationMs} tag={plan.brandTag} /> : null}
      <DirCaptions chunks={plan.chunks} lay={lay} />
      {plan.media.voiceover ? (plan.media.voSegments && plan.media.voSegments.length > 1 ? plan.media.voSegments.map((sg, i) => (
        <Sequence key={`vo${i}`} from={sg.outStartF} durationInFrames={sg.durF} layout="none">
          <Audio src={staticFile(plan.media.voiceover)} startFrom={sg.srcStartF} volume={(f) => Math.min(1, (f + 1) / 2, (sg.durF - f) / 2)} />
        </Sequence>
      )) : <Audio src={staticFile(plan.media.voiceover)} />) : null}
      <TransitionFx layouts={plan.layouts} />
      {plan.shots && plan.shots.length ? <TransitionFx layouts={[{startMs: -1e9}, ...plan.shots.filter((x) => D.vlog.overlayFx.includes(x.fx)).map((x) => ({startMs: x.startMs, transition: x.fx}))]} /> : null}
      <Music plan={plan} />
      <Sfx plan={plan} />
    </AbsoluteFill>
  );
};

export const DirectorMain = (props) => {
  loadFonts();
  useEffect(() => {
    loadFonts();
  }, []);
  const theme = useMemo(() => buildTheme(props.palette || CONFIG.palette, props.look), [props.palette, props.look]);
  return (
    <ThemeContext.Provider value={theme}>
      <Scene plan={props} />
    </ThemeContext.Provider>
  );
};
