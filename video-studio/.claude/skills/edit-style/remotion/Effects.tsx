// @ts-nocheck
import React from 'react';
import {Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {withAlpha} from '../shared/color.js';
import {CONFIG, ease, enterStyle, exitStyle, fontFor, progress, surfaceStyle, useGeo, useTheme} from './core';

// Dark scrim for the 'gradient' caption backing (full-screen head layouts).
export const Scrim = ({layoutState}) => {
  const theme = useTheme();
  const geo = useGeo();
  const backing = theme.preset.backing[layoutState.segName];
  if (backing !== 'gradient') return null;
  const g = theme.preset.backingStyle.gradient;
  const op = Math.min(1, Math.max(0, layoutState.transitionP ?? 1)) * (layoutState.segName === 'full' ? 1 : 0);
  const h = g.heightPctFrame * geo.height;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: geo.width,
        height: h,
        opacity: op,
        background: `linear-gradient(180deg, ${g.stops.map(([pos, a]) => `${withAlpha(theme.roles[g.role], a * g.alphaBottom)} ${pos * 100}%`).join(', ')})`,
      }}
    />
  );
};

// Diagonal wipe that ends the hook title. Clipped to the graphic rect.
export const HookWipe = ({plan, layoutState}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const tr = CONFIG.transitions.hookExit;
  if (!plan.hook || !CONFIG.hook.wipeOut) return null;
  const start = geo.ms2f(plan.hook.endMs) - Math.round(geo.ms2f(tr.ms) / 2);
  const dur = Math.max(1, geo.ms2f(tr.ms));
  const t = Math.min(1, Math.max(0, (frame - start) / dur));
  if (t <= 0 || t >= 1) return null;
  const p = ease(CONFIG.animations.wipe.easing)(t);
  const g = layoutState.graphic;
  const band = g.w * 1.4;
  const x = -band + p * (g.w + 2 * band);
  return (
    <div style={{position: 'absolute', left: g.x, top: g.y, width: g.w, height: g.h, overflow: 'hidden', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top: -g.h,
          height: g.h * 3,
          width: band,
          left: x,
          background: theme.roles[tr.fillRole],
          transform: `skewX(${-tr.angleDeg}deg)`,
        }}
      />
    </div>
  );
};

// Sound effects scheduled by the planner and curated by scripts/lib/sfx.mjs. Real CC0 samples (plan.sfxMeta) win over the synthesised fallback.
// Each sample carries what the sound designer measured: its level against the voice, how long it is silent at the start (so the audible start lands on the event's frame),
// and where it really ends (so no silent tail is played). A short fade-out removes clicks at the cut.
export const Sfx = ({plan}) => {
  const geo = useGeo();
  return (
    <>
      {plan.sfx.map((s, i) => {
        const key = s.v ? `${s.type}~${s.v}` : s.type;
        const meta = (plan.sfxMeta && (plan.sfxMeta[key] || plan.sfxMeta[s.type])) || CONFIG.sound.sfx[s.type];
        if (!meta) return null;
        const vol = Math.pow(10, (meta.gainDb + (s.gDb || 0) + CONFIG.sound.voiceGainDb) / 20);
        const tail = meta.tailMs && meta.tailMs < meta.durationMs ? meta.tailMs : null;
        const onset = tail ? 0 : meta.onsetMs || 0;
        const playMs = tail || Math.max(40, (meta.effectiveMs || meta.durationMs) - onset);
        const startFrom = tail ? geo.ms2f(meta.durationMs - tail) : geo.ms2f(onset);
        // the silent head of the sample is skipped (startFrom), so its audible start lands exactly on the event's frame
        const at = s.atMs;
        const from = Math.max(0, geo.ms2f(at));
        const durF = geo.ms2f(playMs) + 3;
        const fadeF = Math.min(durF, Math.max(2, geo.ms2f(25)));
        return (
          <Sequence key={i} from={from} durationInFrames={durF} layout="none">
            <Audio src={staticFile(`sfx/${key in (plan.sfxMeta || {}) ? key : s.type}.wav`)} volume={(f) => vol * Math.min(1, (durF - f) / fadeF)} startFrom={startFrom} />
          </Sequence>
        );
      })}
    </>
  );
};

// "n/N" step counter that stays on screen from each spoken ordinal until the next one.
export const StepBadge = ({plan}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const S = CONFIG.visuals.stepBadge;
  const t = (frame / geo.fps) * 1000;
  const b = (plan.badges || []).find((x) => t >= x.startMs && t < x.endMs);
  if (!b) return null;
  const p = progress(frame, geo.ms2f(b.startMs), S.enterMs, geo.fps, 'outBack');
  const out = progress(frame, geo.ms2f(b.endMs - 160), 160, geo.fps, 'inCubic');
  const px = S.sizePctShort * geo.ss;
  const f = fontFor(theme, theme.preset.numberFont, '1');
  return (
    <div style={{position: 'absolute', right: (1 - S.xPct) * geo.width, top: S.yPct * geo.height}}>
      <div
        style={{
          ...surfaceStyle(theme, geo.ss, {radius: 'chip'}),
          ...enterStyle(p, CONFIG.animations.ctaPop.from, geo.ss),
          ...(out > 0 ? exitStyle(out, CONFIG.animations.panelExit.to, geo.ss) : {}),
          fontFamily: f.family,
          fontWeight: 800,
          fontSize: px,
          padding: `${S.padYEm * px}px ${S.padXEm * px}px`,
          lineHeight: 1,
          direction: 'ltr',
          display: 'flex',
          gap: 0.15 * px,
        }}
      >
        <span style={{color: theme.roles.accent}}>{b.n}</span>
        <span style={{opacity: 0.7}}>/</span>
        <span>{b.total}</span>
      </div>
    </div>
  );
};

// Music bed (generated by scripts/make-music.mjs or a user file). Ducks under speech, swells on the hook, fades in/out. Levels come from the tokens.
export const Music = ({plan}) => {
  const geo = useGeo();
  const m = CONFIG.sound.music;
  if (!plan.musicEnabled || !plan.media.music) return null;
  // a bed the director already leveled against the measured voice (plan.musicBalanced) needs no extra gain; otherwise the fixed level from the tokens
  // the user's music volume (plan.musicGainDb, dB): never more than 2 LU under the voice in pauses, so the voice always stays on top
  const below = plan.musicBalanced ? (plan.musicBelowLu ?? 10) : -m.gainDbRelVoice;
  // a plan made before the file carried headroom cannot go louder than the file itself without passing full volume
  const maxUp = plan.musicBalanced && plan.musicHeadroomDb === undefined ? 0 : below - 2;
  const userDb = Number.isFinite(plan.musicGainDb) ? Math.max(-30, Math.min(maxUp, plan.musicGainDb)) : 0;
  // a balanced file carries headroom (plan.musicHeadroomDb): it is turned down by that much, so the volume stays at or under 1
  const headroom = plan.musicBalanced ? plan.musicHeadroomDb || 0 : 0;
  const base = Math.pow(10, ((plan.musicBalanced ? -headroom : m.gainDbRelVoice) + CONFIG.sound.voiceGainDb + userDb) / 20);
  const duck = Math.pow(10, (plan.musicDuckDb ?? m.duckDbDuringSpeech) / 20); // the director sets how far the bed drops under speech (music level)
  const swell = Math.pow(10, Math.max(0, Math.min(m.swellDb, below - 2 - userDb)) / 20); // the hook swell shrinks when the user already raised the music
  const hookEnd = plan.hook ? plan.hook.endMs : 0;
  return (
    <Audio
      src={staticFile(plan.media.music)}
      loop
      volume={(f) => {
        const t = (f / geo.fps) * 1000;
        const speaking = plan.pages.some((p) => t >= p.startMs - m.duckAttackMs && t <= p.endMs + m.duckReleaseMs);
        const fadeIn = Math.min(1, t / m.fadeInMs);
        const fadeOut = Math.min(1, Math.max(0, (plan.durationMs - t) / m.fadeOutMs));
        const sw = hookEnd > 0 && t < hookEnd + m.swellOnHookMs ? 1 + (swell - 1) * Math.min(1, Math.max(0, (hookEnd + m.swellOnHookMs - t) / m.swellOnHookMs)) : 1;
        const duckNow = speaking && !(hookEnd > 0 && t < hookEnd) ? duck : 1;
        return base * duckNow * sw * fadeIn * fadeOut;
      }}
    />
  );
};

// Short full-frame flash on "flashCut" visuals (section title cards).
export const Flash = ({plan}) => {
  const frame = useCurrentFrame();
  const geo = useGeo();
  const theme = useTheme();
  const fl = CONFIG.transitions.flash;
  const t = (frame / geo.fps) * 1000;
  let a = 0;
  for (const v of plan.visuals) {
    if (!CONFIG.animations.swapVariants[v.variant]?.flash) continue;
    const k = (t - v.startMs) / fl.ms;
    if (k >= 0 && k < 1) a = Math.max(a, fl.alpha * (1 - k) * (1 - k));
  }
  if (a <= 0.003) return null;
  return <div style={{position: 'absolute', inset: 0, background: theme.roles[fl.role], opacity: a, pointerEvents: 'none'}} />;
};
