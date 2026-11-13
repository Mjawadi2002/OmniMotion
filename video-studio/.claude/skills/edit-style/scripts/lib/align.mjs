// Aligns a user-supplied plain-text transcript to recognised words: the TEXT is the user's, the TIMINGS come from the audio.
const norm = (t) => t.toLowerCase().normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const lev = (a, b) => {
  const d = Array.from({length: a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

export const alignText = (text, audioWords, durationMs) => {
  const sTok = text.split(/\s+/).filter(Boolean);
  const wTok = audioWords.map((w) => norm(w.text));
  const cost = (a, b) => {
    const x = norm(a);
    if (x === b) return 0;
    if (!x || !b) return 1.2;
    return lev(x, b) <= Math.max(1, Math.floor(Math.max(x.length, b.length) / 3)) ? 0.35 : 1.2;
  };
  const n = sTok.length;
  const m = wTok.length;
  const dp = Array.from({length: n + 1}, () => new Float32Array(m + 1));
  for (let i = 1; i <= n; i++) dp[i][0] = i * 0.9;
  for (let j = 1; j <= m; j++) dp[0][j] = j * 0.9;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) dp[i][j] = Math.min(dp[i - 1][j - 1] + cost(sTok[i - 1], wTok[j - 1]), dp[i - 1][j] + 0.9, dp[i][j - 1] + 0.9);
  const match = new Array(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const c = cost(sTok[i - 1], wTok[j - 1]);
    if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + c)) < 1e-4 && c < 1.2) {
      match[i - 1] = j - 1;
      i--;
      j--;
    } else if (Math.abs(dp[i][j] - (dp[i - 1][j] + 0.9)) < 1e-4) i--;
    else j--;
  }
  const out = sTok.map((t, k) => (match[k] >= 0 ? {text: t, startMs: audioWords[match[k]].startMs, endMs: audioWords[match[k]].endMs, conf: audioWords[match[k]].conf, matched: true} : {text: t, matched: false}));
  for (let k = 0; k < n; k++) {
    if (out[k].matched) continue;
    let p = k - 1;
    while (p >= 0 && !out[p].matched) p--;
    let q = k + 1;
    while (q < n && !out[q].matched) q++;
    const a = p >= 0 ? out[p].endMs : 0;
    const b = q < n ? out[q].startMs : durationMs;
    const span = q - p;
    out[k].startMs = Math.round(a + ((b - a) * (k - p)) / span);
    out[k].endMs = Math.round(a + ((b - a) * (k - p + 1)) / span);
  }
  return {words: out.map(({text, startMs, endMs, conf}) => ({text, startMs, endMs, conf})), unmatched: out.filter((w) => !w.matched).map((w) => w.text)};
};
export {norm};
