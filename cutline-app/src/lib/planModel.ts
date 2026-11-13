// The edit plan as the UI edits it. Field definitions mirror the engine's plan schema (docs/PLAN_SCHEMA.md).
import {normalize} from '@engine/shared/text.js';
import type {Project, Word} from './api';

export type Anchor = 'start' | 'end' | {ms: number} | {at: string; n?: number; end?: boolean; lead?: number} | {after: number};

export const nz = (t: string) => (normalize(t || '') as string).replace(/[^\p{L}\p{N}]/gu, '');

export const stripP = (t: string) => t.replace(/^[“”"'`´’‘«».,!?;:،؛؟…()\[\]{}]+|[“”"'`´’‘«».,!?;:،؛؟…()\[\]{}]+$/g, '').trim();

export const anchorFromWord = (words: Word[], idx: number, end = false, lead = end ? 700 : -250): Anchor => {
  const k = nz(words[idx].text);
  let n = 0;
  for (let i = 0; i <= idx; i++) if (nz(words[i].text) === k) n++;
  const a: {at: string; n?: number; end?: boolean; lead?: number} = {at: stripP(words[idx].text), lead};
  if (n > 1) a.n = n;
  if (end) a.end = true;
  return a;
};

export const describeAnchor = (a: Anchor | undefined): string => {
  if (a === undefined || a === null) return 'not set';
  if (a === 'start') return 'start of video';
  if (a === 'end') return 'end of video';
  if (typeof a === 'object' && 'ms' in a) return `${(a.ms / 1000).toFixed(2)} s`;
  if (typeof a === 'object' && 'after' in a) return `${(a.after / 1000).toFixed(1)} s after the start of this beat`;
  if (typeof a === 'object' && 'at' in a) return `${a.end ? 'end of ' : ''}"${a.at}"${a.n ? ` (no. ${a.n})` : ''}${a.lead ? `, ${a.lead > 0 ? '+' : ''}${a.lead} ms` : ''}`;
  return 'not set';
};

export type FieldType = 'text' | 'select' | 'bool' | 'number' | 'list';
export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  cols?: Field[];
  wide?: boolean;
  help?: string;
}

const tone = {key: 'tone', label: 'Tone', type: 'select', options: ['amber', 'white', 'green', 'red', 'blue']} as Field;
const ICONS = ['check', 'bolt', 'star', 'spark', 'cash', 'coin', 'face', 'cursor'];

export const MOTION_SCENES = ['clock', 'timeline', 'growth', 'rocket', 'target', 'bulb', 'bubbles', 'network', 'layers', 'cube', 'orbit', 'coin'];

export const KINDS: Record<string, {label: string; hint: string; fields: Field[]; defaults: Record<string, unknown>; slot?: string; tech?: boolean}> = {
  motion: {label: 'Motion graphic', hint: 'An animated 2D or 3D element above you that illustrates what you say', fields: [{key: 'scene', label: 'Scene', type: 'select', options: MOTION_SCENES, help: 'clock: time, timeline: a journey, growth: results, rocket: launch, target: a goal, bulb: an idea, bubbles: talking, network: connections, layers: a stack (3D), cube: a set of things (3D), orbit: an ecosystem (3D), coin: money (3D)'}, {key: 'label', label: 'Caption', type: 'text', help: 'A word or two you say'}, {key: 'value', label: 'Number', type: 'text', help: 'A number you say'}, {key: 'unit', label: 'Unit', type: 'text', help: 'For example years, tools'}, {key: 'items', label: 'Pieces', type: 'list', wide: true, cols: [{key: 'label', label: 'Word', type: 'text'}]}], defaults: {scene: 'orbit', label: '', items: [{label: ''}, {label: ''}, {label: ''}]}},
  slam: {label: 'Word slam', hint: 'One big word over your face', slot: 'mid', fields: [{key: 'text', label: 'Word', type: 'text'}, {key: 'tone', label: 'Colour', type: 'select', options: ['ink', 'blue', 'amber']}, {key: 'strike', label: 'Strike through', type: 'bool'}], defaults: {text: '', tone: 'ink'}},
  chip: {label: 'Price chip', hint: 'Brand and price at the top', slot: 'top', fields: [{key: 'name', label: 'Name', type: 'text'}, {key: 'price', label: 'Price', type: 'text'}, {key: 'sub', label: 'Small line', type: 'text'}, {key: 'strike', label: 'Strike the price', type: 'bool'}], defaults: {name: '', price: ''}},
  stats: {label: 'Numbers', hint: 'Count-up figures', slot: 'full', fields: [{key: 'items', label: 'Figures', type: 'list', wide: true, cols: [{key: 'value', label: 'Value', type: 'text'}, {key: 'label', label: 'Label', type: 'text'}, {...tone}]}, {key: 'support', label: 'Line under', type: 'text'}], defaults: {items: [{value: '', label: '', tone: 'amber'}]}},
  pills: {label: 'Pill list', hint: 'Items that appear as you say them', slot: 'lower', fields: [{key: 'items', label: 'Items', type: 'list', wide: true, cols: [{key: 'text', label: 'Text', type: 'text'}, {key: 'icon', label: 'Icon', type: 'select', options: ICONS}]}], defaults: {items: [{text: '', icon: 'check'}]}},
  flow: {label: 'Timeline', hint: 'Steps joined by a line', fields: [{key: 'steps', label: 'Steps', type: 'list', wide: true, cols: [{key: 'text', label: 'Text', type: 'text'}]}], defaults: {steps: [{text: ''}]}},
  split: {label: 'Before and after', hint: 'Two panels, the first struck out', fields: [{key: 'a.label', label: 'First label', type: 'text'}, {key: 'a.text', label: 'First text', type: 'text'}, {key: 'b.label', label: 'Second label', type: 'text'}, {key: 'b.text', label: 'Second text', type: 'text'}], defaults: {a: {label: '', text: ''}, b: {label: '', text: ''}}},
  quote2: {label: 'Quote card', hint: 'A line you say, with a quote mark', fields: [{key: 'text', label: 'Quote', type: 'text', wide: true}], defaults: {text: ''}},
  place: {label: 'Place pin', hint: 'A map pin for a place you name', fields: [{key: 'name', label: 'Place', type: 'text'}], defaults: {name: ''}},
  ring: {label: 'Rating ring', hint: 'A score out of ten', slot: 'full', fields: [{key: 'value', label: 'Score', type: 'number'}, {key: 'of', label: 'Out of', type: 'number'}, {key: 'label', label: 'Label', type: 'text'}], defaults: {value: 7, of: 10, label: ''}},
  sting: {label: 'Warning card', hint: 'Caution tape sting', slot: 'full', fields: [{key: 'text', label: 'Text', type: 'text'}], defaults: {text: ''}},
  cta: {label: 'Comment keyword', hint: 'Ending call to action', slot: 'full', fields: [{key: 'keyword', label: 'Keyword', type: 'text'}, {key: 'line', label: 'Line', type: 'text'}], defaults: {keyword: '', line: ''}},
  tag: {label: 'Label tag', hint: 'Small place or time label', slot: 'top', fields: [{key: 'text', label: 'Text', type: 'text'}], defaults: {text: ''}},
  image: {label: 'Image window', hint: 'A picture in a browser window', fields: [{key: 'src', label: 'Image or clip', type: 'select', options: []}, {key: 'pan', label: 'Scroll', type: 'select', options: ['', 'down', 'up']}, {key: 'zoom', label: 'Push-in', type: 'number'}], defaults: {src: '', fit: 'cover', zoom: 0.08}},
  video: {label: 'Video window', hint: 'One of your extra clips in a window', fields: [{key: 'src', label: 'Video', type: 'select', options: []}, {key: 'startAtMs', label: 'Start inside the clip (ms)', type: 'number'}], defaults: {src: '', fit: 'cover', startAtMs: 0}},
  browser: {label: 'Page card', hint: 'A page built from your words', fields: [{key: 'heading', label: 'Heading', type: 'text'}, {key: 'selection', label: 'Highlighted part', type: 'text'}], defaults: {heading: '', selection: '', lines: 3}},
  quote: {label: 'Quote (light)', hint: 'A short quote in a card', fields: [{key: 'text', label: 'Quote', type: 'text', wide: true}], defaults: {text: ''}},
  stat: {label: 'Number (light)', hint: 'One count-up number', fields: [{key: 'value', label: 'Value', type: 'text'}, {key: 'label', label: 'Label', type: 'text'}], defaults: {value: '', label: ''}},
  list: {label: 'List (light)', hint: 'Rows in a card', fields: [{key: 'rows', label: 'Rows', type: 'list', wide: true, cols: [{key: 'name', label: 'Text', type: 'text'}]}], defaults: {rows: [{name: ''}]}},
  steps: {label: 'Steps (light)', hint: 'Numbered steps', fields: [{key: 'items', label: 'Steps', type: 'list', wide: true, cols: [{key: 'text', label: 'Text', type: 'text'}]}], defaults: {items: [{text: ''}]}},
};

export const kindsFor = (project: Project) => (project.mode === 'vlog' ? ['motion', 'tag', 'slam', 'stats', 'quote2', 'pills', 'place', 'image'] : project.style === 'tech' ? ['motion', 'slam', 'chip', 'stats', 'pills', 'flow', 'split', 'quote2', 'place', 'ring', 'sting', 'cta', 'image', 'video'] : ['motion', 'image', 'video', 'browser', 'quote', 'stat', 'list', 'steps']);

export const modesFor = (project: Project) => (project.mode === 'vlog' ? ['vlog'] : project.style === 'tech' ? ['techHead', 'techDemo'] : ['lightHead', 'lightSection', 'darkDemo']);
export const defaultModeFor = (project: Project) => (project.mode === 'vlog' ? 'vlog' : project.style === 'tech' ? 'techHead' : 'lightHead');
export const SLOTS = ['', 'main', 'lower', 'full', 'mid', 'top', 'stats', 'phone', 'wide', 'tile'];

export const getPath = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
export const setPath = (o: any, path: string, v: unknown) => {
  const ks = path.split('.');
  const out = {...o};
  let cur = out;
  ks.forEach((k, i) => {
    if (i === ks.length - 1) cur[k] = v;
    else {
      cur[k] = {...(cur[k] || {})};
      cur = cur[k];
    }
  });
  return out;
};

export const newBeat = (project: Project, kind: string, from: Anchor, to: Anchor, existing: any[]) => {
  const k = KINDS[kind];
  const mode = kind === 'motion' ? defaultModeFor(project) : project.mode === 'vlog' ? 'vlog' : project.style === 'tech' ? (['slam', 'chip', 'cta'].includes(kind) && kind !== 'cta' ? 'techHead' : 'techDemo') : 'lightHead';
  let id = `${kind}-${existing.length + 1}`;
  while (existing.some((g) => g.id === id)) id += '-b';
  return {id, mode, ...(k.slot ? {slot: k.slot} : {}), kind, from, to, content: JSON.parse(JSON.stringify(k.defaults))};
};

// before saving: give list items their own anchors (the first spoken word of each item) so they appear as the speaker says them
export const finalizePlan = (plan: any, words: Word[] | null) => {
  const out = JSON.parse(JSON.stringify(plan));
  const find = (text: string) => {
    if (!words) return null;
    const first = nz(String(text).split(/\s+/)[0]);
    return first && words.some((w) => nz(w.text) === first) ? stripP(String(text).split(/\s+/)[0]) : null;
  };
  for (const g of out.graphics || []) {
    for (const key of ['items', 'steps']) {
      for (const it of g.content?.[key] || []) {
        if (it.at || !it.text) continue;
        const f = find(it.text);
        if (f) it.at = {at: f};
      }
    }
  }
  return out;
};

// Where an anchor lands on the edited timeline: the same rules as the engine (scripts/lib/directorPlan.mjs makeResolver), so the timeline shows
// a graphic where the render will put it, even before the plan is saved.
export const makeAnchorResolver = (words: Word[], durationMs: number) => {
  const keys = words.map((w) => nz(w.text));
  const find = (phrase: string, n = 1) => {
    const toks = String(phrase).split(/\s+/).map(nz).filter(Boolean);
    if (!toks.length) return -1;
    let seen = 0;
    for (let i = 0; i + toks.length <= keys.length; i++) {
      if (toks.every((t, k) => keys[i + k] === t)) {
        seen++;
        if (seen === n) return i;
      }
    }
    return -1;
  };
  return (a: any, base: number, fallback: number): number => {
    if (a === undefined || a === null) return fallback;
    if (typeof a === 'number') return a;
    if (a === 'start') return 0;
    if (a === 'end') return durationMs;
    if (typeof a === 'string') a = {at: a};
    if (a.ms !== undefined) return a.ms + (a.lead || 0);
    if (a.after !== undefined) return base + a.after;
    if (a.atIndex !== undefined && words[a.atIndex]) return words[a.atIndex].startMs + (a.lead || 0);
    const i = find(a.at, a.n || 1);
    if (i < 0) return fallback;
    const len = String(a.at).split(/\s+/).filter(Boolean).length;
    const w = a.end ? words[Math.min(words.length - 1, i + len - 1)].endMs : words[i].startMs;
    return w + (a.lead || 0);
  };
};

// the word nearest to a time: its start (for a beginning) or its end (for an end)
export const nearestWord = (words: Word[], ms: number, end = false) => {
  let best = -1;
  let bd = Infinity;
  words.forEach((w, i) => {
    const d = Math.abs((end ? w.endMs : w.startMs) - ms);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
};
