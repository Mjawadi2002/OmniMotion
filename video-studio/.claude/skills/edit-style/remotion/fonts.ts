// @ts-nocheck
// Loads local npm font packages (@fontsource/*) into the document before any frame is rendered, so renders work offline.
import {continueRender, delayRender} from 'remotion';
import config from '../style.config.json';

const ctx = require.context('../../../../node_modules/@fontsource', true, /files\/[a-z0-9-]+-(latin|latin-ext|arabic)-(400|500|600|700|800)-(normal|italic)\.woff2$/);
const urls = {};
ctx.keys().forEach((k) => {
  urls[k.split('/').pop()] = ctx(k);
});

let started = false;
export const loadFonts = () => {
  if (started) return;
  started = true;
  const handle = delayRender('Loading local fonts');
  const jobs = [];
  for (const [family, def] of Object.entries(config.fonts.registry)) {
    for (const weight of def.weights) {
      for (const style of def.styles || ['normal']) for (const subset of def.subsets) {
        const file = `${def.package}-${subset}-${weight}-${style}.woff2`;
        const url = urls[file];
        if (!url) continue;
        const face = new FontFace(family, `url(${url})`, {
          weight: String(weight),
          style,
          unicodeRange: config.fonts.subsetRanges[subset],
        });
        jobs.push(face.load().then((f) => document.fonts.add(f)));
      }
    }
  }
  Promise.all(jobs)
    .then(() => document.fonts.ready)
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error('Font load failed', e);
      continueRender(handle);
    });
};
