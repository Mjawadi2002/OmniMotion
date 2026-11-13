// @ts-nocheck
import React from 'react';
import {Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {CONFIG, ease, floatY, getLayout, gradientFill, isGradientOutline, outlineOf, progress, shadowOf, useGeo, useTheme} from './core';

const lerp = (a, b, t) => a + (b - a) * t;

// Resolves the animated layout at the current frame: rects interpolate over animations.layoutExpand.
export const useLayoutState = (plan) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const t = (frame / geo.fps) * 1000;
  const segs = plan.layouts;
  let idx = 0;
  for (let i = 0; i < segs.length; i++) if (segs[i].startMs <= t) idx = i;
  const seg = segs[idx];
  const cur = getLayout(geo, theme, seg.layout);
  const curCard = cur.head.mode === 'card' ? 1 : 0;
  if (idx === 0) return {...cur, headOpacity: cur.head.mode === 'none' ? 0 : 1, cardness: curCard, backdrop: cur.head.mode === 'backdrop' ? 1 : 0, segName: seg.layout};
  const prev = getLayout(geo, theme, segs[idx - 1].layout);
  const p = progress(frame, geo.ms2f(seg.startMs), CONFIG.animations.layoutExpand.ms, geo.fps, CONFIG.animations.layoutExpand.easing);
  const L = (a, b) => lerp(a, b, p);
  const prevHidden = prev.head.mode === 'none';
  const curHidden = cur.head.mode === 'none';
  const from = prevHidden ? cur.head : prev.head;
  const to = curHidden ? prev.head : cur.head;
  const head = {
    x: L(from.x, to.x),
    y: L(from.y, to.y),
    w: L(from.w, to.w),
    h: L(from.h, to.h),
    radius: L(from.radius, to.radius),
    mode: cur.head.mode,
  };
  return {
    name: cur.name,
    segName: seg.layout,
    graphic: cur.graphic,
    head,
    headOpacity: prevHidden ? p : curHidden ? 1 - p : 1,
    cardness: L(prev.head.mode === 'card' ? 1 : 0, curCard),
    backdrop: L(prev.head.mode === 'backdrop' ? 1 : 0, cur.head.mode === 'backdrop' ? 1 : 0),
    caption: {cx: L(prev.caption.cx, cur.caption.cx), cy: L(prev.caption.cy, cur.caption.cy), maxW: L(prev.caption.maxW, cur.caption.maxW)},
    translation: {cy: L(prev.translation.cy, cur.translation.cy)},
    transitionP: p,
  };
};

export const Head = ({plan, layoutState}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const t = (frame / geo.fps) * 1000;
  if (plan.media.kind !== 'video') return null;
  const h = layoutState.head;
  if (h.w <= 1 || h.h <= 1) return null;
  const shot = [...plan.shots].reverse().find((s) => s.startMs <= t) || plan.shots[0];
  const origin = CONFIG.pacing.punchOrigin;
  const crop = CONFIG.layouts.headCrop;
  const card = layoutState.cardness;
  const bd = layoutState.backdrop || 0;
  const voice = Math.pow(10, CONFIG.sound.voiceGainDb / 20);
  const xf = Math.max(1, CONFIG.pacing.silence.crossfadeFrames);
  // without silence cutting the whole file plays as one segment
  const segs = plan.media.segments && plan.media.segments.length ? plan.media.segments : [{srcStartF: 0, outStartF: 0, durF: Math.ceil((plan.durationMs * geo.fps) / 1000)}];
  const ow = Math.max(1, theme.preset.outlineWidthPctShort * geo.ss);
  const outlineBox =
    card > 0.5
      ? isGradientOutline(theme)
        ? {border: `${ow}px solid transparent`, background: gradientFill(theme), boxShadow: shadowOf(theme, geo.ss)}
        : {border: outlineOf(theme, geo.ss), boxShadow: shadowOf(theme, geo.ss)}
      : {};
  // idle motion: card float, per-shot Ken Burns drift (both flags come from the preset)
  const mo = theme.preset.motion || {};
  const bob = card > 0.5 ? floatY(theme, geo, t) : 0;
  const shotLen = Math.max(1, shot.endMs - shot.startMs);
  const sp = Math.min(1, Math.max(0, (t - shot.startMs) / shotLen));
  const kb = mo.kenBurns ? 1 + CONFIG.motion.kenBurns.maxScale * sp : 1;
  const kbX = mo.kenBurns ? CONFIG.motion.kenBurns.driftXPctShort * geo.ss * (sp - 0.5) * (shot.startMs % 2 === 0 ? 1 : -1) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: h.x,
        top: h.y,
        width: h.w,
        height: h.h,
        borderRadius: h.radius,
        overflow: 'hidden',
        boxSizing: 'border-box',
        opacity: layoutState.headOpacity,
        transform: `translateY(${bob}px)`,
        ...outlineBox,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateX(${kbX}px) scale(${shot.scale * kb * (1 + (CONFIG.stage.backdrop.scale - 1) * bd)})`,
          transformOrigin: `${origin.x * 100}% ${origin.y * 100}%`,
          filter: bd > 0.01 ? `blur(${CONFIG.stage.backdrop.blurPctShort * geo.ss * bd}px) brightness(${1 - (1 - CONFIG.stage.backdrop.brightness) * bd})` : undefined,
        }}
      >
        {segs.map((sg, i) => (
          <Sequence key={i} from={sg.outStartF} durationInFrames={sg.durF} layout="none">
            <OffthreadVideo
              src={staticFile(plan.media.file)}
              startFrom={sg.srcStartF}
              style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${crop.objectPositionX * 100}% ${crop.objectPositionY * 100}%`}}
              volume={(f) => voice * Math.min(1, (f + 1) / xf, (sg.durF - f) / xf)}
            />
          </Sequence>
        ))}
      </div>
    </div>
  );
};

// Voice track when the input is audio only.
export const VoiceOnly = ({plan}) =>
  plan.media.kind === 'audio' ? <Audio src={staticFile(plan.media.file)} volume={Math.pow(10, CONFIG.sound.voiceGainDb / 20)} /> : null;
