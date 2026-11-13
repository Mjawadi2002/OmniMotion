// WORKED EXAMPLE (a different video and a different reference): a complete, rendered, approved build of a "paper scrapbook" reference.
// It shows the patterns that work: one VideoLayer that morphs between layout modes, cards that enter with springs and leave fast,
// captions chunked from words.json and kept inside the safe zone, every timing taken from word times, and data from timeline.json.
// Its timings, texts and layouts belong to that other video: do NOT copy them; copy the craft.
// "Paper scrapbook" edit of IMG_9173, built to mirror the reference reel's design language:
// grid paper stage, footage in a torn taped photo card, cream cards with hard ink shadows and tape,
// boxed caption labels with a red keyword, a five-step tracker on top, stamps, and a newspaper end card.
import React, {useMemo} from 'react';
import {AbsoluteFill, Freeze, OffthreadVideo, spring, staticFile, useCurrentFrame} from 'remotion';
import '@fontsource/archivo/700.css';
import '@fontsource/archivo/800.css';
import '@fontsource/archivo/900.css';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/dm-serif-display/400-italic.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/fraunces/800.css';
import '@fontsource/fraunces/600-italic.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import WORDS from './words.json';
import TL from './timeline.json';

const FPS = 30;
const W = 1080;
const H = 1920;
const VIDEO_MS = TL.videoMs;
export const TOTAL_MS = VIDEO_MS + 1900;

const C = {
  paper: '#E5DCC6',
  card: '#F4EFE3',
  ink: '#161513',
  red: '#C8262C',
  mute: '#6E6656',
  yellow: '#F2C53D',
  tape: 'rgba(226,214,178,0.88)',
};
const F = {
  sans: 'Archivo, sans-serif',
  serif: '"DM Serif Display", serif',
  body: 'Fraunces, serif',
  mono: '"JetBrains Mono", monospace',
};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const useMs = () => (useCurrentFrame() / FPS) * 1000;
// 0..1 progress of an appear starting at `at` over `dur` ms
const pr = (ms: number, at: number, dur = 260) => clamp((ms - at) / dur);

// ---------------------------------------------------------------- timeline
type Mode = 'full' | 'paper' | 'window' | 'news';
const MODES: [number, Mode][] = [
  [0, 'full'],
  [8900, 'paper'],
  [21950, 'full'],
  [24650, 'paper'],
  [37850, 'window'],
  [45650, 'paper'],
  [57450, 'news'],
];
const SEAMS: number[] = TL.seams;
const PUNCH: [number, number, number][] = [
  [7200, 8650, 1.12], // "idiot ... out of it"
  [24270, 24650, 1.2], // "tool"
  [41100, 41780, 1.16], // "no limits"
];
const STEPS = [
  {at: 8900, label: ['The', 'idea']},
  {at: 13630, label: ['Ignore', 'the noise']},
  {at: 24130, label: ["It's", 'a tool']},
  {at: 37900, label: ['No', 'limits']},
  {at: 45770, label: ['One', 'catch']},
];

const modeAt = (ms: number) => {
  let i = 0;
  MODES.forEach(([t], k) => {
    if (ms >= t) i = k;
  });
  return i;
};

type Rect = {x: number; y: number; w: number; h: number; rot: number; torn: number; zoomK: number; oy: number};
const RECTS: Record<Mode, Rect> = {
  full: {x: 0, y: 0, w: W, h: H, rot: 0, torn: 0, zoomK: 1, oy: 50},
  paper: {x: 206, y: 934, w: 668, h: 900, rot: -1.6, torn: 1, zoomK: 0.55, oy: 70},
  window: {x: 110, y: 556, w: 860, h: 900, rot: 0, torn: 0, zoomK: 0.8, oy: 42},
  news: {x: 262, y: 560, w: 556, h: 640, rot: 2.2, torn: 1, zoomK: 0, oy: 55},
};
const TRANS_MS = 480;

// ---------------------------------------------------------------- textures
const useNoise = (size: number, n: number, seed: number, dark = 0.5) =>
  useMemo(() => {
    if (typeof document === 'undefined') return '';
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d')!;
    let s = seed;
    const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < dark ? `rgba(60,45,25,${0.25 + r() * 0.35})` : `rgba(255,250,235,${0.3 + r() * 0.4})`;
      g.fillRect(r() * size, r() * size, 1 + r() * 1.6, 1 + r() * 1.6);
    }
    return c.toDataURL('image/png');
  }, [size, n, seed, dark]);

const rand = (() => {
  let s = 7;
  return Array.from({length: 400}, () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
})();

// a torn-paper polygon around a w x h box (amplitude a px)
const tornPath = (w: number, h: number, a: number, seed = 0) => {
  if (a < 0.3) return undefined;
  const pts: string[] = [];
  const n = 26;
  const R = (i: number) => rand[(i + seed) % rand.length];
  for (let i = 0; i <= n; i++) pts.push(`${(i / n) * w}px ${R(i) * a}px`);
  for (let i = 1; i <= n; i++) pts.push(`${w - R(i + 40) * a}px ${(i / n) * h}px`);
  for (let i = 1; i <= n; i++) pts.push(`${w - (i / n) * w}px ${h - R(i + 80) * a}px`);
  for (let i = 1; i < n; i++) pts.push(`${R(i + 120) * a}px ${h - (i / n) * h}px`);
  return `polygon(${pts.join(',')})`;
};

const Tape: React.FC<{x: number; y: number; rot: number; w?: number}> = ({x, y, rot, w = 130}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: 40, background: C.tape, transform: `rotate(${rot}deg)`, boxShadow: '0 2px 3px rgba(0,0,0,0.12)', borderLeft: '2px dashed rgba(255,255,255,0.35)', borderRight: '2px dashed rgba(255,255,255,0.35)', zIndex: 5}} />
);

// ---------------------------------------------------------------- stage
const Stage: React.FC = () => {
  const noise = useNoise(256, 5200, 3);
  return (
    <AbsoluteFill style={{background: C.paper}}>
      <AbsoluteFill style={{backgroundImage: 'linear-gradient(rgba(70,55,30,0.10) 2px, transparent 2px), linear-gradient(90deg, rgba(70,55,30,0.10) 2px, transparent 2px), linear-gradient(rgba(70,55,30,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(70,55,30,0.06) 1px, transparent 1px)', backgroundSize: '180px 180px, 180px 180px, 36px 36px, 36px 36px'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 25% 15%, rgba(255,250,235,0.55), transparent 55%), radial-gradient(ellipse at 80% 85%, rgba(140,110,60,0.18), transparent 60%)'}} />
      {noise ? <AbsoluteFill style={{backgroundImage: `url(${noise})`, backgroundSize: '256px', opacity: 0.55}} /> : null}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(80,60,30,0.28) 100%)'}} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- video
const VideoLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const ms = (frame / FPS) * 1000;
  const i = modeAt(ms);
  const cur = RECTS[MODES[i][1]];
  const prev = RECTS[MODES[Math.max(0, i - 1)][1]];
  const t = i === 0 ? 1 : inOut(clamp((ms - MODES[i][0]) / TRANS_MS));
  const r = {} as Rect;
  (Object.keys(cur) as (keyof Rect)[]).forEach((k) => (r[k] = lerp(prev[k], cur[k], t)));
  // jump-cut punch: alternate framing per silence seam, plus authored punches
  let seg = 0;
  SEAMS.forEach((s, k) => {
    if (ms >= s) seg = k;
  });
  const segStart = SEAMS[seg];
  const alt = seg % 2 ? 0.1 : 0;
  const drift = 0.025 * clamp((ms - segStart) / 4000);
  let punch = 0;
  for (const [a, b, z] of PUNCH) {
    const up = clamp((ms - a) / 160);
    const down = clamp((ms - b) / 220);
    punch = Math.max(punch, (z - 1) * up * (1 - down));
  }
  const zoom = 1 + (alt + drift + punch) * r.zoomK;
  const lastF = Math.floor((VIDEO_MS / 1000) * FPS) - 2;
  const clip = tornPath(r.w, r.h, 16 * r.torn, 3);
  const showWindow = MODES[i][1] === 'window' ? t : MODES[Math.max(0, i - 1)][1] === 'window' ? 1 - t : 0;
  return (
    <>
      {showWindow > 0.01 ? <WindowChrome op={showWindow} ms={ms} /> : null}
      <div style={{position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, transform: `rotate(${r.rot}deg)`, filter: r.torn > 0.05 ? `drop-shadow(${9 * r.torn}px ${11 * r.torn}px 0 ${C.ink})` : undefined}}>
        <div style={{position: 'absolute', inset: 0, overflow: 'hidden', clipPath: clip, background: '#222'}}>
          <div style={{position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: '47% 36%'}}>
            <Freeze frame={lastF} active={frame >= lastF}>
              <OffthreadVideo muted src={staticFile('cut.mp4')} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `50% ${r.oy}%`}} />
            </Freeze>
          </div>
        </div>
        {r.torn > 0.5 ? (
          <>
            <Tape x={-40} y={-14} rot={-32} />
            <Tape x={r.w - 92} y={-14} rot={30} />
          </>
        ) : null}
      </div>
    </>
  );
};

// the "call window" around the footage in the window section (mirrors the reference's interview window)
const WindowChrome: React.FC<{op: number; ms: number}> = ({op, ms}) => {
  const secs = Math.max(0, Math.floor((ms - 37850) / 1000));
  return (
    <div style={{position: 'absolute', left: 90, top: 470, width: 900, height: 1100, background: C.card, border: `4px solid ${C.ink}`, boxShadow: `10px 12px 0 ${C.ink}`, opacity: op, transform: `translateY(${(1 - op) * 40}px)`}}>
      <div style={{height: 78, display: 'flex', alignItems: 'center', padding: '0 26px', gap: 14, borderBottom: `3px solid ${C.ink}`, fontFamily: F.mono, fontSize: 28, color: C.ink}}>
        <span style={{width: 16, height: 16, borderRadius: 8, background: C.red, display: 'inline-block'}} />
        <span style={{fontWeight: 700}}>00:{String(secs).padStart(2, '0')}</span>
        <span style={{marginLeft: 'auto', fontWeight: 700, letterSpacing: 1}}>right now</span>
      </div>
      <div style={{position: 'absolute', bottom: 18, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 26}}>
        {['mic', 'cam', 'up'].map((k) => (
          <div key={k} style={{width: 62, height: 62, borderRadius: 31, border: `3px solid ${C.ink}`, background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <Icon kind={k} />
          </div>
        ))}
        <div style={{width: 120, height: 62, borderRadius: 31, background: C.red, border: `3px solid ${C.ink}`}} />
      </div>
      <Tape x={-36} y={-16} rot={-28} />
      <Tape x={806} y={-16} rot={28} />
    </div>
  );
};

const Icon: React.FC<{kind: string; size?: number; color?: string}> = ({kind, size = 30, color = C.ink}) => {
  const p = {fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'mic' ? (
        <>
          <rect x="9" y="3" width="6" height="11" rx="3" {...p} />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...p} />
        </>
      ) : kind === 'cam' ? (
        <>
          <rect x="3" y="7" width="13" height="10" rx="2" {...p} />
          <path d="M16 11l5-3v8l-5-3" {...p} />
        </>
      ) : kind === 'up' ? (
        <path d="M12 19V5M6 11l6-6 6 6" {...p} />
      ) : kind === 'person' ? (
        <>
          <circle cx="12" cy="8" r="4" {...p} />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...p} />
        </>
      ) : null}
    </svg>
  );
};

// ---------------------------------------------------------------- cards
const Card: React.FC<{x: number; y: number; w: number; h?: number; from: number; to: number; rot?: number; tapes?: boolean; children: React.ReactNode; pad?: number}> = ({x, y, w, h, from, to, rot = 0, tapes = true, children, pad = 34}) => {
  const frame = useCurrentFrame();
  const ms = (frame / FPS) * 1000;
  const noise = useNoise(200, 2600, 11, 0.6);
  if (ms < from || ms > to + 260) return null;
  const s = spring({frame: frame - Math.round((from / 1000) * FPS), fps: FPS, config: {damping: 13, stiffness: 150, mass: 0.8}});
  const e = clamp((ms - to) / 240);
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, height: h, transform: `translateY(${(1 - s) * 90 - e * 50}px) rotate(${rot + (1 - s) * -5}deg) scale(${0.9 + 0.1 * s - 0.04 * e})`, opacity: clamp(s * 3) * (1 - e), transformOrigin: '50% 100%'}}>
      <div style={{position: 'relative', background: C.card, border: `4px solid ${C.ink}`, boxShadow: `10px 12px 0 ${C.ink}`, padding: pad, height: h ? '100%' : undefined, boxSizing: 'border-box'}}>
        {noise ? <div style={{position: 'absolute', inset: 0, backgroundImage: `url(${noise})`, opacity: 0.35, pointerEvents: 'none'}} /> : null}
        <div style={{position: 'relative'}}>{children}</div>
      </div>
      {tapes ? (
        <>
          <Tape x={-44} y={-18} rot={-30} />
          <Tape x={w - 90} y={-18} rot={30} />
        </>
      ) : null}
    </div>
  );
};

const Kicker: React.FC<{children: React.ReactNode; right?: React.ReactNode}> = ({children, right}) => (
  <div style={{display: 'flex', alignItems: 'center', fontFamily: F.mono, fontWeight: 700, fontSize: 27, letterSpacing: 2, color: C.red, textTransform: 'uppercase'}}>
    <span style={{fontSize: 30, marginRight: 12}}>✸</span>
    {children}
    {right ? <span style={{marginLeft: 'auto', color: C.ink, letterSpacing: 1}}>{right}</span> : null}
  </div>
);
const Rule: React.FC<{double?: boolean}> = ({double}) => <div style={{borderTop: `3px solid ${C.ink}`, borderBottom: double ? `1.5px solid ${C.ink}` : undefined, height: double ? 5 : 0, margin: '14px 0'}} />;

const Stamp: React.FC<{at: number; text: string; rot?: number; size?: number; style?: React.CSSProperties; color?: string}> = ({at, text, rot = -9, size = 44, style, color = C.red}) => {
  const ms = useMs();
  const p = clamp((ms - at) / 200);
  if (p <= 0) return null;
  return (
    <div style={{position: 'absolute', transform: `rotate(${rot}deg) scale(${lerp(1.9, 1, outBack(p))})`, opacity: p, border: `5px solid ${color}`, outline: `2px solid ${color}`, outlineOffset: 5, padding: '6px 18px', fontFamily: F.mono, fontWeight: 700, fontSize: size, color, letterSpacing: 2, whiteSpace: 'nowrap', background: 'rgba(244,239,227,0.55)', ...style}}>
      {text}
    </div>
  );
};

const Check: React.FC<{at: number; size?: number; bg?: string}> = ({at, size = 56, bg = C.ink}) => {
  const ms = useMs();
  const p = pr(ms, at, 220);
  return (
    <div style={{width: size, height: size, borderRadius: size / 2, background: p > 0 ? bg : 'transparent', border: `3px solid ${C.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${p > 0 ? outBack(p) : 1})`, flexShrink: 0}}>
      {p > 0 ? <span style={{color: '#fff', fontSize: size * 0.56, fontFamily: F.sans, fontWeight: 900}}>✓</span> : null}
    </div>
  );
};

// a word that fades from faint to full when spoken (keeps the layout still)
const Spoken: React.FC<{at: number; children: React.ReactNode; style?: React.CSSProperties}> = ({at, children, style}) => {
  const ms = useMs();
  const p = pr(ms, at, 160);
  return <span style={{opacity: 0.16 + 0.84 * p, ...style}}>{children}</span>;
};

// draws a red line through its child at `at`
const Strike: React.FC<{at: number; children: React.ReactNode}> = ({at, children}) => {
  const ms = useMs();
  const p = clamp((ms - at) / 220);
  return (
    <span style={{position: 'relative', display: 'inline-block'}}>
      <span style={{opacity: 1 - 0.45 * p}}>{children}</span>
      <span style={{position: 'absolute', left: -6, top: '54%', height: 6, width: `calc(${p * 100}% + 12px)`, background: C.red, transform: 'rotate(-2deg)', borderRadius: 3}} />
    </span>
  );
};

// ---------------------------------------------------------------- hook (full screen): stacked labels + the quote card
const Label: React.FC<{at: number; children: React.ReactNode; size: number; rot: number; out: number}> = ({at, children, size, rot, out}) => {
  const frame = useCurrentFrame();
  const ms = (frame / FPS) * 1000;
  if (ms < at) return <div style={{height: size * 1.5}} />;
  const s = spring({frame: frame - Math.round((at / 1000) * FPS), fps: FPS, config: {damping: 12, stiffness: 180}});
  const e = clamp((ms - out) / 220);
  return (
    <div style={{display: 'inline-block', transform: `rotate(${rot}deg) scale(${lerp(0.7, 1, s)})`, opacity: clamp(s * 2) * (1 - e), background: C.card, border: `4px solid ${C.ink}`, boxShadow: `7px 8px 0 ${C.ink}`, padding: '8px 26px 12px', fontFamily: F.sans, fontWeight: 900, fontSize: size, color: C.ink, letterSpacing: -0.5, lineHeight: 1.1, margin: '6px 0'}}>
      {children}
    </div>
  );
};

const QUOTE: [string, number][] = [['“If', 3100], ['you', 3270], ['have', 3430], ['an', 3600], ['idea', 3730], ['that', 4270], ['genuinely', 4500], ['you', 5000], ['think', 5200], ["it's", 5500], ['good,', 5770], ["don't", 6100], ['let', 6470], ['any', 6900], ['idiot', 7200], ['talk', 7800], ['you', 8100], ['out', 8300], ['of', 8470], ['it.”', 8600]];

const Hook: React.FC = () => {
  const ms = useMs();
  if (ms > 9300) return null;
  const circle = clamp((ms - 3730) / 300);
  return (
    <>
      <div style={{position: 'absolute', top: 236, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <Label at={330} size={78} rot={-1.6} out={8700}>Stan Lee</Label>
        <Label at={1100} size={54} rot={1.2} out={8760}>
          the legend behind <span style={{color: C.red}}>Marvel</span>
        </Label>
      </div>
      <Card x={66} y={1066} w={890} from={2950} to={8850} rot={-0.8}>
        <Kicker right="Stan Lee">once said</Kicker>
        <Rule double />
        <div style={{fontFamily: F.body, fontWeight: 600, fontSize: 47, lineHeight: 1.22, color: C.ink}}>
          {QUOTE.map(([w, at], k) => (
            <React.Fragment key={k}>
              {w === 'idea' ? (
                <span style={{position: 'relative', display: 'inline-block'}}>
                  <Spoken at={at} style={{color: C.red}}>{w}</Spoken>
                  <svg style={{position: 'absolute', left: -18, top: -10, overflow: 'visible'}} width="130" height="76" viewBox="0 0 130 76">
                    <ellipse cx="65" cy="38" rx="62" ry="33" fill="none" stroke={C.red} strokeWidth="5" strokeDasharray="420" strokeDashoffset={420 * (1 - circle)} transform="rotate(-6 65 38)" />
                  </svg>
                </span>
              ) : w === 'idiot' ? (
                <Spoken at={at} style={{color: C.red, textDecoration: ms > 7300 ? 'underline' : 'none', textDecorationThickness: 5, textUnderlineOffset: 8}}>{w}</Spoken>
              ) : (
                <Spoken at={at}>{w}</Spoken>
              )}{' '}
            </React.Fragment>
          ))}
        </div>
        <div style={{textAlign: 'right', fontFamily: F.serif, fontStyle: 'italic', fontSize: 40, color: C.ink, marginTop: 10, opacity: pr(ms, 8350, 200)}}>— Stan Lee</div>
      </Card>
    </>
  );
};

// ---------------------------------------------------------------- stepper (top tracker, mirrors the reference's 5-step progress)
const Stepper: React.FC = () => {
  const frame = useCurrentFrame();
  const ms = (frame / FPS) * 1000;
  const mi = modeAt(ms);
  const mode = MODES[mi][1];
  if (ms < 8900 || ms > 57700) return null;
  // hidden during the window section and the end card
  const hideA = mode === 'window' ? clamp((ms - 37850) / 250) : 0;
  const showB = MODES[mi - 1] && MODES[mi - 1][1] === 'window' ? 1 - clamp((ms - MODES[mi][0]) / 250) : 0;
  const hide = Math.max(hideA, showB, mode === 'news' ? clamp((ms - 57450) / 200) : 0);
  if (hide >= 1) return null;
  let active = 0;
  STEPS.forEach((s, k) => {
    if (ms >= s.at) active = k;
  });
  const s = spring({frame: frame - Math.round(8.9 * FPS), fps: FPS, config: {damping: 14, stiffness: 140}});
  const x0 = 112, gap = 190;
  const fillTo = active + clamp((ms - STEPS[active].at) / 350) - 1;
  return (
    <div style={{position: 'absolute', left: 48, top: 226, width: 984, height: 172, opacity: (1 - hide) * clamp(s * 2), transform: `translateY(${(1 - s) * -60 - hide * 30}px)`}}>
      <div style={{position: 'absolute', inset: 0, background: C.card, border: `4px solid ${C.ink}`, boxShadow: `9px 10px 0 ${C.ink}`}} />
      <Tape x={-40} y={-16} rot={-30} w={110} />
      <Tape x={912} y={-16} rot={30} w={110} />
      {/* connectors */}
      {STEPS.slice(0, 4).map((_, k) => {
        const f = clamp(fillTo - k);
        return (
          <div key={k} style={{position: 'absolute', left: x0 + k * gap + 32, top: 52, width: gap - 64, height: 0, borderTop: `3px dashed rgba(22,21,19,0.45)`}}>
            <div style={{position: 'absolute', left: 0, top: -4.5, height: 6, width: `${f * 100}%`, background: C.red}} />
          </div>
        );
      })}
      {STEPS.map((st, k) => {
        const done = k < active;
        const act = k === active;
        const pulse = act ? 1 + 0.28 * (1 - clamp((ms - st.at) / 320)) : 1;
        return (
          <div key={k} style={{position: 'absolute', left: x0 + k * gap - 100, top: 24, width: 200, textAlign: 'center'}}>
            <div style={{margin: '0 auto', width: 58, height: 58, borderRadius: 29, boxSizing: 'border-box', border: `3px solid ${C.ink}`, background: done ? C.ink : act ? C.red : C.card, color: done || act ? '#fff' : C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.body, fontWeight: 800, fontSize: 30, transform: `scale(${pulse})`, boxShadow: act ? `0 0 0 6px rgba(200,38,44,0.18)` : undefined}}>
              {done ? '✓' : k + 1}
            </div>
            <div style={{marginTop: 8, fontFamily: F.body, fontWeight: 700, fontSize: 25, lineHeight: 1.1, color: act ? C.red : done ? C.ink : C.mute}}>
              {st.label[0]}
              <br />
              {st.label[1]}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- section cards (paper zone: y 430..900)
const CX = 64, CW = 886;

const CardAI: React.FC = () => {
  const ms = useMs();
  const typed = 'right now';
  const n = Math.floor(clamp((ms - 10900) / 320) * typed.length);
  return (
    <Card x={CX} y={440} w={CW} from={9000} to={13560} pad={0} rot={0.6}>
      <div style={{height: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', borderBottom: `3px solid ${C.ink}`, fontFamily: F.mono, fontSize: 25, fontWeight: 700}}>
        {[0, 1, 2].map((k) => (
          <span key={k} style={{width: 18, height: 18, borderRadius: 9, border: `3px solid ${C.ink}`, display: 'inline-block'}} />
        ))}
        <span style={{marginLeft: 20}}>reflects &amp; relates to us</span>
      </div>
      <div style={{position: 'relative', height: 300, padding: '26px 34px'}}>
        <div style={{fontFamily: F.mono, fontSize: 26, color: C.mute, fontWeight: 500}}>&gt; simply because of…</div>
        <div style={{fontFamily: F.serif, fontSize: 104, lineHeight: 1.05, color: C.ink, marginTop: 10}}>
          {typed.slice(0, n)}
          <span style={{opacity: Math.floor(ms / 400) % 2 ? 1 : 0.15, color: C.red}}>|</span>
        </div>
        <Stamp at={11430} text="MORE THAN EVER" size={40} rot={-7} style={{left: 40, top: 200}} />
        {ms >= 13200 ? (
          <div style={{position: 'absolute', right: 40, top: 70, width: 200, height: 200, background: C.ink, color: C.card, fontFamily: F.serif, fontSize: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(4deg) scale(${outBack(pr(ms, 13200, 220))})`, boxShadow: `8px 9px 0 ${C.red}`}}>AI</div>
        ) : null}
      </div>
    </Card>
  );
};

const CardNoise: React.FC = () => {
  const ms = useMs();
  const rows: [string, number][] = [['a hype', 17400], ['a bubble', 17970], ['a competitor', 18670]];
  return (
    <Card x={CX} y={432} w={CW} from={13650} to={21930} rot={-0.6}>
      <Kicker right={`${rows.filter(([, a]) => ms >= a).length}/3`}>everyone knows AI</Kicker>
      <div style={{fontFamily: F.serif, fontSize: 54, color: C.ink, marginTop: 6}}>Everyone thinks of it as…</div>
      <Rule double />
      {rows.map(([t, at], k) => {
        const p = pr(ms, at, 240);
        return (
          <div key={k} style={{display: 'flex', alignItems: 'center', height: 74, borderBottom: '2px dotted rgba(22,21,19,0.5)', opacity: p, transform: `translateX(${(1 - p) * -30}px)`}}>
            <span style={{fontFamily: F.mono, fontSize: 28, fontWeight: 700, width: 74, color: C.mute}}>0{k + 1}</span>
            <span style={{fontFamily: F.body, fontWeight: 700, fontSize: 48}}>
              <Strike at={21300 + k * 120}>{t}</Strike>
            </span>
          </div>
        );
      })}
      <Stamp at={21970} text="NOISE" size={64} rot={-10} style={{right: 30, top: 150}} />
    </Card>
  );
};

const CardTeam1: React.FC = () => {
  const ms = useMs();
  return (
    <Card x={CX} y={440} w={CW} from={24750} to={28780} rot={0.5}>
      <Kicker>imagine</Kicker>
      <div style={{fontFamily: F.serif, fontSize: 66, marginTop: 4}}>
        <Spoken at={25830}>your whole team</Spoken>
      </div>
      <Rule double />
      <div style={{display: 'flex', gap: 26, marginTop: 6}}>
        <div style={{flex: 1, position: 'relative', border: `3px solid ${C.ink}`, padding: '18px 22px', height: 150, opacity: 0.25 + 0.75 * pr(ms, 26870, 200)}}>
          <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: 26, color: C.mute}}>YESTERDAY</div>
          <div style={{fontFamily: F.body, fontWeight: 700, fontSize: 44, marginTop: 8}}>
            <Strike at={27600}>couldn't afford</Strike>
          </div>
        </div>
        <div style={{flex: 1, position: 'relative', border: `3px solid ${C.ink}`, padding: '18px 22px', height: 150, background: ms >= 28370 ? 'rgba(242,197,61,0.35)' : undefined, opacity: 0.25 + 0.75 * pr(ms, 28370, 200)}}>
          <div style={{fontFamily: F.mono, fontWeight: 700, fontSize: 26, color: C.red}}>TODAY</div>
          <div style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 10}}>
            <Check at={28370} size={60} bg={C.red} />
            <span style={{fontFamily: F.body, fontWeight: 700, fontSize: 44}}>today</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

const CardTeam2: React.FC = () => {
  const ms = useMs();
  const chips: [string, number][] = [['some creativity', 30030], ['some adaptability', 30930], ['a good idea', 32270]];
  const got = chips.filter(([, a]) => ms >= a).length;
  return (
    <Card x={CX} y={460} w={CW} from={28870} to={32830} rot={-0.5}>
      <Kicker right={`${got}/3`}>simply with</Kicker>
      <Rule />
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 8}}>
        {chips.map(([t, at], k) => {
          const on = ms >= at;
          const p = pr(ms, at, 220);
          return (
            <div key={k} style={{border: `3px solid ${C.ink}`, padding: '10px 22px', fontFamily: F.sans, fontWeight: 800, fontSize: 42, background: on ? C.yellow : C.card, boxShadow: on ? `5px 6px 0 ${C.ink}` : 'none', transform: `scale(${on ? lerp(1.15, 1, p) : 1}) rotate(${on ? (k % 2 ? 1.2 : -1.2) : 0}deg)`, color: on ? C.ink : C.mute}}>
              {t}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const CardTeam3: React.FC = () => {
  const ms = useMs();
  const rows: [string, number][] = [['an assistant', 34570], ['a designer', 35130], ['an editor', 35870]];
  const band = pr(ms, 36530, 260);
  return (
    <Card x={CX} y={432} w={CW} from={32900} to={37830} rot={0.4}>
      <Kicker>you can literally have</Kicker>
      <Rule double />
      {rows.map(([t, at], k) => {
        const p = pr(ms, at, 240);
        return (
          <div key={k} style={{display: 'flex', alignItems: 'center', gap: 22, height: 80, borderBottom: '2px dotted rgba(22,21,19,0.5)', opacity: 0.2 + 0.8 * p}}>
            <div style={{width: 58, height: 58, borderRadius: 29, border: `3px solid ${C.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p > 0 ? C.yellow : C.card}}>
              <Icon kind="person" size={34} />
            </div>
            <span style={{fontFamily: F.body, fontWeight: 700, fontSize: 48, flex: 1}}>{t}</span>
            <Check at={at + 120} size={50} />
          </div>
        );
      })}
      <div style={{marginTop: 18, height: 72, background: C.ink, color: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.serif, fontSize: 48, clipPath: `inset(0 ${(1 - band) * 100}% 0 0)`}}>
        a whole team <span style={{color: C.yellow, marginLeft: 14, fontStyle: 'italic'}}>for you</span>
      </div>
    </Card>
  );
};

// headline above the call window (mirrors the reference's "interview" section)
const Headline: React.FC = () => {
  const frame = useCurrentFrame();
  const ms = (frame / FPS) * 1000;
  if (ms < 37850 || ms > 45900) return null;
  const v = ms < 41780 ? 0 : 1;
  const at = v === 0 ? 37950 : 41800;
  const s = spring({frame: frame - Math.round((at / 1000) * FPS), fps: FPS, config: {damping: 13, stiffness: 170}});
  const e = clamp((ms - (v === 0 ? 41650 : 45600)) / 150);
  const lines = v === 0 ? [<>the human potential</>, <>has <span style={{color: C.red}}>no limits</span></>] : [<>build your own <span style={{color: C.red}}>empire</span></>, <>from scratch</>];
  return (
    <div style={{position: 'absolute', top: 236, left: 0, right: 0, textAlign: 'center', fontFamily: F.sans, fontWeight: 900, fontSize: 74, lineHeight: 1.06, color: C.ink, letterSpacing: -1, opacity: clamp(s * 2) * (1 - e), transform: `translateY(${(1 - s) * 30}px) scale(${lerp(0.9, 1, s)})`}}>
      {lines.map((l, k) => (
        <div key={k}>{l}</div>
      ))}
    </div>
  );
};

const CardCatch: React.FC = () => (
  <Card x={CX + 40} y={520} w={CW - 80} from={45750} to={47080} rot={-1}>
    <div style={{position: 'absolute', left: -12, top: -66, background: C.red, color: '#fff', fontFamily: F.mono, fontWeight: 700, fontSize: 28, padding: '6px 16px', transform: 'rotate(-4deg)', border: `3px solid ${C.ink}`}}>⚠ but…</div>
    <div style={{fontFamily: F.serif, fontSize: 60, textAlign: 'center'}}>there is only</div>
    <div style={{position: 'relative', height: 130}}>
      <Stamp at={46570} text="ONE CATCH" size={78} rot={-5} style={{left: 140, top: 14}} />
    </div>
  </Card>
);

const CardDiff: React.FC = () => {
  const ms = useMs();
  return (
    <Card x={CX} y={440} w={CW} from={47180} to={52880} rot={0.5}>
      <Kicker>here comes the difference</Kicker>
      <Rule double />
      <div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 10}}>
        <div style={{flex: 1, border: `4px solid ${C.ink}`, background: ms >= 49170 ? C.yellow : C.card, padding: '22px 18px', textAlign: 'center', fontFamily: F.body, fontWeight: 800, fontSize: 44, lineHeight: 1.1, opacity: 0.2 + 0.8 * pr(ms, 49070, 220), boxShadow: ms >= 49170 ? `6px 7px 0 ${C.ink}` : 'none'}}>
          a successful person
        </div>
        <div style={{width: 74, height: 74, borderRadius: 37, background: C.red, color: '#fff', fontFamily: F.serif, fontSize: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${C.ink}`, flexShrink: 0}}>vs</div>
        <div style={{flex: 1, border: `4px dashed ${C.mute}`, padding: '22px 18px', textAlign: 'center', fontFamily: F.body, fontWeight: 700, fontSize: 44, lineHeight: 1.1, color: C.mute, opacity: 0.2 + 0.8 * pr(ms, 50770, 220)}}>
          everyone else
        </div>
      </div>
      <div style={{position: 'relative', height: 96}}>
        <Stamp at={52070} text="SO SIMPLE" size={50} rot={-6} style={{left: 250, top: 22}} />
      </div>
    </Card>
  );
};

const CardTry: React.FC = () => {
  const ms = useMs();
  const xs = [55200, 55430, 55660];
  return (
    <Card x={CX} y={432} w={CW} from={52960} to={57420} rot={-0.4}>
      <Kicker>a successful person is someone who</Kicker>
      <Rule double />
      <div style={{display: 'flex', alignItems: 'center', height: 96, borderBottom: '2px dotted rgba(22,21,19,0.5)', opacity: 0.2 + 0.8 * pr(ms, 54930, 200)}}>
        <span style={{fontFamily: F.body, fontWeight: 700, fontSize: 50, flex: 1}}>kept failing</span>
        {xs.map((a, k) => (
          <span key={k} style={{fontFamily: F.sans, fontWeight: 900, fontSize: 58, color: C.red, marginLeft: 16, opacity: pr(ms, a, 120), transform: `scale(${ms >= a ? outBack(pr(ms, a, 200)) : 0})`, display: 'inline-block'}}>✗</span>
        ))}
      </div>
      <div style={{display: 'flex', alignItems: 'center', height: 110, opacity: 0.2 + 0.8 * pr(ms, 56100, 200)}}>
        <span style={{fontFamily: F.body, fontWeight: 700, fontSize: 50, flex: 1}}>
          tried <span style={{background: ms >= 56870 ? C.yellow : 'transparent', padding: '0 8px', boxShadow: ms >= 56870 ? `4px 5px 0 ${C.ink}` : 'none', border: ms >= 56870 ? `3px solid ${C.ink}` : '3px solid transparent'}}>one more time</span>
        </span>
        <Check at={57330} size={64} bg={C.red} />
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------- end card (mirrors the reference's newspaper outro)
const News: React.FC = () => {
  const frame = useCurrentFrame();
  const ms = (frame / FPS) * 1000;
  if (ms < 57450) return null;
  const s = spring({frame: frame - Math.round(57.45 * FPS), fps: FPS, config: {damping: 14, stiffness: 140}});
  const b = pr(ms, 58300, 260);
  return (
    <>
      <div style={{position: 'absolute', top: 268, left: 70, right: 70, textAlign: 'center', opacity: clamp(s * 2), transform: `translateY(${(1 - s) * -40}px)`}}>
        <div style={{fontFamily: F.serif, fontSize: 84, color: C.ink, lineHeight: 1}}>The One More Time</div>
        <div style={{borderTop: `4px solid ${C.ink}`, borderBottom: `2px solid ${C.ink}`, height: 6, margin: '16px 0 10px'}} />
        <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: F.mono, fontWeight: 700, fontSize: 24, color: C.ink, letterSpacing: 1}}>
          <span>STAN LEE</span>
          <span>NO LIMITS</span>
          <span>AI · A TOOL</span>
        </div>
      </div>
      <div style={{position: 'absolute', top: 1262, left: 60, right: 60, textAlign: 'center', fontFamily: F.body, fontWeight: 800, fontSize: 56, lineHeight: 1.12, color: C.ink, opacity: pr(ms, 57700, 260)}}>
        Kept failing.
        <br />
        Tried <span style={{color: C.red}}>one more time.</span>
      </div>
      <div style={{position: 'absolute', top: 1420, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 24, opacity: b, transform: `translateY(${(1 - b) * 20}px)`}}>
        <div style={{border: `3px solid ${C.ink}`, background: C.card, padding: '10px 30px', fontFamily: F.sans, fontWeight: 800, fontSize: 34, boxShadow: `5px 6px 0 ${C.ink}`}}>Save this</div>
        <div style={{border: `3px solid ${C.ink}`, background: C.red, color: '#fff', padding: '10px 30px', fontFamily: F.sans, fontWeight: 800, fontSize: 34, boxShadow: `5px 6px 0 ${C.ink}`}}>+ Follow</div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------- captions (boxed label, red keyword)
type Word = {t: string; s: number; e: number};
const EMPH = new Set(['marvel', 'idea', 'ai', 'hype', 'bubble', 'competitor', 'noise', 'competition', 'tool', 'team', 'yesterday', 'today', 'creativity', 'adaptability', 'assistant', 'designer', 'editor', 'limits', 'empire', 'scratch', 'catch', 'difference', 'successful', 'failing', 'time', 'potential', 'human', 'simple']);
const norm = (t: string) => t.toLowerCase().replace(/[^a-z']/g, '');

const chunks = (() => {
  const ws = (WORDS as Word[]).map((w) => ({...w, t: w.t.replace(/["“”]/g, '')}));
  const out: {words: Word[]; s: number; e: number}[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({words: cur, s: cur[0].s, e: cur[cur.length - 1].e});
    cur = [];
  };
  ws.forEach((w) => {
    const len = cur.map((x) => x.t).join(' ').length + w.t.length + 1;
    if (cur.length >= 3 || (cur.length && len > 17)) flush();
    cur.push(w);
    if (/[,.!?]$/.test(w.t)) flush();
  });
  flush();
  out.forEach((c, k) => {
    const next = out[k + 1];
    c.e = next ? Math.min(next.s, c.e + 700) : c.e + 400;
    if (next && next.s - c.e < 250) c.e = next.s;
  });
  return out;
})();

const CAP_Y: Record<Mode, number> = {full: 1268, paper: 1440, window: 1320, news: 1440};

const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const ms = (frame / FPS) * 1000;
  if (ms < 8900) return null; // the hook shows the words in the labels and the quote card
  const c = chunks.find((x) => ms >= x.s && ms < x.e);
  if (!c) return null;
  const i = modeAt(ms);
  const t = inOut(clamp((ms - MODES[i][0]) / TRANS_MS));
  const y = lerp(CAP_Y[MODES[Math.max(0, i - 1)][1]], CAP_Y[MODES[i][1]], i === 0 ? 1 : t);
  const s = spring({frame: frame - Math.round((c.s / 1000) * FPS), fps: FPS, config: {damping: 11, stiffness: 260, mass: 0.6}});
  const text = c.words.map((w) => w.t).join(' ');
  const size = Math.min(66, 800 / (text.length * 0.6));
  const rot = (chunks.indexOf(c) % 3) - 1;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: y, display: 'flex', justifyContent: 'center', transform: 'translateY(-50%)'}}>
      <div style={{background: '#F2ECDD', border: `4px solid ${C.ink}`, boxShadow: `7px 8px 0 ${C.ink}`, padding: '8px 28px 12px', fontFamily: F.sans, fontWeight: 900, fontSize: size, color: C.ink, letterSpacing: -0.5, whiteSpace: 'nowrap', transform: `scale(${lerp(0.78, 1, s)}) rotate(${rot * 0.8}deg)`, opacity: clamp(s * 2.5)}}>
        {c.words.map((w, k) => (
          <span key={k} style={{color: EMPH.has(norm(w.t)) ? C.red : C.ink}}>
            {w.t.replace(/[,.]$/, '')}
            {k < c.words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- film grain over everything
const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const noise = useNoise(240, 3000, 99, 0.5);
  if (!noise) return null;
  return <AbsoluteFill style={{backgroundImage: `url(${noise})`, backgroundSize: '240px', backgroundPosition: `${(frame * 37) % 240}px ${(frame * 71) % 240}px`, opacity: 0.12, mixBlendMode: 'multiply', pointerEvents: 'none'}} />;
};

// ---------------------------------------------------------------- composition
export const Composition: React.FC = () => (
  <AbsoluteFill style={{background: C.paper}}>
    <Stage />
    <VideoLayer />
    <Hook />
    <Stepper />
    <CardAI />
    <CardNoise />
    <CardTeam1 />
    <CardTeam2 />
    <CardTeam3 />
    <Headline />
    <CardCatch />
    <CardDiff />
    <CardTry />
    <News />
    <Captions />
    <Grain />
  </AbsoluteFill>
);
