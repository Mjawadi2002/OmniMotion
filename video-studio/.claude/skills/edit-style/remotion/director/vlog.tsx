// @ts-nocheck
// Vlog layer: a timeline of full-screen shots cut to the narration (crossfades, slow push-ins, optional pan / blur fill, ambient sound kept low).
import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {withAlpha} from '../../shared/color.js';
import {ease, useGeo} from '../core';
import {D} from './bits';

const lerp = (a, b, t) => a + (b - a) * t;

const ShotView = ({sh, clip, xf, index, durF}) => {
  const f = useCurrentFrame();
  const geo = useGeo();
  const V = D.vlog;
  const p = Math.min(1, Math.max(0, f / Math.max(1, durF)));
  const fadeF = Math.max(1, Math.round((xf * geo.fps) / 1000));
  const op = xf > 0 ? Math.min(1, f / fadeF) : 1;
  const z = sh.zoom || (index % 2 ? [V.zoom[1], V.zoom[0]] : V.zoom);
  const pop = sh.fx === 'zoom' ? 1 + 0.16 * (1 - ease('outCubic')(Math.min(1, f / Math.max(1, Math.round(0.32 * geo.fps))))) : 1;
  const scale = lerp(z[0], z[1], ease('inOutCubic')(p)) * pop;
  const px = Array.isArray(sh.posX) ? sh.posX : sh.posX !== undefined ? [sh.posX, sh.posX] : clip.portrait ? [0.5, 0.5] : V.pan;
  const posX = lerp(px[0], px[1], p) * 100;
  const gain = Math.pow(10, (sh.ambientDb ?? V.ambientDb) / 20);
  const startFrom = Math.round((sh.srcStartMs / 1000) * geo.fps);
  const vid = (style, muted) => <OffthreadVideo src={staticFile(clip.file)} startFrom={startFrom} playbackRate={sh.speed || 1} muted={muted || !clip.hasAudio} volume={gain} style={style} />;
  const fill = {position: 'absolute', inset: 0, width: '100%', height: '100%'};
  return (
    <AbsoluteFill style={{opacity: op}}>
      {sh.fit === 'blur' ? (
        <>
          <div style={{position: 'absolute', inset: -40, filter: 'blur(28px) brightness(0.55)', transform: 'scale(1.1)'}}>{vid({...fill, objectFit: 'cover'}, true)}</div>
          <div style={{position: 'absolute', inset: 0, transform: `scale(${scale})`}}>{vid({...fill, objectFit: 'contain'}, false)}</div>
        </>
      ) : (
        <div style={{position: 'absolute', inset: 0, transform: `scale(${scale})`, transformOrigin: '50% 45%'}}>{vid({...fill, objectFit: 'cover', objectPosition: `${posX}% 50%`}, false)}</div>
      )}
    </AbsoluteFill>
  );
};

export const VlogLayer = ({plan}) => {
  const geo = useGeo();
  const V = D.vlog;
  const grade = (plan.look && plan.look.grade) || (D.grade && D.grade[plan.gradeName || 'vlog']) || null;
  const shots = plan.shots || [];
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {shots.map((sh, i) => {
        const clip = plan.clips[sh.clipId];
        if (!clip) return null;
        const xf = sh.fx === 'cut' || i === 0 ? 0 : V.xfMs;
        const startMs = Math.max(0, sh.startMs - xf);
        const from = geo.ms2f(startMs);
        const durF = Math.max(2, geo.ms2f(sh.endMs) - from + 2);
        return (
          <Sequence key={i} from={from} durationInFrames={durF} layout="none">
            <div style={{position: 'absolute', inset: 0, filter: grade ? `contrast(${grade.contrast}) saturate(${grade.saturate}) brightness(${grade.brightness})` : undefined}}>
              <ShotView sh={sh} clip={clip} xf={xf} index={i} durF={durF} />
            </div>
          </Sequence>
        );
      })}
      {grade ? (
        <>
          <div style={{position: 'absolute', inset: 0, background: grade.tint, opacity: grade.tintAlpha, mixBlendMode: 'soft-light', pointerEvents: 'none'}} />
          <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,${grade.vignette}) 100%)`, pointerEvents: 'none'}} />
        </>
      ) : null}
      {/* soft shade under the captions so white text reads on bright footage */}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%', background: 'linear-gradient(0deg, rgba(0,0,0,0.38), transparent)', pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};
