// @ts-nocheck
// Preview-side replacement for the engine's webpack font loader: same registry, same faces, loaded from this app's @fontsource packages.
import {continueRender, delayRender} from 'remotion';
import config from '@engine/style.config.json';

const urls: Record<string, string> = {};
const found = import.meta.glob('/node_modules/@fontsource/*/files/*-{latin,arabic}-{400,500,600,700,800}-{normal,italic}.woff2', {query: '?url', import: 'default', eager: true});
for (const [k, v] of Object.entries(found)) urls[k.split('/').pop()!] = v as string;

let started = false;
export const loadFonts = () => {
  if (started) return;
  started = true;
  const handle = delayRender('Loading local fonts');
  const jobs: Promise<unknown>[] = [];
  for (const [family, def] of Object.entries(config.fonts.registry) as [string, any][]) {
    for (const weight of def.weights) {
      for (const style of def.styles || ['normal']) {
        for (const subset of def.subsets) {
          const file = `${def.package}-${subset}-${weight}-${style}.woff2`;
          const url = urls[file];
          if (!url) continue;
          const face = new FontFace(family, `url(${url})`, {weight: String(weight), style, unicodeRange: config.fonts.subsetRanges[subset]});
          jobs.push(face.load().then((f) => document.fonts.add(f)));
        }
      }
    }
  }
  Promise.all(jobs)
    .then(() => document.fonts.ready)
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
};
