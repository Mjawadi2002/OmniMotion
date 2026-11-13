// @ts-nocheck
import React from 'react';
import {Composition} from 'remotion';
import {CONFIG} from './core';
import {Main} from './Main';
import {StoryMain} from './story/StoryMain';
import {DirectorMain} from './director/DirectorMain';

// Minimal default plan so the Studio can open the composition without a job (size/duration from the tokens file).
// Real renders pass --props=<job>/plan.json produced by scripts/run.mjs.
const [aw, ah] = CONFIG.output.aspects[CONFIG.output.defaultAspect];
const ss = CONFIG.output.shortSide;
const emptyMs = CONFIG.output.studioPlaceholderMs;
const emptyPlan = {
  palette: CONFIG.palette,
  fps: CONFIG.output.fps,
  width: Math.round(aw <= ah ? ss : (ss * aw) / ah),
  height: Math.round(aw <= ah ? (ss * ah) / aw : ss),
  durationMs: emptyMs,
  media: {kind: 'none', file: null},
  hook: null,
  layouts: [{startMs: 0, endMs: emptyMs, layout: 'graphicOnly'}],
  shots: [{startMs: 0, endMs: emptyMs, scale: 1}],
  pages: [],
  visuals: [],
  sfx: [],
};

export const Root = () => (
  <>
  <Composition
    id="Main"
    component={Main}
    width={emptyPlan.width}
    height={emptyPlan.height}
    fps={emptyPlan.fps}
    durationInFrames={Math.ceil((emptyPlan.durationMs * emptyPlan.fps) / 1000)}
    defaultProps={emptyPlan}
    calculateMetadata={({props}) => ({
      durationInFrames: Math.max(1, Math.ceil((props.durationMs * props.fps) / 1000)),
      fps: props.fps,
      width: props.width,
      height: props.height,
    })}
  />
  <Composition
    id="Story"
    component={StoryMain}
    width={emptyPlan.width}
    height={emptyPlan.height}
    fps={emptyPlan.fps}
    durationInFrames={Math.ceil((emptyPlan.durationMs * emptyPlan.fps) / 1000)}
    defaultProps={{...emptyPlan, cues: {}, storyWords: [], pages: []}}
    calculateMetadata={({props}) => ({
      durationInFrames: Math.max(1, Math.ceil((props.durationMs * props.fps) / 1000)),
      fps: props.fps,
      width: props.width,
      height: props.height,
    })}
  />
  <Composition
    id="Director"
    component={DirectorMain}
    width={emptyPlan.width}
    height={emptyPlan.height}
    fps={emptyPlan.fps}
    durationInFrames={Math.ceil((emptyPlan.durationMs * emptyPlan.fps) / 1000)}
    defaultProps={{...emptyPlan, layouts: [{startMs: 0, endMs: 3000, mode: 'lightHead'}], titles: [], sections: [], graphics: [], chunks: [], pages: [], media: {kind: 'none'}}}
    calculateMetadata={({props}) => ({
      durationInFrames: Math.max(1, Math.ceil((props.durationMs * props.fps) / 1000)),
      fps: props.fps,
      width: props.width,
      height: props.height,
    })}
  />
  </>
);