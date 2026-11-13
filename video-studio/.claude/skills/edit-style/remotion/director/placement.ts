// @ts-nocheck
// Where captions and graphics may sit.
// 1. The caption: the layout's caption, changed by the chosen caption style (captions.config.json) and kept inside the platform safe zone (platforms.config.json).
// 2. Graphics: never on the caption line, never under the app's own interface (top bar, bottom text, the column of buttons on the right).
// The same functions are used by the captions and by every graphic, so they always agree.
import CAPTIONS from '../../captions.config.json';
import PLATFORMS from '../../platforms.config.json';
import {D} from './bits';

// the safe zone the plan asks for (plan.safeZone: a platform id or a zone object); none when the plan says 'off'
export const safeZoneOf = (plan) => {
  const z = plan && plan.safeZone;
  if (z === 'off' || z === false) return null;
  if (z && typeof z === 'object') return z;
  return PLATFORMS.platforms[z] || PLATFORMS.platforms[PLATFORMS.default];
};

export const captionPreset = (plan) => {
  const cs = (plan && plan.captionStyle) || {};
  const base = CAPTIONS.presets[cs.preset] || {};
  return {...base, ...cs};
};

// half the height of the caption line, as a fraction of the frame
const captionHalf = (cap) => D.caption.sizeH * (cap.scale || 1) * 0.62 + 0.006;

// the layout as drawn: its caption with the style and the safe zone applied
export const effectiveLayout = (mode, plan) => {
  const lay0 = D.layouts[mode];
  if (!lay0 || !lay0.caption) return lay0;
  const st = captionPreset(plan);
  const cap = {...lay0.caption};
  if (st.karaoke !== undefined) cap.karaoke = st.karaoke;
  if (st.entitySerif !== undefined) cap.entitySerif = st.entitySerif;
  cap.scale = (lay0.caption.scale || 1) * (st.scale || 1);
  cap.upper = !!st.upper;
  cap.box = st.box || 'none';
  // colours the user picked for the caption style (any of them; the look's colours otherwise): text, accent (spoken word, names, numbers), box, boxText
  const HEX = /^#[0-9a-fA-F]{6}$/;
  cap.colors = st.colors && typeof st.colors === 'object' ? Object.fromEntries(Object.entries(st.colors).filter(([, v]) => HEX.test(String(v)))) : {};
  cap.pop = +st.pop || 0;
  cap.cy = lay0.caption.cy + (+st.offsetY || 0);
  cap.cx = 0.5;
  const z = safeZoneOf(plan);
  if (z) {
    const half = captionHalf(cap);
    cap.cy = Math.min(1 - z.bottom - half, Math.max(z.top + half, cap.cy));
    // the line stays clear of the button column: centred between the left margin and the column when it crosses it
    if (cap.cy + half > z.railTop && cap.cy - half < z.railBottom) {
      cap.cx = (z.left + (1 - z.right)) / 2;
      cap.maxW = Math.min(cap.maxW || 0.92, 1 - z.right - z.left - 0.02);
    }
  }
  return {...lay0, caption: cap};
};

export const captionBand = (lay) => {
  if (!lay || !lay.caption) return null;
  const half = captionHalf(lay.caption);
  return {top: lay.caption.cy - half, bottom: lay.caption.cy + half};
};

// keep a rectangle (pixels) inside the safe zone: below the top bar, above the bottom text, left of the button column
const fitSafe = (r, z, geo) => {
  if (!z) return r;
  const W = geo.width;
  const H = geo.height;
  let {x, y, w, h} = r;
  const top = z.top * H;
  const bottom = (1 - z.bottom) * H;
  if (h > bottom - top) h = bottom - top;
  if (y < top) y = top;
  if (y + h > bottom) y = bottom - h;
  const left = z.left * W;
  if (x < left) {
    w -= left - x;
    x = left;
  }
  const crossesRail = y + h > z.railTop * H && y < z.railBottom * H;
  const right = (crossesRail ? 1 - z.right : 1 - z.left) * W;
  if (x + w > right) {
    const over = x + w - right;
    // slide left first, then narrow
    const slide = Math.min(over, x - left);
    x -= slide;
    w -= over - slide;
  }
  return {x, y, w: Math.max(w, 0.2 * W), h: Math.max(h, 0.06 * H)};
};

// no graphic on the caption line: above it when there is room, else shrunk above it, else below it
const avoidCaptions = (r, lay, geo, z) => {
  const band = captionBand(lay);
  if (!band) return r;
  const top = band.top * geo.height;
  const bottom = band.bottom * geo.height;
  const overlap = Math.min(r.y + r.h, bottom) - Math.max(r.y, top);
  if (overlap <= 0.005 * geo.height) return r;
  const minY = Math.max(0.06, z ? z.top : 0) * geo.height;
  const maxY = (z ? 1 - z.bottom : 0.98) * geo.height;
  const gap = 0.012 * geo.height;
  const above = top - gap - r.h;
  if (above >= minY) return {...r, y: above};
  if (r.y < top && top - gap - Math.max(r.y, minY) >= r.h * 0.5) {
    const y = Math.max(r.y, minY);
    return {...r, y, h: top - gap - y};
  }
  const below = bottom + gap;
  if (below + r.h <= maxY) return {...r, y: below};
  if (maxY - below >= r.h * 0.5) return {...r, y: below, h: maxY - below};
  return {...r, y: minY, h: Math.max(0.06 * geo.height, top - gap - minY)};
};

// the final place of a graphic: inside the safe zone and off the captions (the second pass keeps the result inside the zone)
export const placeRect = (r, lay, plan, geo) => {
  const z = safeZoneOf(plan);
  let out = fitSafe(r, z, geo);
  out = avoidCaptions(out, lay, geo, z);
  out = fitSafe(out, z, geo);
  // the zone pushed it back onto the captions: cut it at the caption line
  const band = captionBand(lay);
  if (band) {
    const top = band.top * geo.height;
    const bottom = band.bottom * geo.height;
    const gap = 0.012 * geo.height;
    if (Math.min(out.y + out.h, bottom) - Math.max(out.y, top) > 0.005 * geo.height) {
      if (out.y + out.h / 2 < (top + bottom) / 2) out = {...out, h: Math.max(0.05 * geo.height, top - gap - out.y)};
      else {
        const y = bottom + gap;
        out = {...out, y, h: Math.max(0.05 * geo.height, out.y + out.h - y)};
      }
    }
  }
  return out;
};
