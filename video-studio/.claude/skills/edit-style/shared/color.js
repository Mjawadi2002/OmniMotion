// Shared by Node scripts AND the Remotion bundle. Pure functions, no I/O.
export const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
export const rgbToHex = (rgb) =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

export const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

export const mix = (a, b, t) => {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((v, i) => v + (cb[i] - v) * t));
};

export const withAlpha = (hex, alpha) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

// Moves `fg` toward white or black (whichever helps) until contrast >= min. Returns {hex, changed}.
export const ensureContrast = (fg, bg, min) => {
  if (contrast(fg, bg) >= min) return { hex: fg, changed: false };
  const toward = luminance(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const cand = mix(fg, toward, t);
    if (contrast(cand, bg) >= min) return { hex: cand, changed: true };
  }
  return { hex: toward, changed: true };
};

// Roles that are brand colors: never auto-modified, only reported.
const BRAND_ROLES = new Set(['primary', 'accent', 'accentDeep', 'background', 'backgroundAlt', 'shape', 'surface', 'surfaceAlt', 'outline', 'shadow', 'highlight', 'glow', 'captionBg']);

export const resolvePalette = (config, paletteName) => {
  const pal = config.palettes[paletteName];
  if (!pal) throw new Error(`Unknown palette "${paletteName}". Available: ${Object.keys(config.palettes).join(', ')}`);
  const roles = { ...pal.roles };
  const report = [];
  const c = config.contrast;
  for (const [fg, bg, size] of [...c.pairs, ...((c.pairsByPalette && c.pairsByPalette[paletteName]) || [])]) {
    if (!roles[fg] || !roles[bg]) continue;
    const min = size === 'large' ? c.minLarge : c.minNormal;
    const before = contrast(roles[fg], roles[bg]);
    if (before >= min) {
      report.push({ fg, bg, size, ratio: +before.toFixed(2), min, status: 'pass' });
      continue;
    }
    if (c.autoFix && !BRAND_ROLES.has(fg)) {
      const fixed = ensureContrast(roles[fg], roles[bg], min);
      const from = roles[fg];
      roles[fg] = fixed.hex;
      report.push({ fg, bg, size, ratio: +contrast(roles[fg], roles[bg]).toFixed(2), min, status: 'fixed', from, to: fixed.hex });
    } else {
      report.push({ fg, bg, size, ratio: +before.toFixed(2), min, status: 'FAIL (brand role, not auto-fixed)' });
    }
  }
  return { roles, report, preset: config.presets[pal.preset], presetName: pal.preset, pal };
};
