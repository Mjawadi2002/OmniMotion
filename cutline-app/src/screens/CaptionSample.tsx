// A live sample of a caption style for the style picker: the same few words, the spoken word moving along, drawn the way the style
// will look in the video, in the colours the user picked (or the default ones).
import {useEffect, useState} from 'react';

const WORDS = ['your', 'idea', 'matters'];

// one shared clock for every sample on the page
let listeners: ((n: number) => void)[] = [];
let tick = 0;
let timer: number | null = null;
const useTick = () => {
  const [n, setN] = useState(tick);
  useEffect(() => {
    listeners.push(setN);
    if (timer === null)
      timer = window.setInterval(() => {
        tick += 1;
        listeners.forEach((l) => l(tick));
      }, 520);
    return () => {
      listeners = listeners.filter((l) => l !== setN);
      if (!listeners.length && timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return n;
};

export const CaptionSample = ({style, colors = {}}: {style: string; colors?: Partial<Record<'text' | 'accent' | 'box', string>>}) => {
  const n = useTick();
  const text = colors.text || '#FFFFFF';
  const accent = colors.accent || '#FFD23F';
  const box = colors.box || '#111111';
  const cycle = WORDS.length + 1; // a short pause after the last word
  const i = n % cycle; // the word being spoken (WORDS.length = pause)
  const font = 'Inter, system-ui, sans-serif';
  const stage = (children: React.ReactNode, align: 'center' | 'flex-end' = 'center') => (
    <div aria-hidden style={{height: 76, borderRadius: 8, marginBottom: 8, background: 'radial-gradient(ellipse at 50% 30%, #1f2a52, #0a0f22)', display: 'flex', alignItems: align, justifyContent: 'center', paddingBottom: align === 'flex-end' ? 8 : 0, overflow: 'hidden'}}>
      {children}
    </div>
  );

  if (style === 'none') {
    return stage(
      <div style={{display: 'flex', gap: 6, alignItems: 'flex-end'}}>
        {[18, 30, 44].map((h, k) => (
          <div key={k} style={{width: 14, height: k <= i % 3 ? h : 6, borderRadius: 3, background: k === 2 ? accent : '#3B5BFF', transition: 'height .35s cubic-bezier(.2,1.4,.4,1)'}} />
        ))}
      </div>,
    );
  }
  if (style === 'karaoke') {
    return stage(
      <div style={{font: `800 15px ${font}`, color: text, letterSpacing: -0.2}}>
        {WORDS.map((w, k) => (
          <span key={k} style={{color: k <= i && i < WORDS.length ? accent : text, transition: 'color .15s', marginRight: 4}}>
            {w}
          </span>
        ))}
      </div>,
    );
  }
  // the chunk on screen: the word being spoken and the ones before it
  const shown = WORDS.map((w, k) => ({w, k, on: i < WORDS.length && k <= i, now: k === i}));
  if (style === 'label') {
    return stage(
      <div style={{background: '#F2ECDD', border: '2px solid #141414', boxShadow: '3px 3px 0 #141414', padding: '3px 9px 4px', font: `900 15px ${font}`, color: '#141414', transform: `rotate(${i % 2 ? 0.8 : -0.8}deg)`, opacity: i < WORDS.length ? 1 : 0.25, transition: 'opacity .2s'}}>
        {shown.map(({w, k, on}) => (
          <span key={k} style={{color: k === 1 ? colors.accent || '#C8262C' : '#141414', opacity: on ? 1 : 0.2, marginRight: 4}}>
            {w}
          </span>
        ))}
      </div>,
    );
  }
  if (style === 'boxed') {
    return stage(
      <div style={{background: colors.box || 'rgba(10,12,24,.85)', borderRadius: 999, padding: '4px 12px', font: `700 15px ${font}`, color: text, opacity: i < WORDS.length ? 1 : 0.25, transition: 'opacity .2s'}}>
        {shown.map(({w, k, on}) => (
          <span key={k} style={{opacity: on ? 1 : 0.25, marginRight: 4}}>
            {w}
          </span>
        ))}
      </div>,
    );
  }
  if (style === 'minimal') {
    return stage(
      <div style={{font: `500 11px ${font}`, color: text, opacity: 0.9}}>
        {shown.map(({w, k, on}) => (
          <span key={k} style={{opacity: on ? 1 : 0.2, marginRight: 3}}>
            {w}
          </span>
        ))}
      </div>,
      'flex-end',
    );
  }
  if (style === 'highlight') {
    return stage(
      <div style={{font: `800 15px ${font}`, color: text}}>
        {shown.map(({w, k, on, now}) => (
          <span key={k} style={{opacity: on ? 1 : 0.2, marginRight: 4, padding: '1px 5px', borderRadius: 4, background: now ? accent : 'transparent', color: now ? box : text, transition: 'background .12s'}}>
            {w}
          </span>
        ))}
      </div>,
    );
  }
  if (style === 'bold') {
    return stage(
      <div style={{font: `900 17px ${font}`, color: text, textTransform: 'uppercase', letterSpacing: -0.3, textShadow: '0 2px 6px rgba(0,0,0,.5)'}}>
        {shown.map(({w, k, on, now}) => (
          <span key={k} style={{opacity: on ? 1 : 0.15, color: now ? accent : text, marginRight: 5}}>
            {w}
          </span>
        ))}
      </div>,
    );
  }
  // kinetic (default): each word springs in on its own, the key word bigger in the accent colour
  return stage(
    <div style={{font: `900 16px ${font}`, color: text, display: 'flex', alignItems: 'baseline', gap: 5}}>
      {shown.map(({w, k, on, now}) => (
        <span key={k} style={{display: 'inline-block', color: k === 1 ? accent : text, fontSize: k === 1 ? 21 : 16, opacity: on ? 1 : 0, transform: on ? `translateY(0) scale(${now ? 1.12 : 1})` : 'translateY(10px) scale(.6)', transition: 'transform .32s cubic-bezier(.2,1.6,.4,1), opacity .2s'}}>
          {w}
        </span>
      ))}
    </div>,
  );
};
