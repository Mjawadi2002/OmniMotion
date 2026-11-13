#!/usr/bin/env node
// Asset layer: fetches the story-related assets that Claude lists in assets_plan.json (logos, website screenshots, licensed photos).
// Everything stays traceable: every file gets a source URL + licence line in assets_manifest.json, and the edit report lists them.
//
//   node scripts/assets.mjs --plan <assets_plan.json> --out <public/assets dir> [--only id1,id2]
//
// assets_plan.json = [{id, type, ...}]
//   {"id":"mailchimp","type":"logo","slug":"mailchimp"}                      Simple Icons (CC0 icon set; the marks stay property of their owners)
//   {"id":"athens","type":"photo","query":"Acropolis Athens","orientation":"portrait|landscape"}   Wikimedia Commons, only CC0 / public domain / CC BY / CC BY-SA, attribution recorded
//   {"id":"repo","type":"screenshot","url":"https://github.com/...","width":1280,"height":900,"scrollY":0}  public page captured in headless Chrome
//   {"id":"mine","type":"file","from":"C:/path/image.png"}                    a file you provided
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
const UA = 'edit-style-asset-fetcher/1.0 (personal video editing tool)';
const get = async (url, asBuffer = false) => {
  const r = await fetch(url, {headers: {'User-Agent': UA}});
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return asBuffer ? Buffer.from(await r.arrayBuffer()) : r.text();
};
const findChrome = () => [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => p && fs.existsSync(p));
const OK_LICENSE = /^(cc0|public domain|pd|cc[ -]by(?!-nc)|cc[ -]by-sa|attribution)/i;
const strip = (h) => (h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export const fetchAssets = async ({plan, outDir, only}) => {
  fs.mkdirSync(outDir, {recursive: true});
  const manifest = [];
  for (const a of plan) {
    if (only && !only.includes(a.id)) continue;
    try {
      if (a.type === 'logo') {
        const svg = await get(`https://cdn.simpleicons.org/${encodeURIComponent(a.slug || a.id)}`);
        const file = `${a.id}.svg`;
        fs.writeFileSync(path.join(outDir, file), svg);
        manifest.push({id: a.id, file, type: 'logo', source: `https://simpleicons.org (${a.slug || a.id})`, license: 'Simple Icons, CC0 icon set; trademark belongs to its owner'});
      } else if (a.type === 'photo') {
        const q = encodeURIComponent(a.query);
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}%20filetype:bitmap&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280&format=json&origin=*`;
        const j = JSON.parse(await get(url));
        const pages = Object.values(j.query?.pages || {}).map((p) => ({...p.imageinfo?.[0], title: p.title})).filter((i) => i.thumburl);
        const rank = (i) => {
          const lic = i.extmetadata?.LicenseShortName?.value || '';
          const orient = i.height > i.width ? 'portrait' : 'landscape';
          return (/^(cc0|public domain)/i.test(lic) ? 0 : 1) + (a.orientation && a.orientation !== orient ? 2 : 0) + (i.width < 1200 ? 3 : 0);
        };
        const pick = pages.filter((i) => OK_LICENSE.test(i.extmetadata?.LicenseShortName?.value || '')).sort((x, y) => rank(x) - rank(y))[0];
        if (!pick) throw new Error(`no freely licensed photo found for "${a.query}"`);
        const ext = path.extname(new URL(pick.thumburl).pathname) || '.jpg';
        const file = `${a.id}${ext}`;
        fs.writeFileSync(path.join(outDir, file), await get(pick.thumburl, true));
        manifest.push({id: a.id, file, type: 'photo', source: pick.descriptionurl, license: pick.extmetadata?.LicenseShortName?.value, author: strip(pick.extmetadata?.Artist?.value), attribution_required: !/^(cc0|public domain)/i.test(pick.extmetadata?.LicenseShortName?.value || '')});
      } else if (a.type === 'screenshot') {
        const exe = findChrome();
        if (!exe) throw new Error('no Chrome/Edge found for screenshots; pass the screenshot as a file asset instead');
        const file = `${a.id}.png`;
        const w = a.width || 1280;
        const h = a.height || 900;
        const r = spawnSync(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--force-device-scale-factor=${a.scale || 2}`, `--virtual-time-budget=${a.waitMs || 6000}`, `--screenshot=${path.join(outDir, file)}`, a.url], {encoding: 'utf8', timeout: 60000});
        if (!fs.existsSync(path.join(outDir, file))) throw new Error(`screenshot failed: ${(r.stderr || '').slice(0, 200)}`);
        manifest.push({id: a.id, file, type: 'screenshot', source: a.url, license: 'screenshot of a public web page, used as an on-screen reference'});
      } else if (a.type === 'file') {
        const file = `${a.id}${path.extname(a.from)}`;
        fs.copyFileSync(a.from, path.join(outDir, file));
        manifest.push({id: a.id, file, type: 'file', source: a.from, license: 'provided by the user'});
      } else throw new Error(`unknown asset type ${a.type}`);
      console.log(`asset ${a.id}: ok (${a.type})`);
    } catch (e) {
      console.warn(`asset ${a.id}: FAILED (${e.message})`);
      manifest.push({id: a.id, type: a.type, error: e.message});
    }
  }
  fs.writeFileSync(path.join(path.dirname(outDir), 'assets_manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) args[v[i].slice(2)] = v[i + 1] && !v[i + 1].startsWith('--') ? v[++i] : true;
  if (!args.plan || !args.out) {
    console.log('usage: node scripts/assets.mjs --plan assets_plan.json --out <dir> [--only a,b]');
    process.exit(1);
  }
  const m = await fetchAssets({plan: JSON.parse(fs.readFileSync(path.resolve(args.plan), 'utf8')), outDir: path.resolve(args.out), only: args.only ? args.only.split(',') : null});
  console.log(JSON.stringify(m, null, 2));
}
