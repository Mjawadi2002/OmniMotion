// Standalone preview page for an agent-built composition: the app shows it in a sandboxed frame (no access to the app).
// Built by `agent.mjs preview` with esbuild. Do not edit.
import './storage-shim';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import {Audio, staticFile} from 'remotion';
import {Composition, TOTAL_MS} from '../Composition';
import TL from '../timeline.json';
import type {PlayerRef} from '@remotion/player';

// tell the app (parent window) when the preview is ready or what broke: the frame is sandboxed, so this is the only channel
const report = (type: string, message = '') => {
  try {
    window.parent.postMessage({source: 'omnimotion-agent-preview', type, message: String(message).slice(0, 600)}, '*');
  } catch {
    // no parent
  }
};
window.addEventListener('error', (e) => report('error', e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e: any) => report('error', String((e.reason && e.reason.message) || e.reason)));

// staticFile('cut.mp4') resolves next to this page: <workspace>/public/
(window as any).remotion_staticBase = new URL('../public', location.href).pathname.replace(/\/$/, '');

const frames = Math.max(30, Math.ceil((TOTAL_MS / 1000) * 30));

// the sound of the final render (voice levelled, music ducked under it, effects, -14 LUFS), mixed by `agent.mjs preview`; empty when there is none
declare const __PREVIEW_SOUND__: string;
const SOUND = typeof __PREVIEW_SOUND__ === 'string' ? __PREVIEW_SOUND__ : '';
const WithSound: React.FC = (props: any) => (
  <>
    <Composition {...props} />
    {SOUND ? <Audio src={staticFile(SOUND)} /> : null}
  </>
);
const W = (TL as any).width || 1080;
const H = (TL as any).height || 1920;

class Boundary extends React.Component<{children: React.ReactNode}, {error: string | null}> {
  state = {error: null as string | null};
  static getDerivedStateFromError(e: any) {
    return {error: String((e && e.message) || e)};
  }
  render() {
    if (this.state.error) {
      report('error', this.state.error);
      return <div style={{color: '#ffb4b4', font: '14px system-ui', padding: 16}}>The composition crashed: {this.state.error}</div>;
    }
    return this.props.children;
  }
}

// the app's timeline seeks the preview, and the preview tells the timeline where the playhead is
const App = () => {
  const ref = React.useRef<PlayerRef>(null);
  React.useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data || {};
      if (d.source !== 'omnimotion-app') return;
      if (d.type === 'seek' && ref.current) ref.current.seekTo(Math.max(0, Math.min(frames - 1, Math.round((Number(d.ms) / 1000) * 30))));
      if (d.type === 'play' && ref.current) ref.current.play();
      if (d.type === 'pause' && ref.current) ref.current.pause();
    };
    window.addEventListener('message', onMsg);
    let last = 0;
    const p = ref.current;
    const onFrame = (ev: any) => {
      const now = Date.now();
      if (now - last < 120) return;
      last = now;
      report('frame', String(Math.round((ev.detail.frame / 30) * 1000)));
    };
    p?.addEventListener('frameupdate', onFrame);
    p?.addEventListener('seeked', onFrame);
    return () => {
      window.removeEventListener('message', onMsg);
      p?.removeEventListener('frameupdate', onFrame);
      p?.removeEventListener('seeked', onFrame);
    };
  }, []);
  return (
    <Boundary>
      <Player ref={ref} component={WithSound} durationInFrames={frames} fps={30} compositionWidth={W} compositionHeight={H} controls clickToPlay style={{width: '100%', height: '100%'}} acknowledgeRemotionLicense />
    </Boundary>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
setTimeout(() => report('ready'), 0);
