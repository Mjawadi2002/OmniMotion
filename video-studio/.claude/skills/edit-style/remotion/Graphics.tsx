// @ts-nocheck
import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {withAlpha} from '../shared/color.js';
import {toWesternDigits} from '../shared/text.js';
import {CONFIG, ease, enterStyle, exitStyle, floatY, fontFor, lineIsRtl, outlineOf, progress, shadowOf, surfaceStyle, useGeo, useTheme, visualOrder} from './core';

const stroke = (theme, geo, role) => ({fill: 'none', stroke: theme.roles[role], strokeWidth: CONFIG.icons.strokePctShort * geo.ss, strokeLinecap: 'round', strokeLinejoin: 'round'});

export const CheckIcon = ({size, theme, geo, bg = 'positive', fg = 'textOnAccent'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="12" fill={theme.roles[bg]} />
    <path d="M7 12.5l3.2 3.2L17 8.8" {...stroke(theme, geo, fg)} strokeWidth={2.4} />
  </svg>
);
export const ChatIcon = ({size, theme, geo, role = 'textOnAccent'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M12 3.5c4.7 0 8.5 3.2 8.5 7.2S16.7 18 12 18c-1 0-2-.1-2.9-.4L5 19.5l1-3.4C4.4 15 3.5 12.9 3.5 10.7 3.5 6.7 7.3 3.5 12 3.5z" {...stroke(theme, geo, role)} strokeWidth={2} />
  </svg>
);
export const LinkIcon = ({size, theme, geo, role = 'textOnSurface'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" {...stroke(theme, geo, role)} strokeWidth={2} />
  </svg>
);

// Wrapper: handles panel enter/exit for a visual that lives in the graphic rect.
export const VisualWrapper = ({visual, rect, children}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const V = CONFIG.animations.swapVariants[visual.variant || CONFIG.transitions.graphicSwap.type];
  const startF = geo.ms2f(visual.startMs);
  const endF = geo.ms2f(visual.endMs);
  const enterP = progress(frame, startF, V.enter.ms, geo.fps, V.enter.easing);
  const exitP = progress(frame, endF - geo.ms2f(V.exit.ms), V.exit.ms, geo.fps, V.exit.easing);
  const st = {...enterStyle(enterP, V.enter.from, geo.ss)};
  if (exitP > 0) Object.assign(st, exitStyle(exitP, V.exit.to, geo.ss));
  const theme = useTheme();
  const bob = floatY(theme, geo, (frame / geo.fps) * 1000, visual.startMs * 0.001);
  return (
    <div style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, display: 'flex', alignItems: 'center', justifyContent: 'center', ...st}}>
      <div style={{transform: `translateY(${bob}px)`}}>{children}</div>
    </div>
  );
};

const useLocal = (visual) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const t = (frame / geo.fps) * 1000 - visual.startMs;
  return {frame, geo, t, localF: frame - geo.ms2f(visual.startMs)};
};

// ---------- KeywordChip ----------
export const KeywordChip = ({visual}) => {
  const theme = useTheme();
  const {geo} = useLocal(visual);
  const c = CONFIG.visuals.chip;
  const f = fontFor(theme, 'display', visual.data.text);
  const px = c.sizePctShort * geo.ss;
  return (
    <div
      style={{
        ...surfaceStyle(theme, geo.ss, {radius: 'chip', bgRole: c.role, textRole: c.textRole}),
        fontFamily: f.family,
        fontWeight: f.weight,
        fontSize: px,
        padding: `${c.padYEm * px}px ${c.padXEm * px}px`,
        lineHeight: 1.15,
        whiteSpace: 'nowrap',
        direction: /[؀-ۿ]/.test(visual.data.text) ? 'rtl' : 'ltr',
      }}
    >
      {visual.data.text}
    </div>
  );
};

// ---------- KeywordCard (large key term with an accent bar) ----------
export const KeywordCard = ({visual}) => {
  const theme = useTheme();
  const {frame, geo} = useLocal(visual);
  const k = CONFIG.visuals.keywordCard;
  const barP = progress(frame, geo.ms2f(visual.startMs + 120), 380, geo.fps, 'outCubic');
  const f = fontFor(theme, 'display', visual.data.text);
  const px = k.sizePctShort * geo.ss;
  const hard = theme.preset.shadow.type === 'hard';
  const card = theme.preset.keywordCardStyle === 'card';
  const rtl = /[؀-ۿ]/.test(visual.data.text);
  const inner = (
    <>
      <div style={{width: k.barWidthPctShort * geo.ss, height: k.barHeightPctShort * geo.ss, borderRadius: 999, background: theme.roles.accent, transform: `scaleX(${barP})`, transformOrigin: rtl ? 'right' : 'left', alignSelf: card ? undefined : 'center'}} />
      <div
        style={{
          fontFamily: f.family,
          fontWeight: f.weight,
          fontSize: px,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          direction: rtl ? 'rtl' : 'ltr',
          color: card ? theme.roles.textOnSurface : theme.roles[k.softTextRole],
          textShadow: card || hard ? undefined : `0 0 ${0.04 * geo.ss}px ${withAlpha(theme.roles.glow, 0.5)}`,
        }}
      >
        {visual.data.text}
      </div>
    </>
  );
  if (card) {
    return (
      <div style={{position: 'relative'}}>
        <div style={{...surfaceStyle(theme, geo.ss, {radius: 'panel'}), padding: `${k.cardPadYPctShort * geo.ss}px ${k.cardPadXPctShort * geo.ss}px`, display: 'flex', flexDirection: 'column', alignItems: rtl ? 'flex-end' : 'flex-start', gap: k.gapPctShort * geo.ss}}>
          {inner}
        </div>
        <ArrowAccent visual={visual} rtl={rtl} />
      </div>
    );
  }
  return (
    <div style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: k.gapPctShort * geo.ss}}>
      {inner}
      <ArrowAccent visual={visual} rtl={rtl} />
    </div>
  );
};

// ---------- SectionTitle ("Number N" typed on the stage, topic below) ----------
export const SectionTitle = ({visual}) => {
  const theme = useTheme();
  const {frame, geo, t} = useLocal(visual);
  const S = CONFIG.visuals.sectionTitle;
  const [pre, post] = visual.data.label.split('{n}');
  const num = String(visual.data.n);
  const full = pre + num + post;
  const typeDelay = 160;
  const typed = Math.max(0, Math.min(full.length, Math.floor(((t - typeDelay) / 1000) * S.typeCharsPerSec)));
  const preT = pre.slice(0, typed);
  const numT = typed > pre.length ? num.slice(0, typed - pre.length) : '';
  const postT = typed > pre.length + num.length ? post.slice(0, typed - pre.length - num.length) : '';
  const doneAt = typeDelay + (full.length / S.typeCharsPerSec) * 1000;
  const cursorOn = t < doneAt + 700 && Math.floor((frame / geo.fps) * 2.2) % 2 === 0;
  const rtl = /[\u0600-\u06FF]/.test(full);
  const f = fontFor(theme, 'display', full);
  const px = S.sizePctShort * geo.ss;
  const wh = theme.preset.wordHighlight;
  const topicP = progress(frame, geo.ms2f(visual.startMs + doneAt), CONFIG.animations.panelEnter.ms, geo.fps, CONFIG.animations.panelEnter.easing);
  const tf = fontFor(theme, 'display', visual.data.topic || '');
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.03 * geo.ss}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 0.012 * geo.ss, direction: rtl ? 'rtl' : 'ltr', fontFamily: f.family, fontWeight: f.weight, fontSize: px, lineHeight: 1.15, color: theme.roles.text, whiteSpace: 'pre'}}>
        <span>{preT}</span>
        {numT ? (
          <span style={{background: theme.roles[wh.fillRole], color: theme.roles[wh.textRole], borderRadius: theme.preset.radiusPctShort.wordBox * px, padding: `0 ${0.22 * px}px`, border: wh.outline ? outlineOf(theme, geo.ss) : undefined}}>{numT}</span>
        ) : null}
        <span>{postT}</span>
        <span style={{display: 'inline-block', width: 0.008 * geo.ss, height: px * 0.95, background: theme.roles.accent, opacity: cursorOn ? 1 : 0}} />
      </div>
      {visual.data.topic ? (
        <div style={{...enterStyle(topicP, CONFIG.animations.panelEnter.from, geo.ss), fontFamily: tf.family, fontWeight: tf.weight, fontSize: S.topicSizePctShort * geo.ss, color: theme.roles.accent, textShadow: theme.preset.shadow.type === 'hard' ? undefined : `0 0 ${0.04 * geo.ss}px ${withAlpha(theme.roles.glow, 0.5)}`, direction: /[\u0600-\u06FF]/.test(visual.data.topic) ? 'rtl' : 'ltr'}}>
          {visual.data.topic}
        </div>
      ) : null}
    </div>
  );
};

// ---------- StatCounter ----------
export const StatCounter = ({visual}) => {
  const theme = useTheme();
  const {frame, geo, localF} = useLocal(visual);
  const s = CONFIG.visuals.stat;
  const raw = toWesternDigits(visual.data.value);
  const m = raw.match(/^([^\d]*)([\d.,]+)(.*)$/);
  const prefix = m ? m[1] : '';
  const numStr = m ? m[2] : raw;
  const suffix = m ? m[3] : '';
  const target = parseFloat(numStr.replace(/,/g, ''));
  const decimals = (numStr.split('.')[1] || '').length;
  const p = progress(frame, geo.ms2f(visual.startMs), CONFIG.animations.counter.ms, geo.fps, CONFIG.animations.counter.easing);
  const val = target * p;
  const shown = isNaN(target)
    ? numStr
    : numStr.includes(',')
    ? val.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals})
    : val.toFixed(decimals);
  const f = fontFor(theme, theme.preset.numberFont, numStr);
  const px = s.sizePctShort * geo.ss;
  const hard = theme.preset.shadow.type === 'hard';
  const textShadow = hard
    ? `${theme.preset.shadow.offsetXPctShort * geo.ss}px ${theme.preset.shadow.offsetYPctShort * geo.ss}px 0 ${theme.roles.shadow}`
    : `0 0 ${0.04 * geo.ss}px ${withAlpha(theme.roles.glow, 0.55)}`;
  const label = visual.data.label;
  const lf = fontFor(theme, 'body', label || '');
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.015 * geo.ss}}>
      <div
        style={{
          fontFamily: f.family,
          fontWeight: f.weight,
          fontSize: px,
          lineHeight: 1,
          color: theme.roles[s.role],
          textShadow,
          WebkitTextStroke: hard ? `${Math.max(1, theme.preset.outlineWidthPctShort * geo.ss)}px ${theme.roles.outline}` : undefined,
          paintOrder: 'stroke fill',
          direction: 'ltr',
        }}
      >
        {prefix}
        {shown}
        {suffix}
      </div>
      {label ? (
        <div
          style={{
            fontFamily: lf.family,
            fontWeight: lf.weight,
            fontSize: s.labelSizePctShort * geo.ss,
            color: theme.roles.text,
            direction: /[؀-ۿ]/.test(label) ? 'rtl' : 'ltr',
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};

// ---------- Checklist ----------
const ListChecklist = ({visual}) => {
  const theme = useTheme();
  const {frame, geo, t} = useLocal(visual);
  const c = CONFIG.visuals.checklist;
  const a = CONFIG.animations.itemStagger;
  const items = visual.data.items.slice(0, c.maxItems);
  const rowH = c.itemHeightPctShort * geo.ss;
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: c.gapPctShort * geo.ss, alignItems: 'stretch', minWidth: 0.6 * geo.ss}}>
      {items.map((it, i) => {
        const at = Math.max(0, (it.atMs ?? i * a.staggerMs) - visual.startMs);
        const p = progress(frame, geo.ms2f(visual.startMs + at), a.ms, geo.fps, a.easing);
        const f = fontFor(theme, 'body', it.text);
        const rtl = /[؀-ۿ]/.test(it.text);
        return (
          <div
            key={i}
            style={{
              ...surfaceStyle(theme, geo.ss, {radius: 'mini'}),
              ...enterStyle(p, a.from, geo.ss),
              height: rowH,
              display: 'flex',
              alignItems: 'center',
              gap: 0.025 * geo.ss,
              padding: `0 ${0.03 * geo.ss}px`,
              direction: rtl ? 'rtl' : 'ltr',
              fontFamily: f.family,
              fontWeight: f.weight,
              fontSize: c.itemSizePctShort * geo.ss,
              whiteSpace: 'nowrap',
            }}
          >
            <CheckIcon size={rowH * 0.5} theme={theme} geo={geo} bg={c.checkRole} />
            <span>{it.text}</span>
          </div>
        );
      })}
    </div>
  );
};

// ---------- LinkCard ----------
export const LinkCard = ({visual}) => {
  const theme = useTheme();
  const {geo} = useLocal(visual);
  const c = CONFIG.visuals.linkCard;
  const f = fontFor(theme, 'display', visual.data.text);
  const fb = fontFor(theme, 'body', c.badgeText);
  return (
    <div style={{...surfaceStyle(theme, geo.ss, {radius: 'panel'}), padding: `${0.035 * geo.ss}px ${0.05 * geo.ss}px`, display: 'flex', flexDirection: 'column', gap: 0.015 * geo.ss, maxWidth: geo.width * 0.9}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 0.015 * geo.ss, fontFamily: fb.family, fontWeight: fb.weight, fontSize: c.subSizePctShort * geo.ss, opacity: 0.8}}>
        <LinkIcon size={c.subSizePctShort * geo.ss * 1.2} theme={theme} geo={geo} />
        <span>{c.badgeText}</span>
      </div>
      <div style={{fontFamily: f.family, fontWeight: f.weight, fontSize: c.titleSizePctShort * geo.ss, direction: 'ltr', overflowWrap: 'anywhere'}}>{visual.data.text}</div>
    </div>
  );
};

// ---------- ImageCard ----------
export const ImageCard = ({visual, rect}) => {
  const theme = useTheme();
  const {geo} = useLocal(visual);
  const c = CONFIG.visuals.image;
  const maxH = rect.h * c.maxHeightPctGraphic;
  return (
    <div style={{...surfaceStyle(theme, geo.ss, {radius: c.radius, bgRole: 'surface'}), padding: 0.03 * geo.ss, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.015 * geo.ss}}>
      <Img src={staticFile(visual.data.src)} style={{maxHeight: maxH, maxWidth: rect.w * 0.7, objectFit: 'contain'}} />
      {visual.data.label ? (
        <div style={{fontFamily: fontFor(theme, 'body', visual.data.label).family, fontWeight: fontFor(theme, 'body').weight, fontSize: 0.035 * geo.ss}}>{visual.data.label}</div>
      ) : null}
    </div>
  );
};

// ---------- CtaPill ----------
export const CtaPill = ({visual}) => {
  const theme = useTheme();
  const {frame, geo} = useLocal(visual);
  const c = CONFIG.visuals.cta;
  const a = CONFIG.animations.ctaPop;
  const p = progress(frame, geo.ms2f(visual.startMs), a.ms, geo.fps, a.easing);
  const f = fontFor(theme, 'display', visual.data.text);
  const px = c.sizePctShort * geo.ss;
  return (
    <div
      style={{
        ...surfaceStyle(theme, geo.ss, {radius: 'chip', bgRole: 'accent', textRole: 'textOnAccent'}),
        ...enterStyle(p, a.from, geo.ss),
        display: 'flex',
        alignItems: 'center',
        gap: 0.02 * geo.ss,
        padding: `${0.3 * px}px ${0.7 * px}px`,
        fontFamily: f.family,
        fontWeight: f.weight,
        fontSize: px,
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
        direction: /[؀-ۿ]/.test(visual.data.text) ? 'rtl' : 'ltr',
      }}
    >
      <ChatIcon size={px * 0.9} theme={theme} geo={geo} />
      <span>{visual.data.text}</span>
    </div>
  );
};

// ---------- Hook title card: big title (key word in accent), subtitle, tag pills ----------
export const HookTitle = ({hook, rect}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const h = CONFIG.hook;
  const a = CONFIG.animations.hookTitle;
  const px = h.titleSizePctShort * geo.ss;
  const hard = theme.preset.shadow.type === 'hard';
  const shimmer = theme.preset.motion?.shimmer;
  const tMs = (frame / geo.fps) * 1000;
  const startF = geo.ms2f(hook.startMs);
  const endF = geo.ms2f(hook.endMs);
  const exitP = progress(frame, endF - geo.ms2f(CONFIG.animations.panelExit.ms), CONFIG.animations.panelExit.ms, geo.fps, CONFIG.animations.panelExit.easing);
  const lines = hook.lines;
  const total = lines.reduce((s, l) => s + l.length, 0);
  // fit the stagger inside the hook duration so every word lands before the hold phase
  const stagger = total > 1 ? Math.min(a.staggerMs, (hook.endMs - hook.startMs - a.ms - h.holdMs) / (total - 1)) : 0;
  const titleDone = Math.max(0, stagger) * Math.max(0, total - 1) + a.ms;
  const shim = (((tMs % CONFIG.motion.shimmer.periodMs) / CONFIG.motion.shimmer.periodMs) * 260) - 80;
  let n = 0;
  const subP = progress(frame, startF + geo.ms2f(titleDone * 0.7), CONFIG.animations.panelEnter.ms, geo.fps, CONFIG.animations.panelEnter.easing);
  const tagStart = titleDone * 0.7 + h.tagDelayMs;
  return (
    <div style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.012 * geo.ss, ...(exitP > 0 ? exitStyle(exitP, CONFIG.animations.panelExit.to, geo.ss) : {})}}>
      {lines.map((line, li) => (
        <div key={li} style={{display: 'flex', gap: 0.022 * geo.ss, direction: 'ltr', alignItems: 'center'}}>
          {visualOrder(line, lineIsRtl(line)).map((oi, wi) => {
            const w = line[oi];
            const idx = n++;
            const p = progress(frame, startF + geo.ms2f(Math.max(0, stagger) * idx), a.ms, geo.fps, a.easing);
            const f = fontFor(theme, 'display', w.text);
            const base = w.emph ? theme.roles.accent : theme.roles.text;
            const textFill = shimmer
              ? {backgroundImage: `linear-gradient(100deg, ${base} 0%, ${base} ${shim - 12}%, ${theme.roles.accent3} ${shim}%, ${base} ${shim + 14}%, ${base} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent'}
              : {color: base};
            return (
              <span
                key={wi}
                style={{
                  ...enterStyle(p, a.from, geo.ss),
                  display: 'inline-block',
                  fontFamily: f.family,
                  fontWeight: f.weight,
                  fontSize: px,
                  lineHeight: h.titleLineHeight,
                  ...textFill,
                  filter: [enterStyle(p, a.from, geo.ss).filter, shimmer || !hard ? `drop-shadow(0 0 ${0.03 * geo.ss}px ${withAlpha(w.emph ? theme.roles.glow : theme.roles.text, 0.45)})` : undefined].filter(Boolean).join(' ') || undefined,
                  textShadow: hard ? `${theme.preset.shadow.offsetXPctShort * geo.ss}px ${theme.preset.shadow.offsetYPctShort * geo.ss}px 0 ${theme.roles.shadow}` : undefined,
                  WebkitTextStroke: hard ? `${Math.max(1, theme.preset.outlineWidthPctShort * geo.ss)}px ${theme.roles.outline}` : undefined,
                  paintOrder: 'stroke fill',
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      ))}
      {hook.subtitle ? (
        <div style={{...enterStyle(subP, CONFIG.animations.panelEnter.from, geo.ss), marginTop: 0.01 * geo.ss, fontFamily: fontFor(theme, 'body', hook.subtitle).family, fontWeight: fontFor(theme, 'body').weight + 100, fontSize: h.subtitleSizePctShort * geo.ss, color: theme.roles.textMuted, direction: /[\u0600-\u06FF]/.test(hook.subtitle) && lineIsRtl(hook.subtitle.split(' ').map((t) => ({text: t}))) ? 'rtl' : 'ltr', unicodeBidi: 'plaintext', maxWidth: rect.w * 0.9, textAlign: 'center'}}>
          {hook.subtitle}
        </div>
      ) : null}
      {hook.tags && hook.tags.length ? (
        <div style={{display: 'flex', gap: h.tagGapPctShort * geo.ss, marginTop: 0.012 * geo.ss, flexWrap: 'wrap', justifyContent: 'center', direction: 'ltr'}}>
          {hook.tags.slice(0, h.maxTags).map((tg, i) => {
            const p = progress(frame, startF + geo.ms2f(tagStart + i * CONFIG.animations.itemStagger.staggerMs), CONFIG.animations.itemStagger.ms, geo.fps, CONFIG.animations.itemStagger.easing);
            const f = fontFor(theme, 'body', tg);
            return (
              <div key={i} style={{...surfaceStyle(theme, geo.ss, {radius: 'chip'}), ...enterStyle(p, CONFIG.animations.itemStagger.from, geo.ss), fontFamily: f.family, fontWeight: 700, fontSize: h.tagSizePctShort * geo.ss, padding: `${0.35 * h.tagSizePctShort * geo.ss}px ${0.9 * h.tagSizePctShort * geo.ss}px`, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 0.008 * geo.ss}}>
                <span style={{width: 0.012 * geo.ss, height: 0.012 * geo.ss, borderRadius: '50%', background: theme.roles.accent}} />
                {tg}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export const Checklist = ({visual, rect}) => {
  const c = CONFIG.visuals.checklist;
  return c.style === 'flow' && visual.data.items.length >= c.flowMinItems ? <FlowSteps visual={visual} /> : <ListChecklist visual={visual} />;
};

// ---------- ArrowAccent: hand-drawn arrow that draws itself next to a card, pointing down toward the speaker ----------
export const ArrowAccent = ({visual, rtl}) => {
  const theme = useTheme();
  const {frame, geo} = useLocal(visual);
  const A = CONFIG.visuals.arrow;
  if (!A.enabled) return null;
  const idx = parseInt(String(visual.id).replace(/\D/g, ''), 10) || 0;
  const side = (A.alternate ? (idx % 2 === 0 ? 1 : -1) : 1) * (rtl ? -1 : 1);
  const L = A.lengthPctShort * geo.ss;
  const p = progress(frame, geo.ms2f(visual.startMs + A.delayMs), A.drawMs, geo.fps, 'outCubic');
  const head = Math.min(1, Math.max(0, (p - 0.82) / 0.18));
  const sw = A.strokePctShort * geo.ss;
  return (
    <svg width={L} height={L} viewBox="0 0 130 130" style={{position: 'absolute', top: '100%', [side > 0 ? 'right' : 'left']: -L * 0.35, transform: `translateY(${L * 0.06}px) scaleX(${side > 0 ? 1 : -1})`, overflow: 'visible', pointerEvents: 'none', filter: `drop-shadow(0 0 ${0.012 * geo.ss}px ${withAlpha(theme.roles.glow, 0.5)})`}}>
      <path d="M 10 8 C 78 0, 112 38, 98 112" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - p)} fill="none" stroke={theme.roles.accent} strokeWidth={(sw / L) * 130} strokeLinecap="round" />
      <path d="M 80 94 L 98 116 L 116 92" fill="none" stroke={theme.roles.accent} strokeWidth={(sw / L) * 130} strokeLinecap="round" strokeLinejoin="round" opacity={head} />
    </svg>
  );
};

// ---------- PercentRing: a ring that fills to the spoken percentage while the number counts up ----------
export const PercentRing = ({visual}) => {
  const theme = useTheme();
  const {frame, geo} = useLocal(visual);
  const S = CONFIG.visuals.percentRing;
  const size = S.sizePctShort * geo.ss;
  const stroke = S.strokePctShort * geo.ss;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const p = progress(frame, geo.ms2f(visual.startMs + 150), S.fillMs, geo.fps, 'outCubic');
  const val = Math.min(100, Math.max(0, parseFloat(toWesternDigits(visual.data.value).replace(/,/g, '')) || 0));
  const f = fontFor(theme, theme.preset.numberFont, '0');
  const hard = theme.preset.shadow.type === 'hard';
  const gid = `pr-${visual.id}`;
  const label = visual.data.label;
  const lf = fontFor(theme, 'body', label || '');
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.02 * geo.ss}}>
      <div style={{position: 'relative', width: size, height: size, filter: hard ? undefined : `drop-shadow(0 0 ${0.035 * geo.ss}px ${withAlpha(theme.roles.glow, 0.55)})`}}>
        <svg width={size} height={size}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={theme.roles.accent} />
              <stop offset="55%" stopColor={theme.roles.accent3} />
              <stop offset="100%" stopColor={theme.roles.accent2} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={withAlpha(theme.roles.text, S.trackAlpha)} strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (val / 100) * p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </svg>
        <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: f.family, fontWeight: f.weight, fontSize: size * 0.3, color: theme.roles.text, direction: 'ltr', textShadow: hard ? `${theme.preset.shadow.offsetXPctShort * geo.ss}px ${theme.preset.shadow.offsetYPctShort * geo.ss}px 0 ${theme.roles.shadow}` : undefined}}>
          {Math.round(val * p)}%
        </div>
      </div>
      {label ? <div style={{fontFamily: lf.family, fontWeight: lf.weight, fontSize: S.labelSizePctShort * geo.ss, color: theme.roles.text, direction: /[\u0600-\u06FF]/.test(label) ? 'rtl' : 'ltr'}}>{label}</div> : null}
    </div>
  );
};

// ---------- KeyPhrase: a spoken phrase with a marker sweep and a drawn underline ----------
export const KeyPhrase = ({visual, rect}) => {
  const theme = useTheme();
  const {frame, geo} = useLocal(visual);
  const K = CONFIG.visuals.keyPhrase;
  const text = visual.data.text;
  const rtl = /[\u0600-\u06FF]/.test(text);
  const f = fontFor(theme, 'display', text);
  const px = K.sizePctShort * geo.ss;
  const sweep = progress(frame, geo.ms2f(visual.startMs + 180), K.markerSweepMs, geo.fps, 'outCubic');
  const under = progress(frame, geo.ms2f(visual.startMs + 320), K.underlineMs, geo.fps, 'outCubic');
  const hard = theme.preset.shadow.type === 'hard';
  return (
    <div style={{position: 'relative', display: 'inline-block', maxWidth: rect.w * K.maxWidthPct, textAlign: 'center', direction: rtl ? 'rtl' : 'ltr', padding: `0 ${0.02 * geo.ss}px`}}>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: '0.1em', height: '0.52em', background: withAlpha(theme.roles.accent, K.markerAlpha), borderRadius: '0.18em', transform: `scaleX(${sweep})`, transformOrigin: rtl ? 'right' : 'left'}} />
      <span style={{position: 'relative', fontFamily: f.family, fontWeight: f.weight, fontSize: px, lineHeight: 1.2, color: theme.roles.text, textShadow: hard ? `${theme.preset.shadow.offsetXPctShort * geo.ss}px ${theme.preset.shadow.offsetYPctShort * geo.ss}px 0 ${theme.roles.shadow}` : `0 0 ${0.03 * geo.ss}px ${withAlpha(theme.roles.glow, 0.45)}`}}>{text}</span>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" style={{position: 'absolute', left: 0, bottom: '-0.28em', width: '100%', height: '0.34em', overflow: 'visible', transform: rtl ? 'scaleX(-1)' : undefined}}>
        <path d="M 1 7 Q 14 1 27 7 T 53 7 T 79 7 T 99 6" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - under)} fill="none" stroke={theme.roles.accent} strokeWidth={K.underlineWidthPctShort * geo.ss * 0.55} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <ArrowAccent visual={visual} rtl={rtl} />
    </div>
  );
};

// ---------- FlowSteps: connected, numbered steps that draw themselves as each item is spoken ----------
export const FlowSteps = ({visual}) => {
  const theme = useTheme();
  const {frame, geo} = useLocal(visual);
  const c = CONFIG.visuals.checklist;
  const a = CONFIG.animations.itemStagger;
  const items = visual.data.items.slice(0, c.maxItems);
  const node = c.nodeSizePctShort * geo.ss;
  const gap = c.rowGapPctShort * geo.ss;
  const lineW = Math.max(2, c.lineWidthPctShort * geo.ss);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap, alignItems: 'stretch', minWidth: 0.55 * geo.ss}}>
      {items.map((it, i) => {
        const at = it.atMs ?? visual.startMs + i * a.staggerMs;
        const p = progress(frame, geo.ms2f(at), a.ms, geo.fps, a.easing);
        const lineP = progress(frame, geo.ms2f(at + 140), c.lineDrawMs, geo.fps, 'outCubic');
        const f = fontFor(theme, 'body', it.text);
        const rtl = /[\u0600-\u06FF]/.test(it.text);
        const pulse = p > 0.99 && i === items.length - 1 ? 1 + 0.05 * Math.sin((frame / geo.fps) * 6) : 1;
        return (
          <div key={i} style={{...enterStyle(p, a.from, geo.ss), display: 'flex', alignItems: 'center', gap: 0.03 * geo.ss, flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: rtl ? 'flex-end' : 'flex-start', position: 'relative'}}>
            <div style={{position: 'relative', width: node, height: node, flex: 'none'}}>
              <div style={{...surfaceStyle(theme, geo.ss, {radius: 'chip', bgRole: 'accent', textRole: 'textOnAccent'}), width: node, height: node, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontFor(theme, theme.preset.numberFont, '1').family, fontWeight: 800, fontSize: node * 0.5, transform: `scale(${pulse})`}}>{i + 1}</div>
              {i < items.length - 1 ? <div style={{position: 'absolute', left: '50%', top: node, width: lineW, marginLeft: -lineW / 2, height: gap * lineP, background: `linear-gradient(180deg, ${theme.roles.accent}, ${theme.roles.accent3})`, borderRadius: lineW}} /> : null}
            </div>
            <div style={{...surfaceStyle(theme, geo.ss, {radius: 'chip'}), padding: `${0.014 * geo.ss}px ${0.04 * geo.ss}px`, fontFamily: f.family, fontWeight: 700, fontSize: c.itemSizePctShort * geo.ss, whiteSpace: 'nowrap', direction: rtl ? 'rtl' : 'ltr'}}>{it.text}</div>
          </div>
        );
      })}
    </div>
  );
};

export const VISUALS = {KeywordChip, KeywordCard, KeyPhrase, PercentRing, SectionTitle, StatCounter, Checklist, LinkCard, ImageCard, CtaPill};
