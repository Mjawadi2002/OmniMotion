// @ts-nocheck
import React, {useEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Captions} from './Captions';
import {buildTheme, CONFIG, ThemeContext, useGeo, useTheme} from './core';
import {Flash, HookWipe, Music, Scrim, Sfx, StepBadge} from './Effects';
import {loadFonts} from './fonts';
import {HookTitle, VISUALS, VisualWrapper} from './Graphics';
import {Head, useLayoutState, VoiceOnly} from './Head';
import {Stage} from './Stage';

const Scene = ({plan}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const layoutState = useLayoutState(plan);
  const t = (frame / geo.fps) * 1000;
  const activeVisuals = plan.visuals.filter((v) => t >= v.startMs && t < v.endMs);
  const hookActive = plan.hook && t >= plan.hook.startMs && t < plan.hook.endMs + 50;

  const angle = ((t / 1000) * CONFIG.motion.borderSpin.degPerSec) % 360;
  return (
    <AbsoluteFill style={{'--angle': `${angle}deg`}}>
      <Stage plan={plan} />
      <Head plan={plan} layoutState={layoutState} />
      <Scrim layoutState={layoutState} />
      {hookActive ? <HookTitle hook={plan.hook} rect={layoutState.graphic} /> : null}
      {activeVisuals.map((v) => {
        const C = VISUALS[v.component];
        if (!C) return null;
        return (
          <VisualWrapper key={v.id} visual={v} rect={layoutState.graphic}>
            <C visual={v} rect={layoutState.graphic} />
          </VisualWrapper>
        );
      })}
      <StepBadge plan={plan} />
      <Captions plan={plan} layoutState={layoutState} />
      <HookWipe plan={plan} layoutState={layoutState} />
      <Flash plan={plan} />
      <VoiceOnly plan={plan} />
      <Music plan={plan} />
      <Sfx plan={plan} />
    </AbsoluteFill>
  );
};

export const Main = (props) => {
  useEffect(() => {
    loadFonts();
  }, []);
  loadFonts();
  const theme = useMemo(() => buildTheme(props.palette || CONFIG.palette), [props.palette]);
  return (
    <ThemeContext.Provider value={theme}>
      <Scene plan={props} />
    </ThemeContext.Provider>
  );
};
