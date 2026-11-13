// @ts-nocheck
// Motion graphics: real animated 2D (SVG) and 3D (CSS 3D, projected orbits) elements that illustrate what is being said.
// Every scene is drawn only with the colour roles of the look in use (so it follows any look or reference), timed from the graphic's start,
// and shows only words / numbers the plan took from the speech (content.label, content.items[].label, content.value, content.unit).
// Plan: {kind: 'motion', content: {scene, label?, value?, unit?, items?: [{label, at?}]}}.  Scenes: see SCENES at the bottom.
import React from 'react';
import {fontFor, progress, useTheme} from '../core';
import {withAlpha} from '../../shared/color.js';
import {useT} from './bits';

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

const useCtx = (c, w, h, startMs) => {
  const {frame, geo, tMs, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const E = (ms, dur, e = 'outCubic') => progress(frame, ms2f(startMs + ms), dur, geo.fps, e);
  const items = (c.items || []).map((it) => (typeof it === 'string' ? {label: it} : {label: it.label || it.text || '', atMs: it.atMs})).filter((it) => it.label !== undefined);
  const vw = 1000;
  return {
    frame, geo, theme, roles, E, items, vw, vh: (1000 * h) / w, w, h,
    t: Math.max(0, (tMs - startMs) / 1000), tMs, startMs,
    // when item i shows: on its spoken word if the plan anchored it, else staggered
    at: (i, base = 350, step = 450) => (items[i] && items[i].atMs ? Math.max(0, items[i].atMs - startMs) : base + i * step),
    A: roles.accent, B: roles.primary, T: roles.text, M: roles.textMuted, G: roles.positive || roles.accent,
    uid: `m${Math.round(startMs)}`,
    font: (text, kind = 'heading') => fontFor(theme, kind, text),
  };
};

// the panel every scene sits in: contrast is guaranteed on any footage (background + text roles are a pair), with a soft grid and drifting glow for depth
const Panel = ({ctx, children}) => {
  const {roles, w, h, t, E} = ctx;
  const p = E(0, 500);
  return (
    <div style={{position: 'relative', width: w, height: h, overflow: 'hidden', borderRadius: h * 0.08, opacity: p, background: `linear-gradient(160deg, ${withAlpha(roles.background, 0.9)}, ${withAlpha(roles.backgroundAlt || roles.background, 0.84)})`, border: `${Math.max(2, h * 0.008)}px solid ${withAlpha(roles.primary, 0.6)}`, boxShadow: `0 0 ${h * 0.14}px ${withAlpha(roles.glow, 0.38)}, inset 0 0 ${h * 0.2}px ${withAlpha(roles.glow, 0.12)}`}}>
      <div style={{position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${withAlpha(roles.primary, 0.09)} 1px, transparent 1px), linear-gradient(90deg, ${withAlpha(roles.primary, 0.09)} 1px, transparent 1px)`, backgroundSize: `${h * 0.12}px ${h * 0.12}px`, backgroundPosition: `${(t * h * 0.03) % (h * 0.12)}px 0`}} />
      <div style={{position: 'absolute', left: `${30 + 12 * Math.sin(t * 0.9)}%`, top: '-30%', width: '60%', height: '90%', borderRadius: '50%', background: `radial-gradient(closest-side, ${withAlpha(roles.glow, 0.28)}, transparent)`}} />
      {children}
    </div>
  );
};

const Svg = ({ctx, children}) => (
  <svg width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.vw} ${ctx.vh}`} style={{position: 'absolute', inset: 0}}>
    {children}
  </svg>
);

// text that always stays inside the scene: it is made smaller when it would not fit (maxW, or the room to the edges), and a centred label near an edge slides in
// free: drawn inside a moved group (its own coordinates), so only maxW applies, not the scene edges
const Txt = ({ctx, x: x0, y: y0, size: size0, children, fill, weight = 800, anchor = 'middle', op = 1, kind = 'heading', maxW, free = false}: any) => {
  const f = ctx.font(String(children), kind);
  const pad = 18;
  const em = String(children).length * 0.64;
  const room = free ? maxW || Infinity : Math.min(maxW || Infinity, anchor === 'start' ? ctx.vw - pad - x0 : anchor === 'end' ? x0 - pad : ctx.vw - 2 * pad);
  const size = size0 * Math.min(1, room / Math.max(1, em * size0));
  const half = (em * size) / 2;
  const x = anchor === 'middle' && !free ? Math.min(ctx.vw - pad - half, Math.max(pad + half, x0)) : x0;
  const y = free ? y0 : Math.min(ctx.vh - size * 0.25, Math.max(size * 0.9, y0));
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={f.family} fontWeight={weight} fontSize={size} fill={fill || ctx.T} opacity={op} style={{letterSpacing: kind === 'heading' ? 1 : 0}}>
      {children}
    </text>
  );
};

// a number that counts up to its value, with its unit
const Counter = ({ctx, x, y, size: size0, c, anchor = 'start', maxW}) => {
  if (c.value === undefined || c.value === null) return null;
  const p = ctx.E(100, 1300, 'outCubic');
  const isInt = Number.isInteger(+c.value);
  const shown = isInt ? Math.round(+c.value * p) : (+c.value * p).toFixed(1);
  // the width the final number and unit need, and the room available: the number is made smaller when it would not fit
  const finalText = (c.prefix || '') + (isInt ? Math.round(+c.value) : (+c.value).toFixed(1)) + (c.suffix || '');
  const need = finalText.length * size0 * 0.62 + (c.unit && anchor === 'start' ? String(c.unit).length * size0 * 0.42 * 0.66 + size0 * 0.25 : 0);
  const room = maxW || (anchor === 'start' ? ctx.vw - 60 - x : ctx.vw * 0.5);
  const size = size0 * Math.min(1, room / Math.max(1, need));
  const nf = ctx.font('0', 'numeric');
  return (
    <g opacity={clamp(p * 3)}>
      <text x={x} y={y} textAnchor={anchor} fontFamily={nf.family} fontWeight={800} fontSize={size} fill={ctx.A} style={{filter: `drop-shadow(0 0 ${size * 0.12}px ${withAlpha(ctx.A, 0.6)})`}}>
        {c.prefix || ''}
        {shown}
        {c.suffix || ''}
      </text>
      {c.unit ? (
        <Txt ctx={ctx} x={anchor === 'start' ? x + String(shown).length * size * 0.62 + size * 0.2 : x} y={anchor === 'start' ? y : y + size * 0.5} size={size * 0.42} fill={ctx.T} anchor={anchor === 'start' ? 'start' : 'middle'}>
          {String(c.unit).toUpperCase()}
        </Txt>
      ) : null}
    </g>
  );
};

const Label = ({ctx, c}) => {
  if (!c.label) return null;
  const p = ctx.E(300, 450);
  const text = String(c.label).toUpperCase();
  return <Txt ctx={ctx} x={ctx.vw / 2} y={ctx.vh - ctx.vh * 0.06} size={Math.max(ctx.vh * 0.075, Math.min(ctx.vw * 0.045, ctx.vh * 0.13))} fill={ctx.T} op={p}>{text}</Txt>;
};

// ---------------------------------------------------------------- 2D scenes
const Timeline = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, items, at, uid} = ctx;
  const n = Math.max(2, Math.min(5, items.length || 2));
  const hasNum = c.value !== undefined && c.value !== null;
  const y = vh * (hasNum ? 0.7 : 0.48);
  const x0 = 120;
  const x1 = vw - 120;
  const draw = E(0, 1500, 'inOutCubic');
  const head = x0 + (x1 - x0) * draw;
  const pts = Array.from({length: n}, (_, i) => x0 + ((x1 - x0) * i) / (n - 1));
  return (
    <Svg ctx={ctx}>
      <defs>
        <linearGradient id={`${uid}-l`} x1="0" x2="1"><stop offset="0" stopColor={B} /><stop offset="1" stopColor={A} /></linearGradient>
      </defs>
      <line x1={x0} x2={x1} y1={y} y2={y} stroke={withAlpha(M, 0.35)} strokeWidth={8} strokeLinecap="round" />
      <line x1={x0} x2={head} y1={y} y2={y} stroke={`url(#${uid}-l)`} strokeWidth={10} strokeLinecap="round" style={{filter: `drop-shadow(0 0 14px ${withAlpha(A, 0.7)})`}} />
      <circle cx={head} cy={y} r={20} fill={A} opacity={draw < 1 ? 1 : 0} style={{filter: `drop-shadow(0 0 18px ${A})`}} />
      {pts.map((x, i) => {
        const p = E(at(i, 400, Math.max(300, 1100 / n)), 420, 'outBack');
        const it = items[i];
        return (
          <g key={i} opacity={clamp(p * 2)}>
            <line x1={x} x2={x} y1={y} y2={y - 46 * p} stroke={withAlpha(A, 0.8)} strokeWidth={4} />
            <circle cx={x} cy={y} r={20 * p} fill={ctx.roles.background} stroke={A} strokeWidth={7} />
            <circle cx={x} cy={y} r={7 * p} fill={A} />
            {it && it.label ? <Txt ctx={ctx} x={x} y={i % 2 && n > 2 ? y + 52 + vh * 0.07 : y - 62} size={Math.max(vh * 0.07, Math.min(vw * 0.042, vh * 0.12))} fill={T} op={p} maxW={((x1 - x0) / (n - 1)) * (n > 2 ? 1.8 : 0.95)}>{String(it.label).toUpperCase()}</Txt> : null}
          </g>
        );
      })}
      <Counter ctx={ctx} x={90} y={vh * 0.34} size={vh * 0.28} c={c} />
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};

const Growth = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, items, uid} = ctx;
  const n = Math.max(4, Math.min(7, items.length || 6));
  const left = 110;
  const right = vw - 110;
  const base = vh * 0.82;
  const maxH = vh * 0.5;
  const bw = ((right - left) / n) * 0.58;
  const vals = Array.from({length: n}, (_, i) => 0.18 + 0.82 * Math.pow((i + 1) / n, 1.55));
  const xs = vals.map((_, i) => left + ((right - left) / n) * (i + 0.5));
  const tops = vals.map((v, i) => base - v * maxH * E(i * 150, 600, 'outBack'));
  const line = xs.map((x, i) => `${i ? 'L' : 'M'} ${x} ${tops[i] - 26}`).join(' ');
  const drawP = E(n * 150 - 200, 800, 'inOutCubic');
  const last = xs[n - 1];
  return (
    <Svg ctx={ctx}>
      <defs>
        <linearGradient id={`${uid}-b`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={A} /><stop offset="1" stopColor={B} /></linearGradient>
      </defs>
      <line x1={left - 20} x2={right + 20} y1={base + 10} y2={base + 10} stroke={withAlpha(M, 0.4)} strokeWidth={4} />
      {vals.map((v, i) => (
        <g key={i}>
          <rect x={xs[i] - bw / 2} y={tops[i]} width={bw} height={Math.max(0, base - tops[i])} rx={bw * 0.18} fill={`url(#${uid}-b)`} opacity={0.92} />
          {items[i] && items[i].label ? <Txt ctx={ctx} x={xs[i]} y={base + vh * 0.075} size={vh * 0.055} fill={M} op={E(i * 150 + 300, 300)}>{String(items[i].label).toUpperCase()}</Txt> : null}
        </g>
      ))}
      <path d={line} fill="none" stroke={T} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawP} style={{filter: `drop-shadow(0 0 12px ${withAlpha(A, 0.8)})`}} />
      <g opacity={drawP > 0.95 ? 1 : 0} transform={`translate(${last} ${tops[n - 1] - 26})`}>
        <path d="M -10 22 L 34 -14 L 34 20 Z" fill={A} transform="rotate(-18)" style={{filter: `drop-shadow(0 0 14px ${A})`}} />
      </g>
      <Counter ctx={ctx} x={90} y={vh * 0.3} size={vh * 0.22} c={c} />
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};

const Clock = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, roles} = ctx;
  const cx = vw * (c.value !== undefined ? 0.3 : 0.5);
  const cy = vh * 0.48;
  const r = vh * 0.34;
  const sweep = E(0, 2600, 'inOutCubic');
  const minute = sweep * 360 * 6;
  const hour = sweep * 360 * 0.5;
  const ang = (deg, len) => [cx + Math.sin((deg * Math.PI) / 180) * len, cy - Math.cos((deg * Math.PI) / 180) * len];
  const [mx, my] = ang(minute, r * 0.82);
  const [hx, hy] = ang(hour, r * 0.54);
  const circ = TAU * (r + 18);
  return (
    <Svg ctx={ctx}>
      <circle cx={cx} cy={cy} r={r + 18} fill="none" stroke={withAlpha(M, 0.25)} strokeWidth={10} />
      <circle cx={cx} cy={cy} r={r + 18} fill="none" stroke={A} strokeWidth={10} strokeLinecap="round" strokeDasharray={`${circ * sweep} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} style={{filter: `drop-shadow(0 0 14px ${withAlpha(A, 0.8)})`}} />
      <circle cx={cx} cy={cy} r={r} fill={withAlpha(roles.backgroundAlt || roles.background, 0.9)} />
      {Array.from({length: 12}, (_, i) => {
        const [x1, y1] = ang(i * 30, r * 0.88);
        const [x2, y2] = ang(i * 30, r * (i % 3 === 0 ? 0.74 : 0.8));
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 3 === 0 ? T : M} strokeWidth={i % 3 === 0 ? 7 : 4} strokeLinecap="round" />;
      })}
      <line x1={cx} y1={cy} x2={hx} y2={hy} stroke={T} strokeWidth={14} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={mx} y2={my} stroke={A} strokeWidth={9} strokeLinecap="round" style={{filter: `drop-shadow(0 0 10px ${A})`}} />
      <circle cx={cx} cy={cy} r={14} fill={B} stroke={T} strokeWidth={5} />
      <Counter ctx={ctx} x={vw * 0.6} y={vh * 0.55} size={vh * 0.36} c={c} />
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};

const Rocket = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, t, uid} = ctx;
  const fly = E(200, 2600, 'inOutCubic');
  const pos = (u) => {
    // quadratic path from bottom-left up to the top-right
    const x = 130 + (vw - 330) * u;
    const y = vh * 0.78 - vh * 0.56 * Math.pow(u, 0.85) - Math.sin(u * Math.PI) * vh * 0.06;
    return [x, y];
  };
  const [x, y] = pos(fly);
  const [x2, y2] = pos(Math.min(1, fly + 0.02));
  const rot = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + 90;
  const trail = Array.from({length: 16}, (_, i) => {
    const u = clamp(fly - i * 0.022);
    const [tx, ty] = pos(u);
    return {tx, ty, o: (1 - i / 16) * 0.8 * (fly > 0.02 ? 1 : 0), s: 20 * (1 - i / 22)};
  });
  const flame = 1 + 0.25 * Math.sin(t * 40);
  return (
    <Svg ctx={ctx}>
      {Array.from({length: 18}, (_, i) => (
        <circle key={i} cx={(i * 197) % vw} cy={((i * 331) % (vh * 0.9)) + 20} r={2 + (i % 3)} fill={T} opacity={0.25 + 0.35 * Math.abs(Math.sin(t * 1.6 + i))} />
      ))}
      {trail.map((p, i) => <circle key={i} cx={p.tx} cy={p.ty} r={p.s} fill={i % 2 ? A : B} opacity={p.o * 0.55} />)}
      <g transform={`translate(${x} ${y}) rotate(${rot}) scale(1.5)`} style={{filter: `drop-shadow(0 0 16px ${withAlpha(A, 0.7)})`}}>
        <path d="M 0 -48 C 18 -26 18 8 12 30 L -12 30 C -18 8 -18 -26 0 -48 Z" fill={T} />
        <path d="M 0 -48 C 9 -36 12 -22 12 -10 L -12 -10 C -12 -22 -9 -36 0 -48 Z" fill={A} />
        <circle cx={0} cy={-6} r={8} fill={B} stroke={roles_bg(ctx)} strokeWidth={3} />
        <path d="M -12 12 L -28 34 L -12 28 Z M 12 12 L 28 34 L 12 28 Z" fill={B} />
        <path d={`M -9 30 Q 0 ${30 + 34 * flame} 9 30 Z`} fill={A} />
        <path d={`M -5 30 Q 0 ${30 + 20 * flame} 5 30 Z`} fill={T} />
      </g>
      <Counter ctx={ctx} x={80} y={vh * 0.3} size={vh * 0.22} c={c} />
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};
const roles_bg = (ctx) => ctx.roles.background;

const Bulb = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, t, uid} = ctx;
  const cx = vw * 0.5;
  const cy = vh * 0.44;
  const on = E(700, 350, 'outCubic');
  const pulse = 1 + 0.06 * Math.sin(t * 5) * on;
  return (
    <Svg ctx={ctx}>
      <defs>
        <radialGradient id={`${uid}-g`}><stop offset="0" stopColor={A} stopOpacity={0.85} /><stop offset="1" stopColor={A} stopOpacity={0} /></radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={vh * 0.5 * on * pulse} fill={`url(#${uid}-g)`} />
      {Array.from({length: 14}, (_, i) => {
        const a = (i / 14) * TAU;
        const r1 = vh * 0.3;
        const r2 = vh * (0.3 + 0.13 * on * (0.7 + 0.3 * Math.sin(t * 6 + i)));
        return <line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2} stroke={A} strokeWidth={8} strokeLinecap="round" opacity={on} />;
      })}
      <path d={`M ${cx - 50} ${cy + 70} C ${cx - 50} ${cy + 20} ${cx - 110} ${cy + 10} ${cx - 110} ${cy - 50} A 110 110 0 1 1 ${cx + 110} ${cy - 50} C ${cx + 110} ${cy + 10} ${cx + 50} ${cy + 20} ${cx + 50} ${cy + 70} Z`} fill={withAlpha(A, 0.15 + 0.7 * on)} stroke={T} strokeWidth={9} strokeLinejoin="round" transform={`scale(1) `} style={{filter: `drop-shadow(0 0 ${22 * on}px ${A})`}} />
      <path d={`M ${cx - 28} ${cy + 20} L ${cx - 14} ${cy - 24} L ${cx} ${cy + 4} L ${cx + 14} ${cy - 24} L ${cx + 28} ${cy + 20}`} fill="none" stroke={T} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.5 + 0.5 * on} />
      <rect x={cx - 52} y={cy + 76} width={104} height={20} rx={9} fill={M} />
      <rect x={cx - 40} y={cy + 100} width={80} height={18} rx={9} fill={B} />
      <Counter ctx={ctx} x={70} y={vh * 0.3} size={vh * 0.2} c={c} />
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};

const Target = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, t} = ctx;
  const cx = vw * 0.7;
  const cy = vh * 0.5;
  const R = vh * 0.38;
  const hit = E(1200, 420, 'outCubic');
  const fly = E(700, 560, 'inCubic');
  const ax = cx - (cx - 140) * (1 - fly) - 0;
  const ay = cy + (vh * 0.34) * (1 - fly);
  const shake = Math.sin(t * 60) * 4 * (1 - E(1220, 500));
  return (
    <Svg ctx={ctx}>
      {[1, 0.74, 0.5, 0.26].map((k, i) => {
        const p = E(i * 140, 500, 'outBack');
        return <circle key={i} cx={cx} cy={cy} r={R * k * p} fill={i % 2 ? withAlpha(A, 0.88) : withAlpha(B, 0.5)} stroke={T} strokeWidth={5} />;
      })}
      <circle cx={cx} cy={cy} r={R * 0.1} fill={T} />
      <circle cx={cx} cy={cy} r={R * (0.2 + 1.1 * hit)} fill="none" stroke={A} strokeWidth={6} opacity={hit > 0 && hit < 1 ? 1 - hit : 0} />
      <g transform={`translate(${ax + shake} ${ay}) rotate(${-38 + 38 * fly})`} opacity={fly > 0 ? 1 : 0}>
        <line x1={-150} y1={0} x2={0} y2={0} stroke={T} strokeWidth={9} strokeLinecap="round" />
        <path d="M 0 0 L -30 -16 L -30 16 Z" fill={A} transform="translate(8 0)" />
        <path d="M -150 0 L -176 -20 L -166 0 L -176 20 Z" fill={A} />
      </g>
      <Counter ctx={ctx} x={80} y={vh * 0.42} size={vh * 0.26} c={c} maxW={vw * 0.34} />
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};

const Network = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, items, t, at} = ctx;
  const n = Math.max(5, Math.min(9, items.length || 7));
  const cx = vw / 2;
  const cy = vh * 0.5;
  const nodes = Array.from({length: n}, (_, i) => {
    const a = i * 2.39996 + 0.6;
    const r = Math.sqrt((i + 0.6) / (n + 0.4));
    return [cx + Math.cos(a) * r * vw * 0.4, cy + Math.sin(a) * r * vh * 0.36];
  });
  const links = nodes.map((_, i) => [i, (i + 1) % n]).concat(nodes.map((_, i) => [i, (i * 3 + 2) % n]).filter(([a, b]) => a !== b));
  const hub = E(0, 500, 'outBack');
  return (
    <Svg ctx={ctx}>
      {links.map(([a, b], i) => {
        const p = E(300 + i * 90, 500, 'inOutCubic');
        const x = nodes[a][0] + (nodes[b][0] - nodes[a][0]) * p;
        const y = nodes[a][1] + (nodes[b][1] - nodes[a][1]) * p;
        const pulse = (t * 0.7 + i * 0.13) % 1;
        return (
          <g key={i}>
            <line x1={nodes[a][0]} y1={nodes[a][1]} x2={x} y2={y} stroke={withAlpha(B, 0.7)} strokeWidth={4} />
            {p >= 1 ? <circle cx={nodes[a][0] + (nodes[b][0] - nodes[a][0]) * pulse} cy={nodes[a][1] + (nodes[b][1] - nodes[a][1]) * pulse} r={6} fill={A} /> : null}
          </g>
        );
      })}
      {nodes.map(([x, y], i) => {
        const k = n - 1 - i; // item k sits on node n-1-k
        const p = E(at(k < items.length ? k : i, 150, 220), 420, 'outBack');
        const it = items[k];
        return (
          <g key={i} opacity={clamp(p * 2)}>
            <circle cx={x} cy={y} r={(it && it.label ? 22 : 15) * p} fill={ctx.roles.background} stroke={i % 2 ? A : B} strokeWidth={7} style={{filter: `drop-shadow(0 0 10px ${withAlpha(i % 2 ? A : B, 0.8)})`}} />
            {it && it.label ? <Txt ctx={ctx} x={x} y={y - 38} size={Math.max(vh * 0.058, Math.min(vw * 0.038, vh * 0.1))} fill={T} op={p} maxW={vw * 0.46}>{String(it.label).toUpperCase()}</Txt> : null}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={46 * hub * (1 + 0.05 * Math.sin(t * 4))} fill={A} style={{filter: `drop-shadow(0 0 24px ${A})`}} />
      <circle cx={cx} cy={cy} r={66 * hub} fill="none" stroke={withAlpha(A, 0.5)} strokeWidth={5} />
      <Counter ctx={ctx} x={70} y={vh * 0.24} size={vh * 0.17} c={c} />
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};

const Layers = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, items, at, uid} = ctx;
  const n = Math.max(3, Math.min(5, items.length || 4));
  const cx = vw * 0.33;
  const W = vw * 0.27;
  const Hh = vh * 0.12;
  const gap = vh * 0.105;
  const baseY = vh * 0.72;
  return (
    <Svg ctx={ctx}>
      <defs>
        <linearGradient id={`${uid}-a`} x1="0" x2="1"><stop offset="0" stopColor={B} /><stop offset="1" stopColor={A} /></linearGradient>
      </defs>
      {Array.from({length: n}, (_, i) => {
        const p = E(at(i, 200, 520), 560, 'outBack');
        const y = baseY - i * gap - (1 - p) * vh * 0.35;
        const mix = i / Math.max(1, n - 1);
        const top = `${cx},${y - Hh} ${cx + W},${y} ${cx},${y + Hh} ${cx - W},${y}`;
        const left = `${cx - W},${y} ${cx},${y + Hh} ${cx},${y + Hh + gap * 0.5} ${cx - W},${y + gap * 0.5}`;
        const right = `${cx + W},${y} ${cx},${y + Hh} ${cx},${y + Hh + gap * 0.5} ${cx + W},${y + gap * 0.5}`;
        const it = items[i];
        return (
          <g key={i} opacity={clamp(p * 2)}>
            <polygon points={left} fill={withAlpha(B, 0.9)} />
            <polygon points={right} fill={withAlpha(M, 0.45)} />
            <polygon points={top} fill={mix > 0.5 ? A : `url(#${uid}-a)`} stroke={T} strokeWidth={3} opacity={0.96} />
            {it && it.label ? (
              <g opacity={E(at(i, 200, 520) + 250, 300)}>
                <line x1={cx + W + 14} y1={y} x2={cx + W + 90} y2={y} stroke={withAlpha(T, 0.5)} strokeWidth={3} />
                <Txt ctx={ctx} x={cx + W + 104} y={y + vh * 0.02} size={Math.min(gap * 1.15, Math.max(vh * 0.065, Math.min(vw * 0.04, vh * 0.1)))} anchor="start" fill={T}>{String(it.label).toUpperCase()}</Txt>
              </g>
            ) : null}
          </g>
        );
      })}
      <Counter ctx={ctx} x={70} y={vh * 0.24} size={vh * 0.17} c={c} />
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};

const Bubbles = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, items, at, t} = ctx;
  const n = Math.max(3, Math.min(4, items.length || 3));
  return (
    <Svg ctx={ctx}>
      {Array.from({length: n}, (_, i) => {
        const p = E(at(i, 250, 700), 450, 'outBack');
        const right = i % 2 === 0;
        const label = items[i] && items[i].label ? String(items[i].label) : '';
        // a wide, short panel (above the speaker): the messages spread across in two staggered rows, so they stay big; a tall one stacks them
        const wide = vh < vw * 0.62;
        const bh = wide ? vh * 0.3 : vh * 0.17;
        const fs = bh * 0.44;
        const bw = Math.min(wide ? vw * 0.4 : vw * 0.62, Math.max(wide ? vw * 0.22 : vw * 0.26, label.length * fs * 0.64 + fs * 1.6));
        const x = wide ? Math.min(vw - 40 - bw, Math.max(40, vw * (0.06 + (0.88 * i) / Math.max(1, n - 1)) - bw / 2)) : right ? vw - 90 - bw : 90;
        const y = wide ? (i % 2 ? vh * 0.55 : vh * 0.12) : vh * 0.1 + i * (bh + vh * 0.06);
        const typing = E(at(i, 250, 700) - 350, 350) > 0 && p < 1;
        return (
          <g key={i} transform={`translate(${x + bw / 2} ${y + bh / 2}) scale(${0.6 + 0.4 * p})`} opacity={clamp(p * 2)}>
            <rect x={-bw / 2} y={-bh / 2} width={bw} height={bh} rx={bh / 2} fill={right ? A : withAlpha(ctx.roles.shape || B, 0.95)} stroke={right ? 'none' : B} strokeWidth={4} />
            <path d={right ? `M ${bw / 2 - 30} ${bh / 2 - 6} L ${bw / 2 + 4} ${bh / 2 + 22} L ${bw / 2 - 64} ${bh / 2 - 4} Z` : `M ${-bw / 2 + 30} ${bh / 2 - 6} L ${-bw / 2 - 4} ${bh / 2 + 22} L ${-bw / 2 + 64} ${bh / 2 - 4} Z`} fill={right ? A : withAlpha(ctx.roles.shape || B, 0.95)} />
            {label ? <Txt ctx={ctx} x={0} y={fs * 0.36} size={fs} free maxW={bw * 0.84} fill={right ? ctx.roles.textOnAccent || ctx.roles.background : T}>{label}</Txt> : [0, 1, 2].map((k) => <circle key={k} cx={(k - 1) * 34} cy={0} r={9} fill={right ? ctx.roles.background : T} opacity={0.5 + 0.5 * Math.sin(t * 8 - k)} />)}
          </g>
        );
      })}
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};

// ---------------------------------------------------------------- 3D scenes (CSS 3D, drawn in the look's colours)
const Cube = ({c, ctx}) => {
  const {E, w, h, A, B, T, t, items, roles} = ctx;
  const s = Math.min(w * 0.4, h * 0.56);
  const appear = E(0, 800, 'outBack');
  const faces = ['rotateY(0deg)', 'rotateY(90deg)', 'rotateY(180deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'];
  const fs = (text) => ctx.font(String(text), 'heading');
  return (
    <div style={{position: 'absolute', inset: 0}}>
      <div style={{position: 'absolute', left: '50%', top: '50%', width: s, height: s, marginLeft: -s / 2, marginTop: -s / 2 - h * 0.03, perspective: s * 4.2, transform: `scale(${appear})`}}>
        <div style={{position: 'relative', width: s, height: s, transformStyle: 'preserve-3d', transform: `rotateX(${-24 + 6 * Math.sin(t * 1.3)}deg) rotateY(${30 + t * 48}deg)`}}>
          {faces.map((tf, i) => {
            const it = items[i % Math.max(1, items.length || 1)];
            const label = items.length && it ? it.label : '';
            const f = fs(label || 'A');
            return (
              <div key={i} style={{position: 'absolute', inset: 0, transform: `${tf} translateZ(${s / 2}px)`, background: `linear-gradient(145deg, ${withAlpha(i % 2 ? B : A, 0.92)}, ${withAlpha(roles.background, 0.9)})`, border: `${Math.max(3, s * 0.02)}px solid ${withAlpha(T, 0.85)}`, boxShadow: `inset 0 0 ${s * 0.18}px ${withAlpha(T, 0.25)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', backfaceVisibility: 'hidden'}}>
                {label ? <span style={{fontFamily: f.family, fontWeight: 800, fontSize: s * 0.17, color: i % 2 ? T : roles.textOnAccent || roles.background, textAlign: 'center', padding: s * 0.06, lineHeight: 1.05, direction: 'ltr'}}>{String(label).toUpperCase()}</span> : <div style={{width: s * 0.3, height: s * 0.3, borderRadius: i % 3 === 0 ? '50%' : s * 0.04, border: `${s * 0.035}px solid ${T}`, transform: i % 3 === 1 ? 'rotate(45deg)' : 'none'}} />}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{position: 'absolute', left: '50%', top: `${50 + (s / h) * 52}%`, width: s * 1.2, height: s * 0.2, marginLeft: -s * 0.6, borderRadius: '50%', background: `radial-gradient(closest-side, ${withAlpha(A, 0.5)}, transparent)`, opacity: appear}} />
      <Svg ctx={ctx}>
        <Counter ctx={ctx} x={70} y={ctx.vh * 0.24} size={ctx.vh * 0.17} c={c} />
        <Label ctx={ctx} c={c} />
      </Svg>
    </div>
  );
};

const Coin = ({c, ctx}) => {
  const {E, w, h, A, B, T, t, roles} = ctx;
  const d = Math.min(h * 0.6, w * 0.3);
  const appear = E(0, 700, 'outBack');
  const rot = t * 210;
  const bounce = -Math.abs(Math.sin(t * 2.4)) * d * 0.16;
  const sym = c.symbol || c.unit || '';
  const f = ctx.font('0', 'numeric');
  const face = (back) => (
    <div style={{position: 'absolute', inset: 0, borderRadius: '50%', transform: `${back ? 'rotateY(180deg)' : ''} translateZ(${d * 0.04}px)`, backfaceVisibility: 'hidden', background: `radial-gradient(circle at 35% 30%, ${withAlpha(T, 0.9)}, ${A} 38%, ${withAlpha(roles.accentDeep || A, 1)} 100%)`, border: `${d * 0.045}px solid ${withAlpha(T, 0.75)}`, boxShadow: `inset 0 0 ${d * 0.12}px ${withAlpha(roles.background, 0.35)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box'}}>
      <div style={{width: '70%', height: '70%', borderRadius: '50%', border: `${d * 0.02}px dashed ${withAlpha(roles.background, 0.45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: f.family, fontWeight: 800, fontSize: d * 0.38, color: roles.textOnAccent || roles.background}}>{String(sym).slice(0, 3).toUpperCase() || '★'}</div>
    </div>
  );
  return (
    <div style={{position: 'absolute', inset: 0}}>
      <div style={{position: 'absolute', left: c.value !== undefined ? '30%' : '50%', top: '50%', width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2 + bounce, perspective: d * 5, transform: `scale(${appear})`}}>
        <div style={{position: 'relative', width: d, height: d, transformStyle: 'preserve-3d', transform: `rotateY(${rot}deg) rotateX(-12deg)`}}>
          {Array.from({length: 9}, (_, k) => <div key={k} style={{position: 'absolute', inset: 0, borderRadius: '50%', background: k % 2 ? A : withAlpha(roles.accentDeep || A, 1), transform: `translateZ(${(k - 4) * d * 0.01}px)`}} />)}
          {face(false)}
          {face(true)}
        </div>
      </div>
      <div style={{position: 'absolute', left: c.value !== undefined ? '30%' : '50%', top: `${50 + (d / h) * 56}%`, width: d * 0.9, height: d * 0.14, marginLeft: -d * 0.45, borderRadius: '50%', background: `radial-gradient(closest-side, ${withAlpha(roles.background, 0.7)}, transparent)`, opacity: appear * (1 - Math.abs(Math.sin(t * 2.4)) * 0.4)}} />
      <Svg ctx={ctx}>
        <Counter ctx={ctx} x={ctx.vw * 0.5} y={ctx.vh * 0.58} size={ctx.vh * 0.34} c={{...c, unit: undefined}} />
        <Label ctx={ctx} c={c} />
      </Svg>
    </div>
  );
};

const Orbit = ({c, ctx}) => {
  const {E, vw, vh, A, B, T, M, items, t, uid} = ctx;
  const cx = vw * (c.value !== undefined ? 0.36 : 0.5);
  const cy = vh * 0.5;
  const R = vh * 0.36;
  const rings = [
    {tilt: 0.38, rot: 0.2, speed: 0.9, k: 1.0},
    {tilt: 0.52, rot: 1.35, speed: -0.7, k: 0.78},
    {tilt: 0.3, rot: 2.4, speed: 0.55, k: 0.56},
  ];
  const project = (ring, th) => {
    const x = Math.cos(th) * R * ring.k * 1.6;
    const y = Math.sin(th) * R * ring.k * ring.tilt * 1.6;
    const z = Math.sin(th);
    const c2 = Math.cos(ring.rot);
    const s2 = Math.sin(ring.rot);
    return {x: cx + x * c2 - y * s2, y: cy + x * s2 + y * c2, z};
  };
  const appear = E(0, 800, 'outBack');
  const sats = [];
  rings.forEach((ring, ri) => {
    for (let k = 0; k < 2; k++) {
      const idx = ri * 2 + k;
      const th = t * ring.speed * 1.3 + k * Math.PI + ri;
      sats.push({...project(ring, th), idx, ri});
    }
  });
  sats.sort((a, b) => a.z - b.z);
  return (
    <Svg ctx={ctx}>
      <defs>
        <radialGradient id={`${uid}-s`} cx="35%" cy="30%"><stop offset="0" stopColor={T} /><stop offset="0.45" stopColor={A} /><stop offset="1" stopColor={B} /></radialGradient>
      </defs>
      {rings.map((ring, ri) => {
        const d = Array.from({length: 61}, (_, i) => {
          const p = project(ring, (i / 60) * TAU);
          return `${i ? 'L' : 'M'} ${p.x} ${p.y}`;
        }).join(' ');
        return <path key={ri} d={d} fill="none" stroke={withAlpha(ri % 2 ? A : B, 0.7)} strokeWidth={4} opacity={appear} />;
      })}
      <circle cx={cx} cy={cy} r={R * 0.34 * appear} fill={`url(#${uid}-s)`} style={{filter: `drop-shadow(0 0 28px ${withAlpha(A, 0.75)})`}} />
      {sats.map((s, i) => {
        const sc = 0.75 + 0.35 * ((s.z + 1) / 2);
        const it = items[s.idx];
        const p = E(300 + s.idx * 160, 400, 'outBack');
        return (
          <g key={i} opacity={clamp(p * 2)}>
            <circle cx={s.x} cy={s.y} r={(it && it.label ? 19 : 13) * sc * p} fill={s.ri % 2 ? A : T} stroke={ctx.roles.background} strokeWidth={4} style={{filter: `drop-shadow(0 0 10px ${withAlpha(A, 0.8)})`}} />
            {it && it.label ? <Txt ctx={ctx} x={s.x} y={s.y - 34 * sc} size={vh * 0.055 * sc} fill={T} op={p}>{String(it.label).toUpperCase()}</Txt> : null}
          </g>
        );
      })}
      <Counter ctx={ctx} x={vw * 0.72} y={vh * 0.55} size={vh * 0.3} c={c} />
      <Label ctx={ctx} c={c} />
    </Svg>
  );
};

export const SCENES = {timeline: Timeline, growth: Growth, clock: Clock, rocket: Rocket, bulb: Bulb, target: Target, network: Network, layers: Layers, bubbles: Bubbles, cube: Cube, coin: Coin, orbit: Orbit};
export const SCENE_NAMES = Object.keys(SCENES);

export const Motion = ({c, w, h, startMs}) => {
  const ctx = useCtx(c, w, h, startMs);
  const Scene = SCENES[c.scene] || SCENES.network;
  return (
    <Panel ctx={ctx}>
      <Scene c={c} ctx={ctx} />
    </Panel>
  );
};
