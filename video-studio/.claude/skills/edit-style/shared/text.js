// Shared text helpers (Node + Remotion). Language data comes from style.config.json, never from here.
export const scriptOf = (config, str) => {
  const scripts = config.fonts.scripts;
  let best = null;
  let bestCount = 0;
  for (const [name, re] of Object.entries(scripts)) {
    const m = str.match(new RegExp(re, 'g'));
    const n = m ? m.length : 0;
    if (n > bestCount) {
      best = name;
      bestCount = n;
    }
  }
  return best;
};

export const dominantScript = (config, words) => {
  const counts = {};
  for (const w of words) {
    const s = scriptOf(config, w.text);
    if (s) counts[s] = (counts[s] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'latin';
};

export const isRtlScript = (config, script) => config.fonts.rtlScripts.includes(script);

// Normalisation for lexicon matching (diacritics, tatweel, alef variants, punctuation).
export const normalize = (str) =>
  str
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[“”"'`´’‘«».,!?;:،؛؟…()\[\]{}]/g, '')
    .trim();

// Trims punctuation at both ends only (keeps internal apostrophes, dots in URLs, decimal commas).
export const stripPunct = (str) => str.replace(/^[“”"'`´’‘«».,!?;:،؛؟…()\[\]{}]+|[“”"'`´’‘«».,!?;:،؛؟…()\[\]{}]+$/g, '').trim();

export const toWesternDigits = (str) =>
  str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/٫/g, '.').replace(/٬/g, ',');
