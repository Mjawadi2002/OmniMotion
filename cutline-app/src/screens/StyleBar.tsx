import {useEffect, useRef, useState} from 'react';
import {ArrowCounterClockwise, Eye, EyeSlash} from '@phosphor-icons/react';
import CAPTIONS from '@engine/captions.config.json';
import PLATFORMS from '@engine/platforms.config.json';
import type {Project} from '../lib/api';

type Preset = {label: string; description: string; karaoke: boolean; scale: number; upper: boolean; box: string; pop: number};
const PRESETS = CAPTIONS.presets as Record<string, Preset>;
const PLATFORM_LIST = PLATFORMS.platforms as Record<string, {label: string}>;

// a small sample of each caption style, drawn with plain CSS so the choice is visible before it is picked
const Sample = ({p}: {p: Preset}) => {
  const words = ['say', 'this', 'out'];
  return (
    <span className="cap-sample" data-box={p.box} style={{fontSize: `${Math.round(10 * Math.min(p.scale, 1.12) * 10) / 10}px`}}>
      {words.map((w, i) => {
        const on = i === 1 && (p.karaoke || p.box === 'word');
        return (
          <b key={w} data-on={on || undefined} data-box={on && p.box === 'word' ? 'word' : undefined} style={on && p.pop ? {transform: `scale(${1 + p.pop})`, margin: '0 3px'} : undefined}>
            {p.upper ? w.toUpperCase() : w}
          </b>
        );
      })}
    </span>
  );
};

// The caption style and the platform the reel is made for. Both change the preview at once and are kept with the project (and used for the render).
// the caption colours you can pick, with what each one paints (the look's colours are used for any left unset)
type CapColor = 'text' | 'accent' | 'box' | 'boxText';
const COLOR_LABEL: Record<CapColor, string> = {text: 'Text', accent: 'Highlight', box: 'Word box', boxText: 'Text in box'};
const COLOR_HINT: Record<CapColor, string> = {text: 'The words of the caption', accent: 'Names, numbers and the spoken word', box: 'The box behind the spoken word', boxText: 'The spoken word inside its box'};
const COLOR_DEFAULT: Record<CapColor, string> = {text: '#FFFFFF', accent: '#FFD23F', box: '#FFD23F', boxText: '#111111'};

const CaptionColors = ({project, set, style}: {project: Project; set: (p: Partial<Project['settings']>) => unknown; style: string}) => {
  const saved = project.settings?.captionColors || {};
  const [cc, setCc] = useState<Partial<Record<CapColor, string>>>(saved);
  const timer = useRef<number | null>(null);
  useEffect(() => setCc(project.settings?.captionColors || {}), [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const boxed = PRESETS[style]?.box === 'word';
  const keys: CapColor[] = boxed ? ['text', 'box', 'boxText', 'accent'] : ['text', 'accent'];
  const change = (k: CapColor, v: string) => {
    const next = {...cc, [k]: v};
    setCc(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => set({captionColors: next}), 220); // the preview follows while you drag the picker
  };
  const reset = () => {
    setCc({});
    set({captionColors: {}});
  };
  const custom = Object.keys(cc).length > 0;
  return (
    <div className="stack" style={{gap: 'var(--sp-2)'}}>
      <div className="row between">
        <span className="label-sm">Caption colours</span>
        {custom ? (
          <button className="btn ghost sm" onClick={reset} title="Use the look's colours again">
            <ArrowCounterClockwise size={14} aria-hidden /> Look's colours
          </button>
        ) : null}
      </div>
      <div className="cap-colors">
        {keys.map((k) => (
          <label key={k} className="cap-color" title={COLOR_HINT[k]} data-auto={!cc[k] || undefined}>
            <input type="color" value={cc[k] || COLOR_DEFAULT[k]} onChange={(e) => change(k, e.target.value.toUpperCase())} aria-label={`${COLOR_LABEL[k]} colour: ${COLOR_HINT[k]}`} />
            <span>{COLOR_LABEL[k]}</span>
            <span className="mono faint">{cc[k] || "look's"}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

// music volume: dB on top of the level the engine set against your voice (the composition keeps the voice on top, whatever the value)
const VOL_MIN = -18;
const VOL_MAX = 8;
const volWord = (v: number) => (v <= -12 ? 'Very low' : v <= -4 ? 'Low' : v < 0 ? 'A little lower' : v === 0 ? 'Default' : v <= 3 ? 'A little higher' : 'High');

export const StyleBar = ({project, persist, showZones, onShowZones, hasMusic, musicNeedsRebuild, musicVolume, onMusicVolume}: {project: Project; persist?: (p: Project) => Promise<unknown>; showZones: boolean; onShowZones: (v: boolean) => void; hasMusic?: boolean; musicNeedsRebuild?: boolean; musicVolume?: number; onMusicVolume?: (v: number | null) => void}) => {
  const style = project.settings?.captionStyle || 'auto';
  const platform = project.settings?.platform || 'all';
  const set = (patch: Partial<Project['settings']>) => persist && persist({...project, settings: {...project.settings, ...patch}});
  const vol = musicVolume ?? project.settings?.musicVolume ?? 0;
  // the slider moves the preview at once; the value is saved when you let go
  const commitVol = (v: number) => {
    if (v === (project.settings?.musicVolume ?? 0)) return onMusicVolume?.(null);
    Promise.resolve(set({musicVolume: v})).finally(() => onMusicVolume?.(null));
  };
  return (
    <div className="style-bar stack" style={{gap: 'var(--sp-3)'}}>
      {onMusicVolume ? (
        <div className="stack" style={{gap: 'var(--sp-2)'}}>
          <div className="row between">
            <label className="label-sm" htmlFor="music-vol">
              Music volume
            </label>
            {hasMusic ? (
              <span className="row" style={{gap: 'var(--sp-2)', alignItems: 'center'}}>
                <span className="mono" style={{fontSize: 'var(--fs-xs)'}}>
                  {volWord(vol)} ({vol > 0 ? '+' : ''}
                  {vol} dB)
                </span>
                {vol !== 0 ? (
                  <button className="btn ghost sm" onClick={() => commitVol(0)} disabled={!persist} title="Back to the level set against your voice">
                    Reset
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
          {hasMusic ? (
            <>
              <input
                id="music-vol"
                className="vol-range"
                type="range"
                min={VOL_MIN}
                max={VOL_MAX}
                step={1}
                value={vol}
                disabled={!persist}
                aria-valuetext={`${volWord(vol)}, ${vol} decibels`}
                onChange={(e) => onMusicVolume(Number(e.target.value))}
                onPointerUp={(e) => commitVol(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => commitVol(Number((e.target as HTMLInputElement).value))}
              />
              <span className="help">Play the preview and drag to hear it. Your voice always stays louder than the music. The render uses this volume too.</span>
              {musicNeedsRebuild && vol > 0 ? <span className="help" style={{color: 'var(--accent)'}}>This preview was built before the volume control existed, so it can only go lower. Save and preview once to make it louder too (the render already can).</span> : null}
            </>
          ) : (
            <span className="help">
              No music in this edit. Attach a track in <a href={`#/project/${project.id}/media`}>Media</a>, then build the preview again.
            </span>
          )}
        </div>
      ) : null}
      <div className="stack" style={{gap: 'var(--sp-2)'}}>
        <div className="row between">
          <span className="label-sm">Captions</span>
          {style !== 'auto' ? (
            <button className="btn ghost sm" onClick={() => set({captionStyle: 'auto'})} title="Use the caption style of the look">
              Use the look's
            </button>
          ) : null}
        </div>
        <div className="cap-grid" role="radiogroup" aria-label="Caption style">
          {Object.entries(PRESETS).map(([id, p]) => {
            const active = style === id;
            return (
              <button key={id} role="radio" aria-checked={active} className="cap-chip" data-active={active || undefined} onClick={() => set({captionStyle: id})} title={p.description} disabled={!persist}>
                <Sample p={p} />
                <span className="cap-name">{p.label}</span>
              </button>
            );
          })}
        </div>
        <span className="help">{style === 'auto' ? 'Following the look (or the reference it was studied from). Pick one to override.' : PRESETS[style]?.description}</span>
      </div>
      {persist ? <CaptionColors project={project} set={set} style={style} /> : null}
      <div className="row wrap" style={{gap: 'var(--sp-2)', alignItems: 'center'}}>
        <label className="label-sm" htmlFor="platform">
          Made for
        </label>
        <select id="platform" className="select sm" style={{width: 'auto', flex: 1, minWidth: 150}} value={platform} onChange={(e) => set({platform: e.target.value as Project['settings']['platform']})} disabled={!persist}>
          {Object.entries(PLATFORM_LIST).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
          <option value="off">Anywhere (no safe zone)</option>
        </select>
        <button className="btn secondary sm" onClick={() => onShowZones(!showZones)} aria-pressed={showZones} disabled={platform === 'off'} title="Show what the app covers">
          {showZones ? <EyeSlash size={14} aria-hidden /> : <Eye size={14} aria-hidden />} {showZones ? 'Hide' : 'Show'} app overlay
        </button>
      </div>
      <span className="help">Graphics and captions stay out of the areas the app covers. The overlay shows them on the preview; it is never rendered.</span>
    </div>
  );
};
