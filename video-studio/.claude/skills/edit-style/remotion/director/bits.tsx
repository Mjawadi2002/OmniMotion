// @ts-nocheck
// Small building blocks of the reference look: title block with an italic serif highlight, pixel stickers, section card, overlays, captions.
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {withAlpha} from '../../shared/color.js';
import {CONFIG, enterStyle, fontFor, lineIsRtl, measureText, progress, useGeo, useTheme, visualOrder} from '../core';

export const D = CONFIG.director;
export const useT = () => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  return {frame, geo, tMs: (frame / geo.fps) * 1000, ms2f: geo.ms2f};
};
export const isLatinOnly = (s) => !/[֐-ࣿﭐ-﻿]/.test(s);

// ---------------------------------------------------------------- pixel stickers (original 8x8 pixel art; colors are palette roles)
const PIX = {
  coin: ['..aaaa..', '.aAAAAa.', 'aAAkkAAa', 'aAkAAkAa', 'aAkAAkAa', 'aAAkkAAa', '.aAAAAa.', '..aaaa..'],
  cash: ['gggggggg', 'gGGGGGGg', 'gGggggGg', 'gGgGGgGg', 'gGggggGg', 'gGGGGGGg', 'gggggggg', '........'],
  bolt: ['....aa..', '...aaa..', '..aaa...', '.aaaaaa.', '...aaa..', '..aa....', '.a......', '........'],
  star: ['...aa...', '...aa...', 'aaaaaaaa', '.aaaaaa.', '..aaaa..', '.aaaaaa.', '.aa..aa.', '........'],
  cursor: ['k.......', 'kk......', 'kwk.....', 'kwwk....', 'kwwwk...', 'kwwkkk..', 'kkwk....', '..kk....'],
  check: ['........', '......gg', '.....ggg', 'g...ggg.', 'gg.ggg..', '.ggggg..', '..ggg...', '........'],
  spark: ['...aa...', '...aa...', '..aaaa..', 'aaaaaaaa', '..aaaa..', '...aa...', '...aa...', '........'],
  face: ['.rrrrrr.', 'rrrrrrrr', 'rkwrrkwr', 'rkkrrkkr', 'rrrrrrrr', 'rrkkkkrr', '.rrrrrr.', '..r..r..'],
};
export const Sticker = ({name, size, rot = 0}) => {
  const {roles} = useTheme();
  const map = {a: roles.accent, A: roles.accentDeep, g: roles.positive, G: roles.positive, r: roles.red, k: roles.cardInk, w: '#FFFFFF'};
  const rows = PIX[name] || PIX.spark;
  const px = size / 8;
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{transform: `rotate(${rot}deg)`, imageRendering: 'pixelated', overflow: 'visible'}}>
      {rows.map((row, y) => row.split('').map((c, x) => (c === '.' ? null : <rect key={`${x}${y}`} x={x} y={y} width={1.02} height={1.02} fill={map[c] || roles.accent} opacity={c === 'G' ? 0.75 : 1} />)))}
    </svg>
  );
};

// ---------------------------------------------------------------- title block: bold line + highlighted italic serif phrase
export const TitleBlock = ({title, startMs, endMs, lay}) => {
  const {frame, geo, tMs, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const L = lay.title;
  if (!L || !title) return null;
  const T = D.title;
  const p = progress(frame, ms2f(startMs), T.enterMs, geo.fps, 'outCubic');
  const out = progress(frame, ms2f(endMs - 160), 160, geo.fps, 'inCubic');
  const f1 = fontFor(theme, 'display', title.line1);
  const size1 = T.line1Size * geo.width;
  const hl = title.highlight;
  const latin = hl ? isLatinOnly(hl) : true;
  const fh = hl ? (latin ? fontFor(theme, 'serif', hl) : fontFor(theme, 'display', hl)) : null;
  const sizeH = T.boxSize * geo.width;
  const wBox = hl ? measureText(hl, sizeH, fh.family, fh.weight) + 2 * T.boxPadX * geo.width : 0;
  const ink = roles[lay.stage === 'paper' || lay.stage === 'white' ? 'paperInk' : 'dimInk'];
  const stk = (title.stickers || []).slice(0, 2);
  const boxTop = L.boxY * geo.height;
  const boxH = L.boxH * geo.height;
  const sp = progress(frame, ms2f(startMs + 120), T.enterMs, geo.fps, 'outBack');
  return (
    <div style={{position: 'absolute', inset: 0, opacity: 1 - out}}>
      <div style={{position: 'absolute', left: 0, width: geo.width, top: L.line1Y * geo.height, transform: 'translateY(-50%)', textAlign: 'center', ...enterStyle(p, {opacity: 0, y: 0.012, scale: 1, blur: 0}, geo.ss)}}>
        <span style={{fontFamily: f1.family, fontWeight: 800, fontSize: size1, color: ink, direction: lineIsRtl(title.line1.split(' ').map((x) => ({text: x}))) ? 'rtl' : 'ltr', letterSpacing: '-0.01em'}}>{title.line1}</span>
      </div>
      {hl ? (
        <div style={{position: 'absolute', left: geo.width / 2 - wBox / 2, top: boxTop, width: wBox, height: boxH, ...enterStyle(progress(frame, ms2f(startMs + 90), T.enterMs, geo.fps, 'outCubic'), {opacity: 0, y: 0.014, scale: 0.96, blur: 0}, geo.ss)}}>
          <div style={{position: 'absolute', inset: 0, background: roles.accent, borderRadius: T.boxRadius * geo.width, boxShadow: `0 ${0.004 * geo.height}px ${0.02 * geo.height}px ${withAlpha(roles.accent, 0.3)}`}} />
          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fh.family, fontStyle: fh.style, fontWeight: fh.weight, fontSize: sizeH, color: roles.textOnAccent, direction: latin ? 'ltr' : 'rtl', whiteSpace: 'nowrap'}}>{hl}</div>
        </div>
      ) : null}
      {stk.map((n, i) => {
        const s = D.stickers.pixel * geo.width * 1.1;
        const x = i === 0 ? geo.width / 2 - wBox / 2 - s * 1.2 : geo.width / 2 + wBox / 2 + s * 0.3;
        return (
          <div key={i} style={{position: 'absolute', left: x, top: boxTop + boxH / 2 - s / 2 + (i ? -0.01 : 0.008) * geo.height, transform: `scale(${sp})`, opacity: sp}}>
            <Sticker name={n} size={s} rot={i ? 6 : -6} />
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- section card ("Repo Number Five"): typed line + highlighted italic word
export const SectionCard = ({sec, startMs, endMs, lay}) => {
  const {frame, geo, tMs, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const S = D.section;
  const L = lay.title || D.layouts.lightSection.title;
  const typed = Math.floor(((tMs - startMs - 80) / 1000) * S.typeCharsPerSec);
  const l1 = sec.line1.slice(0, Math.max(0, typed));
  const doneAt = (sec.line1.length / S.typeCharsPerSec) * 1000 + 80;
  const bp = progress(frame, ms2f(startMs + doneAt), 280, geo.fps, 'outBack');
  const f1 = fontFor(theme, 'display', sec.line1);
  const hl = sec.box;
  const latin = isLatinOnly(hl || '');
  const fh = hl ? (latin ? fontFor(theme, 'serif', hl) : fontFor(theme, 'display', hl)) : null;
  const sizeH = S.boxSize * geo.width;
  const wBox = hl ? measureText(hl, sizeH, fh.family, fh.weight) + 2 * D.title.boxPadX * geo.width : 0;
  const out = progress(frame, ms2f(endMs - 200), 200, geo.fps, 'inCubic');
  const ink = roles.paperInk;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: 1 - out}}>
      <div style={{position: 'absolute', left: 0, width: geo.width, top: L.line1Y * geo.height, transform: 'translateY(-50%)', textAlign: 'center', whiteSpace: 'pre'}}>
        <span style={{fontFamily: f1.family, fontWeight: 800, fontSize: S.line1Size * geo.width, color: ink, direction: /[؀-ۿ]/.test(sec.line1) ? 'rtl' : 'ltr'}}>{l1}</span>
        {typed < sec.line1.length + 8 && Math.floor(tMs / 450) % 2 === 0 ? <span style={{display: 'inline-block', width: 0.006 * geo.width, height: S.line1Size * geo.width * 0.9, background: roles.accent, marginLeft: 6, verticalAlign: 'middle'}} /> : null}
      </div>
      {hl && bp > 0.02 ? (
        <div style={{position: 'absolute', left: geo.width / 2 - wBox / 2, top: L.boxY * geo.height, width: wBox, height: L.boxH * geo.height, transform: `scale(${bp})`, opacity: Math.min(1, bp * 1.5)}}>
          <div style={{position: 'absolute', inset: 0, background: roles.accent, borderRadius: D.title.boxRadius * geo.width}} />
          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fh.family, fontStyle: fh.style, fontWeight: fh.weight, fontSize: sizeH, color: roles.textOnAccent, whiteSpace: 'nowrap'}}>{hl}</div>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- pill / stat overlays
export const Pill = ({text, tone = 'red', style = {}, size}) => {
  const {geo} = useT();
  const {roles} = useTheme();
  const P = D.pill;
  const bg = tone === 'green' ? withAlpha(roles.positive, 0.18) : tone === 'blue' ? withAlpha(roles.accent, 0.14) : roles.redSoft;
  const ink = tone === 'green' ? roles.positive : tone === 'blue' ? roles.accent : roles.red;
  const px = (size || P.sizeH) * geo.height;
  return <div style={{display: 'inline-flex', alignItems: 'center', gap: px * 0.5, background: bg, color: ink, borderRadius: 999, padding: `${P.padY * geo.height}px ${P.padX * geo.width}px`, fontFamily: fontFor(useTheme(), 'display', text).family, fontWeight: 700, fontSize: px, boxShadow: `0 ${0.003 * geo.height}px ${0.012 * geo.height}px rgba(0,0,0,0.12)`, ...style}}>{text}</div>;
};

export const StatBox = ({value, label, prefix = '', suffix = '', startMs, tone}) => {
  const {frame, geo, tMs, ms2f} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const S = D.stat;
  const raw = String(value).replace(/[^\d.,]/g, '');
  const target = parseFloat(raw.replace(/,/g, '')) || 0;
  const p = progress(frame, ms2f(startMs), 700, geo.fps, 'outCubic');
  const shown = raw.includes(',') ? Math.round(target * p).toLocaleString('en-US') : raw.includes('.') ? (target * p).toFixed(raw.split('.')[1].length) : String(Math.round(target * p));
  const pop = progress(frame, ms2f(startMs), 260, geo.fps, 'outBack');
  const f = fontFor(theme, 'display', '0');
  return (
    <div style={{display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: withAlpha(roles.dim, 0.92), color: roles.dimInk, borderRadius: S.radiusH * geo.height, padding: `${S.padH * geo.height}px ${S.padH * 1.6 * geo.height}px`, transform: `scale(${0.8 + 0.2 * pop})`, opacity: Math.min(1, pop * 1.6), boxShadow: `0 ${0.006 * geo.height}px ${0.03 * geo.height}px rgba(0,0,0,0.3)`}}>
      <div style={{fontFamily: f.family, fontWeight: 800, fontSize: S.sizeH * geo.height, lineHeight: 1, direction: 'ltr'}}>{prefix}{shown}{suffix}</div>
      {label ? <div style={{fontFamily: fontFor(theme, 'body', label).family, fontWeight: 600, fontSize: S.labelH * geo.height, marginTop: 0.006 * geo.height, opacity: 0.9, direction: /[؀-ۿ]/.test(label) ? 'rtl' : 'ltr'}}>{label}</div> : null}
    </div>
  );
};

// ---------------------------------------------------------------- captions: chunks of 1-3 words, bold sans, active word in the accent, italic serif for named entities
export const DirCaptions = ({chunks, lay, hideWhen}) => {
  const {frame, geo, tMs} = useT();
  const theme = useTheme();
  const {roles} = theme;
  const C = D.caption;
  const cur = chunks.find((c) => tMs >= c.startMs - 30 && tMs < c.endMs + 140);
  if (!cur || (hideWhen && hideWhen(tMs))) return null;
  const light = lay.stage === 'paper' || lay.stage === 'white';
  const CC = lay.caption.colors || {};
  const ink = CC.text || roles[lay.caption.ink];
  const size0 = C.sizeH * (lay.caption.scale || 1) * geo.height;
  // a caption is one line: when the words are wider than the room it has (big styles, long words, the line moved clear of a button column), the type shrinks to fit
  const room = (lay.caption.maxW || 0.92) * geo.width * 0.98;
  const lineW =
    cur.words.reduce((sum, w) => {
      const entity = lay.caption.entitySerif !== false && w.entity && isLatinOnly(w.text);
      const f = entity ? fontFor(theme, 'serif', w.text) : fontFor(theme, 'display', w.text);
      const t = lay.caption.upper ? w.text.toUpperCase() : w.text;
      return sum + measureText(t, size0 * (entity ? C.serifScale : 1) * (1 + (lay.caption.pop || 0)), f.family, entity ? 700 : f.weight);
    }, 0) +
    C.gapEm * size0 * Math.max(0, cur.words.length - 1) +
    (lay.caption.box === 'chunk' ? size0 * 0.84 : 0) +
    (lay.caption.box === 'word' ? size0 * 0.32 : 0);
  const size = size0 * Math.min(1, room / Math.max(1, lineW));
  const karaoke = lay.caption.karaoke !== false;
  const rtl = lineIsRtl(cur.words);
  const order = visualOrder(cur.words, rtl);
  let active = -1;
  cur.words.forEach((w, i) => {
    if (tMs >= w.startMs - 30) active = i;
  });
  const enter = progress(frame, geo.ms2f(cur.startMs - 30), C.revealMs, geo.fps, 'outCubic');
  const exitP = progress(frame, geo.ms2f(cur.endMs + 20), 120, geo.fps, 'inCubic');
  const sh = light ? 'none' : `0 ${C.shadow.offsetH * geo.height}px ${C.shadow.blurH * geo.height}px rgba(0,0,0,${C.shadow.alpha})`;
  return (
    <div style={{position: 'absolute', left: (lay.caption.cx ?? 0.5) * geo.width, top: lay.caption.cy * geo.height, transform: `translate(-50%,-50%) translateY(${(1 - enter) * 0.01 * geo.height - exitP * 0.006 * geo.height}px)`, opacity: Math.min(enter * 1.5, 1) * (1 - exitP), maxWidth: lay.caption.maxW * geo.width}}>
      <div style={{display: 'flex', gap: C.gapEm * size, alignItems: 'baseline', justifyContent: 'center', direction: 'ltr', whiteSpace: 'nowrap', ...(lay.caption.box === 'chunk' ? {background: 'rgba(10,10,14,0.8)', padding: `${size * 0.2}px ${size * 0.42}px`, borderRadius: size * 0.34} : {})}}>
        {order.map((i) => {
          const w = cur.words[i];
          const shown = tMs >= w.startMs - 30;
          const entity = lay.caption.entitySerif !== false && w.entity && isLatinOnly(w.text);
          const f = entity ? fontFor(theme, 'serif', w.text) : fontFor(theme, 'display', w.text);
          const isActive = i === active;
          const accent = (karaoke && isActive) || w.num || w.entity;
          const pop = progress(frame, geo.ms2f(w.startMs - 30), C.revealMs, geo.fps, 'outBack');
          const boxed = lay.caption.box === 'word' && isActive && shown;
          const grow = isActive && shown ? 1 + (lay.caption.pop || 0) * pop : 1;
          const plain = lay.caption.box === 'chunk';
          return (
            <span key={i} style={{fontFamily: f.family, fontStyle: f.style, fontWeight: entity ? 700 : f.weight, fontSize: size * (entity ? C.serifScale : 1), color: boxed ? CC.boxText || roles.textOnAccent || '#111' : accent ? CC.accent || roles.accent : plain ? CC.text || '#FFFFFF' : ink, textShadow: boxed || plain ? 'none' : sh, opacity: shown ? 1 : 0, transform: `scale(${(shown ? 0.92 + 0.08 * pop : 0.9) * grow})`, display: 'inline-block', ...(boxed ? {background: CC.box || CC.accent || roles.accent, padding: `0 ${size * 0.16}px`, borderRadius: size * 0.16} : {})}}>{lay.caption.upper ? w.text.toUpperCase() : w.text}</span>
          );
        })}
      </div>
    </div>
  );
};
