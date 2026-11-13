import {useEffect, useMemo, useRef, useState, type RefObject} from 'react';
import {Player, type PlayerRef} from '@remotion/player';
import {DirectorMain} from '@engine/remotion/director/DirectorMain';
import PLATFORMS from '@engine/platforms.config.json';
import {loadFonts} from '../engine/fonts';

type Zone = {label: string; top: number; bottom: number; left: number; right: number; railTop: number; railBottom: number};

// The app's own interface drawn over the frame (approximate), so you can see what the platform will cover.
const PlatformOverlay = ({platform}: {platform: string}) => {
  const z = (PLATFORMS.platforms as Record<string, Zone>)[platform];
  if (!z) return null;
  const pct = (v: number) => `${v * 100}%`;
  const shade = 'rgba(8, 10, 20, 0.55)';
  return (
    <div className="pz-overlay" aria-hidden>
      <div className="pz-zone" style={{top: 0, left: 0, right: 0, height: pct(z.top), background: shade}}>
        <span>{z.label} top bar</span>
      </div>
      <div className="pz-zone" style={{bottom: 0, left: 0, right: 0, height: pct(z.bottom), background: shade}}>
        <span>Name, caption and sound</span>
      </div>
      <div className="pz-zone pz-rail" style={{top: pct(z.railTop), bottom: pct(1 - z.railBottom), right: 0, width: pct(z.right), background: shade}}>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} />
        ))}
      </div>
      <div className="pz-safe" style={{top: pct(z.top), bottom: pct(z.bottom), left: pct(z.left), right: pct(z.left)}} />
    </div>
  );
};

// Live preview of the resolved plan: the same composition the render uses, played in the app.
// captionStyle and platform change the picture at once (they are drawn by the composition, not planned).
export const PlanPreview = ({plan, publicUrl, captionStyle, captionColors, platform, musicVolume, showZones, playerRef, onFrame}: {plan: any; publicUrl: string; captionStyle?: string; captionColors?: Record<string, string>; platform?: string; musicVolume?: number; showZones?: boolean; playerRef?: RefObject<PlayerRef | null>; onFrame?: (frame: number) => void}) => {
  // staticFile() in the composition resolves against this base, served by the app's media protocol
  (window as any).remotion_staticBase = publicUrl;
  useEffect(() => loadFonts(), []);
  const boxRef = useRef<HTMLDivElement>(null);
  const [footage, setFootage] = useState<'ok' | 'loading' | 'missing' | 'error'>('ok');
  const [attempt, setAttempt] = useState(0);
  const frames = useMemo(() => Math.max(2, Math.ceil((plan.durationMs * plan.fps) / 1000)), [plan.durationMs, plan.fps]);
  const props = useMemo(() => ({...plan, captionStyle: {...(captionStyle && captionStyle !== 'auto' ? {preset: captionStyle} : plan.captionStyle || {}), ...(captionColors && Object.keys(captionColors).length ? {colors: captionColors} : {})}, safeZone: platform || plan.safeZone || 'all', musicGainDb: Number.isFinite(musicVolume) ? musicVolume : plan.musicGainDb}), [plan, captionStyle, captionColors, platform, musicVolume]);
  useEffect(() => {
    const p = playerRef?.current;
    if (!p || !onFrame) return;
    const fn = (e: any) => onFrame(e.detail.frame);
    p.addEventListener('frameupdate', fn);
    p.addEventListener('seeked', fn);
    return () => {
      p.removeEventListener('frameupdate', fn);
      p.removeEventListener('seeked', fn);
    };
  }, [playerRef, onFrame, attempt]);
  // The player draws captions and graphics before the footage has arrived, which looks like the footage is gone.
  // Watch the footage element and say so: loading while it buffers (after a short delay, so seeks do not flash), or an error if it cannot load.
  useEffect(() => {
    let since = 0;
    let checked = '';
    const tick = () => {
      const vids = [...(boxRef.current?.querySelectorAll('video') || [])];
      const bad = vids.find((v) => v.error || v.networkState === 3);
      if (bad) {
        const src = (bad.currentSrc || bad.src || '').split('#')[0];
        if (src && checked !== src) {
          checked = src;
          // tell a missing file apart from one the player cannot read
          fetch(src, {method: 'HEAD'})
            .then((r) => setFootage(r.ok ? 'error' : 'missing'))
            .catch(() => setFootage('missing'));
        }
        return;
      }
      checked = '';
      const waiting = vids.some((v) => v.readyState < 2);
      if (!waiting) {
        since = 0;
        setFootage('ok');
      } else if (!since) since = Date.now();
      else if (Date.now() - since > 700) setFootage('loading');
    };
    const id = window.setInterval(tick, 300);
    return () => window.clearInterval(id);
  }, [attempt]);
  return (
    <div ref={boxRef} style={{position: 'absolute', inset: 0}}>
      <Player
        key={attempt}
        ref={playerRef as any}
        component={DirectorMain as any}
        inputProps={props}
        durationInFrames={frames}
        compositionWidth={plan.width}
        compositionHeight={plan.height}
        fps={plan.fps}
        controls
        loop
        clickToPlay
        acknowledgeRemotionLicense
        style={{width: '100%', height: '100%'}}
      />
      {showZones && platform && platform !== 'off' ? <PlatformOverlay platform={platform} /> : null}
      {footage === 'loading' ? (
        <div className="pv-status" role="status">
          <span className="pv-spin" aria-hidden />
          Loading your footage
        </div>
      ) : footage !== 'ok' ? (
        <div className="pv-status bad" role="alert">
          <b>{footage === 'missing' ? 'Your footage file is missing' : 'Your footage could not be played'}</b>
          <span>{footage === 'missing' ? 'Prepare the project again in Media to bring it back.' : 'The file may still be copying or be damaged. Try again in a moment.'}</span>
          <button
            className="btn secondary sm"
            onClick={() => {
              setFootage('ok');
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default PlanPreview;
