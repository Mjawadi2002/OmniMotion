// @ts-nocheck
// Extra graphic kinds: flow (timeline), split (before / after), chart (bars / line that draw themselves), quote2 (big quote mark), place (map pin).
// All text comes from the plan (spoken words); colours / sizes from tokens + palette roles.
import React from 'react';
import {withAlpha} from '../../shared/color.js';
import {fontFor, progress, useGeo, useTheme} from '../core';
import {D, useT} from './bits';

export const glass = (roles, geo, alpha = 0.08) => ({
  background: withAlpha('#FFFFFF', alpha),
  border: `1px solid ${withAlpha('#FFFFFF', 0.14)}`,
  boxShadow: `0 ${0.008 * geo.height}px ${0.03 * geo.height}px rgba(0,0,0,0.4), inset 0 1px 0 ${withAlpha('#FFFFFF', 0.12)}`,
  backdropFilter: 'blur(14px)',
});
const rtl = (t) => /[؀-ۿ]/.test(t || '');

// vertical timeline: numbered nodes joined by a line that draws itself
export const Flow = ({c, w, h, startMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const steps = c.steps || [];
  const rowH = Math.min(h / Math.max(steps.length, 1), 0.15 * geo.height);
  const x0 = w * 0.13;
  const longest = Math.max(...steps.map((st) => String(st.text).length), 6);
  const avail = w - x0 - rowH * 0.55 - w * 0.06;
  const size = Math.min(rowH * 0.28, avail / (longest * 0.64 * 1.05));
  return (
    <div style={{width: w, height: h, position: 'relative'}}>
      {steps.map((st, i) => {
        const at = st.atMs ?? startMs + 200 + i * 700;
        const p = progress(frame, ms2f(at), 340, geo.fps, 'outBack');
        const line = progress(frame, ms2f(at - 300), 300, geo.fps, 'outCubic');
        const f = fontFor(theme, 'heading', st.text);
        const y = i * rowH + rowH / 2;
        return (
          <React.Fragment key={i}>
            {i > 0 ? <div style={{position: 'absolute', left: x0 - 1.5, top: y - rowH, width: 3, height: rowH * line, background: withAlpha(roles.primary, 0.8)}} /> : null}
            <div style={{position: 'absolute', left: x0 - rowH * 0.3, top: y - rowH * 0.3, width: rowH * 0.6, height: rowH * 0.6, borderRadius: 99, background: roles.accent, color: roles.textOnAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontFor(theme, 'numeric', '1').family, fontWeight: 700, fontSize: size, transform: `scale(${p})`, boxShadow: `0 0 ${rowH * 0.5}px ${withAlpha(roles.accent, 0.5)}`}}>{i + 1}</div>
            <div style={{position: 'absolute', left: x0 + rowH * 0.55, top: y - rowH * 0.3, height: rowH * 0.6, display: 'flex', alignItems: 'center', padding: `0 ${size * 0.8}px`, borderRadius: rowH * 0.2, ...glass(roles, geo), fontFamily: f.family, fontWeight: 800, fontSize: size * 1.05, color: roles.text, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 20}px)`, direction: rtl(st.text) ? 'rtl' : 'ltr', whiteSpace: 'nowrap'}}>{st.text}</div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// before / after: two glass panels, the first gets struck through, the second pops in green
export const Split = ({c, w, h, startMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const a = progress(frame, ms2f(startMs + 120), 320, geo.fps, 'outBack');
  const b = progress(frame, ms2f(c.bAtMs ?? startMs + 900), 340, geo.fps, 'outBack');
  // same: both sides are true together (owner AND you), so nothing is struck out and both panels are positive
  const same = !!c.same || c.strike === false;
  const strike = same ? 0 : progress(frame, ms2f(c.strikeAtMs ?? (c.bAtMs ?? startMs + 900) - 150), 260, geo.fps, 'outCubic');
  const panel = (side, p, tone, extra) => {
    const f = fontFor(theme, 'heading', side.text);
    const lf = fontFor(theme, 'heading', side.label || 'A');
    return (
      <div style={{flex: 1, borderRadius: 0.02 * geo.height, padding: `${0.02 * geo.height}px ${0.03 * geo.width}px`, ...glass(roles, geo, 0.07), borderColor: withAlpha(tone, 0.6), opacity: Math.min(1, p * 1.5), transform: `scale(${0.92 + 0.08 * p})`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.008 * geo.height, position: 'relative'}}>
        <div style={{fontFamily: lf.family, fontWeight: 800, fontSize: 0.016 * geo.height, letterSpacing: '0.12em', textTransform: 'uppercase', color: tone}}>{side.label}</div>
        <div style={{fontFamily: f.family, fontWeight: 800, fontSize: 0.036 * geo.height, color: roles.text, direction: rtl(side.text) ? 'rtl' : 'ltr', position: 'relative', display: 'inline-block'}}>
          {side.text}
          {extra}
        </div>
      </div>
    );
  };
  return (
    <div style={{width: w, height: h, display: 'flex', flexDirection: 'column', gap: 0.016 * geo.height}}>
      {panel(c.a || {}, a, same ? roles.positive : roles.red, strike > 0 ? <span style={{position: 'absolute', left: -6, top: '54%', height: Math.max(4, 0.004 * geo.height), width: `calc(${strike * 100}% + 12px)`, background: roles.red, borderRadius: 3}} /> : null)}
      {panel(c.b || {}, b, roles.positive, null)}
    </div>
  );
};

// chart that draws itself: bars or line
export const Chart = ({c, w, h, startMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const data = c.data || [];
  const max = Math.max(...data.map((d) => d.value), 1);
  const pad = w * 0.06;
  const cw = w - pad * 2;
  const ch = h * 0.72;
  const nf = fontFor(theme, 'numeric', '0');
  const draw = progress(frame, ms2f(startMs + 150), 900, geo.fps, 'outCubic');
  const bw = cw / Math.max(data.length, 1);
  const pts = data.map((d, i) => [pad + bw * i + bw / 2, h * 0.08 + ch * (1 - (d.value / max) * draw)]);
  return (
    <div style={{width: w, height: h, position: 'relative', ...glass(roles, geo, 0.05), borderRadius: 0.02 * geo.height}}>
      <svg width={w} height={h} style={{position: 'absolute', inset: 0}}>
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={pad} x2={w - pad} y1={h * 0.08 + ch * g} y2={h * 0.08 + ch * g} stroke={withAlpha('#FFFFFF', 0.08)} />)}
        {c.type === 'line' ? (
          <>
            <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={roles.accent} strokeWidth={Math.max(3, h * 0.012)} strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={h * 0.016} fill={roles.accent} opacity={draw} />)}
          </>
        ) : (
          data.map((d, i) => {
            const bh = ch * (d.value / max) * draw;
            const hi = i === (c.highlight ?? data.length - 1);
            return <rect key={i} x={pad + bw * i + bw * 0.2} y={h * 0.08 + ch - bh} width={bw * 0.6} height={bh} rx={bw * 0.08} fill={hi ? roles.accent : withAlpha(roles.primary, 0.75)} />;
          })
        )}
      </svg>
      {data.map((d, i) => (
        <div key={i} style={{position: 'absolute', left: pad + bw * i, width: bw, top: h * 0.08 + ch + h * 0.04, textAlign: 'center', fontFamily: fontFor(theme, 'heading', d.label || 'A').family, fontWeight: 700, fontSize: h * 0.06, color: roles.textMuted}}>{d.label}</div>
      ))}
      {data.map((d, i) => (
        <div key={`v${i}`} style={{position: 'absolute', left: pad + bw * i, width: bw, top: pts[i][1] - h * 0.1, textAlign: 'center', fontFamily: nf.family, fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: h * 0.075, color: roles.text, opacity: draw}}>{d.display ?? d.value}</div>
      ))}
    </div>
  );
};

// quote with a big accent quote mark
export const Quote2 = ({c, w, h, startMs}) => {
  const {frame, geo, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const p = progress(frame, ms2f(startMs + 60), 420, geo.fps, 'outCubic');
  const latin = !rtl(c.text);
  const f = latin ? fontFor(theme, 'serif', c.text) : fontFor(theme, 'heading', c.text);
  return (
    <div style={{width: w, height: h, position: 'relative', borderRadius: 0.025 * geo.height, ...glass(roles, geo, 0.06), padding: `${h * 0.2}px ${w * 0.08}px ${h * 0.08}px`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * 0.02 * geo.height}px)`}}>
      <div style={{position: 'absolute', left: w * 0.06, top: -h * 0.02, fontFamily: fontFor(theme, 'serif', 'A').family, fontWeight: 700, fontSize: h * 0.6, lineHeight: 1, color: roles.accent, opacity: 0.9}}>“</div>
      <span style={{fontFamily: f.family, fontStyle: latin ? 'italic' : 'normal', fontWeight: 700, fontSize: Math.min(w * 0.075, h * 0.15), lineHeight: 1.25, color: roles.text, textAlign: 'center', direction: rtl(c.text) ? 'rtl' : 'ltr'}}>{c.text}</span>
    </div>
  );
};

// abstract map: grid, pin that drops, ripples, place name (no real map data is invented)
export const Place = ({c, w, h, startMs}) => {
  const {frame, geo, ms2f, tMs} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const drop = progress(frame, ms2f(startMs + 150), 520, geo.fps, 'outBack');
  const cx = w / 2;
  const cy = h * 0.46;
  const f = fontFor(theme, 'heading', c.name);
  const t = Math.max(0, tMs - startMs - 600) / 1000;
  return (
    <div style={{width: w, height: h, position: 'relative', overflow: 'hidden', borderRadius: 0.025 * geo.height, ...glass(roles, geo, 0.04)}}>
      <svg width={w} height={h} style={{position: 'absolute', inset: 0}}>
        {Array.from({length: 9}).map((_, i) => <line key={`a${i}`} x1={0} x2={w} y1={(h / 8) * i} y2={(h / 8) * i + (i % 2 ? 6 : -6)} stroke={withAlpha(roles.primary, 0.18)} />)}
        {Array.from({length: 9}).map((_, i) => <line key={`b${i}`} y1={0} y2={h} x1={(w / 8) * i} x2={(w / 8) * i + (i % 2 ? -8 : 8)} stroke={withAlpha(roles.primary, 0.18)} />)}
        {[0, 0.5].map((o, i) => {
          const k = ((t + o) % 1.4) / 1.4;
          return <circle key={i} cx={cx} cy={cy + h * 0.1} r={k * h * 0.28} fill="none" stroke={withAlpha(roles.accent, 0.6 * (1 - k))} strokeWidth={3} opacity={drop > 0.95 ? 1 : 0} />;
        })}
        <g transform={`translate(${cx} ${cy - (1 - drop) * h * 0.5})`}>
          <path d={`M0 ${h * 0.1} C ${-h * 0.11} ${-h * 0.02} ${-h * 0.09} ${-h * 0.13} 0 ${-h * 0.13} C ${h * 0.09} ${-h * 0.13} ${h * 0.11} ${-h * 0.02} 0 ${h * 0.1} Z`} fill={roles.accent} />
          <circle cx={0} cy={-h * 0.04} r={h * 0.035} fill={roles.background} />
        </g>
      </svg>
      <div style={{position: 'absolute', left: 0, width: '100%', bottom: h * 0.08, textAlign: 'center', fontFamily: f.family, fontWeight: 800, fontSize: Math.min(w * 0.09, h * 0.16), color: roles.text, opacity: drop, direction: rtl(c.name) ? 'rtl' : 'ltr'}}>{c.name}</div>
    </div>
  );
};
