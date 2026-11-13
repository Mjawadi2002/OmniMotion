// @ts-nocheck
import React, {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {withAlpha, luminance} from '../shared/color.js';
import {CONFIG, enterStyle, exitStyle, fontFor, lineIsRtl, measureText, outlineOf, progress, shadowOf, useGeo, useTheme, visualOrder} from './core';

export const Captions = ({plan, layoutState}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const cfg = CONFIG.captions;
  const anim = CONFIG.animations;
  const t = (frame / geo.fps) * 1000;
  const {roles, preset} = theme;

  if (plan.hook && CONFIG.hook.hideCaptions && t < plan.hook.endMs) return null;

  let page = null;
  for (const p of plan.pages) if (t >= p.startMs - cfg.paging.leadInMs && t < p.endMs + cfg.paging.tailHoldMs) page = p;
  if (!page) return null;

  const backing = preset.backing[layoutState.segName] || 'none';
  const bgRole = backing === 'pill' ? 'captionBg' : 'background';
  const light = luminance(roles[bgRole]) > 0.4;
  const emphasisRole = light ? cfg.emphasis.roleOnLight : cfg.emphasis.roleOnDark;
  const fontPx0 = cfg.fontSizePctShort * geo.ss;

  // ----- fit the line into the available width -----
  const padX = backing === 'pill' ? preset.backingStyle.pill.padXEm * fontPx0 : 0;
  const boxPad = cfg.wordBox.padXEm * fontPx0;
  const gap = 0.28 * fontPx0;
  const widths = page.words.map((w) => {
    const f = fontFor(theme, 'caption', w.text);
    return measureText(w.text, fontPx0, f.family, f.weight) + 2 * boxPad;
  });
  const total = widths.reduce((a, b) => a + b, 0) + gap * (page.words.length - 1) + 2 * padX;
  const fit = Math.min(1, layoutState.caption.maxW / Math.max(1, total));
  const fontPx = fontPx0 * fit;

  // ----- page enter/exit -----
  const startF = geo.ms2f(page.startMs - cfg.paging.leadInMs);
  const enterP = progress(frame, startF, anim.captionPageEnter.ms, geo.fps, anim.captionPageEnter.easing);
  const tEnd = page.endMs + cfg.paging.tailHoldMs;
  const nextSoon = plan.pages.some((p) => p.startMs > page.startMs && p.startMs <= tEnd + 200);
  const exitP = nextSoon ? 0 : progress(frame, geo.ms2f(tEnd - anim.captionPageExit.ms), anim.captionPageExit.ms, geo.fps, anim.captionPageExit.easing);
  const st = {...enterStyle(enterP, anim.captionPageEnter.from, geo.ss)};
  if (exitP > 0) Object.assign(st, exitStyle(exitP, anim.captionPageExit.to, geo.ss));

  // ----- word states -----
  let active = -1;
  page.words.forEach((w, i) => {
    if (t >= w.startMs - cfg.wordState.activeLeadMs) active = i;
  });

  const wh = preset.wordHighlight;
  const pill = preset.backingStyle.pill;
  const pageRtl = lineIsRtl(page.words);
  const order = visualOrder(page.words, pageRtl);
  const wordNodes = order.map((i) => {
    const w = page.words[i];
    const f = fontFor(theme, 'caption', w.text);
    const isActive = i === active;
    const isPast = i < active;
    const emph = w.emph ? roles[emphasisRole] : null;
    const upcomingRole = backing === 'gradient' ? cfg.wordState.upcomingOnFootage : cfg.wordState.upcoming;
    const color = isActive ? roles[wh.textRole] : isPast ? emph || roles[cfg.wordState.past] : emph || roles[upcomingRole];
    const sw = Math.min(1, Math.max(0, (t - (w.startMs - cfg.wordState.activeLeadMs)) / cfg.wordState.switchMs));
    const popP = isActive ? progress(frame, geo.ms2f(w.startMs - cfg.wordState.activeLeadMs), CONFIG.motion.wordPop.ms, geo.fps, CONFIG.motion.wordPop.easing) : 0;
    const popScale = isActive ? 1 + ((wh.pop || 1) - 1) * popP : 1;
    return (
      <span
        key={i}
        style={{
          display: 'inline-block',
          fontFamily: f.family,
          fontWeight: f.weight,
          fontSize: fontPx,
          lineHeight: cfg.lineHeight,
          letterSpacing: `${cfg.letterSpacingEm}em`,
          textTransform: cfg.textTransform,
          padding: `${cfg.wordBox.padYEm * fontPx}px ${cfg.wordBox.padXEm * fontPx}px`,
          borderRadius: preset.radiusPctShort.wordBox * fontPx,
          background: isActive ? withAlpha(roles[wh.fillRole], isActive ? Math.max(0.0, sw) : 0) : 'transparent',
          border: isActive && wh.outline ? outlineOf(theme, geo.ss) : `${wh.outline ? Math.max(1, preset.outlineWidthPctShort * geo.ss) : 0}px solid transparent`,
          color,
          textShadow: backing === 'gradient' && !isActive ? `0 ${cfg.wordState.footageShadow.offsetPctShort * geo.ss}px ${cfg.wordState.footageShadow.blurPctShort * geo.ss}px ${withAlpha(roles.shadow, cfg.wordState.footageShadow.alpha)}` : undefined,
          transform: `scale(${popScale})`,
          boxShadow: isActive && wh.glow ? `0 0 ${0.035 * geo.ss}px ${withAlpha(roles[wh.fillRole], 0.6)}` : undefined,
          opacity: !isActive && !isPast ? cfg.wordState.upcomingOpacity : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {w.text}
      </span>
    );
  });

  const rowStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap,
    direction: 'ltr',
    whiteSpace: 'nowrap',
  };

  const wrapStyle =
    backing === 'pill'
      ? {
          background: withAlpha(roles[pill.role], pill.alpha),
          borderRadius: preset.radiusPctShort.caption * fontPx,
          padding: `${pill.padYEm * fontPx}px ${pill.padXEm * fontPx}px`,
          border: pill.outline ? outlineOf(theme, geo.ss) : undefined,
          boxShadow: pill.hardShadow ? shadowOf(theme, geo.ss) : undefined,
        }
      : {};

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: layoutState.caption.cx,
          top: layoutState.caption.cy,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div style={st}>
          <div style={wrapStyle}>
            <div style={rowStyle}>{wordNodes}</div>
          </div>
        </div>
      </div>
      {page.translation && cfg.translation.enabled ? (
        <div
          style={{
            position: 'absolute',
            left: layoutState.caption.cx,
            top: layoutState.translation.cy,
            transform: 'translate(-50%, -50%)',
            width: layoutState.caption.maxW,
            textAlign: 'center',
            color: roles[cfg.translation.role],
            opacity: cfg.translation.opacity * (1 - exitP),
            fontFamily: fontFor(theme, 'body', page.translation).family,
            fontWeight: cfg.translation.weight,
            fontSize: cfg.translationFontSizePctShort * geo.ss,
            textShadow: cfg.translation.shadow ? `0 ${0.003 * geo.ss}px ${0.01 * geo.ss}px ${withAlpha(roles.shadow, 0.8)}` : undefined,
            direction: /[؀-ۿ]/.test(page.translation) ? 'rtl' : 'ltr',
          }}
        >
          {page.translation}
        </div>
      ) : null}
    </>
  );
};
