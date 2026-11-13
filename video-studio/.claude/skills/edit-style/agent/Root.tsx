// Registers the agent-built composition. Do not edit: write Composition.tsx instead.
import React from 'react';
import {Composition as Comp} from 'remotion';
import {Composition, TOTAL_MS} from './Composition';
import TL from './timeline.json';

export const AgentRoot: React.FC = () => (
  <Comp id="Agent" component={Composition} durationInFrames={Math.max(30, Math.ceil((TOTAL_MS / 1000) * 30))} fps={30} width={(TL as any).width || 1080} height={(TL as any).height || 1920} />
);
