// @ts-nocheck
// Hand-drawn ink primitives: thick outline, flat fill, wobble that "boils" at storyboard fps (story.ink in the tokens file).
import React, {createContext, useContext} from 'react';

export const InkCtx = createContext({step: 0, w: 9, amp: 2.4, ink: '#000'});
export const useInk = () => useContext(InkCtx);

// deterministic noise in [-1, 1]
export const rnd = (n) => {
  const x = Math.sin(n * 127.1 + 74.7) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
};
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeBack = (t) => {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
// 0..1 progress of a time window
export const win = (t, a, b) => clamp01((t - a) / Math.max(1, b - a));

// Catmull-Rom spline through points -> cubic bezier path
export const smooth = (pts, closed) => {
  const n = pts.length;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return closed ? d + ' Z' : d;
};

export const ellipsePts = (cx, cy, rx, ry, n = 12, rot = 0) =>
  Array.from({length: n}, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  });

export const rectPts = (x, y, w, h, r = 0) => {
  const k = Math.min(r, w / 2, h / 2);
  return [
    [x + k, y],
    [x + w - k, y],
    [x + w, y + k],
    [x + w, y + h - k],
    [x + w - k, y + h],
    [x + k, y + h],
    [x, y + h - k],
    [x, y + k],
  ];
};

// Wobbly path from points. closed shapes get a fill; stroke defaults to the ink role.
export const Blob = ({pts, closed = true, fill = 'none', stroke, sw, seed = 0, amp, opacity, ...rest}) => {
  const {step, w, amp: A, ink} = useContext(InkCtx);
  const a = amp === undefined ? A : amp;
  const jp = pts.map((p, i) => [p[0] + rnd(seed * 31 + i * 2 + step * 101) * a, p[1] + rnd(seed * 31 + i * 2 + 1 + step * 101) * a]);
  return <path d={smooth(jp, closed)} fill={fill} stroke={stroke === undefined ? ink : stroke} strokeWidth={sw === undefined ? w : sw} strokeLinejoin="round" strokeLinecap="round" opacity={opacity} {...rest} />;
};

export const Ell = ({cx, cy, rx, ry, n = 12, rot = 0, ...p}) => <Blob pts={ellipsePts(cx, cy, rx, ry, n, rot)} {...p} />;
export const Rct = ({x, y, w, h, r = 12, ...p}) => <Blob pts={rectPts(x, y, w, h, r)} {...p} />;
export const Ln = ({x1, y1, x2, y2, bend = 0, ...p}) => {
  const mx = (x1 + x2) / 2 + (-(y2 - y1) / 1) * 0.0 + bend;
  const my = (y1 + y2) / 2;
  return <Blob pts={[[x1, y1], [mx, my], [x2, y2]]} closed={false} {...p} />;
};

// hand-lettered text: no wobble in the glyphs, tiny rotation boil
export const Txt = ({x, y, children, size, fill, family, weight = 800, anchor = 'middle', seed = 0, rotate = 0, opacity = 1, dir, spacing}) => {
  const {step} = useContext(InkCtx);
  const r = rotate + rnd(seed * 13 + step * 17) * 0.6;
  return (
    <text x={x} y={y} fontSize={size} fill={fill} fontFamily={family} fontWeight={weight} textAnchor={anchor} opacity={opacity} transform={`rotate(${r} ${x} ${y})`} direction={dir} letterSpacing={spacing} style={{userSelect: 'none'}}>
      {children}
    </text>
  );
};
