// @ts-nocheck
// Window cards (browser chrome + content) as in the references. Content kinds are generic mock-ups filled ONLY with words from the speech or from provided assets.
import React from 'react';
import {Img, OffthreadVideo, staticFile} from 'remotion';
import {Chip, Cta, Pills, Ring, Slam, Stats, Sting, Tag} from './tech';
import {Chart, Flow, Place, Quote2, Split} from './kinds2';
import {Motion} from './motion';
import {ThemeContext} from '../core';
import {withAlpha} from '../../shared/color.js';
import {CONFIG, enterStyle, exitStyle, fontFor, measureText, progress, useGeo, useTheme} from '../core';
import {D, Pill, StatBox, Sticker, isLatinOnly, useT} from './bits';

const rtlOf = (s) => /[֐-ࣿ]/.test(s || '');
const bar = (w, h, color, r = 99) => ({width: w, height: h, background: color, borderRadius: r});

// ---------------------------------------------------------------- content renderers (return JSX for a w x h content box)
const Browser = ({c, w, h, tMs, startMs}) => {
  const theme = useTheme();
  const {roles} = theme;
  const {frame, geo, ms2f} = useT();
  const dark = !!c.dark;
  const bg = dark ? roles.backdrop : roles.card;
  const ink = dark ? roles.dimInk : roles.cardInk;
  const muted = dark ? withAlpha(roles.dimInk, 0.35) : withAlpha(roles.cardMuted, 0.28);
  const f = fontFor(theme, 'heading', c.heading || 'A');
  const size = Math.min(w * 0.095, h * 0.17);
  const sel = c.selection && c.heading ? c.heading.indexOf(c.selection) : -1;
  const selP = progress(frame, ms2f(c.selectAtMs ?? startMs + 500), D.window.highlight.ms, geo.fps, 'outCubic');
  const scroll = Math.max(0, (tMs - startMs - 1400) / 1000) * D.window.scrollPxPerSec * geo.height;
  const head = sel >= 0 ? (
    <>
      {c.heading.slice(0, sel)}
      <span style={{backgroundImage: `linear-gradient(${withAlpha(roles.accent, D.window.highlight.alpha)},${withAlpha(roles.accent, D.window.highlight.alpha)})`, backgroundSize: `${selP * 100}% 100%`, backgroundRepeat: 'no-repeat', backgroundPosition: rtlOf(c.heading) ? 'right' : 'left', borderRadius: 4, padding: '0 4px'}}>{c.selection}</span>
      {c.heading.slice(sel + c.selection.length)}
    </>
  ) : c.heading;
  const lines = c.lines ?? 4;
  return (
    <div style={{width: w, height: h, background: bg, color: ink, overflow: 'hidden', position: 'relative'}}>
      <div style={{padding: `${h * 0.12}px ${w * 0.045}px`, transform: `translateY(${-Math.min(scroll, h * 0.25)}px)`, direction: rtlOf(c.heading) ? 'rtl' : 'ltr'}}>
        {c.kicker ? <div style={{fontFamily: fontFor(theme, 'mono', c.kicker).family, fontSize: size * 0.34, color: roles.accent, marginBottom: size * 0.3, fontWeight: 600}}>{c.kicker}</div> : null}
        <div style={{fontFamily: f.family, fontWeight: 800, fontSize: size, lineHeight: 1.12, letterSpacing: '-0.01em'}}>{head}</div>
        <div style={{marginTop: size * 0.5, display: 'flex', flexDirection: 'column', gap: size * 0.26}}>
          {Array.from({length: lines}).map((_, i) => <div key={i} style={bar(`${[92, 78, 86, 60, 70, 50][i % 6]}%`, size * 0.12, muted)} />)}
        </div>
        {c.button ? <div style={{marginTop: size * 0.5, display: 'inline-block', background: roles.accent, color: roles.textOnAccent, borderRadius: 999, padding: `${size * 0.16}px ${size * 0.5}px`, fontFamily: f.family, fontWeight: 700, fontSize: size * 0.34}}>{c.button}</div> : null}
      </div>
    </div>
  );
};

const Terminal = ({c, w, h, tMs, startMs}) => {
  const theme = useTheme();
  const {roles} = theme;
  const mono = fontFor(theme, 'mono', 'A');
  const size = Math.min(w * 0.05, h * 0.075);
  let budget = Math.max(0, ((tMs - startMs - 250) / 1000) * (c.charsPerSec || 26));
  const rows = (c.lines || []).map((ln, i) => {
    const text = ln.text || '';
    const n = Math.min(text.length, Math.floor(budget));
    budget -= text.length + 4;
    return {ln, shown: text.slice(0, Math.max(0, n)), done: n >= text.length, started: n > 0 || (i === 0)};
  });
  return (
    <div style={{width: w, height: h, background: roles.backdrop, color: roles.dimInk, overflow: 'hidden', padding: `${h * 0.08}px ${w * 0.05}px`, fontFamily: mono.family, fontSize: size, lineHeight: 1.5}}>
      {rows.map((r, i) => (r.started ? (
        <div key={i} style={{whiteSpace: 'pre-wrap', direction: rtlOf(r.ln.text) ? 'rtl' : 'ltr', color: r.ln.type === 'out' ? roles.textMuted : roles.dimInk}}>
          {r.ln.type !== 'out' ? <span style={{color: roles.accent, marginRight: size * 0.6}}>{c.prompt || '>'}</span> : null}
          {r.shown}
          {!r.done && Math.floor(tMs / 450) % 2 === 0 ? <span style={{display: 'inline-block', width: size * 0.55, height: size, background: roles.accent, verticalAlign: 'text-bottom', marginLeft: 2}} /> : null}
        </div>
      ) : null))}
    </div>
  );
};

const ListCard = ({c, w, h, tMs, startMs}) => {
  const theme = useTheme();
  const {roles} = theme;
  const {frame, geo, ms2f} = useT();
  const rows = c.rows || [];
  const rowH = Math.min(h * 0.17, (h * 0.86) / Math.max(rows.length, 3));
  const size = rowH * 0.42;
  return (
    <div style={{width: w, height: h, background: roles.card, color: roles.cardInk, overflow: 'hidden', position: 'relative', padding: `${h * 0.05}px ${w * 0.05}px`}}>
      {rows.map((r, i) => {
        const inP = progress(frame, ms2f(startMs + 150 + i * 120), 280, geo.fps, 'outCubic');
        const sP = r.strikeAtMs ? progress(frame, ms2f(r.strikeAtMs), 260, geo.fps, 'outCubic') : r.strike ? progress(frame, ms2f(startMs + 700 + i * 140), 260, geo.fps, 'outCubic') : 0;
        const nf = fontFor(theme, 'display', r.name);
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: rowH, borderBottom: `1px solid ${withAlpha(roles.cardMuted, 0.18)}`, opacity: inP, transform: `translateY(${(1 - inP) * 10}px)`, direction: rtlOf(r.name) ? 'rtl' : 'ltr'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: size * 0.7}}>
              <div style={{width: size * 1.5, height: size * 1.5, borderRadius: size * 0.4, background: [roles.accent, roles.cardInk, roles.red, roles.positive][i % 4], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: nf.family, fontWeight: 800, fontSize: size * 0.9}}>{(r.name || '?').trim().charAt(0).toUpperCase()}</div>
              <span style={{fontFamily: nf.family, fontWeight: 700, fontSize: size, opacity: 1 - sP * 0.45}}>{r.name}</span>
            </div>
            <span style={{position: 'relative', fontFamily: fontFor(theme, 'mono', '1').family, fontWeight: 600, fontSize: size * 0.95, direction: 'ltr'}}>
              {r.value}
              {sP > 0 ? <span style={{position: 'absolute', left: -6, top: '52%', height: Math.max(3, size * 0.14), width: `calc(${sP * 100}% + 12px)`, background: roles.red, borderRadius: 4, transform: 'rotate(-6deg)'}} /> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const Logos = ({c, w, h, tMs, startMs}) => {
  const theme = useTheme();
  const {roles} = theme;
  const {frame, geo, ms2f} = useT();
  const tiles = c.tiles || [];
  const n = tiles.length;
  const cols = c.columns || Math.min(n, 3);
  const tw = (w * 0.9) / cols;
  const size = Math.min(tw * 0.62, h * 0.55);
  return (
    <div style={{width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: tw * 0.1, flexWrap: 'wrap', alignContent: 'center'}}>
      {tiles.map((t, i) => {
        const p = progress(frame, ms2f(startMs + 120 + i * 140), 280, geo.fps, 'outBack');
        const sP = t.strikeAtMs ? progress(frame, ms2f(t.strikeAtMs), 260, geo.fps, 'outCubic') : t.strike ? progress(frame, ms2f(startMs + 900 + i * 160), 260, geo.fps, 'outCubic') : 0;
        const nf = fontFor(theme, 'display', t.name);
        return (
          <div key={i} style={{width: tw * 0.9, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.1, transform: `scale(${0.8 + 0.2 * p})`, opacity: Math.min(1, p * 1.5)}}>
            <div style={{position: 'relative', width: size, height: size, background: t.bg || roles.card, borderRadius: size * 0.22, boxShadow: '0 6px 18px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
              {t.image ? <Img src={staticFile(t.image)} style={{width: '78%', height: '78%', objectFit: 'contain'}} /> : <span style={{fontFamily: nf.family, fontWeight: 800, fontSize: size * 0.5, color: roles.accent}}>{(t.name || '?').trim().charAt(0).toUpperCase()}</span>}
              {sP > 0 ? <div style={{position: 'absolute', left: '-5%', top: '50%', width: `${sP * 110}%`, height: Math.max(4, size * 0.08), background: roles.red, borderRadius: 6, transform: 'rotate(-18deg)', transformOrigin: 'left center'}} /> : null}
            </div>
            <span style={{fontFamily: nf.family, fontWeight: 700, fontSize: size * 0.2, color: roles.dimInk, textAlign: 'center', direction: rtlOf(t.name) ? 'rtl' : 'ltr'}}>{t.name}</span>
          </div>
        );
      })}
    </div>
  );
};

const GridCard = ({c, w, h, tMs, startMs}) => {
  const {roles} = useTheme();
  const {frame, geo, ms2f} = useT();
  const cols = 4;
  const rows = 3;
  const cw = (w * 0.9) / cols;
  const ch = (h * 0.8) / rows;
  const tones = [roles.accent, roles.cardInk, roles.red, roles.positive, roles.shape];
  return (
    <div style={{width: w, height: h, background: roles.card, position: 'relative', padding: `${h * 0.08}px ${w * 0.05}px`, display: 'flex', flexWrap: 'wrap', gap: cw * 0.06, alignContent: 'flex-start'}}>
      {Array.from({length: cols * rows}).map((_, i) => {
        const p = progress(frame, ms2f(startMs + 80 + i * 45), 220, geo.fps, 'outCubic');
        return <div key={i} style={{width: cw * 0.94, height: ch * 0.9, borderRadius: cw * 0.08, background: withAlpha(tones[(i * 7) % tones.length], i % 3 === 0 ? 0.9 : 0.16), transform: `scale(${0.7 + 0.3 * p})`, opacity: p}} />;
      })}
    </div>
  );
};

const Steps = ({c, w, h, tMs, startMs}) => {
  const theme = useTheme();
  const {roles} = theme;
  const {frame, geo, ms2f} = useT();
  const items = c.items || [];
  const rowH = Math.min(h * 0.22, (h * 0.86) / Math.max(items.length, 3));
  const size = rowH * 0.42;
  return (
    <div style={{width: w, height: h, background: roles.card, padding: `${h * 0.06}px ${w * 0.06}px`, color: roles.cardInk}}>
      {items.map((it, i) => {
        const at = it.atMs ?? startMs + 200 + i * 450;
        const p = progress(frame, ms2f(at), 300, geo.fps, 'outBack');
        const f = fontFor(theme, 'display', it.text);
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: size * 0.8, height: rowH, opacity: Math.min(1, p * 1.4), transform: `translateX(${(1 - p) * -20}px)`, direction: rtlOf(it.text) ? 'rtl' : 'ltr'}}>
            <div style={{width: size * 1.7, height: size * 1.7, borderRadius: 999, background: roles.accent, color: roles.textOnAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: f.family, fontWeight: 800, fontSize: size}}>{i + 1}</div>
            <span style={{fontFamily: f.family, fontWeight: 700, fontSize: size * 1.1}}>{it.text}</span>
          </div>
        );
      })}
    </div>
  );
};

const Compare = ({c, w, h, tMs, startMs}) => {
  const {roles} = useTheme();
  const {frame, geo, ms2f} = useT();
  const l = progress(frame, ms2f(startMs + 150), 300, geo.fps, 'outBack');
  const r = progress(frame, ms2f(c.rightAtMs ?? startMs + 900), 300, geo.fps, 'outBack');
  return (
    <div style={{width: w, height: h, background: roles.card, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: w * 0.05, flexWrap: 'wrap', alignContent: 'center'}}>
      <div style={{transform: `scale(${l})`, opacity: l}}><Pill text={`${c.leftLabel} ${c.leftValue}`} tone="red" size={0.03} /></div>
      {c.rightLabel ? <div style={{transform: `scale(${r})`, opacity: r}}><Pill text={`${c.rightLabel} ${c.rightValue}`} tone="green" size={0.03} /></div> : null}
    </div>
  );
};

const StatCard = ({c, w, h, tMs, startMs}) => {
  const {roles} = useTheme();
  return (
    <div style={{width: w, height: h, background: roles.backdrop, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <StatBox value={c.value} label={c.label} prefix={c.prefix} suffix={c.suffix} startMs={startMs + 120} />
    </div>
  );
};

const QuoteCard = ({c, w, h}) => {
  const theme = useTheme();
  const {roles} = theme;
  const f = fontFor(theme, 'serif', c.text);
  return (
    <div style={{width: w, height: h, background: roles.card, color: roles.cardInk, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: w * 0.08, textAlign: 'center'}}>
      <span style={{fontFamily: isLatinOnly(c.text) ? f.family : fontFor(theme, 'display', c.text).family, fontStyle: isLatinOnly(c.text) ? 'italic' : 'normal', fontWeight: 700, fontSize: Math.min(w * 0.08, h * 0.2), lineHeight: 1.2, direction: rtlOf(c.text) ? 'rtl' : 'ltr'}}>{c.text}</span>
    </div>
  );
};

const MediaCard = ({c, w, h, kind, startMs, endMs}) => {
  const {frame, geo, ms2f} = useT();
  const span = Math.max(800, (endMs ?? startMs + 2400) - startMs);
  const p = progress(frame, ms2f(startMs), span, geo.fps, 'inOutCubic');
  // pan: tall screenshots scroll top to bottom; zoom: slow push-in on the image
  const posY = c.pan === 'down' ? p * 100 : c.pan === 'up' ? (1 - p) * 100 : (c.posY ?? 50);
  const scale = 1 + (c.zoom ?? 0.06) * p;
  const common = {width: '100%', height: '100%', objectFit: c.fit || 'cover', objectPosition: `50% ${posY}%`, transform: `scale(${scale})`, transformOrigin: `50% ${posY}%`};
  return (
    <div style={{width: w, height: h, overflow: 'hidden', background: '#000'}}>
      {kind === 'video' ? <OffthreadVideo src={staticFile(c.src)} startFrom={Math.round(((c.startAtMs || 0) / 1000) * geo.fps)} muted style={common} /> : <Img src={staticFile(c.src)} style={common} />}
    </div>
  );
};

const KINDS = {browser: Browser, terminal: Terminal, list: ListCard, logos: Logos, grid: GridCard, steps: Steps, compare: Compare, stat: StatCard, quote: QuoteCard, image: (p) => <MediaCard {...p} kind="image" />, video: (p) => <MediaCard {...p} kind="video" />, tag: Tag, flow: Flow, split: Split, chart: Chart, quote2: Quote2, place: Place, pills: Pills, stats: Stats, chip: Chip, slam: Slam, sting: Sting, ring: Ring, cta: Cta, motion: Motion};
const BARE = new Set(['tag', 'flow', 'split', 'chart', 'quote2', 'place', 'stat', 'logos', 'pills', 'stats', 'chip', 'slam', 'sting', 'ring', 'cta', 'motion']);

// ---------------------------------------------------------------- the window itself
export const WindowCard = ({g, rect, badge}) => {
  const baseTheme = useTheme();
  const tone = g.tone && D.tones && D.tones[g.tone];
  const theme = tone ? {...baseTheme, roles: {...baseTheme.roles, ...tone}} : baseTheme;
  return <ThemeContext.Provider value={theme}><WindowCardInner g={g} rect={rect} badge={badge} /></ThemeContext.Provider>;
};

const WindowCardInner = ({g, rect, badge}) => {
  const {frame, geo, tMs, ms2f} = useT();
  const theme = useTheme();
  const {roles, preset} = theme;
  const Wd = D.window;
  const TR = D.transitions;
  const inP = progress(frame, ms2f(g.startMs), TR.windowIn.ms, geo.fps, 'outCubic');
  const outP = progress(frame, ms2f(g.endMs - TR.windowOut.ms), TR.windowOut.ms, geo.fps, 'inCubic');
  const st = {...enterStyle(inP, TR.windowIn.from, geo.ss)};
  if (outP > 0) Object.assign(st, exitStyle(outP, TR.windowOut.to, geo.ss));
  const chromeH = Wd.chromeH * geo.height;
  const phone = g.device === 'phone';
  const bare = BARE.has(g.kind) || g.chrome === false || phone;
  const Content = KINDS[g.kind] || Browser;
  const url = g.url || g.title || '';
  const radius = Wd.radius * geo.width;
  const contentH = rect.h - (bare ? 0 : chromeH);
  const ow = Math.max(2, preset.outlineWidthPctShort * geo.ss);
  const zoom = g.zoom ? 1 + (g.zoom - 1) * progress(frame, ms2f(g.startMs), Math.max(600, g.endMs - g.startMs), geo.fps, 'inOutCubic') : 1;
  return (
    <div style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...st}}>
      {bare ? (
        phone ? (
          <div style={{width: rect.w, height: rect.h, borderRadius: 0.06 * rect.w, overflow: 'hidden', background: '#0B0B0D', border: `${0.018 * rect.w}px solid #0B0B0D`, boxShadow: `0 0 0 ${Math.max(2, 0.003 * rect.w)}px ${withAlpha('#FFFFFF', 0.25)}, 0 ${0.01 * geo.height}px ${0.05 * geo.height}px rgba(0,0,0,0.55), 0 0 ${0.06 * geo.height}px ${withAlpha(roles.glow, 0.28)}`, boxSizing: 'border-box', position: 'relative'}}>
            <Content c={g.content} w={rect.w - 0.036 * rect.w} h={rect.h - 0.036 * rect.w} tMs={tMs} startMs={g.startMs} endMs={g.endMs} />
            <div style={{position: 'absolute', left: '50%', top: 0.012 * rect.w, width: 0.2 * rect.w, height: 0.03 * rect.w, marginLeft: -0.1 * rect.w, borderRadius: 99, background: '#0B0B0D'}} />
          </div>
        ) : (
        <div style={{width: rect.w, height: rect.h}}>
          <Content c={g.content} w={rect.w} h={rect.h} tMs={tMs} startMs={g.startMs} endMs={g.endMs} />
        </div>
        )
      ) : (
        <div style={{width: rect.w, height: rect.h, borderRadius: radius, overflow: 'hidden', background: roles.card, border: `${ow}px solid ${roles.outline}`, boxShadow: `0 ${0.006 * geo.height}px ${0.04 * geo.height}px ${withAlpha(roles.glow, 0.32)}, 0 ${0.004 * geo.height}px ${0.012 * geo.height}px rgba(0,0,0,0.12)`, boxSizing: 'border-box'}}>
          <div style={{height: chromeH, background: '#FBFAFC', display: 'flex', alignItems: 'center', gap: Wd.dotR * geo.width * 1.5, padding: `0 ${0.022 * geo.width}px`, position: 'relative', borderBottom: '1px solid rgba(0,0,0,0.06)'}}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map((c, i) => <div key={i} style={{width: Wd.dotR * 2 * geo.width, height: Wd.dotR * 2 * geo.width, borderRadius: 99, background: c}} />)}
            <div style={{position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: Wd.urlW * geo.width, height: Wd.urlH * geo.height, background: '#fff', borderRadius: 8, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontFor(theme, 'heading', url || 'a').family, fontWeight: 700, fontSize: Wd.urlH * geo.height * 0.56, color: '#1d1d1f', whiteSpace: 'nowrap', overflow: 'hidden'}}>{url}</div>
            {badge ? <div style={{position: 'absolute', right: 0.02 * geo.width, top: '50%', transform: 'translateY(-50%)', background: '#161616', color: '#fff', borderRadius: 99, padding: `0 ${Wd.badge.padX * geo.width}px`, height: Wd.badge.sizeH * geo.height * 1.5, display: 'flex', alignItems: 'center', fontFamily: fontFor(theme, 'display', '1').family, fontWeight: 800, fontSize: Wd.badge.sizeH * geo.height}}><span style={{color: roles.accent}}>{badge.n}</span><span style={{opacity: 0.6, margin: '0 3px'}}>/</span>{badge.total}</div> : null}
          </div>
          <div style={{transform: `scale(${zoom})`, transformOrigin: `${(g.zoomX ?? 0.5) * 100}% ${(g.zoomY ?? 0.5) * 100}%`}}>
            <Content c={g.content} w={rect.w - 2 * ow} h={contentH - ow} tMs={tMs} startMs={g.startMs} endMs={g.endMs} />
          </div>
        </div>
      )}
      {(g.overlays || []).map((o, i) => <Overlay key={i} o={o} rect={rect} chromeH={bare ? 0 : chromeH} />)}
    </div>
  );
};

const Overlay = ({o, rect, chromeH}) => {
  const {frame, geo, tMs, ms2f} = useT();
  const {roles} = useTheme();
  if (tMs < o.atMs - 40 || (o.untilMs && tMs > o.untilMs)) return null;
  const x = (o.x ?? 0.5) * rect.w;
  const y = chromeH + (o.y ?? 0.5) * (rect.h - chromeH);
  if (o.type === 'stat') {
    return <div style={{position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)'}}><StatBox value={o.value} label={o.label} prefix={o.prefix} suffix={o.suffix} startMs={o.atMs} /></div>;
  }
  if (o.type === 'pill') {
    const p = progress(frame, ms2f(o.atMs), 260, geo.fps, 'outBack');
    return <div style={{position: 'absolute', left: x, top: y, transform: `translate(${o.anchorX ?? 0}%,-50%) scale(${0.85 + 0.15 * p})`, opacity: Math.min(1, p * 1.5)}}><Pill text={o.text} tone={o.tone || 'red'} /></div>;
  }
  if (o.type === 'box') {
    const p = progress(frame, ms2f(o.atMs), 380, geo.fps, 'outCubic');
    const w = (o.w ?? 0.3) * rect.w;
    const h = (o.h ?? 0.1) * (rect.h - chromeH);
    return <div style={{position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: 6, background: withAlpha(roles.accent, 0.34), border: `${Math.max(2, 0.003 * geo.width)}px solid ${roles.accent}`, opacity: p, transform: `scale(${1.15 - 0.15 * p})`, boxShadow: `0 0 ${0.012 * geo.height}px ${withAlpha(roles.accent, 0.5)}`}} />;
  }
  if (o.type === 'callout') {
    const p = progress(frame, ms2f(o.atMs), 360, geo.fps, 'outCubic');
    const w = (o.w ?? 0.4) * rect.w;
    const h = (o.h ?? 0.12) * (rect.h - chromeH);
    return <div style={{position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: 999, border: `${Math.max(3, 0.004 * geo.width)}px solid ${roles.red}`, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`, boxShadow: `0 0 ${0.012 * geo.height}px ${withAlpha(roles.red, 0.5)}`}} />;
  }
  if (o.type === 'sticker') {
    const p = progress(frame, ms2f(o.atMs), 300, geo.fps, 'outBack');
    const s = D.stickers.pixel * geo.width * 1.4;
    return <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%,-100%) scale(${p})`}}><Sticker name={o.name} size={s} rot={o.rot || 0} /></div>;
  }
  return null;
};
