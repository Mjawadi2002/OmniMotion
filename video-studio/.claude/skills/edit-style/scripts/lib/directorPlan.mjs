// edit_plan.json (authored by Claude, or drafted by autoPlan) -> resolved plan.json for the Director composition.
// Anchors are WORDS of the transcript, so the plan survives silence cuts and re-timing.
import {dominantScript, isRtlScript, normalize, scriptOf, stripPunct} from '../../shared/text.js';

export const nz = (t) => normalize(t || '').replace(/[^\p{L}\p{N}]/gu, '');

// ---------------------------------------------------------------- anchors
export const makeResolver = (words, durationMs) => {
  const keys = words.map((w) => nz(w.text));
  const find = (phrase, n = 1) => {
    const toks = String(phrase).split(/\s+/).map(nz).filter(Boolean);
    let seen = 0;
    for (let i = 0; i + toks.length <= keys.length; i++) {
      if (toks.every((t, k) => keys[i + k] === t)) {
        seen++;
        if (seen === n) return i;
      }
    }
    return -1;
  };
  const resolve = (a, ctx = {}) => {
    if (a === undefined || a === null) return ctx.fallback;
    if (typeof a === 'number') return a;
    if (a === 'start') return 0;
    if (a === 'end') return durationMs;
    if (typeof a === 'string') a = {at: a};
    if (a.ms !== undefined) return a.ms + (a.lead || 0);
    if (a.after !== undefined) return (ctx.base ?? 0) + a.after;
    if (a.atIndex !== undefined) return words[a.atIndex].startMs + (a.lead || 0);
    const i = find(a.at, a.n || 1);
    if (i < 0) {
      ctx.warn && ctx.warn(`anchor "${a.at}" (n=${a.n || 1}) not found in the transcript`);
      return ctx.fallback;
    }
    const w = words[i];
    return (a.end ? words[i + String(a.at).split(/\s+/).length - 1].endMs : w.startMs) + (a.lead || 0);
  };
  return {resolve, find};
};

// ---------------------------------------------------------------- caption chunks (1 to 3 words) with emphasis flags
export const buildChunks = (cfg, words, emphasisList = []) => {
  const dom = dominantScript(cfg, words);
  const stop = new Set();
  for (const l of Object.values(cfg.lexicons.stopwords)) for (const w of l) stop.add(nz(w));
  const emph = new Set(emphasisList.map(nz));
  const punct = /[.!?;:,،؟؛…]$/;
  const flagged = words.map((w, i) => {
    const clean = stripPunct(w.text);
    const k = nz(w.text);
    const latin = scriptOf(cfg, clean) === 'latin';
    const num = /\d/.test(clean);
    const capMid = latin && /^[A-Z][\p{L}]+/u.test(clean) && i > 0 && !punct.test(words[i - 1].text) && !stop.has(k);
    const foreign = latin && dom !== 'latin' && clean.length >= 4 && !stop.has(k);
    const entity = emph.has(k) || capMid || foreign || /^[A-Z]{2,}$/.test(clean);
    return {text: w.text, startMs: w.startMs, endMs: w.endMs, num, entity: !num && entity};
  });
  const chunks = [];
  let cur = [];
  const flush = () => {
    if (cur.length) chunks.push({startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs, words: cur});
    cur = [];
  };
  flagged.forEach((w, i) => {
    const prev = flagged[i - 1];
    if (cur.length && (cur.length >= cfg.director.caption.maxWords || w.startMs - prev.endMs > 380 || punct.test(prev.text))) flush();
    cur.push(w);
  });
  flush();
  // a chunk lives until the next one starts (continuous speech), never longer than 600 ms of silence
  chunks.forEach((c, i) => {
    const next = chunks[i + 1];
    c.endMs = next ? Math.min(Math.max(c.endMs, next.startMs - 20), c.endMs + 600) : c.endMs + 400;
  });
  return chunks;
};

// ---------------------------------------------------------------- the resolver
export const resolvePlan = ({edit, words, durationMs, cfg, fps, width, height, palette, assets = {}, seams = [], clips = null}) => {
  const warnings = [];
  const R = makeResolver(words, durationMs);
  const warn = (m) => warnings.push(m);
  const D = cfg.director;
  const rs = (a, ctx = {}) => R.resolve(a, {...ctx, warn});

  const titles = (edit.titles || []).map((t) => {
    const startMs = rs(t.from, {fallback: 0});
    return {...t, startMs, endMs: rs(t.to, {base: startMs, fallback: startMs + 3000})};
  });
  const sections = (edit.sections || []).map((t) => {
    const startMs = rs(t.from ?? t.at, {fallback: 0});
    return {...t, startMs, endMs: rs(t.to, {base: startMs, fallback: startMs + D.section.holdMs})};
  });
  const graphics = (edit.graphics || []).map((g, i) => {
    const startMs = rs(g.from, {fallback: 0});
    const endMs = rs(g.to, {base: startMs, fallback: startMs + D.pacing.graphicHoldMs});
    const content = JSON.parse(JSON.stringify(g.content || {}));
    const fixTimes = (o) => {
      if (Array.isArray(o)) return o.forEach(fixTimes);
      if (o && typeof o === 'object') {
        for (const k of Object.keys(o)) {
          if (/AtMs$|^atMs$|^untilMs$/.test(k) && typeof o[k] === 'object') o[k] = rs(o[k], {base: startMs, fallback: startMs});
          else fixTimes(o[k]);
        }
      }
    };
    fixTimes(content);
    (content.rows || []).forEach((r) => r.strikeAt && (r.strikeAtMs = rs(r.strikeAt, {base: startMs, fallback: startMs + 800})));
    (content.tiles || []).forEach((r) => r.strikeAt && (r.strikeAtMs = rs(r.strikeAt, {base: startMs, fallback: startMs + 900})));
    (content.items || []).forEach((r) => r.at && (r.atMs = rs(r.at, {base: startMs, fallback: startMs + 400})));
    (content.steps || []).forEach((r) => r.at && (r.atMs = rs(r.at, {base: startMs, fallback: startMs + 400})));
    if (content.bAt) content.bAtMs = rs(content.bAt, {base: startMs, fallback: startMs + 900});
    (Array.isArray(content.lines) ? content.lines : []).forEach((r) => r.at && (r.atMs = rs(r.at, {base: startMs, fallback: startMs})));
    if (content.strikeAt) content.strikeAtMs = rs(content.strikeAt, {base: startMs, fallback: startMs + 600});
    if (content.selectAt) content.selectAtMs = rs(content.selectAt, {base: startMs, fallback: startMs + 500});
    if (content.rightAt) content.rightAtMs = rs(content.rightAt, {base: startMs, fallback: startMs + 900});
    const overlays = (g.overlays || []).map((o) => ({...o, atMs: rs(o.at, {base: startMs, fallback: startMs + 600}), untilMs: o.until ? rs(o.until, {base: startMs, fallback: endMs}) : undefined}));
    const src = content.src && assets[content.src] ? assets[content.src] : content.src;
    if (content.src) content.src = src;
    (content.tiles || []).forEach((t) => t.image && assets[t.image] && (t.image = assets[t.image]));
    return {id: g.id || `g${i}`, mode: g.mode || (g.slot === 'tile' ? undefined : g.kind === 'motion' ? edit.defaultMode || 'techHead' : 'darkDemo'), slot: g.slot, kind: g.kind, large: g.large, url: g.url, title: g.title, zoom: g.zoom, zoomX: g.zoomX, zoomY: g.zoomY, chrome: g.chrome, tone: g.tone, device: g.device, transition: g.transition, badge: g.badge, content, overlays, startMs, endMs};
  });

  // never-empty rule (light layouts): a topic title for every stretch of speech, a faint topic word behind it, and a full-head fallback for any remaining gap
  const ghosts = [];
  const lightStyle = String(edit.defaultMode || 'lightHead').startsWith('light');
  if (lightStyle && edit.fill !== false && D.fill && D.fill.enabled) {
    const F = D.fill;
    const stopSet = new Set();
    for (const l of Object.values(cfg.lexicons.stopwords)) for (const w of l) stopSet.add(nz(w));
    const sents = [];
    let cur = [];
    words.forEach((w, i) => {
      cur.push(w);
      const nx = words[i + 1];
      if (!nx || /[.!?؟…]$/.test(w.text) || nx.startMs - w.endMs > 700 || nx.endMs - cur[0].startMs > F.maxSentenceMs) {
        sents.push(cur);
        cur = [];
      }
    });
    const wins = [];
    let acc = null;
    for (const sn of sents) {
      acc = acc ? [...acc, ...sn] : [...sn];
      if (acc[acc.length - 1].endMs - acc[0].startMs >= F.minTitleMs) {
        wins.push(acc);
        acc = null;
      }
    }
    if (acc) wins.length ? wins[wins.length - 1].push(...acc) : wins.push(acc);
    const flagMap = new Map();
    buildChunks(cfg, words, edit.captionEmphasis || []).forEach((c) => c.words.forEach((w) => flagMap.set(w.startMs, w)));
    const emph = new Set((edit.captionEmphasis || []).map(nz));
    const busy = [...titles, ...sections].map((t) => [t.startMs, t.endMs]);
    const made = [];
    wins.forEach((ws0, wi) => {
      let startMs = Math.max(0, ws0[0].startMs - 100);
      let endMs = ws0[ws0.length - 1].endMs + 200;
      for (const [a, b] of busy) {
        if (startMs < b && endMs > a) {
          if (a <= startMs) startMs = b;
          else endMs = a;
        }
      }
      if (endMs - startMs < 1200) return;
      const ws = ws0.filter((w) => w.startMs >= startMs - 100 && w.startMs < endMs);
      if (!ws.length) return;
      let best = -1;
      let score = -1;
      ws.forEach((w, i) => {
        const t = stripPunct(w.text);
        const k = nz(t);
        if (k.length < 3 || stopSet.has(k)) return;
        const f = flagMap.get(w.startMs) || {};
        if (k.length < 4 && !/\d/.test(t) && !emph.has(k) && !f.entity) return;
        const sc = k.length + (/\d/.test(t) ? 30 : 0) + (emph.has(k) ? 25 : 0) + (f.entity ? 12 : 0);
        if (sc > score) {
          score = sc;
          best = i;
        }
      });
      if (best < 0) return;
      const hl = stripPunct(ws[best].text);
      let line1 = ws.slice(Math.max(0, best - 3), best).map((w) => stripPunct(w.text)).filter(Boolean).join(' ');
      if (!line1) line1 = ws.slice(best + 1, best + 3).map((w) => stripPunct(w.text)).filter(Boolean).join(' ');
      if (!line1) return;
      made.push({startMs, endMs, line1, highlight: hl, stickers: wi % 3 === 0 ? [F.stickers[(wi / 3) % F.stickers.length | 0]] : [], auto: true});
    });
    titles.push(...made);
    titles.sort((a, b) => a.startMs - b.startMs);
    titles.forEach((t, i) => {
      const nx = titles[i + 1];
      if (nx && t.endMs > nx.startMs) t.endMs = nx.startMs;
    });
    for (const t of made) ghosts.push({startMs: t.startMs, endMs: t.endMs, text: t.highlight});
  }

  // layouts: from graphics modes (head beats fill the gaps) unless the plan gives its own
  let layouts;
  if (edit.layouts && edit.layouts.length) {
    layouts = edit.layouts.map((l) => ({mode: l.mode, transition: l.transition, startMs: rs(l.from, {fallback: 0}), endMs: 0}));
    layouts.sort((a, b) => a.startMs - b.startMs);
    layouts.forEach((l, i) => (l.endMs = layouts[i + 1] ? layouts[i + 1].startMs : durationMs));
  } else {
    const spans = [];
    for (const g of graphics.filter((x) => x.mode)) spans.push({mode: g.mode, transition: g.transition, startMs: g.startMs, endMs: g.endMs});
    for (const s of sections) spans.push({mode: 'lightSection', startMs: s.startMs, endMs: s.endMs});
    for (const t of titles) if (!spans.some((x) => x.startMs <= t.startMs && x.endMs > t.startMs)) spans.push({mode: 'lightHead', startMs: t.startMs, endMs: t.endMs});
    if (lightStyle && edit.fill !== false && D.fill && D.fill.enabled) {
      const cover = [...titles, ...sections, ...graphics].map((x) => [x.startMs, x.endMs]).sort((a, b) => a[0] - b[0]);
      let t0 = 0;
      for (const [a, b] of cover) {
        if (a - t0 >= D.fill.minGapMs) spans.push({mode: 'fullHead', startMs: t0, endMs: a});
        t0 = Math.max(t0, b);
      }
      if (durationMs - t0 >= D.fill.minGapMs) spans.push({mode: 'fullHead', startMs: t0, endMs: durationMs});
    }
    spans.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    layouts = [];
    let t = 0;
    const push = (mode, a, b, tr) => {
      if (b <= a) return;
      const last = layouts[layouts.length - 1];
      if (last && last.mode === mode) last.endMs = b;
      else layouts.push({mode, transition: tr, startMs: a, endMs: b});
    };
    for (const s of spans) {
      if (s.endMs <= t) continue;
      const a = Math.max(t, s.startMs);
      push(edit.defaultMode || 'lightHead', t, a);
      push(s.mode, a, s.endMs, s.transition);
      t = s.endMs;
    }
    push(edit.defaultMode || 'lightHead', t, durationMs);
  }

  const chunks = buildChunks(cfg, words, edit.captionEmphasis || []);

  // punch-ins / zoom-outs: authored zooms + automatic ones at silence-cut seams (they hide the jump cut)
  const Z = D.zoom;
  const zooms = (edit.zooms || []).map((z, idx) => {
    const startMs = rs(z.from, {fallback: 0});
    return {startMs, endMs: rs(z.to, {base: startMs, fallback: startMs + Z.emphasisHoldMs}), scale: z.scale || Z.emphasisScale, authored: true, idx};
  });
  if (edit.autoZoom !== false && Z.enabled) {
    seams.forEach((sm, i) => {
      const scale = Z.seamScales[i % Z.seamScales.length];
      if (scale <= 1) return;
      const next = seams[i + 1] ?? durationMs;
      zooms.push({startMs: sm, endMs: Math.min(next - 80, sm + Z.holdMaxMs), scale});
    });
  }
  zooms.sort((a, b) => a.startMs - b.startMs);

  // sound events
  const sfx = [];
  let why = '';
  const add = (type, atMs, w = why) => sfx.push({type, atMs: Math.max(0, Math.round(atMs)), why: w});
  for (const g of graphics) {
    why = g.kind;
    if (g.slot !== 'tile') add(D.sfx.windowIn, g.startMs - 20, `${g.kind} window appears`);
    if (g.badge) add(D.sfx.badge, g.startMs + 200, 'step badge');
    for (const o of g.overlays) if (o.type === 'stat' || o.type === 'pill') add(D.sfx.stat, o.atMs);
    for (const r of [...(g.content.rows || []), ...(g.content.tiles || [])]) if (r.strikeAtMs) add(D.sfx.strike, r.strikeAtMs, 'item struck out');
    for (const r of g.content.items || []) if (r.atMs) add('check', r.atMs, 'checklist item');
    if (g.kind === 'stat') add(D.sfx.stat, g.startMs + 120);
    if (g.kind === 'slam') add(D.sfx.slam, g.startMs + 40);
    if (g.kind === 'sting') add(D.sfx.sting, g.startMs + 30);
    if (g.kind === 'ring') add(D.sfx.ringDone, g.startMs + 1100);
    if (g.kind === 'cta') add(D.sfx.cta, g.startMs + 120);
    if (g.kind === 'chart') add(D.sfx.chart, g.startMs + 120);
    if (g.kind === 'place') add(D.sfx.place, g.startMs + 520);
    if (g.kind === 'split') {
      add(D.sfx.split, g.startMs + 120);
      if (g.content.same || g.content.strike === false) add(D.sfx.split, g.content.bAtMs ?? g.startMs + 900);
      else add(D.sfx.strike, g.content.strikeAtMs ?? (g.content.bAtMs ?? g.startMs + 900) - 150);
    }
    for (const it of g.content.items || []) if (g.kind === 'pills' && it.atMs) add(D.sfx.pillTick, it.atMs + 60);
    if (g.kind === 'stats') for (const it of g.content.items || []) add(D.sfx.statTick, it.atMs ?? g.startMs + 150);
    if (g.kind === 'flow') for (const st of g.content.steps || []) add(D.sfx.flow, st.atMs ?? g.startMs + 200);
  }
  for (const s of sections) add(D.sfx.section, s.startMs + 300, 'section title');
  layouts.slice(1).forEach((l, i) => {
    if ((l.mode === 'darkDemo') !== (layouts[i].mode === 'darkDemo')) add(D.sfx.layout, l.startMs - 60, 'layout change');
  });
  // emphasized words (names, numbers, foreign words): the lightest sound, at most one every few seconds (the sound designer thins them out)
  for (const c of chunks) {
    const w = c.words.find((x) => x.entity);
    if (w) sfx.push({type: 'emphasis', atMs: w.startMs, why: `emphasized word "${stripPunct(w.text)}"`});
  }
  sfx.sort((a, b) => a.atMs - b.atMs);

  // vlog: full-screen shot timeline cut to the narration
  let shots = [];
  if (clips && Object.keys(clips).length) {
    shots = edit.shots && edit.shots.length ? resolveShots({edit, words, durationMs, cfg, clips, rs, warn}) : autoShots({edit, words, durationMs, cfg, clips});
    for (const sh of shots) if (sh.fx && D.vlog.overlayFx.includes(sh.fx)) add(`fx:${sh.fx}`, sh.startMs - 40, `transition between clips (${sh.fx})`);
    sfx.sort((a, b) => a.atMs - b.atMs);
  }

  return {warnings, plan: {shots, clips: clips ? Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, {id: c.id, file: c.file, durationMs: c.durationMs, width: c.width, height: c.height, portrait: c.portrait, hasAudio: c.hasAudio}])) : {}, palette, gradeName: edit.grade, fps, width, height, durationMs, layouts, titles, sections, graphics, zooms, ghosts, chunks, pages: chunks.map((c) => ({startMs: c.startMs, endMs: c.endMs, words: c.words})), sfx, badges: []}};
};

// ---------------------------------------------------------------- fact check: every visible text must come from the speech, a provided file or the plan's allow list
const SKIP_KEYS = new Set(['bg', 'same', 'scene', 'symbol', 'tone', 'device', 'pan', 'posY', 'type', 'highlight', 'display', 'unit', 'transition', 'fit', 'icon', 'chrome', 'zoom', 'zoomX', 'zoomY', 'kind', 'type', 'tone', 'mode', 'src', 'image', 'stickers', 'slot', 'id', 'name_', 'prompt', 'at', 'from', 'to', 'strikeAt', 'selectAt', 'rightAt', 'until']);
export const factCheck = ({edit, words, cfg, allow = []}) => {
  const spoken = new Set(words.map((w) => nz(w.text)));
  allow.forEach((a) => String(a).split(/\s+/).forEach((t) => spoken.add(nz(t))));
  const UI = new Set(['without', 'with', 'issues', 'month', 'mo', 'terminal', 'browser']);
  const issues = [];
  const visit = (o, pathStr) => {
    if (typeof o === 'string') {
      for (const tok of o.split(/\s+/)) {
        const k = nz(tok);
        if (k.length >= 3 && !/^\d+$/.test(k) && !spoken.has(k) && !UI.has(k) && !Array.from(spoken).some((s) => s.length >= 4 && (s.startsWith(k) || k.startsWith(s)))) issues.push(`${pathStr}: "${tok}" is not in the transcript`);
      }
    } else if (Array.isArray(o)) o.forEach((v, i) => visit(v, `${pathStr}[${i}]`));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!SKIP_KEYS.has(k)) visit(v, `${pathStr}.${k}`);
  };
  visit({titles: edit.titles, sections: edit.sections, graphics: (edit.graphics || []).map((g) => ({url: g.url, title: g.title, content: g.content, overlays: g.overlays}))}, 'plan');
  return issues;
};

// ---------------------------------------------------------------- baseline planner (used when no plan is authored)
// Reads only the speech: numbers -> count-up stats, comma lists -> pill stacks, named / foreign terms -> window cards, first strong term -> hook slam.
// Everything on screen is a spoken word. A hand-written plan (story analysis by Claude) is still better; this keeps raw footage from coming out bare.
// A number with a unit tells its story better as a motion graphic than as a plain count-up card: years / months -> a clock, money -> a spinning coin, percent -> growth.
// Only words that were spoken are used (the number and its unit).
const TIME_UNIT = /^(years?|months?|weeks?|days?|hours?|minutes?|ans?|ann[eé]es?|mois|semaines?|jours?|heures?|سنة|سنين|سنوات|شهر|اشهر|أشهر|يوم|ايام|أيام)$/i;
const MONEY_UNIT = /^(dollars?|euros?|usd|eur|dinars?|dt|tnd|دينار|دولار|يورو)$/i;
export const motionForNumber = (raw, nextWord) => {
  const num = parseFloat(String(raw).replace(/[^\d.,]/g, '').replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  const unit = stripPunct(nextWord || '');
  if (/%$/.test(raw) || /^(percent|pourcent|%)$/i.test(unit)) return {scene: 'growth', value: num, suffix: '%'};
  if (TIME_UNIT.test(unit)) return {scene: 'clock', value: num, unit};
  if (/[$€]/.test(raw) || MONEY_UNIT.test(unit)) return {scene: 'coin', value: num, symbol: /€|euro|eur/i.test(raw + unit) ? '€' : /dinar|dt|tnd|دينار/i.test(raw + unit) ? 'DT' : '$'};
  return null;
};

export const autoPlan = ({cfg, words, durationMs, style = 'tech'}) => {
  const D = cfg.director;
  const tech = style === 'tech';
  const stop = new Set();
  for (const l of Object.values(cfg.lexicons.stopwords)) for (const w of l) stop.add(nz(w));
  const chunks = buildChunks(cfg, words);
  const flag = new Map();
  chunks.forEach((c) => c.words.forEach((w) => flag.set(w.startMs, w)));
  const edit = {titles: [], sections: [], graphics: [], defaultMode: tech ? 'techHead' : 'lightHead'};
  const demo = tech ? 'techDemo' : 'darkDemo';
  const hold = D.pacing.graphicHoldMs;
  const minStart = D.pacing.hookHeadMs;
  let last = 0;
  let demoMs = 0;
  const room = (t, len) => t >= last + D.pacing.minGapMs + 900 && demoMs + len <= durationMs * (1 - D.pacing.headVisibleShare);
  const clean = (w) => stripPunct(w.text);
  const used = new Set();
  const take = (i, n) => words.slice(i, i + n).map(clean).filter((x) => x && !stop.has(nz(x)));
  // hook: first strong term in the first 8 s
  const first = words.findIndex((w) => w.startMs < 8000 && flag.get(w.startMs) && (flag.get(w.startMs).entity || flag.get(w.startMs).num) && clean(w).length >= 3);
  if (first >= 0 && tech) {
    const w = words[first];
    edit.graphics.push({id: 'hook', mode: 'techHead', slot: 'mid', kind: 'slam', from: {ms: Math.max(0, w.startMs - 200)}, to: {ms: w.endMs + 1100}, content: {text: clean(w), tone: 'blue'}});
    used.add(nz(clean(w)));
  } else if (!tech) edit.titles.push({from: 0, to: {ms: Math.max(D.pacing.hookHeadMs, words[Math.min(4, words.length - 1)].endMs)}, line1: words.slice(0, 3).map(clean).join(' '), highlight: take(3, 3)[0], stickers: ['spark']});
  last = minStart;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.startMs < last + 300) continue;
    const f = flag.get(w.startMs);
    // comma list of 3 to 5 short items -> pills
    if (/[,،]$/.test(w.text)) {
      const run = [i];
      let j = i + 1;
      while (j < words.length && run.length < 5 && words[j].startMs - words[j - 1].endMs < 700) {
        run.push(j);
        if (!/[,،]$/.test(words[j].text)) break;
        j++;
      }
      if (run.length >= 3 && run.length <= 5 && !/[,،]$/.test(words[run[run.length - 1]].text) && room(w.startMs, hold + 800)) {
        const items = run.map((k) => ({text: clean(words[k]), icon: 'check', at: {ms: words[k].startMs}}));
        const endMs = words[run[run.length - 1]].endMs + 900;
        edit.graphics.push({id: `list${i}`, mode: demo, slot: 'lower', kind: 'pills', from: {ms: w.startMs - 150}, to: {ms: endMs}, content: {items}});
        demoMs += endMs - w.startMs;
        last = endMs + 200;
        i = run[run.length - 1];
        continue;
      }
    }
    if (!f || used.has(nz(clean(w))) || !room(w.startMs, hold)) continue;
    if (f.num) {
      // numbers within 3 s share one count-up row
      const row = [];
      for (let k = i; k < words.length && words[k].startMs - w.startMs < 3000 && row.length < 3; k++) {
        const fk = flag.get(words[k].startMs);
        if (fk && fk.num) row.push(k);
      }
      const mc = row.length === 1 ? motionForNumber(clean(words[row[0]]), words[row[0] + 1] && words[row[0] + 1].text) : null;
      if (mc) {
        const mEnd = words[row[0]].endMs + hold - 200;
        edit.graphics.push({id: `mot${i}`, kind: 'motion', from: {ms: w.startMs - 150}, to: {ms: mEnd}, content: mc});
        last = mEnd + 200;
        used.add(nz(clean(w)));
        continue;
      }
      const items = row.map((k, n) => ({value: clean(words[k]), label: take(k + 1, 2).join(' '), tone: ['amber', 'white', 'green'][n], at: {ms: words[k].startMs}}));
      const endMs = words[row[row.length - 1]].endMs + hold - 600;
      edit.graphics.push({id: `num${i}`, mode: demo, slot: tech ? 'full' : undefined, kind: 'stats', from: {ms: w.startMs - 150}, to: {ms: endMs}, content: {items}});
      demoMs += endMs - w.startMs;
      last = endMs + 200;
      row.forEach((k) => used.add(nz(clean(words[k]))));
      continue;
    }
    if (f.entity && clean(w).length >= 3 && /^[A-Z]/.test(clean(w)) && i > 0 && !/[.!?]$/.test(words[i - 1].text)) {
      const phrase = [clean(w), ...take(i + 1, 2).filter((x) => /^[A-Z]/.test(x))].join(' ');
      edit.graphics.push({id: `ent${i}`, mode: demo, kind: 'browser', title: clean(w), from: {ms: w.startMs - 150}, to: {ms: w.startMs - 150 + hold}, content: {dark: true, heading: phrase, selection: clean(w), selectAt: {ms: w.startMs}, lines: 3}});
      demoMs += hold;
      last = w.startMs - 150 + hold + 200;
      used.add(nz(clean(w)));
    }
  }
  return edit;
};

// ---------------------------------------------------------------- vlog shots
const findClip = (clips, ref) => {
  if (!ref) return null;
  const k = String(ref).toLowerCase();
  return clips[ref] || Object.values(clips).find((c) => c.id === k || c.name.toLowerCase() === k || c.name.toLowerCase().startsWith(k)) || null;
};

// make the shots tile the whole narration: sorted, each shot runs until the next starts, the last until the end
const tile = (shots, durationMs) => {
  shots.sort((a, b) => a.startMs - b.startMs);
  if (shots.length) shots[0].startMs = 0;
  shots.forEach((sh, i) => (sh.endMs = shots[i + 1] ? shots[i + 1].startMs : durationMs));
  return shots.filter((sh) => sh.endMs - sh.startMs > 120);
};

// keep the requested part of the clip inside the clip: slow down a little if the clip is too short, else restart from the top
const fitSource = (sh, clip, D) => {
  const dur = sh.endMs - sh.startMs + D.vlog.xfMs;
  let need = dur * sh.speed;
  if (need > clip.durationMs) {
    sh.speed = Math.max(D.vlog.minSpeed, (clip.durationMs * 0.98) / dur);
    need = dur * sh.speed;
  }
  if (sh.srcStartMs + need > clip.durationMs) sh.srcStartMs = Math.max(0, clip.durationMs - need - 50);
  sh.srcStartMs = Math.round(Math.max(0, sh.srcStartMs));
  return sh;
};

export const resolveShots = ({edit, words, durationMs, cfg, clips, rs, warn}) => {
  const D = cfg.director;
  const cursor = {};
  const shots = (edit.shots || []).map((e, i) => {
    const clip = findClip(clips, e.clip);
    if (!clip) {
      warn(`shot ${i}: clip "${e.clip}" not found (have: ${Object.keys(clips).join(', ')})`);
      return null;
    }
    const startMs = rs(e.from, {fallback: 0});
    return {clipId: clip.id, startMs, endMs: 0, srcStartMs: e.srcStartMs ?? null, speed: e.speed || 1, fit: e.fit || (clip.portrait ? 'cover' : D.vlog.landscapeFit), posX: e.posX, zoom: e.zoom, fx: e.fx, ambientDb: e.ambientDb ?? D.vlog.ambientDb, _clip: clip};
  }).filter(Boolean);
  tile(shots, durationMs);
  shots.forEach((sh, i) => {
    const clip = sh._clip;
    if (sh.srcStartMs === null) sh.srcStartMs = cursor[clip.id] ?? (clip.durationMs * 0.08);
    fitSource(sh, clip, D);
    cursor[clip.id] = sh.srcStartMs + (sh.endMs - sh.startMs) * sh.speed + 400;
    if (cursor[clip.id] > clip.durationMs * 0.9) cursor[clip.id] = clip.durationMs * 0.05;
    sh.index = i;
    delete sh._clip;
  });
  return shots;
};

// baseline: sentence-sized beats, clips in the order they were filmed (file time), each clip consumed in sequence
export const autoShots = ({edit, words, durationMs, cfg, clips}) => {
  const D = cfg.director;
  const [minMs, maxMs] = D.vlog.shotMs;
  const order = (edit.clipOrder ? edit.clipOrder.map((r) => findClip(clips, r)).filter(Boolean) : Object.values(clips).sort((a, b) => a.modified - b.modified || a.name.localeCompare(b.name)));
  const bounds = [0];
  let last = 0;
  words.forEach((w, i) => {
    const nx = words[i + 1];
    const end = w.endMs;
    const natural = /[.!?؟…,]$/.test(w.text) || (nx && nx.startMs - w.endMs > 450);
    if (end - last >= minMs && (natural || end - last >= maxMs) && nx && durationMs - end > 900) {
      bounds.push(Math.round(nx.startMs - 60));
      last = end;
    }
  });
  const shots = bounds.map((b, i) => ({clipId: null, startMs: b, endMs: 0, srcStartMs: null, speed: 1, fit: 'cover', ambientDb: D.vlog.ambientDb, fx: i % 4 === 3 ? 'whip' : i % 2 ? 'zoom' : undefined}));
  tile(shots, durationMs);
  const cursor = {};
  shots.forEach((sh, i) => {
    const clip = order[i % order.length];
    sh.clipId = clip.id;
    sh.fit = clip.portrait ? 'cover' : D.vlog.landscapeFit;
    sh.srcStartMs = cursor[clip.id] ?? clip.durationMs * 0.08;
    fitSource(sh, clip, D);
    cursor[clip.id] = sh.srcStartMs + (sh.endMs - sh.startMs) + 500;
    if (cursor[clip.id] > clip.durationMs * 0.85) cursor[clip.id] = clip.durationMs * 0.05;
    sh.index = i;
  });
  return shots;
};
