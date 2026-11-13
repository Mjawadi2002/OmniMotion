// Planner: transcript + tokens + assets  ->  plan.json (pages, hook, visuals, layouts, shots, sfx).
// Every threshold, lexicon and rule comes from style.config.json. No video-specific text lives here.
import {dominantScript, isRtlScript, normalize, scriptOf, stripPunct} from '../../shared/text.js';

const rx = (s, flags = '') => new RegExp(s, flags);
// keep a card label inside maxChars without cutting a word in half ("Learning/Artificial" -> "Learning")
const shorten = (t, max) => (t.length <= max ? t : (t.split(/[\/\-]/)[0].length >= 3 && t.split(/[\/\-]/)[0].length <= max ? t.split(/[\/\-]/)[0] : t.slice(0, max)));

export const buildPlan = ({cfg, words: rawWords, durationMs, palette, lang, assets = [], media, width, height, fps, cuts = []}) => {
  const hasVideo = media.kind === 'video';
  const theme = cfg.palettes[palette];
  const defaultLayout = hasVideo ? theme.layoutDefault : 'graphicOnly';

  // ---------- 1. clean words ----------
  const words = [];
  for (const w of rawWords) {
    const text = (w.text || '').trim();
    if (!text) continue;
    let startMs = Math.max(0, Math.round(w.startMs));
    let endMs = Math.round(w.endMs);
    if (words.length && startMs < words[words.length - 1].endMs) startMs = words[words.length - 1].endMs;
    if (endMs <= startMs) endMs = startMs + 80;
    words.push({text, startMs, endMs, norm: normalize(text), clean: stripPunct(text), script: scriptOf(cfg, text)});
  }
  if (!words.length) throw new Error('Transcript is empty: nothing to plan.');
  durationMs = Math.max(durationMs || 0, words[words.length - 1].endMs + 400);

  const dom = dominantScript(cfg, words);
  const rtl = isRtlScript(cfg, dom);
  if (!lang || lang === 'auto' || !cfg.lexicons.stopwords[lang]) {
    if (dom === 'arabic') lang = 'ar';
    else {
      const fr = new Set(cfg.lexicons.stopwords.fr);
      const en = new Set(cfg.lexicons.stopwords.en);
      let f = 0;
      let e = 0;
      for (const w of words) {
        if (fr.has(w.norm)) f++;
        if (en.has(w.norm)) e++;
      }
      lang = f > e ? 'fr' : 'en';
    }
  }
  const langs = [...new Set([lang, 'en'])];
  const lexSet = (name) => {
    const s = new Set();
    for (const l of langs) for (const x of cfg.lexicons[name]?.[l] || []) s.add(normalize(x));
    return s;
  };
  const STOP = lexSet('stopwords');
  const CTA = lexSet('cta');
  const LIST = lexSet('listMarker');
  const numRe = rx(cfg.patterns.number);
  const urlRe = rx(cfg.patterns.url, 'i');
  const capsRe = rx(cfg.patterns.capsOrMixedCase);

  words.forEach((w) => {
    w.isNumber = numRe.test(w.clean);
    w.isForeign = !!w.script && w.script !== dom && w.clean.length >= 2;
    w.isCaps = capsRe.test(w.clean);
    w.isStop = STOP.has(w.norm) || STOP.has(normalize(w.text.replace(/['’](s|ll|re|ve|d|m|t)$/i, '')));
    w.emph = (cfg.captions.emphasis.applyToNumbers && w.isNumber) || (cfg.captions.emphasis.applyToForeignScript && w.isForeign) || w.isCaps;
  });

  // ---------- 2. caption pages ----------
  const cp = cfg.captions;
  const punctRe = rx(cp.paging.punctuation + '$');
  const pages = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    pages.push({startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs, rtl, words: cur.map(({text, startMs, endMs, emph}) => ({text, startMs, endMs, emph}))});
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const chars = cur.reduce((a, x) => a + x.text.length, 0) + w.text.length;
    const gap = prev ? w.startMs - prev.endMs : 0;
    if (cur.length && (cur.length >= cp.maxWordsPerPage || chars > cp.maxCharsPerPage || gap >= cp.paging.breakOnPauseMs || (cp.paging.breakAfterPunctuation && punctRe.test(prev.text)))) flush();
    cur.push(w);
  });
  flush();
  pages.forEach((p, i) => {
    const next = pages[i + 1];
    if (p.endMs - p.startMs < cp.paging.minPageMs) p.endMs = Math.min(p.startMs + cp.paging.minPageMs, next ? next.startMs : durationMs);
  });

  // ---------- 3. hook ----------
  let hook = null;
  const H = cfg.hook;
  if (H.enabled && durationMs > H.durationMs * 4) {
    const sentRe = new RegExp(H.sentenceEnd);
    const firstSentenceEnd = words.findIndex((w, i) => sentRe.test(w.text) || (words[i + 1] && words[i + 1].startMs - w.endMs > 450));
    const lim = Math.min(H.maxWords, firstSentenceEnd >= 0 ? firstSentenceEnd + 1 : H.maxWords, words.length);
    const hw = words.slice(0, Math.max(1, lim));
    const score = (w) => (w.isStop ? 0 : 1) * (w.clean.length + (w.emph ? 4 : 0));
    const order = hw.map((w, i) => [i, score(w)]).sort((a, b) => b[1] - a[1]);
    const emphIdx = new Set(order.slice(0, H.emphasisWords).map((x) => x[0]));
    const items = hw.map((w, i) => ({text: w.clean || w.text, emph: emphIdx.has(i)}));
    const maxChars = H.maxCharsPerLine;
    const lines = [];
    let line = [];
    let n = 0;
    for (const it of items) {
      if (line.length && n + it.text.length > maxChars) {
        lines.push(line);
        line = [];
        n = 0;
      }
      line.push(it);
      n += it.text.length + 1;
    }
    if (line.length) lines.push(line);
    // subtitle: the words that follow the title (same sentence, else the next one), verbatim from the speech
    const endsSentence = (i) => sentRe.test(words[i].text) || (words[i + 1] && words[i + 1].startMs - words[i].endMs > 450);
    let from = lim;
    if (from > 0 && endsSentence(from - 1)) from = lim; // title already ended its sentence: take the next sentence
    const sub = [];
    for (let i = from; i < words.length && sub.length < H.subtitleMaxWords; i++) {
      sub.push(words[i].text);
      if (endsSentence(i)) break;
    }
    hook = {startMs: 0, endMs: H.durationMs, lines, rtl, subtitle: sub.join(' '), tags: [], titleWords: lim};
  }
  const hookEnd = hook ? hook.endMs : 0;

  // ---------- 4. visual candidates from the decision table ----------
  const V = cfg.visuals;
  const assetList = assets.map((a) => ({...a, nb: normalize(a.base)}));
  const nextContent = (i, n, skipCta = false) => {
    const out = [];
    for (let j = i + 1; j < words.length && j <= i + 6 && out.length < n; j++) {
      const w = words[j];
      if (w.isStop || (skipCta && CTA.has(w.norm))) continue;
      out.push(w);
    }
    return out;
  };
  const cands = [];
  const usedIdx = new Set();
  const lastTermAt = new Map();

  let enumUntil = 0;
  let enumRun = [];
  let quoteEnd = 0;
  const percentRe = rx(cfg.patterns.percent);
  const matchRule = (rule, w, i) => {
    for (const alt of rule.detect.split('|')) {
      const [kind, arg] = alt.split(':');
      if (kind === 'lexicon' && arg === 'cta' && CTA.has(w.norm)) return true;
      if (kind === 'lexicon' && arg === 'listMarker' && LIST.has(w.norm)) return 'list';
      if (kind === 'regex' && arg === 'url' && urlRe.test(w.text)) return true;
      if (kind === 'regex' && arg === 'percent' && percentRe.test(w.clean)) return true;
      if (kind === 'regex' && arg === 'number' && w.isNumber) return true;
      if (kind === 'structure' && arg === 'quoted' && /^[\"\u201c\u00ab\u2018]/.test(w.text) && !/[\"\u201d\u00bb\u2019]$/.test(w.text)) {
        // a quoted phrase of 2-maxWords words: opening quote on this word, closing quote on a later one
        for (let j = i + 1; j < Math.min(words.length, i + V.keyPhrase.maxWords); j++) {
          if (/[\"\u201d\u00bb\u2019][.,!?\u060c\u061f]*$/.test(words[j].text)) {
            quoteEnd = j;
            return 'quote';
          }
        }
      }
      if (kind === 'asset' && assetList.some((a) => a.nb.length >= 3 && (w.norm === a.nb || (w.norm.length >= 4 && a.nb.startsWith(w.norm))))) return true;
      if (kind === 'structure' && arg === 'foreignScript' && w.isForeign && !w.isStop && !w.isNumber && w.clean.length >= 4) return true;
      if (kind === 'structure' && arg === 'capsOrMixedCase' && w.isCaps) return true;
      if (kind === 'structure' && arg === 'enumeration') {
        const k = cfg.patterns.enumerationMinCommaItems;
        if (i < enumUntil) continue;
        let j = i;
        while (j < words.length - 1 && /[,\u060c]$/.test(words[j].text)) j++;
        const run = words.slice(i, j + 1).filter((x) => !x.isStop);
        if (j - i + 1 >= k && run.length >= 2) {
          enumRun = run;
          enumUntil = j + 1;
          return 'enum';
        }
      }
    }
    return false;
  };

  // Section titles: spread-out ordinals ("the first is ...", "the second is ...") become "Number N" title cards.
  const ST = V.sectionTitle;
  const ordMap = {};
  for (const l of langs) for (const [k, v] of Object.entries(cfg.lexicons.ordinals?.[l] || {})) ordMap[normalize(k)] = v;
  const ordIdx = words.map((w, i) => (ordMap[w.norm] !== undefined && w.startMs + 300 >= hookEnd ? i : -1)).filter((i) => i >= 0);
  let sectionMode = false;
  if (ordIdx.length >= ST.minOrdinals) {
    const gapsO = ordIdx.slice(1).map((i, k) => words[i].startMs - words[ordIdx[k]].startMs);
    sectionMode = gapsO.reduce((a, b) => a + b, 0) / gapsO.length >= ST.minAvgGapMs;
  }
  const ordSet = new Set(sectionMode ? ordIdx : []);
  if (hook) {
    // tag pills built from the speech: number of steps (spoken ordinals) and up to two distinct key terms
    const tags = [];
    const stepsTpl = cfg.lexicons.stepsLabel[lang] || cfg.lexicons.stepsLabel.en;
    if (sectionMode) tags.push(stepsTpl.replace('{n}', String(ordIdx.length)));
    const seen = new Set();
    for (const w of words.slice(0, 120)) {
      if (tags.length >= cfg.hook.maxTags) break;
      if (!(w.emph && !w.isNumber && !w.isStop && w.clean.length >= 4)) continue;
      if (seen.has(w.norm) || hook.lines.some((l) => l.some((x) => normalize(x.text) === w.norm))) continue;
      seen.add(w.norm);
      tags.push(w.clean);
    }
    hook.tags = tags;
  }
  const labelTpl = cfg.lexicons.sectionLabel[lang] || cfg.lexicons.sectionLabel.en;
  if (sectionMode) {
    ordIdx.forEach((i) => {
      const w = words[i];
      const topic = nextContent(i, 1)[0];
      cands.push({ruleId: 'section', component: 'SectionTitle', priority: -1, wordIdx: i, startMs: Math.max(hookEnd + 120, w.startMs + ST.leadMs), holdMs: ST.holdMs, data: {n: ordMap[w.norm], label: labelTpl, topic: topic ? topic.clean.slice(0, ST.topicMaxChars) : ''}});
    });
  }

  words.forEach((w, i) => {
    if (w.startMs + 300 < hookEnd) return;
    if (ordSet.has(i)) return;
    for (let r = 0; r < V.rules.length; r++) {
      const rule = V.rules[r];
      const m = matchRule(rule, w, i);
      if (!m) continue;
      const base = {ruleId: rule.id, component: rule.component, priority: r, wordIdx: i, startMs: Math.max(hookEnd + 120, w.startMs + rule.leadMs), holdMs: rule.holdMs};
      if (rule.component === 'StatCounter') {
        const label = nextContent(i, V.stat.labelWords).map((x) => x.clean).join(' ');
        cands.push({...base, data: {value: w.clean, label}});
      } else if (rule.component === 'CtaPill') {
        const t = nextContent(i, 2, true);
        const near = words.slice(i + 1, i + 6);
        const quoted = near.find((x) => /^["\u201c\u00ab\u2018']/.test(x.text));
        const emphFirst = near.find((x) => x.emph && !x.isStop);
        let txt = quoted ? quoted.clean : emphFirst ? emphFirst.clean : t.map((x) => x.clean).join(' ');
        if (quoted) {
          // the whole quoted phrase, up to the word that closes the quote
          const qi = words.indexOf(quoted);
          const run = [quoted];
          for (let j = qi; j < Math.min(words.length, qi + 4) && !/[\"\u201d\u00bb\u2019][.,!?\u060c\u061f]*$/.test(words[j].text); j++) if (j > qi) run.push(words[j]);
          const closing = words.slice(qi, qi + 4).find((x) => /[\"\u201d\u00bb\u2019][.,!?\u060c\u061f]*$/.test(x.text));
          if (closing && closing !== quoted && !run.includes(closing)) run.push(closing);
          txt = run.map((x) => x.clean).join(' ');
        }
        if (txt) cands.push({...base, data: {text: txt.slice(0, V.chip.maxChars)}});
      } else if (rule.component === 'LinkCard') {
        cands.push({...base, data: {text: w.clean}});
      } else if (rule.component === 'ImageCard') {
        const a = assetList.find((a) => a.nb.length >= 3 && (w.norm === a.nb || (w.norm.length >= 4 && a.nb.startsWith(w.norm))));
        const key = 'asset:' + a.nb;
        if (!lastTermAt.has(key) || w.startMs - lastTermAt.get(key) > 12000) {
          lastTermAt.set(key, w.startMs);
          cands.push({...base, data: {src: a.publicPath, label: w.clean}});
        }
      } else if (rule.component === 'Checklist') {
        if (m === 'list') {
          if (usedIdx.has(i)) return;
          const win = [];
          for (let j = i; j < words.length && words[j].startMs - w.startMs < 7000; j++) if (LIST.has(words[j].norm) && !usedIdx.has(j)) win.push(j);
          const items = [];
          for (const j of win) {
            const nxt = nextContent(j, 1, true).filter((x) => !LIST.has(x.norm))[0];
            if (nxt) items.push({text: nxt.clean, atMs: nxt.startMs - 100});
          }
          if (items.length >= 2) {
            win.forEach((j) => usedIdx.add(j));
            cands.push({...base, startMs: Math.max(base.startMs, items[0].atMs - 150), data: {items: items.slice(0, V.checklist.maxItems)}});
          }
        } else if (m === 'enum') {
          const items = enumRun.slice(0, V.checklist.maxItems).map((x) => ({text: x.clean, atMs: x.startMs - 100}));
          if (items.length >= 2) cands.push({...base, startMs: Math.max(base.startMs, items[0].atMs - 150), data: {items}});
        }
      } else if (rule.component === 'PercentRing') {
        const label = nextContent(i, V.stat.labelWords).map((x) => x.clean).join(' ');
        cands.push({...base, data: {value: w.clean.replace(/[%\u066a]/g, ''), label}});
      } else if (rule.component === 'KeyPhrase') {
        const text = words.slice(i, quoteEnd + 1).map((x) => x.clean).join(' ');
        if (text) cands.push({...base, data: {text}});
      } else if ((rule.component === 'KeywordChip' || rule.component === 'KeywordCard') && V.keyPhrase.phraseFromForeignRuns && rule.id === 'foreignTerm' && w.isForeign && words[i + 1] && words[i + 1].isForeign && !words[i + 1].isStop && !words[i + 1].isNumber && words[i + 1].startMs - w.endMs < 400 && !(words[i - 1] && words[i - 1].isForeign && words[i - 1].startMs > hookEnd)) {
        // a run of consecutive Latin words inside the speech ("first impressions", "Machine Learning") becomes one phrase
        const run = [w];
        for (let j = i + 1; j < words.length && run.length < V.keyPhrase.maxWords && words[j].isForeign && !words[j].isStop && !words[j].isNumber && words[j].startMs - words[j - 1].endMs < 400; j++) run.push(words[j]);
        while (run.length > 2 && run.map((x) => x.clean).join(' ').length > V.chip.maxChars + 8) run.pop();
        const key = 'phrase:' + run.map((x) => x.norm).join(' ');
        if (!lastTermAt.has(key) || w.startMs - lastTermAt.get(key) > 15000) {
          lastTermAt.set(key, w.startMs);
          cands.push({...base, component: 'KeyPhrase', data: {text: run.map((x) => x.clean).join(' ')}});
        }
      } else if (rule.component === 'KeywordChip' || rule.component === 'KeywordCard') {
        const key = 'term:' + w.norm;
        if (!lastTermAt.has(key) || w.startMs - lastTermAt.get(key) > 15000) {
          lastTermAt.set(key, w.startMs);
          cands.push({...base, data: {text: shorten(w.clean, V.chip.maxChars)}});
        }
      }
      return; // first matching rule wins
    }
  });

  // ---------- 5. schedule (spacing, priority, per-minute cap) ----------
  const B = V.beats;
  cands.sort((a, b) => a.startMs - b.startMs || a.priority - b.priority);
  const sched = [];
  for (const c of cands) {
    const last = sched[sched.length - 1];
    if (last && c.startMs < last.startMs + B.minHoldMs + B.minGapBetweenMs) {
      if (c.priority < last.priority && c.startMs >= last.startMs - 200) sched[sched.length - 1] = c;
      continue;
    }
    const recent = sched.filter((s) => c.startMs - s.startMs < 60000).length;
    if (recent >= B.maxVisualsPerMinute) continue;
    sched.push(c);
  }

  const finish = (list, isFallback = false) => {
    list.forEach((c, i) => {
      const next = list[i + 1];
      const natural = c.startMs + c.holdMs;
      if (c.component === 'SectionTitle') {
        c.endMs = Math.min(natural, durationMs - 100);
        return;
      }
      const sticky = B.stickyUntilNext ? Math.min(c.startMs + c.holdMs * B.stickyFactor, c.startMs + B.maxHoldMs) : natural;
      let end = next ? Math.min(sticky, next.startMs - B.minGapBetweenMs) : sticky;
      end = Math.max(end, c.startMs + B.minHoldMs);
      c.endMs = Math.min(end, durationMs - 100);
    });
  };
  finish(sched);

  // ---------- 6. idle gaps: head-only beats and fallback chips ----------
  const layouts = [];
  const beats = [];
  const headBeatsOn = hasVideo && cfg.pacing.layoutAlternation.enabled && cfg.pacing.layoutAlternation.headOnlyBeats;
  const gaps = [];
  let cursor = hookEnd;
  for (const c of sched) {
    if (c.startMs - cursor > 0) gaps.push([cursor, c.startMs]);
    cursor = c.endMs;
  }
  if (durationMs - cursor > 0) gaps.push([cursor, durationMs]);

  const pickFallbackWord = (a, b) => {
    const pool = words.filter((w) => w.startMs >= a && w.startMs <= b && !w.isStop && w.clean.length >= 3);
    if (!pool.length) return null;
    const freq = new Map();
    words.forEach((w) => freq.set(w.norm, (freq.get(w.norm) || 0) + 1));
    return pool.sort((x, y) => y.clean.length / freq.get(y.norm) - x.clean.length / freq.get(x.norm))[0];
  };

  // Walk every idle gap: alternate fallback keyword chips and head-only (full-screen) beats until the gap is covered.
  let alt = 0;
  const extra = [];
  const lead = cfg.visuals.rules[cfg.visuals.rules.length - 1].leadMs;
  const chipHold = V.fallback.holdMs;
  for (const [a, b] of gaps) {
    let c = a;
    while (b - c >= B.maxIdleMs) {
      const left = b - c;
      const beatMs = beats.reduce((s, x) => s + (x.endMs - x.startMs), 0);
      const turn = alt++ % V.fallback.beatEvery === V.fallback.beatEvery - 1;
      if (headBeatsOn && turn && left >= B.headOnlyBeatMinMs + 400 && beatMs + V.fallback.beatMs <= V.fallback.maxHeadOnlyShare * durationMs) {
        const len = Math.min(left - 150, V.fallback.beatMs);
        beats.push({startMs: c + 200, endMs: c + len});
        c += len;
        continue;
      }
      const w = pickFallbackWord(c + 300, Math.min(c + left * 0.6, c + V.fallback.searchWindowMs));
      if (!w) {
        c += V.fallback.searchWindowMs;
        continue;
      }
      const start = Math.max(c + B.minGapBetweenMs, w.startMs + lead);
      const comp = V.fallback.alternate[extra.length % V.fallback.alternate.length];
      let text = shorten(w.clean, V.chip.maxChars);
      if (comp === 'KeyPhrase') {
        // up to phraseWords consecutive spoken words around the chosen word, without stop words at the edges
        const k = words.indexOf(w);
        let lo = k;
        let hi = Math.min(words.length - 1, k + V.fallback.phraseWords - 1);
        while (hi > lo && words[hi].isStop) hi--;
        while (lo < hi && words[lo].isStop) lo++;
        text = words.slice(lo, hi + 1).map((x) => x.clean).join(' ');
      }
      extra.push({ruleId: 'fallback', component: comp, priority: 99, wordIdx: -1, startMs: start, holdMs: chipHold, data: {text}});
      c = start + chipHold + V.fallback.idleAfterMs;
    }
  }
  const all = [...sched, ...extra].sort((x, y) => x.startMs - y.startMs);
  finish(all);

  // ---------- 6b. periodic head-only beats ----------
  // Narrative speech produces many low-priority cards; every headBeatPeriodMs the speaker gets a clean full-screen beat (reference rhythm).
  if (headBeatsOn && !beats.length) {
    const LOW = new Set(B.lowPriority);
    let t0 = B.headBeatFirstMs;
    while (t0 + B.headBeatMs < durationMs - 4000) {
      const a = t0;
      const b = t0 + B.headBeatMs;
      const hits = all.filter((c) => c.startMs < b && c.endMs > a);
      if (hits.every((c) => LOW.has(c.component))) {
        hits.forEach((c) => {
          if (c.startMs >= a - 400) all.splice(all.indexOf(c), 1);
          else c.endMs = a - B.minGapBetweenMs;
        });
        beats.push({startMs: a, endMs: b});
        t0 = b + B.headBeatPeriodMs;
      } else {
        t0 += 1500;
      }
    }
  }

  // ---------- 7. ending (CTA) ----------
  const E = cfg.pacing.ending;
  const ctaLast = [...all].reverse().find((c) => c.component === 'CtaPill');
  let endingStart = null;
  if (hasVideo && E.fullLayoutOnCta && ctaLast && durationMs >= E.minVideoMs && ctaLast.startMs > durationMs - E.fullLayoutMs - 2500) {
    endingStart = Math.max(ctaLast.startMs - 400, durationMs - E.fullLayoutMs);
  }

  // layouts timeline
  const segs = [];
  const push = (startMs, layout) => {
    const last = segs[segs.length - 1];
    if (last && last.layout === layout) return;
    segs.push({startMs, layout});
  };
  push(0, defaultLayout);
  const marks = [];
  beats.forEach((b) => marks.push({a: b.startMs, b: b.endMs, layout: 'full'}));
  if (endingStart !== null) marks.push({a: endingStart, b: durationMs, layout: 'full'});
  if (hasVideo) {
    const DM = V.demo;
    const overlaps = (a, b) => marks.some((m) => a < m.b && b > m.a);
    for (const c of all) {
      const isSection = c.component === 'SectionTitle';
      if (!isSection && !DM.components.includes(c.component)) continue;
      const a = Math.max(0, c.startMs - DM.leadInMs);
      const b = Math.min(durationMs, c.endMs + DM.tailMs);
      if (b - a < DM.minMs * (isSection ? 0.8 : 1) || overlaps(a, b)) continue;
      marks.push({a, b, layout: isSection ? 'graphicOnly' : 'demo'});
    }
  }
  marks.sort((x, y) => x.a - y.a);
  for (const m of marks) {
    push(m.a, m.layout);
    if (m.b < durationMs) push(m.b, defaultLayout);
  }
  const layoutsOut = segs.map((s, i) => ({...s, endMs: segs[i + 1] ? segs[i + 1].startMs : durationMs}));

  // visuals shown while the head is full-screen: only compact types survive
  const COMPACT = new Set(['CtaPill', 'LinkCard', 'KeywordChip']);
  const layoutAt = (t) => [...layoutsOut].reverse().find((s) => s.startMs <= t)?.layout || defaultLayout;
  const fullSegs = layoutsOut.filter((s) => s.layout === 'full');
  const visuals = all
    .filter((c) => layoutAt(c.startMs + 50) !== 'full' || COMPACT.has(c.component))
    .map((c) => {
      // a non-compact graphic must not run into a head-only / ending beat: trim it before the layout change
      if (COMPACT.has(c.component)) return c;
      const hit = fullSegs.find((s) => s.startMs > c.startMs && s.startMs < c.endMs);
      return hit ? {...c, endMs: hit.startMs - B.minGapBetweenMs} : c;
    })
    .filter((c) => c.endMs - c.startMs >= B.minHoldMs * 0.6)
    .map((c, i) => ({id: `v${i}`, component: c.component, ruleId: c.ruleId, startMs: Math.round(c.startMs), endMs: Math.round(c.endMs), data: c.data}));
  const rotation = cfg.transitions.swapRotation;
  let rot = 0;
  visuals.forEach((v) => {
    v.variant = v.component === 'SectionTitle' ? 'flashCut' : rotation[rot++ % rotation.length];
  });

  // ---------- 8. shots (digital jump cuts) ----------
  const P = cfg.pacing;
  const gapPoints = [];
  for (let i = 0; i < words.length - 1; i++) {
    const g = words[i + 1].startMs - words[i].endMs;
    if (g >= 100 || punctRe.test(words[i].text)) gapPoints.push({t: Math.round((words[i].endMs + words[i + 1].startMs) / 2), g: g + (punctRe.test(words[i].text) ? 200 : 0)});
  }
  const bounds = [0];
  let lastB = hookEnd > 0 ? Math.max(hookEnd, P.hookFirstShotMs) : 0;
  if (lastB > 0) bounds.push(lastB);
  while (lastB + P.minShotMs < durationMs - P.minShotMs) {
    // a silence-cut seam is the best place for a punch-in: it hides the jump cut
    const seam = cuts.find((c) => c - lastB >= P.minShotMs && c < durationMs - P.minShotMs);
    if (seam !== undefined && seam - lastB <= P.maxShotMs) {
      lastB = seam;
      bounds.push(lastB);
      continue;
    }
    if (lastB + P.targetShotMs >= durationMs - P.minShotMs) break;
    const target = lastB + P.targetShotMs;
    const near = gapPoints.filter((p) => Math.abs(p.t - target) <= P.snapWindowMs && p.t - lastB >= P.minShotMs && p.t - lastB <= P.maxShotMs);
    const pick = near.sort((a, b) => b.g - a.g)[0];
    lastB = pick ? pick.t : target;
    bounds.push(lastB);
  }
  const shots = bounds.map((s, i) => ({startMs: s, endMs: bounds[i + 1] ?? durationMs, scale: P.punchInScales[i % P.punchInScales.length]}));

  // step badges: "n/N" pill that stays on screen from each spoken ordinal until the next one
  const badges = [];
  if (sectionMode) {
    ordIdx.forEach((i, k) => {
      const startMs = Math.max(hookEnd + 120, words[i].startMs + ST.leadMs);
      const endMs = k + 1 < ordIdx.length ? Math.max(startMs + 800, words[ordIdx[k + 1]].startMs + ST.leadMs - 100) : durationMs - 300;
      badges.push({startMs: Math.round(startMs), endMs: Math.round(endMs), n: k + 1, total: ordIdx.length});
    });
  }

  // ---------- 9. sound events ----------
  const S = cfg.sound;
  const sfx = [];
  const add = (type, atMs) => sfx.push({type, atMs: Math.max(0, Math.round(atMs))});
  for (const rule of S.rules) {
    if (rule.on === 'graphicEnter') visuals.filter((v) => v.component !== 'CtaPill' && v.component !== 'SectionTitle').forEach((v) => add(rule.sfx === '$variant' ? cfg.animations.swapVariants[v.variant].sfx : rule.sfx, v.startMs + rule.offsetMs));
    if (rule.on === 'sectionTitle') visuals.filter((v) => v.component === 'SectionTitle').forEach((v) => add(rule.sfx, v.startMs + rule.offsetMs));
    if (rule.on === 'ctaEnter') visuals.filter((v) => v.component === 'CtaPill').forEach((v) => add(rule.sfx, v.startMs + rule.offsetMs));
    if (rule.on === 'hookTitle' && hook) add(rule.sfx, hook.startMs + rule.offsetMs);
    if (rule.on === 'hookExit' && hook) add(rule.sfx, hook.endMs + rule.offsetMs);
    if (rule.on === 'layoutChange') layoutsOut.slice(1).forEach((s) => add(rule.sfx, s.startMs + rule.offsetMs));
    if (rule.on === 'layoutExpand') layoutsOut.slice(1).forEach((s) => s.layout !== defaultLayout && add(rule.sfx, s.startMs + rule.offsetMs));
    if (rule.on === 'layoutCollapse') layoutsOut.slice(1).forEach((s) => s.layout === defaultLayout && add(rule.sfx, s.startMs + rule.offsetMs));
    if (rule.on === 'checklistItem') visuals.filter((v) => v.component === 'Checklist').forEach((v) => v.data.items.slice(0, V.checklist.maxItems).forEach((it) => add(rule.sfx, (it.atMs ?? v.startMs) + rule.offsetMs)));
    if (rule.on === 'stepBadge') badges.forEach((b) => add(rule.sfx, b.startMs + rule.offsetMs));
    if (rule.on === 'percentRing') visuals.filter((v) => v.component === 'PercentRing').forEach((v) => add(rule.sfx, v.startMs + rule.offsetMs));
    if (rule.on === 'keyPhrase') visuals.filter((v) => v.component === 'KeyPhrase').forEach((v) => add(rule.sfx, v.startMs + rule.offsetMs));
  }
  sfx.sort((a, b) => a.atMs - b.atMs);
  const maxN = Math.ceil((S.maxSfxPerMinute * durationMs) / 60000);
  const sfxOut = sfx.slice(0, Math.max(maxN, 1));

  return {
    palette,
    lang,
    rtl,
    fps,
    width,
    height,
    durationMs,
    media,
    hook,
    layouts: layoutsOut,
    shots,
    pages,
    visuals,
    badges,
    sfx: sfxOut,
    stats: {
      words: words.length,
      pages: pages.length,
      visuals: visuals.length,
      visualTypes: visuals.reduce((m, v) => ((m[v.component] = (m[v.component] || 0) + 1), m), {}),
      layouts: layoutsOut.length,
      shots: shots.length,
      sfx: sfxOut.length,
      dominantScript: dom,
    },
  };
};
