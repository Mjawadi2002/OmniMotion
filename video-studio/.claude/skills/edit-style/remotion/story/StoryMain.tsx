// @ts-nocheck
// The animated short: scenes drawn in SVG, locked to word timings (plan.cues), captions/sfx/music/voice from the editing skill.
import React, {useEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Captions} from '../Captions';
import {buildTheme, CONFIG, ThemeContext, fontFor, useGeo, useTheme} from '../core';
import {Music, Sfx} from '../Effects';
import {loadFonts} from '../fonts';
import {VoiceOnly} from '../Head';
import {StoryCtx} from './art';
import {InkCtx, clamp01, easeInOut, easeOut, lerp, rnd, win} from './ink';
import {SCENES} from './scenes';

const EASE = {linear: (t) => t, outCubic: easeOut, inOutCubic: easeInOut};

const useGrain = (size, dots) =>
  useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    for (let i = 0; i < dots; i++) {
      const x = ((rnd(i * 2.3) + 1) / 2) * size;
      const y = ((rnd(i * 5.1 + 7) + 1) / 2) * size;
      const r = 0.6 + Math.abs(rnd(i * 1.7)) * 1.6;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return c.toDataURL('image/png');
  }, [size, dots]);

const Scene = ({plan}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const S = CONFIG.story;
  const roles = theme.roles;
  const tMs = (frame / geo.fps) * 1000;
  const C = (id) => (plan.cues[id] !== undefined ? plan.cues[id] : 0);

  // emotion track with blended transitions
  const track = useMemo(() => S.emotionTrack.map((e) => ({ms: C(e.cue), emo: S.emotions[e.emotion]})).sort((a, b) => a.ms - b.ms), [plan.cues]);
  const emo = (t) => {
    let i = 0;
    track.forEach((e, k) => {
      if (e.ms <= t) i = k;
    });
    const cur = track[i].emo;
    const prev = (track[i - 1] || track[i]).emo;
    const b = easeInOut(win(t, track[i].ms, track[i].ms + S.emotionBlendMs));
    const out = {};
    Object.keys(cur).forEach((k) => {
      out[k] = Array.isArray(cur[k]) ? [lerp(prev[k][0], cur[k][0], b), lerp(prev[k][1], cur[k][1], b)] : lerp(prev[k], cur[k], b);
    });
    return out;
  };

  // layout: the 1080 design square is the safe stage; portrait puts it above the captions, landscape centres it
  const portrait = geo.height > geo.width;
  const L = S.layout[portrait ? 'portrait' : 'landscape'];
  const scale = portrait ? geo.width / S.designSize : geo.height / S.designSize;
  const cy = L.stageCy * geo.height;
  const vbW = geo.width / scale;
  const vbH = geo.height / scale;
  const vbX = S.designSize / 2 - vbW / 2;
  const vbY = S.designSize / 2 - cy / scale;

  // shot + camera
  const shot = S.shots.find((s) => tMs >= C(s.from) && tMs < C(s.to)) || S.shots[S.shots.length - 1];
  const a = C(shot.from);
  const b = Math.max(a + 1, C(shot.to));
  const p = (EASE[shot.camera.easing] || easeInOut)(win(tMs, a, b));
  const cam = {s: lerp(shot.camera.from.s, shot.camera.to.s, p), x: lerp(shot.camera.from.x, shot.camera.to.x, p), y: lerp(shot.camera.from.y, shot.camera.to.y, p)};
  const Scn = SCENES[shot.id];

  const ink = S.ink;
  const ctx = {tMs, C, roles, theme, family: fontFor(theme, 'display', 'A').family, mono: fontFor(theme, 'mono', 'A').family, sizes: S.sizes, texts: S.texts, emo, words: plan.storyWords};
  const inkCtx = {step: Math.floor((tMs / 1000) * ink.boilFps), w: ink.widthDesign, amp: ink.wobbleDesign, ink: roles[ink.role]};
  const grain = useGrain(ink.grain.size, ink.grain.dots);
  const gstep = inkCtx.step;

  // scene boundaries: motion hides the cut (swoosh, snip, page flip)
  const overlays = S.boundaries.map((bd, i) => {
    const T = S.transitions[bd.type];
    const pp = win(tMs, C(bd.at) - T.ms / 2, C(bd.at) + T.ms / 2);
    if (pp <= 0 || pp >= 1) return null;
    const color = roles[T.role];
    if (bd.type === 'swoosh') {
      const bandW = geo.width * 0.9;
      const x = lerp(-bandW * 1.5, geo.width + bandW * 0.8, easeInOut(pp));
      return <div key={i} style={{position: 'absolute', top: -geo.height, height: geo.height * 3, width: bandW, left: x, background: color, transform: `skewX(${-T.angleDeg}deg)`}} />;
    }
    if (bd.type === 'snip') {
      const f = Math.sin(pp * Math.PI);
      const teeth = (up) => {
        const n = 14;
        const pts = [up ? '0% 0%' : '0% 100%', up ? '100% 0%' : '100% 100%'];
        for (let k = n; k >= 0; k--) pts.push(`${(k / n) * 100}% ${up ? (k % 2 ? 100 : 82) : (k % 2 ? 0 : 18)}%`);
        return `polygon(${pts.join(',')})`;
      };
      return (
        <React.Fragment key={i}>
          <div style={{position: 'absolute', left: 0, top: 0, width: geo.width, height: (geo.height / 2) * f * 1.02, background: color, clipPath: teeth(true)}} />
          <div style={{position: 'absolute', left: 0, bottom: 0, width: geo.width, height: (geo.height / 2) * f * 1.02, background: color, clipPath: teeth(false)}} />
        </React.Fragment>
      );
    }
    return <div key={i} style={{position: 'absolute', left: 0, top: 0, width: geo.width, height: geo.height, background: color, transform: `scaleX(${Math.sin(pp * Math.PI)})`}} />;
  });

  const layoutState = {segName: 'storyCaption', caption: {cx: L.caption.cx * geo.width, cy: L.caption.cy * geo.height, maxW: L.caption.maxW * geo.width}, translation: {cy: L.caption.cy * geo.height}};

  return (
    <AbsoluteFill style={{background: roles[shot.bg]}}>
      <StoryCtx.Provider value={ctx}>
        <InkCtx.Provider value={inkCtx}>
          <svg width={geo.width} height={geo.height} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} style={{position: 'absolute', left: 0, top: 0}}>
            <g transform={`translate(540 540) scale(${cam.s}) translate(${-cam.x} ${-cam.y})`}>
              <Scn tMs={tMs} />
            </g>
          </svg>
        </InkCtx.Provider>
      </StoryCtx.Provider>
      {overlays}
      {grain ? <div style={{position: 'absolute', inset: 0, backgroundImage: `url(${grain})`, backgroundSize: `${ink.grain.size}px ${ink.grain.size}px`, backgroundPosition: `${(rnd(gstep * 3.1) * ink.grain.jitterPx).toFixed(1)}px ${(rnd(gstep * 5.7) * ink.grain.jitterPx).toFixed(1)}px`, opacity: ink.grain.alpha, pointerEvents: 'none'}} /> : null}
      <Captions plan={plan} layoutState={layoutState} />
      <VoiceOnly plan={plan} />
      <Music plan={plan} />
      <Sfx plan={plan} />
    </AbsoluteFill>
  );
};

export const StoryMain = (props) => {
  loadFonts();
  useEffect(() => {
    loadFonts();
  }, []);
  const theme = useMemo(() => buildTheme(props.palette || CONFIG.palette), [props.palette]);
  return (
    <ThemeContext.Provider value={theme}>
      <Scene plan={props} />
    </ThemeContext.Provider>
  );
};
