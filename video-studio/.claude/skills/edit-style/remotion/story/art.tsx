// @ts-nocheck
// Characters and props, drawn with ink primitives. Coordinates are art data in the 1080 design space; every color is a palette role.
import React, {createContext, useContext} from 'react';
import {Blob, Ell, Ln, Rct, Txt, clamp01, easeBack, easeInOut, easeOut, lerp, rnd, win} from './ink';

export const StoryCtx = createContext(null);
export const useStory = () => useContext(StoryCtx);

const cols = (roles) => ({
  skin: roles.text,
  hoodie: roles.accent2,
  hair: roles.background,
  eyeWhite: roles.text,
  ink: roles.background,
  glow: roles.accent,
  cyan: roles.accent3,
  neg: roles.negative,
  pos: roles.positive,
});

// ---------------------------------------------------------------------------------------------- Sami
export const Sami = ({x = 0, y = 0, s = 1, emo, rot = 0, body = true, hands}) => {
  const {roles} = useStory();
  const c = cols(roles);
  const lid = emo.lid;
  const eyeRy = lid < 0 ? 31 * (1 - lid * 0.45) : 31;
  const gx = emo.gaze[0] * 9;
  const gy = emo.gaze[1] * 9;
  const eye = (cx, side) => (
    <g key={side}>
      <Ell cx={cx} cy={-6} rx={27} ry={eyeRy} fill={c.eyeWhite} seed={side * 5 + 1} amp={1.2} />
      <Ell cx={cx + gx} cy={-6 + gy} rx={11} ry={13} fill={c.ink} stroke="none" seed={side * 5 + 2} amp={0.6} />
      {lid > 0.02 && lid < 0.96 ? <Rct x={cx - 31} y={-6 - eyeRy - 4} w={62} h={eyeRy * 2 * lid + 8} r={8} fill={c.skin} seed={side * 5 + 3} amp={1} /> : null}
      {lid >= 0.96 ? <Ln x1={cx - 28} y1={-4} x2={cx + 28} y2={-4} bend={0} seed={side * 5 + 4} sw={9} /> : null}
      {emo.bags > 0.05 ? <Ln x1={cx - 22} y1={30} x2={cx + 22} y2={30} bend={0} sw={5} opacity={emo.bags * 0.7} seed={side * 5 + 6} /> : null}
    </g>
  );
  const bi = (side) => {
    const inner = side < 0 ? -14 : 14;
    const outer = side < 0 ? -70 : 70;
    const by = -58 + emo.browRaise;
    return <Ln key={side} x1={outer} y1={by + emo.browAngle * 18} x2={inner} y2={by - emo.browAngle * 18} sw={11} seed={side * 7 + 20} />;
  };
  const mo = emo.mouthOpen;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {body ? (
        <g>
          <Blob pts={[[-130, 112], [-60, 96], [60, 96], [130, 112], [172, 230], [162, 340], [-162, 340], [-172, 230]]} fill={c.hoodie} seed={11} />
          <Ell cx={0} cy={112} rx={74} ry={26} fill={roles.shape} seed={12} />
          <Ln x1={-26} y1={128} x2={-30} y2={190} sw={7} seed={13} />
          <Ln x1={26} y1={128} x2={30} y2={190} sw={7} seed={14} />
        </g>
      ) : null}
      <Ell cx={-104} cy={10} rx={16} ry={26} fill={c.skin} seed={15} />
      <Ell cx={104} cy={10} rx={16} ry={26} fill={c.skin} seed={16} />
      <Ell cx={0} cy={0} rx={104} ry={112} fill={c.skin} seed={17} amp={2} />
      <Blob pts={[[-100, -26], [-92, -88], [-44, -122], [8, -132], [62, -120], [100, -84], [104, -26], [72, -66], [22, -78], [-30, -70], [-70, -56]]} fill={c.hair} seed={18} />
      {eye(-40, -1)}
      {eye(40, 1)}
      {bi(-1)}
      {bi(1)}
      {mo > 0.12 ? (
        <Ell cx={0} cy={64 + emo.mouthCurve * 6} rx={22 + 12 * mo} ry={6 + 24 * mo} fill={c.ink} seed={19} amp={1} />
      ) : (
        <Blob pts={[[-28, 62], [0, 62 + emo.mouthCurve * 22], [28, 62]]} closed={false} sw={9} seed={19} />
      )}
      {emo.sweat > 0.05 ? <Blob pts={[[116, -86], [128, -56], [118, -40], [106, -56]]} fill={c.cyan} opacity={emo.sweat} seed={21} /> : null}
      {hands}
    </g>
  );
};

// ---------------------------------------------------------------------------------------------- Sprite (blinking text cursor with a face)
export const Sprite = ({x = 0, y = 0, s = 1, wake = 1, t = 0, hold, look = [0, 0], wave = 0, bounce = 0, flip = 1}) => {
  const {roles} = useStory();
  const c = cols(roles);
  const blinkPhase = (t % 2300) / 2300;
  const blink = blinkPhase > 0.93 ? 1 : 0;
  const open = clamp01(wake * 1.4 - 0.2) * (1 - blink);
  const squash = 1 + 0.07 * Math.sin((t / 1000) * 5 + bounce) * wake + (1 - wake) * -0.25;
  const ry = 19 * open + 2;
  const armOut = clamp01((wake - 0.4) / 0.6);
  const hand = (side) => {
    const ang = side * (0.5 + 0.25 * Math.sin((t / 1000) * 4 + side)) + (side > 0 ? -wave * Math.sin((t / 1000) * 9) * 0.6 : 0);
    const hx = side * (46 + 44 * armOut * Math.cos(ang * 0.6));
    const hy = 8 - 40 * armOut * Math.sin(Math.abs(ang)) * (side > 0 && wave ? 1.6 : 0.5);
    return (
      <g key={side}>
        <Ln x1={side * 46} y1={10} x2={hx} y2={hy} sw={8} seed={30 + side} />
        <Ell cx={hx} cy={hy} rx={11} ry={11} fill={roles.text} seed={32 + side} amp={0.8} />
        {side > 0 && hold ? <g transform={`translate(${hx} ${hy})`}>{hold}</g> : null}
      </g>
    );
  };
  return (
    <g transform={`translate(${x} ${y}) scale(${flip * s} ${s * squash})`}>
      {armOut > 0.02 ? [hand(-1), hand(1)] : null}
      <Rct x={-46} y={-84} w={92} h={170} r={18} fill={c.cyan} seed={40} amp={1.6} />
      <Rct x={-30} y={-72} w={60} h={14} r={6} fill={roles.text} opacity={0.35} stroke="none" seed={41} amp={0.4} />
      <Ell cx={-19} cy={-26} rx={14} ry={ry} fill={roles.text} seed={42} amp={0.8} />
      <Ell cx={19} cy={-26} rx={14} ry={ry} fill={roles.text} seed={43} amp={0.8} />
      {open > 0.25 ? (
        <g>
          <Ell cx={-19 + look[0] * 5} cy={-26 + look[1] * 6} rx={6} ry={7.5} fill={c.ink} stroke="none" seed={44} amp={0.3} />
          <Ell cx={19 + look[0] * 5} cy={-26 + look[1] * 6} rx={6} ry={7.5} fill={c.ink} stroke="none" seed={45} amp={0.3} />
        </g>
      ) : null}
      <Blob pts={[[-14, 16], [0, 16 + 12 * wake], [14, 16]]} closed={false} sw={6} seed={46} />
    </g>
  );
};

// ---------------------------------------------------------------------------------------------- props
export const Clock = ({cx, cy, r, hour = 2, minute = 0, tick = 0, shake = 0, alarm = 0, seed = 0}) => {
  const {roles, sizes} = useStory();
  const c = cols(roles);
  const ha = ((hour % 12) + minute / 60) / 12 * Math.PI * 2 - Math.PI / 2;
  const ma = (minute / 60) * Math.PI * 2 - Math.PI / 2;
  const sa = (tick / 60) * Math.PI * 2 - Math.PI / 2;
  const jx = shake * rnd(seed + 3) * 6;
  const jy = shake * rnd(seed + 4) * 6;
  const marks = Array.from({length: 12}, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return <Ln key={i} x1={cx + Math.cos(a) * r * 0.82} y1={cy + Math.sin(a) * r * 0.82} x2={cx + Math.cos(a) * r * 0.92} y2={cy + Math.sin(a) * r * 0.92} sw={6} seed={seed + i} amp={0.8} />;
  });
  return (
    <g transform={`translate(${jx} ${jy})`}>
      <Ell cx={cx} cy={cy} rx={r} ry={r} n={16} fill={alarm > 0.5 ? roles.negative : c.skin} seed={seed + 50} amp={1.6} sw={12} />
      <Ell cx={cx} cy={cy} rx={r * 0.88} ry={r * 0.88} n={16} fill={c.skin} stroke="none" seed={seed + 51} amp={0.8} />
      {marks}
      <Ln x1={cx} y1={cy} x2={cx + Math.cos(ha) * r * 0.5} y2={cy + Math.sin(ha) * r * 0.5} sw={13} seed={seed + 60} amp={0.8} />
      <Ln x1={cx} y1={cy} x2={cx + Math.cos(ma) * r * 0.74} y2={cy + Math.sin(ma) * r * 0.74} sw={9} seed={seed + 61} amp={0.8} />
      <Ln x1={cx} y1={cy} x2={cx + Math.cos(sa) * r * 0.8} y2={cy + Math.sin(sa) * r * 0.8} sw={4} stroke={roles.negative} seed={seed + 62} amp={0.5} />
      <Ell cx={cx} cy={cy} rx={9} ry={9} fill={c.ink} seed={seed + 63} amp={0.3} />
    </g>
  );
};

const CLIP_ROLES = ['accent', 'accent2', 'accent3', 'shape', 'text', 'accentDeep'];
export const ClipPile = ({x0, y0, w, rows = 6, cols: nc = 8, t = 0, thud = 0}) => {
  const {roles} = useStory();
  const items = [];
  let k = 0;
  for (let r = 0; r < rows; r++) {
    const n = nc - r;
    for (let i = 0; i < n; i++) {
      const cw = w / nc;
      const px = x0 + (r * cw) / 2 + i * cw + rnd(k * 3) * 6;
      const py = y0 - r * (cw * 0.62) + thud * Math.sin(t / 50 + k) * 4 * Math.max(0, 1 - r / rows);
      const role = CLIP_ROLES[(k * 7 + r) % CLIP_ROLES.length];
      items.push(
        <g key={k} transform={`rotate(${rnd(k * 5 + 1) * 8} ${px + cw / 2} ${py})`}>
          <Rct x={px} y={py - cw * 0.62} w={cw * 1.08} h={cw * 0.66} r={9} fill={roles[role]} seed={k + 100} amp={1.4} sw={8} />
          <Blob pts={[[px + cw * 0.38, py - cw * 0.48], [px + cw * 0.38, py - cw * 0.2], [px + cw * 0.66, py - cw * 0.34]]} fill={roles.background} stroke="none" seed={k + 140} amp={0.6} opacity={0.55} />
        </g>,
      );
      k++;
    }
  }
  return <g>{items}</g>;
};

export const Mug = ({x, y, s = 1, t = 0, steam = 1}) => {
  const {roles} = useStory();
  const puffs = [0, 1, 2].map((i) => {
    const ph = ((t / 1400 + i / 3) % 1);
    return <Blob key={i} pts={[[0, 0], [10 * Math.sin(ph * 6 + i), -22], [-6 * Math.sin(ph * 5), -44], [8, -66]]} closed={false} sw={6} stroke={roles.text} opacity={steam * (1 - ph) * 0.8} seed={200 + i} amp={0.6} transform={`translate(${-24 + i * 24} ${-52 - ph * 40})`} />;
  });
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {puffs}
      <Rct x={-46} y={-40} w={92} h={80} r={14} fill={roles.accent} seed={210} />
      <Blob pts={[[46, -22], [74, -20], [76, 18], [46, 20]]} closed={false} sw={9} seed={211} />
    </g>
  );
};

export const Note = ({x, y, s = 1, role = 'accent', rot = 0, seed = 0, fill = true}) => {
  const {roles} = useStory();
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <Ell cx={0} cy={0} rx={20} ry={15} rot={-0.4} fill={roles[role]} seed={seed + 300} amp={0.8} sw={7} />
      <Ln x1={17} y1={-6} x2={17} y2={-74} sw={7} seed={seed + 301} amp={0.5} />
      <Blob pts={[[17, -74], [46, -62], [42, -36]]} closed={false} sw={7} seed={seed + 302} amp={0.6} />
    </g>
  );
};

export const FileIcon = ({x, y, s = 1, rot = 0, role = 'accent3', seed = 0}) => {
  const {roles} = useStory();
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <Rct x={-44} y={-56} w={88} h={112} r={10} fill={roles[role]} seed={seed + 320} sw={7} />
      <Note x={-4} y={22} s={0.55} role="text" seed={seed + 321} />
    </g>
  );
};

export const Scissors = ({x, y, s = 1, open = 0, rot = 0}) => {
  const {roles} = useStory();
  const a = open * 24;
  const blade = (sign) => (
    <g transform={`rotate(${sign * a} 0 0)`}>
      <Blob pts={[[0, 0], [150, -sign * 8], [160, -sign * 3], [8, sign * 12]]} fill={roles.text} seed={sign + 340} sw={7} amp={0.6} />
      <Ell cx={-34} cy={sign * 26} rx={28} ry={22} fill="none" sw={9} seed={sign + 342} amp={0.8} stroke={roles.accent} />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {blade(-1)}
      {blade(1)}
      <Ell cx={0} cy={0} rx={7} ry={7} fill={roles.background} stroke="none" seed={344} amp={0} />
    </g>
  );
};

export const Pen = ({s = 1, rot = 0}) => {
  const {roles} = useStory();
  return (
    <g transform={`rotate(${rot}) scale(${s})`}>
      <Blob pts={[[0, 0], [20, -14], [90, -70], [100, -58], [30, 6]]} fill={roles.accent} seed={350} sw={7} amp={0.6} />
      <Blob pts={[[0, 0], [20, -14], [30, 6]]} fill={roles.text} seed={351} sw={6} amp={0.3} />
    </g>
  );
};

// Voice waveform with silent gaps. gaps: [{a,b,close}] in bar indices; close 0..1 removes the gap.
export const Waveform = ({x, y, w, h, bars = 64, gaps = [], t = 0, glow = 0, role = 'accent3', seed = 0}) => {
  const {roles} = useStory();
  const widths = [];
  for (let i = 0; i < bars; i++) {
    const g = gaps.find((q) => i >= q.a && i < q.b);
    widths.push(g ? 1 - clamp01(g.close) : 1);
  }
  const total = widths.reduce((u, v) => u + v, 0);
  let acc = 0;
  const out = [];
  for (let i = 0; i < bars; i++) {
    const g = gaps.find((q) => i >= q.a && i < q.b);
    const bw = (w / total) * widths[i];
    const bx = x + (acc / total) * w;
    acc += widths[i];
    if (bw < 0.4) continue;
    const speech = 0.25 + 0.75 * Math.abs(rnd(i * 3.1 + seed)) * (0.6 + 0.4 * Math.abs(Math.sin(i * 0.41)));
    const amp = g ? 0.05 : speech;
    const bh = h * amp * (1 + 0.04 * Math.sin(t / 90 + i));
    out.push(<rect key={i} x={bx} y={y - bh / 2} width={Math.max(1, bw * 0.62)} height={bh} rx={2.5} fill={g && glow > 0 ? roles.negative : roles[role]} opacity={g ? 0.55 + 0.45 * glow : 1} />);
  }
  const marks = gaps.map((q, k) => {
    if (q.close >= 0.98 || glow <= 0) return null;
    let a0 = 0;
    for (let i = 0; i < q.a; i++) a0 += widths[i];
    let wid = 0;
    for (let i = q.a; i < q.b; i++) wid += widths[i];
    return <Rct key={k} x={x + (a0 / total) * w - 4} y={y - h * 0.62} w={(wid / total) * w + 8} h={h * 1.24} r={10} fill="none" stroke={roles.negative} sw={6} opacity={glow * (1 - q.close)} seed={400 + k} amp={1} />;
  });
  return (
    <g>
      {out}
      {marks}
    </g>
  );
};

export const TrackBar = ({x, y, w, h, role, seed = 0, label, jitter = 0}) => {
  const {roles, family} = useStory();
  return (
    <g transform={`translate(${rnd(seed) * jitter} ${rnd(seed + 9) * jitter * 0.4})`}>
      <Rct x={x} y={y} w={w} h={h} r={10} fill={roles[role]} seed={seed + 500} sw={7} amp={1.4} />
      {label ? <Txt x={x + w / 2} y={y + h * 0.66} size={h * 0.5} fill={roles.background} family={family} seed={seed}>{label}</Txt> : null}
    </g>
  );
};

export const Window = ({x, y, w, h, title, fill, seed = 0}) => {
  const {roles, family, sizes} = useStory();
  return (
    <g>
      <Rct x={x} y={y} w={w} h={h} r={22} fill={fill || roles.shape} stroke={roles.accent2} seed={seed + 600} sw={10} amp={1.6} />
      <Rct x={x + 6} y={y + 6} w={w - 12} h={56} r={18} fill={roles.surfaceAlt} stroke="none" seed={seed + 601} amp={0.6} />
      <Ell cx={x + 44} cy={y + 34} rx={10} ry={10} fill={roles.negative} sw={5} seed={seed + 602} amp={0.4} />
      <Ell cx={x + 76} cy={y + 34} rx={10} ry={10} fill={roles.accent} sw={5} seed={seed + 603} amp={0.4} />
      <Ell cx={x + 108} cy={y + 34} rx={10} ry={10} fill={roles.positive} sw={5} seed={seed + 604} amp={0.4} />
      {title ? <Txt x={x + w / 2} y={y + 44} size={sizes.label * 0.8} fill={roles.textMuted} family={family} weight={600} seed={seed}>{title}</Txt> : null}
    </g>
  );
};
