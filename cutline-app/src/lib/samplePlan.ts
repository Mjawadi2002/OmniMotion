// A short, fixed sample edit used to preview a look with the real composition: captions with emphasis, a word slam,
// a pill list, a count-up number and a quote card (tech), or a topic title, a window card and captions (light).
import type {Look} from './api';

export const SAMPLE_W = 576;
export const SAMPLE_H = 1024;
export const SAMPLE_FPS = 30;
export const SAMPLE_MS = 6000;

const words = (text: string, start: number, step: number, flags: Record<number, {entity?: boolean; num?: boolean}>) =>
  text.split(' ').map((t, i) => ({text: t, startMs: start + i * step, endMs: start + i * step + step - 40, ...(flags[i] || {})}));

const chunk = (ws: ReturnType<typeof words>, size: number) => {
  const out: {startMs: number; endMs: number; words: typeof ws}[] = [];
  for (let i = 0; i < ws.length; i += size) {
    const part = ws.slice(i, i + size);
    out.push({startMs: part[0].startMs, endMs: part[part.length - 1].endMs + 300, words: part});
  }
  return out;
};

export const buildSamplePlan = (look: Pick<Look, 'family' | 'roles' | 'fonts' | 'grade'>, face?: unknown) => {
  const tech = look.family === 'tech';
  const ws = tech ? words('This is how your captions and numbers look', 300, 380, {6: {entity: true}, 5: {entity: true}}) : words('This is how your video looks with a clear title', 300, 380, {4: {entity: true}, 3: {entity: true}});
  const chunks = chunk(ws, 3);
  const base: Record<string, unknown> = {
    palette: tech ? 'tech' : 'personal',
    gradeName: tech ? 'tech' : 'personal',
    look: {label: 'preview', roles: look.roles, fonts: look.fonts, grade: look.grade},
    fps: SAMPLE_FPS,
    width: SAMPLE_W,
    height: SAMPLE_H,
    durationMs: SAMPLE_MS,
    media: {kind: 'video', file: 'look-sample.mp4', ...(face ? {face} : {})},
    zooms: [],
    ghosts: [],
    sections: [],
    sfx: [],
    pages: [],
    shots: [],
    clips: {},
    chunks,
    musicEnabled: false,
    brandTag: '',
  };
  if (tech) {
    return {
      ...base,
      layouts: [
        {mode: 'techHead', startMs: 0, endMs: 2700},
        {mode: 'techDemo', startMs: 2700, endMs: SAMPLE_MS},
      ],
      titles: [],
      graphics: [
        {id: 's', mode: 'techHead', slot: 'mid', kind: 'slam', startMs: 450, endMs: 2500, content: {text: 'Your look', tone: 'ink'}, overlays: []},
        {id: 'q', mode: 'techDemo', kind: 'quote2', startMs: 2900, endMs: SAMPLE_MS, content: {text: 'This is how it feels'}, overlays: []},
        {id: 'p', mode: 'techDemo', slot: 'lower', kind: 'pills', startMs: 3000, endMs: SAMPLE_MS, content: {items: [{text: 'Captions', icon: 'check', atMs: 3200}, {text: 'Numbers', icon: 'bolt', atMs: 3900}, {text: 'Cards', icon: 'star', atMs: 4600}]}, overlays: []},
      ],
    };
  }
  return {
    ...base,
    layouts: [{mode: 'lightHead', startMs: 0, endMs: SAMPLE_MS}],
    titles: [{startMs: 350, endMs: 3000, line1: 'How your video', highlight: 'looks', stickers: ['spark']}, {startMs: 3100, endMs: SAMPLE_MS, line1: 'with a clear', highlight: 'title', stickers: ['star']}],
    ghosts: [{startMs: 350, endMs: 3000, text: 'LOOKS'}],
    graphics: [{id: 'b', mode: 'lightHead', kind: 'browser', title: 'Your look', startMs: 3100, endMs: SAMPLE_MS, content: {heading: 'Your look', selection: 'look', selectAtMs: 3600, lines: 3}, overlays: []}],
  };
};
