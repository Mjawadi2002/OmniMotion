// @ts-nocheck
// Core helpers: theme, geometry, animation, fonts. Reads ONLY style.config.json + props.
import React, {createContext, useContext, useMemo} from 'react';
import {Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import config from '../style.config.json';
import {resolvePalette, withAlpha, luminance} from '../shared/color.js';
import {scriptOf} from '../shared/text.js';

export const CONFIG = config;

// ---------- theme ----------
// `look` (optional) is a user look: role colours and fonts laid over the base palette of its family
export const buildTheme = (paletteName, look) => {
  const resolved = resolvePalette(config, paletteName);
  const {presetName, pal, report} = resolved;
  let {roles, preset} = resolved;
  if (look) {
    roles = {...roles, ...(look.roles || {})};
    if (look.fonts) {
      const fonts = {...preset.fonts, ...look.fonts};
      const weights = {...preset.weights};
      for (const [kind, family] of Object.entries(look.fonts)) {
        const reg = config.fonts.registry[family];
        if (!reg) continue;
        const want = preset.weights[kind] ?? 700;
        weights[kind] = reg.weights.reduce((b, w) => (Math.abs(w - want) < Math.abs(b - want) ? w : b), reg.weights[0]);
      }
      preset = {...preset, fonts, weights};
    }
  }
  // optional gradient roles fall back to the accent so every palette works without them
  roles.accent2 = roles.accent2 || roles.accent;
  roles.accent3 = roles.accent3 || roles.accent;
  return {name: paletteName, roles, preset, presetName, pal, report, layoutDefault: pal.layoutDefault};
};
export const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

// ---------- geometry ----------
export const orientationOf = (w, h) => {
  const r = w / h;
  const t = config.output.orientationThresholds;
  return r < t.portraitBelow ? 'portrait' : r > t.landscapeAbove ? 'landscape' : 'square';
};

export const useGeo = () => {
  const {width, height, fps} = useVideoConfig();
  const ss = Math.min(width, height);
  return {width, height, fps, ss, orientation: orientationOf(width, height), ms2f: (ms) => Math.round((ms * fps) / 1000)};
};

export const rectPx = (geo, r) => ({x: r.x * geo.width, y: r.y * geo.height, w: r.w * geo.width, h: r.h * geo.height});

export const getLayout = (geo, theme, name) => {
  const set = config.layouts[geo.orientation] || config.layouts.portrait;
  const l = set[name] || set[theme.layoutDefault];
  const radiusKey = l.head.radius;
  const radius = typeof radiusKey === 'string' ? theme.preset.radiusPctShort[radiusKey] * geo.ss : radiusKey * geo.ss;
  return {
    name,
    graphic: rectPx(geo, l.graphic),
    head: {...rectPx(geo, l.head), mode: l.head.mode, radius},
    caption: {cx: l.caption.cx * geo.width, cy: l.caption.cy * geo.height, maxW: l.caption.maxW * geo.width},
    translation: {cy: (l.translation?.cy ?? l.caption.cy + 0.04) * geo.height},
  };
};

// ---------- animation ----------
export const ease = (name) => {
  const b = config.animations.easings[name] || config.animations.easings.outCubic;
  return Easing.bezier(b[0], b[1], b[2], b[3]);
};

export const progress = (frame, startFrame, ms, fps, easing = 'outCubic') => {
  const dur = Math.max(1, Math.round((ms * fps) / 1000));
  const t = Math.min(1, Math.max(0, (frame - startFrame) / dur));
  return ease(easing)(t);
};

const lerp = (a, b, t) => a + (b - a) * t;

// Style for an element animating from `from` (p=0) to rest (p=1).
export const enterStyle = (p, from, ss) => {
  const f = {opacity: 1, y: 0, scale: 1, blur: 0, ...from};
  const y = lerp(f.y * ss, 0, p);
  const s = lerp(f.scale, 1, p);
  const blur = lerp(f.blur, 0, p);
  return {
    opacity: lerp(f.opacity, 1, p),
    transform: `translateY(${y}px) scale(${s})`,
    filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
  };
};
// Style for an element animating from rest (p=0) to `to` (p=1).
export const exitStyle = (p, to, ss) => {
  const t = {opacity: 1, y: 0, scale: 1, blur: 0, ...to};
  const y = lerp(0, t.y * ss, p);
  const s = lerp(1, t.scale, p);
  const blur = lerp(0, t.blur, p);
  return {
    opacity: lerp(1, t.opacity, p),
    transform: `translateY(${y}px) scale(${s})`,
    filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
  };
};

// ---------- fonts / text ----------
export const FALLBACK = config.fonts.fallbackStack.map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', ');
export const fontFor = (theme, kind, text = '') => {
  const p = theme.preset;
  const script = text ? scriptOf(config, text) : null;
  if (script === 'arabic' || script === 'hebrew') {
    if (kind === 'heading' && p.fonts.arabicHeading) return {family: `"${p.fonts.arabicHeading}", ${FALLBACK}`, weight: p.weights.arabicHeading, script, style: 'normal'};
    return {family: `"${p.fonts.arabic}", ${FALLBACK}`, weight: p.weights.arabic, script, style: 'normal'};
  }
  if ((kind === 'heading' || kind === 'numeric') && !p.fonts[kind]) kind = 'display';
  return {family: `"${p.fonts[kind]}", ${FALLBACK}`, weight: p.weights[kind], script: script || 'latin', style: kind === 'serif' ? 'italic' : 'normal'};
};

let _ctx = null;
export const measureText = (text, fontPx, family, weight) => {
  if (typeof document === 'undefined') return text.length * fontPx * 0.55;
  _ctx = _ctx || document.createElement('canvas').getContext('2d');
  _ctx.font = `${weight} ${fontPx}px ${family}`;
  return _ctx.measureText(text).width;
};

// ---------- surfaces ----------
export const outlineOf = (theme, ss, alphaMul = 1) => {
  const p = theme.preset;
  return `${Math.max(1, p.outlineWidthPctShort * ss)}px solid ${withAlpha(theme.roles[p.outlineRole], p.outlineAlpha * alphaMul)}`;
};
export const shadowOf = (theme, ss) => {
  const s = theme.preset.shadow;
  return `${s.offsetXPctShort * ss}px ${s.offsetYPctShort * ss}px ${s.blurPctShort * ss}px ${withAlpha(theme.roles[s.role], s.alpha)}`;
};
// Rotating gradient used for animated borders. The angle comes from the CSS variable --angle set once per frame in Main.
export const gradientFill = (theme) => {
  const r = theme.roles;
  return `conic-gradient(from var(--angle, 0deg), ${r.accent2}, ${r.accent3}, ${r.accent}, ${r.accent2})`;
};
export const isGradientOutline = (theme) => theme.preset.outlineStyle === 'gradient';
// Border props for any outlined box: solid outline, or an animated gradient border (preset.outlineStyle === 'gradient').
export const borderProps = (theme, ss, bgRole) => {
  if (!isGradientOutline(theme)) return {border: outlineOf(theme, ss)};
  const ow = Math.max(1, theme.preset.outlineWidthPctShort * ss);
  const inner = theme.roles[bgRole || 'surface'];
  return {border: `${ow}px solid transparent`, background: `linear-gradient(${inner}, ${inner}) padding-box, ${gradientFill(theme)} border-box`};
};
export const surfaceStyle = (theme, ss, o = {}) => {
  const r = theme.preset.radiusPctShort[o.radius || 'panel'] * ss;
  const bgRole = o.bgRole || 'surface';
  const out = o.outline === false ? {} : borderProps(theme, ss, bgRole);
  return {
    background: theme.roles[bgRole],
    color: theme.roles[o.textRole || 'textOnSurface'],
    borderRadius: r,
    ...out,
    boxShadow: o.shadow === false ? undefined : shadowOf(theme, ss),
  };
};

// Gentle idle motion helpers (preset.motion flags + tokens.motion). All time-based, deterministic.
export const floatY = (theme, geo, tMs, phase = 0) => {
  if (!theme.preset.motion?.float) return 0;
  const m = config.motion.float;
  return m.ampPctShort * geo.ss * Math.sin((2 * Math.PI * tMs) / m.periodMs + phase);
};
export const onLight = (theme, bgRole) => luminance(theme.roles[bgRole]) > 0.4;

// Visual left-to-right order of words for a caption/title line. In an RTL line the sequence of direction runs is reversed,
// but a run of Latin/number words keeps its own LTR order (so "what's going on guys" is not mirrored inside Arabic text).
export const visualOrder = (words, rtl) => {
  const idx = words.map((_, i) => i);
  if (!rtl) return idx;
  const isRtlWord = (w) => config.fonts.rtlScripts.includes(scriptOf(config, w.text));
  const runs = [];
  idx.forEach((i) => {
    const r = isRtlWord(words[i]);
    const last = runs[runs.length - 1];
    if (last && last.rtl === r) last.items.push(i);
    else runs.push({rtl: r, items: [i]});
  });
  return runs.reverse().flatMap((r) => (r.rtl ? [...r.items].reverse() : r.items));
};
// A line is RTL when most of its words are in an RTL script.
export const lineIsRtl = (words) => {
  const r = words.filter((w) => config.fonts.rtlScripts.includes(scriptOf(config, w.text))).length;
  return r > words.length / 2;
};
