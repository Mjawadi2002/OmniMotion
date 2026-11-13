// @ts-nocheck
// "Tech review" family (reference 6): dark navy stage with a faint grid, thin progress bar + small brand tag on top,
// glass pill stacks, count-up stat rows, price chips, serif word slams, caution-tape sting, rating ring, comment-keyword CTA.
// Every colour / size / timing comes from the tokens (director.tech + palette roles).
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {withAlpha} from '../../shared/color.js';
import {ease, enterStyle, fontFor, measureText, progress, useGeo, useTheme} from '../core';
import {D, Sticker, useT} from './bits';

const T = () => D.tech;
const toneColor = (roles, tone) => ({amber: roles.accent, white: roles.text, green: roles.positive, red: roles.red, blue: roles.primary}[tone] || roles.accent);

export const TechStage = () => {
  const geo = useGeo();
  const {tMs} = useT();
  const {roles} = useTheme();
  const S = T().stage;
  const g = S.gridPx * geo.width;
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 18%, ${roles.backgroundAlt} 0%, ${roles.background} 62%)`}}>
      <div style={{position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${withAlpha(roles.primary, S.gridAlpha)} 1px, transparent 1px), linear-gradient(90deg, ${withAlpha(roles.primary, S.gridAlpha)} 1px, transparent 1px)`, backgroundSize: `${g}px ${g}px`, backgroundPosition: `0px ${(tMs / 1000) * S.driftPxPerSec * geo.height}px`}} />
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 100%, ${withAlpha(roles.primary, S.glowAlpha)} 0%, transparent 55%)`}} />
    </AbsoluteFill>
  );
};

// thin progress line across the top + small spaced caps brand tag
export const TopBar = ({durationMs, tag}) => {
  const {tMs, geo} = useT();
  const {roles} = useTheme();
  const B = T().topBar;
  const f = fontFor(useTheme(), 'heading', 'A');
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, width: `${Math.min(100, (tMs / durationMs) * 100)}%`, height: B.barH * geo.height, background: roles.primary}} />
      {tag ? <div style={{position: 'absolute', left: 0, width: '100%', top: B.tagY * geo.height, textAlign: 'center', fontFamily: f.family, fontWeight: 700, letterSpacing: `${B.tagTracking}em`, fontSize: B.tagSizeH * geo.height, color: roles.accent, textTransform: 'uppercase'}}>{tag}</div> : null}
    </>
  );
};

// glass pills that stack in one by one: icon + text
export const Pills = ({c, w, h, startMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const P = T().pill;
  const items = c.items || [];
  const rowH = Math.min(P.heightH * geo.height, (h - P.gapH * geo.height * (items.length - 1)) / Math.max(items.length, 1));
  const size = rowH * P.textScale;
  return (
    <div style={{width: w, height: h, display: 'flex', flexDirection: 'column', gap: P.gapH * geo.height, justifyContent: 'flex-start'}}>
      {items.map((it, i) => {
        const p = progress(frame, ms2f(it.atMs ?? startMs + 250 + i * 650), 320, geo.fps, 'outBack');
        const f = fontFor(theme, 'heading', it.text);
        return (
          <div key={i} style={{height: rowH, display: 'flex', alignItems: 'center', gap: size * 0.7, padding: `0 ${size * 0.8}px`, borderRadius: rowH * P.radius, background: withAlpha('#FFFFFF', P.fillAlpha), border: `1px solid ${withAlpha('#FFFFFF', P.borderAlpha)}`, boxShadow: `0 ${0.006 * geo.height}px ${0.02 * geo.height}px rgba(0,0,0,0.35)`, opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 0.02 * geo.height}px) scale(${0.96 + 0.04 * p})`, direction: /[؀-ۿ]/.test(it.text) ? 'rtl' : 'ltr'}}>
            <Sticker name={it.icon || 'check'} size={rowH * P.iconScale} />
            <span style={{fontFamily: f.family, fontWeight: 800, fontSize: size, color: roles.text, whiteSpace: 'nowrap'}}>{it.text}</span>
          </div>
        );
      })}
    </div>
  );
};

// big count-up numbers with small caps labels, in a row
export const Stats = ({c, w, h, startMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const S = T().stat;
  const items = c.items || [];
  const f = fontFor(theme, 'numeric', '0');
  const boost = items.length === 1 ? 2.6 : items.length === 2 ? 1.7 : 1;
  const size = Math.min(S.sizeH * boost * geo.height, (w / Math.max(items.length, 1)) * 0.34);
  return (
    <div style={{width: w, height: h, display: 'flex', justifyContent: 'space-evenly', alignItems: 'center', position: 'relative'}}>
      {items.map((it, i) => {
        const at = it.atMs ?? startMs + 150 + i * 400;
        const pop = progress(frame, ms2f(at), 300, geo.fps, 'outBack');
        const raw = String(it.value).replace(/[^\d.,]/g, '');
        const target = parseFloat(raw.replace(/,/g, '')) || 0;
        const p = progress(frame, ms2f(at), 800, geo.fps, 'outCubic');
        const shown = raw.includes(',') ? Math.round(target * p).toLocaleString('en-US') : raw.includes('.') ? (target * p).toFixed(raw.split('.')[1].length) : String(Math.round(target * p));
        const pre = String(it.value).match(/^[^\d]*/)[0];
        const suf = String(it.value).match(/[^\d.,]*$/)[0];
        return (
          <div key={i} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: Math.min(1, pop * 1.6), transform: `scale(${0.85 + 0.15 * pop})`}}>
            <div style={{fontFamily: f.family, fontWeight: 800, fontSize: size, lineHeight: 1, color: toneColor(roles, it.tone), direction: 'ltr', fontVariantNumeric: 'tabular-nums', textShadow: `0 0 ${0.03 * geo.height}px ${withAlpha(toneColor(roles, it.tone), S.glowAlpha)}, 0 ${0.004 * geo.height}px ${0.012 * geo.height}px rgba(0,0,0,0.5)`}}>{pre}{shown}{suf}</div>
            {it.label ? <div style={{marginTop: size * 0.16, fontFamily: fontFor(theme, 'heading', it.label).family, fontWeight: 800, fontSize: size * S.labelScale, letterSpacing: '0.06em', color: roles.textMuted, textAlign: 'center', textTransform: 'uppercase', maxWidth: (w / Math.max(items.length, 1)) * 0.9}}>{it.label}</div> : null}
          </div>
        );
      })}
      {c.support ? <div style={{position: 'absolute', left: 0, width: '100%', top: '78%', textAlign: 'center', fontFamily: fontFor(theme, 'heading', c.support).family, fontWeight: 700, fontSize: size * S.supportScale, color: roles.textMuted, direction: /[؀-ۿ]/.test(c.support) ? 'rtl' : 'ltr'}}>{c.support}</div> : null}
    </div>
  );
};

// hook chip: monogram + name + price, with optional strike (replaced / paid tool)
export const Chip = ({c, w, h, startMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const p = progress(frame, ms2f(startMs), 300, geo.fps, 'outBack');
  const sp = c.strikeAtMs ? progress(frame, ms2f(c.strikeAtMs), 260, geo.fps, 'outCubic') : c.strike ? 1 : 0;
  const nf = fontFor(theme, 'heading', c.name);
  const size = h * 0.34;
  return (
    <div style={{width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${size * 0.8}px`, borderRadius: h * 0.22, background: withAlpha(roles.background, 0.72), border: `1px solid ${withAlpha('#FFFFFF', 0.12)}`, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * -0.02 * geo.height}px)`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: size * 0.6}}>
        <div style={{width: h * 0.62, height: h * 0.62, borderRadius: h * 0.16, background: c.logo ? undefined : roles.accent, color: roles.textOnAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: nf.family, fontWeight: 800, fontSize: h * 0.34}}>{(c.name || '?').trim().charAt(0).toUpperCase()}</div>
        <span style={{fontFamily: nf.family, fontWeight: 800, fontSize: size, color: roles.text}}>{c.name}</span>
      </div>
      <div style={{textAlign: 'right', position: 'relative'}}>
        <div style={{fontFamily: fontFor(theme, 'numeric', '1').family, fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: size, color: roles.red, direction: 'ltr', position: 'relative', display: 'inline-block'}}>
          {c.price}
          {sp > 0 ? <span style={{position: 'absolute', left: -4, top: '52%', height: Math.max(3, size * 0.12), width: `calc(${sp * 100}% + 8px)`, background: roles.red, borderRadius: 3}} /> : null}
        </div>
        {c.sub ? <div style={{fontFamily: nf.family, fontWeight: 600, fontSize: size * 0.42, color: roles.textMuted, direction: 'ltr'}}>{c.sub}</div> : null}
      </div>
    </div>
  );
};

// big serif all-caps word that slams in over the head; optional red strike line
export const Slam = ({c, w, h, startMs, endMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const p = progress(frame, ms2f(startMs), 260, geo.fps, 'outBack');
  const sp = c.strikeAtMs ? progress(frame, ms2f(c.strikeAtMs), 240, geo.fps, 'outCubic') : c.strike ? progress(frame, ms2f(startMs + 380), 240, geo.fps, 'outCubic') : 0;
  const text = String(c.text || '').toUpperCase();
  const latin = !/[؀-ۿ]/.test(text);
  const f = latin && c.tone !== 'blue' ? fontFor(theme, 'serif', text) : fontFor(theme, 'heading', text);
  let size = h * 0.78;
  const wMeasure = measureText(text, size, f.family, f.weight);
  if (wMeasure > w * 0.96) size *= (w * 0.96) / wMeasure;
  const color = c.tone === 'blue' ? roles.primary : c.tone === 'amber' ? roles.accent : roles.text;
  const out = progress(frame, ms2f(endMs - 160), 160, geo.fps, 'inCubic');
  return (
    <div style={{width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', opacity: Math.min(1, p * 1.6) * (1 - out), transform: `scale(${D.type.slam.scaleFrom - (D.type.slam.scaleFrom - 1) * p})`}}>
      <span style={{fontFamily: f.family, fontStyle: 'normal', fontWeight: c.tone === 'blue' ? 800 : f.weight, WebkitTextStroke: c.tone === 'blue' ? `${Math.max(1, h * 0.012)}px ${withAlpha('#FFFFFF', 0.9)}` : undefined, fontSize: size, color, letterSpacing: '0.01em', lineHeight: 1, whiteSpace: 'nowrap', textShadow: `0 0 ${D.type.slam.glowBlurH * geo.height}px ${withAlpha(color, D.type.slam.glowAlpha)}, 0 ${0.006 * geo.height}px ${0.03 * geo.height}px rgba(0,0,0,0.55)`}}>{text}</span>
      {sp > 0 ? <div style={{position: 'absolute', left: '2%', top: '50%', width: `${sp * 96}%`, height: Math.max(5, h * 0.045), background: roles.red, transform: 'rotate(-3deg)', borderRadius: 4}} /> : null}
    </div>
  );
};

// caution-tape sting ("THE CATCH")
export const Sting = ({c, w, h, startMs, endMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const p = progress(frame, ms2f(startMs), 240, geo.fps, 'outBack');
  const out = progress(frame, ms2f(endMs - 180), 180, geo.fps, 'inCubic');
  const f = fontFor(theme, 'heading', c.text);
  const band = h * 0.1;
  const tape = (top, rot) => (
    <div style={{position: 'absolute', left: '-10%', width: '120%', top, height: band, transform: `rotate(${rot}deg)`, background: `repeating-linear-gradient(135deg, ${roles.accent} 0 ${band * 0.5}px, ${roles.background} ${band * 0.5}px ${band}px)`, borderTop: `3px solid ${roles.accent}`, borderBottom: `3px solid ${roles.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: roles.accent, fontFamily: f.family, fontWeight: 800, letterSpacing: '0.1em', fontSize: band * 0.4, opacity: 0.95}} />
  );
  return (
    <div style={{width: w, height: h, position: 'relative', overflow: 'hidden', opacity: (1 - out) * Math.min(1, p * 1.5)}}>
      {tape(h * 0.2, -4)}
      {tape(h * 0.7, -4)}
      <div style={{position: 'absolute', left: '8%', right: '8%', top: '30%', bottom: '30%', border: `${Math.max(4, h * 0.012)}px solid ${roles.accent}`, background: withAlpha(roles.background, 0.9), borderRadius: h * 0.025, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.8 + 0.2 * p}) rotate(-3deg)`}}>
        <span style={{fontFamily: f.family, fontWeight: 800, fontSize: Math.min(h * 0.14, (w * 0.84) / Math.max(String(c.text).length * 0.62, 4)), color: roles.accent, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap'}}>{c.text}</span>
      </div>
    </div>
  );
};

// rating ring "7 / 10" with sweeping arc
export const Ring = ({c, w, h, startMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const p = progress(frame, ms2f(startMs), 1100, geo.fps, 'outCubic');
  const r = Math.min(w, h) * 0.38;
  const circ = 2 * Math.PI * r;
  const frac = (c.value / (c.of || 10)) * p;
  const f = fontFor(theme, 'numeric', '0');
  return (
    <div style={{width: w, height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
      <svg width={r * 2.4} height={r * 2.4} viewBox={`${-r * 1.2} ${-r * 1.2} ${r * 2.4} ${r * 2.4}`}>
        <circle r={r} fill="none" stroke={withAlpha('#FFFFFF', 0.12)} strokeWidth={r * 0.1} />
        <circle r={r} fill="none" stroke={roles.accent} strokeWidth={r * 0.1} strokeLinecap="round" strokeDasharray={`${circ * frac} ${circ}`} transform="rotate(-90)" />
        <text textAnchor="middle" y={r * 0.25} fontFamily={f.family} fontWeight={800} fontSize={r * 0.8} fill={roles.text}>{Math.round(c.value * p)}</text>
        <text textAnchor="middle" y={r * 0.62} fontFamily={f.family} fontWeight={700} fontSize={r * 0.22} fill={roles.textMuted}>{`/ ${c.of || 10}`}</text>
      </svg>
      {c.label ? <div style={{marginTop: h * 0.02, fontFamily: fontFor(theme, 'heading', c.label).family, fontWeight: 800, fontSize: Math.min(w * 0.06, h * 0.07), color: roles.text, textAlign: 'center', direction: /[؀-ۿ]/.test(c.label) ? 'rtl' : 'ltr'}}>{c.label}</div> : null}
    </div>
  );
};

// outro: "Comment KEYWORD" input box + follow line
export const Cta = ({c, w, h, startMs}) => {
  const {frame, geo, tMs, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const p = progress(frame, ms2f(startMs), 320, geo.fps, 'outBack');
  const typed = Math.max(0, Math.floor(((tMs - startMs - 350) / 1000) * 9));
  const kw = String(c.keyword || '').toUpperCase();
  const f = fontFor(theme, 'heading', kw || 'A');
  const size = Math.min(h * 0.34, w * 0.11); // a tall slot (full) must not blow the keyword up past the frame and onto the captions
  const send = progress(frame, ms2f(startMs + 350 + (kw.length / 9) * 1000), 260, geo.fps, 'outBack');
  return (
    <div style={{width: w, height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.5, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 0.02 * geo.height}px)`}}>
      <div style={{fontFamily: f.family, fontWeight: 800, fontSize: size * 1.5, color: roles.text, letterSpacing: '0.02em'}}>{kw}</div>
      <div style={{width: w * 0.92, height: size * 1.5, borderRadius: size * 0.4, background: roles.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${size * 0.5}px`}}>
        <span style={{fontFamily: f.family, fontWeight: 600, fontSize: size * 0.7, color: roles.cardInk}}>{kw.slice(0, typed)}<span style={{opacity: Math.floor(tMs / 450) % 2 ? 0 : 1, color: roles.primary}}>|</span></span>
        <div style={{width: size * 1.1, height: size * 1.1, borderRadius: 99, background: roles.primary, transform: `scale(${send})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.7}}>↑</div>
      </div>
      {c.line ? <div style={{fontFamily: f.family, fontWeight: 800, fontSize: size * 0.62, color: roles.accent, letterSpacing: '0.04em', textTransform: 'uppercase'}}>{c.line}</div> : null}
    </div>
  );
};

// transition effects between layout beats: whip, flash, glitch, punch (token-driven; kind per beat or cycled)
export const transitionState = (layouts, tMs) => {
  const X = D.transitions;
  const half = X.fxMs / 2;
  let idx = -1;
  layouts.forEach((l, i) => {
    if (i > 0 && tMs >= l.startMs - half && tMs <= l.startMs + half) idx = i;
  });
  if (idx < 0) return null;
  const l = layouts[idx];
  const kind = l.transition || X.kinds[(idx - 1) % X.kinds.length];
  const p = (tMs - (l.startMs - half)) / X.fxMs;
  return {idx, kind, p, bell: Math.sin(Math.PI * Math.min(1, Math.max(0, p)))};
};

export const TransitionFx = ({layouts}) => {
  const {geo, tMs} = useT();
  const {roles} = useTheme();
  const X = D.transitions;
  const st = transitionState(layouts, tMs);
  if (!st) return null;
  const {idx, kind, p, bell} = st;
  const W = geo.width;
  const H = geo.height;
  if (kind === 'flash') return <div style={{position: 'absolute', inset: 0, background: '#FFFFFF', opacity: X.flashAlpha * bell, pointerEvents: 'none'}} />;
  if (kind === 'whip') {
    const bw = W * X.whipBandPct;
    const x = -bw + p * (W + bw * 2);
    return (
      <div style={{position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none'}}>
        <div style={{position: 'absolute', top: -H * 0.1, height: H * 1.2, width: bw, left: x, transform: 'skewX(-14deg)', background: `linear-gradient(90deg, transparent, ${withAlpha(roles.primary, 0.55)} 45%, ${withAlpha('#FFFFFF', 0.6)} 55%, transparent)`, filter: `blur(${0.006 * W}px)`}} />
      </div>
    );
  }
  if (kind === 'glitch') {
    const n = X.glitchSlices;
    const seed = Math.floor(p * 6) + idx * 7;
    const rnd = (k) => {
      const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return (
      <div style={{position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity: Math.min(1, bell * 1.6)}}>
        {Array.from({length: n}).map((_, k) => {
          const h = (rnd(k) * 0.08 + 0.03) * H;
          const y = rnd(k + 9) * (H - h);
          const sh = (rnd(k + 3) - 0.5) * 2 * X.glitchShiftPct * W;
          const col = [roles.primary, roles.red, roles.accent][k % 3];
          return <div key={k} style={{position: 'absolute', left: sh, top: y, width: W, height: h, background: withAlpha(col, 0.32), mixBlendMode: 'screen'}} />;
        })}
      </div>
    );
  }
  if (kind === 'zoomthrough') {
    return <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(circle at 50% 45%, transparent ${(1 - bell) * 40}%, ${withAlpha(roles.primary, 0.5 * bell)} 100%)`, opacity: 1}} />;
  }
  if (kind === 'slide') {
    const x = (p - 0.5) * 2 * W * 1.2;
    return (
      <div style={{position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none'}}>
        {[0, 1, 2].map((k) => <div key={k} style={{position: 'absolute', top: H * (0.12 + 0.28 * k), height: H * 0.14, left: x - W * (0.5 + 0.12 * k), width: W, background: `linear-gradient(90deg, transparent, ${withAlpha(k === 1 ? roles.accent : roles.primary, 0.5)})`, filter: `blur(${0.004 * W}px)`}} />)}
      </div>
    );
  }
  // punch: expanding ring
  const r = p * Math.max(W, H) * 0.9;
  return <div style={{position: 'absolute', left: W / 2 - r, top: H / 2 - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `${0.012 * W}px solid ${withAlpha(roles.accent, 0.6 * (1 - p))}`, pointerEvents: 'none'}} />;
};

// small glass tag (vlog place / time label), left aligned
export const Tag = ({c, w, h, startMs, endMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const p = progress(frame, ms2f(startMs), 320, geo.fps, 'outCubic');
  const out = progress(frame, ms2f(endMs - 220), 220, geo.fps, 'inCubic');
  const f = fontFor(theme, 'heading', c.text);
  const size = h * 0.5;
  return (
    <div style={{width: w, height: h, display: 'flex', alignItems: 'center', opacity: Math.min(1, p * 1.5) * (1 - out), transform: `translateX(${(1 - p) * -0.04 * geo.width}px)`}}>
      <div style={{display: 'inline-flex', alignItems: 'center', gap: size * 0.6, height: h, padding: `0 ${size * 0.9}px`, borderRadius: 999, background: withAlpha(roles.background, 0.55), border: `1px solid ${withAlpha('#FFFFFF', 0.16)}`, backdropFilter: 'blur(10px)', fontFamily: f.family, fontWeight: 800, fontSize: size, color: roles.text, direction: /[؀-ۿ]/.test(c.text) ? 'rtl' : 'ltr', letterSpacing: '0.02em'}}>
        <span style={{width: size * 0.5, height: size * 0.5, borderRadius: 99, background: c.tone === 'red' ? roles.red : roles.accent, boxShadow: `0 0 ${size * 0.8}px ${withAlpha(roles.accent, 0.7)}`}} />
        {c.text}
      </div>
    </div>
  );
};
