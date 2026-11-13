// @ts-nocheck
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {withAlpha} from '../shared/color.js';
import {CONFIG, useGeo, useTheme} from './core';

const rng = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// Beat-synced pulse (0..1). Uses the music bpm when a bed is present, otherwise motion.pulse.bpmFallback.
const pulseOf = (tMs, bpm) => 0.5 + 0.5 * Math.cos(2 * Math.PI * ((tMs / 1000) * (bpm / 60)));

const Aurora = ({plan}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const {roles, preset} = theme;
  const A = CONFIG.stage.aurora;
  const tMs = (frame / geo.fps) * 1000;
  const bpm = plan?.musicBpm || CONFIG.motion.pulse.bpmFallback;
  const pulse = preset.motion?.pulse ? 1 + CONFIG.motion.pulse.amount * (pulseOf(tMs, bpm) - 0.5) * 2 : 1;
  const W = geo.width;
  const H = geo.height;
  const ss = geo.ss;

  const particles = React.useMemo(() => {
    const r = rng(A.particles.seed);
    return Array.from({length: A.particles.count}, () => ({
      x: r(),
      y: r(),
      size: A.particles.sizePctShort[0] + r() * (A.particles.sizePctShort[1] - A.particles.sizePctShort[0]),
      speed: A.particles.speedPctShortPerSec[0] + r() * (A.particles.speedPctShortPerSec[1] - A.particles.speedPctShortPerSec[0]),
      phase: r() * Math.PI * 2,
      role: A.particles.roles[Math.floor(r() * A.particles.roles.length)],
    }));
  }, [geo.ss]);

  const gridSp = CONFIG.stage.dotGrid.spacingPctShort * ss;
  const gridDot = CONFIG.stage.dotGrid.radiusPctShort * ss;
  const gridShift = ((tMs / 1000) * A.grid.driftPctShortPerSec * ss) % gridSp;
  const beam = A.beam;
  const beamW = beam.widthPct * W;
  const beamX = (((tMs / beam.periodMs) % 1) * (W + beamW * 3)) - beamW * 1.5;

  return (
    <AbsoluteFill style={{background: `linear-gradient(180deg, ${roles[CONFIG.stage.gradient.stops[0]]} 0%, ${roles[CONFIG.stage.gradient.stops[1]]} 100%)`, overflow: 'hidden'}}>
      {A.blobs.map((b, i) => {
        const t = (2 * Math.PI * tMs) / b.periodMs;
        const cx = (b.cx + b.ax * Math.sin(t + b.phase)) * W;
        const cy = (b.cy + b.ay * Math.cos(t * 0.77 + b.phase)) * H;
        const d = b.sizePctShort * ss;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: cx - d / 2,
              top: cy - d / 2,
              width: d,
              height: d,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${withAlpha(roles[b.role], Math.min(1, b.alpha * pulse))} 0%, ${withAlpha(roles[b.role], 0)} 68%)`,
            }}
          />
        );
      })}
      {beam.enabled ? (
        <div
          style={{
            position: 'absolute',
            left: beamX,
            top: -H * 0.5,
            width: beamW,
            height: H * 2,
            transform: `rotate(${beam.angleDeg}deg)`,
            background: `linear-gradient(90deg, ${withAlpha(roles[beam.role], 0)}, ${withAlpha(roles[beam.role], beam.alpha * pulse)}, ${withAlpha(roles[beam.role], 0)})`,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle, ${withAlpha(roles.text, preset.stage.gridOpacity)} ${gridDot}px, transparent ${gridDot + 0.5}px)`,
          backgroundSize: `${gridSp}px ${gridSp}px`,
          backgroundPosition: `${gridShift}px ${-gridShift}px`,
        }}
      />
      {particles.map((p, i) => {
        const y = (((p.y - (tMs / 1000) * p.speed) % 1) + 1) % 1;
        const x = p.x + 0.015 * Math.sin((2 * Math.PI * tMs) / 7000 + p.phase);
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((2 * Math.PI * tMs) / A.particles.twinkleMs + p.phase));
        const d = p.size * ss;
        return <div key={i} style={{position: 'absolute', left: x * W, top: y * H, width: d, height: d, borderRadius: '50%', background: roles[p.role], opacity: A.particles.alpha * tw, boxShadow: `0 0 ${d * 3}px ${withAlpha(roles[p.role], 0.6)}`}} />;
      })}
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, transparent 45%, ${withAlpha(roles.background, A.vignette.alpha)} 100%)`}} />
    </AbsoluteFill>
  );
};

// Background layer. Style (aurora | arcs | dotgrid-glow) comes from the palette's preset.
export const Stage = ({plan}) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const geo = useGeo();
  const {roles, preset} = theme;
  const st = CONFIG.stage;
  const tMs = (frame / geo.fps) * 1000;
  const style = preset.stage.backgroundStyle;

  if (style === 'aurora') return <Aurora plan={plan} />;

  if (style === 'arcs') {
    const sizes = st.arcs.sizesPctShort.slice(0, st.arcs.count);
    const bpm = plan?.musicBpm || CONFIG.motion.pulse.bpmFallback;
    const drift = preset.motion?.float ? st.arcsDrift : {ampPctShort: 0, periodMs: 1};
    return (
      <AbsoluteFill style={{background: roles.background, overflow: 'hidden'}}>
        {sizes.map((s, i) => {
          const d = s * geo.ss * 2 * (1 + (preset.motion?.pulse ? 0.015 * Math.sin((2 * Math.PI * (tMs / 1000) * bpm) / 60) : 0));
          const cx = (i % 2 === 0 ? geo.width * 1.0 : 0) + drift.ampPctShort * geo.ss * Math.sin((2 * Math.PI * tMs) / drift.periodMs + i * 1.7);
          const cy = geo.height * (0.18 + i * 0.28) + drift.ampPctShort * geo.ss * Math.cos((2 * Math.PI * tMs) / (drift.periodMs * 1.2) + i);
          return <div key={i} style={{position: 'absolute', left: cx - d / 2, top: cy - d / 2, width: d, height: d, borderRadius: '50%', background: roles.shape, opacity: 0.85}} />;
        })}
      </AbsoluteFill>
    );
  }

  const base = {background: `linear-gradient(180deg, ${roles[st.gradient.stops[0]]} 0%, ${roles[st.gradient.stops[1]]} 100%)`};
  const sp = st.dotGrid.spacingPctShort * geo.ss;
  const dot = st.dotGrid.radiusPctShort * geo.ss;
  return (
    <AbsoluteFill style={{...base, overflow: 'hidden'}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${st.glow.cx * 100}% ${st.glow.cy * 100}%, ${withAlpha(roles.glow, preset.stage.glowAlpha)} 0%, transparent ${st.glow.radiusPctShort * 50}%)`}} />
      <AbsoluteFill style={{backgroundImage: `radial-gradient(circle, ${withAlpha(roles.text, preset.stage.gridOpacity)} ${dot}px, transparent ${dot + 0.5}px)`, backgroundSize: `${sp}px ${sp}px`}} />
    </AbsoluteFill>
  );
};
