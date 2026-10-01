/**
 * WCAG 2.1 Contrast Calculation Module
 *
 * Provides functions for calculating relative luminance and contrast ratios
 * per WCAG 2.1 §1.4.3, and for reading the CSS colours the design tokens are
 * written in: hex, rgb(), oklch() and color-mix() of those.
 */

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const expanded =
    clean.length === 3
      ? clean
          .split('')
          .map(c => c + c)
          .join('')
      : clean;
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(expanded);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };
}

export function sRGBtoLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = sRGBtoLinear(rgb.r);
  const g = sRGBtoLinear(rgb.g);
  const b = sRGBtoLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Reading CSS colours ─────────────────────────────────────────────────────
// Every colour is read into sRGB channels from 0 to 255 plus an alpha from 0
// to 1, the form the luminance formula above works on. The OKLab matrices are
// the ones CSS Color 4 specifies for oklab() and oklch().

/** A linear-light sRGB channel (0–1) encoded with the sRGB transfer curve. */
function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** OKLCH (lightness 0–1, chroma, hue in degrees) to sRGB channels 0–255. */
function oklchToRgb(L, C, H) {
  const hue = (H * Math.PI) / 180;
  const a = C * Math.cos(hue);
  const b = C * Math.sin(hue);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  // Colours outside the sRGB gamut are clipped to it.
  const [r, g, bl] = linear.map(c => 255 * linearToSrgb(Math.min(1, Math.max(0, c))));
  return { r, g, b: bl };
}

/**
 * sRGB channels 0–255 to OKLCH. A grey has no hue, so its hue is null.
 * sRGBtoLinear() uses WCAG's threshold 0.03928 instead of the sRGB curve's
 * 0.04045; no 8-bit channel value lies between the two, so both agree.
 */
function rgbToOklch({ r, g, b }) {
  const [lr, lg, lb] = [r, g, b].map(sRGBtoLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  const H = C < 1e-4 ? null : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

/** A number, or a percentage of `full` ('50%' of 1 is 0.5). */
function amount(token, full) {
  return token.endsWith('%') ? (parseFloat(token) / 100) * full : parseFloat(token);
}

/** `rgb(r g b)` or `rgb(r g b / a)` in the space-separated syntax. */
const RGB_RE = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/;

/** `oklch(L C H)` or `oklch(L C H / a)`; L and C may be percentages. */
const OKLCH_RE = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+|none)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/;

/**
 * Reads a CSS colour into `{ r, g, b, alpha }`, or returns null for anything
 * that is not a literal colour (a var() reference, a keyword other than
 * `transparent`, the legacy comma syntax).
 */
export function parseColor(value) {
  const text = value.trim();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
  if (text.startsWith('#')) {
    const rgb = hexToRgb(text);
    return rgb && { ...rgb, alpha: 1 };
  }

  const rgb = RGB_RE.exec(text);
  if (rgb) {
    const [r, g, b] = rgb.slice(1, 4).map(Number);
    return { r, g, b, alpha: rgb[4] ? amount(rgb[4], 1) : 1 };
  }

  const oklch = OKLCH_RE.exec(text);
  if (oklch) {
    const L = amount(oklch[1], 1);
    const C = amount(oklch[2], 0.4); // CSS Color 4: 100% chroma is 0.4
    const H = oklch[3] === 'none' ? 0 : Number(oklch[3]);
    return { ...oklchToRgb(L, C, H), alpha: oklch[4] ? amount(oklch[4], 1) : 1 };
  }

  if (text.startsWith('color-mix(')) return parseColorMix(text);
  return null;
}

/** Splits at the commas that are not inside parentheses. */
function splitTopLevel(text) {
  const parts = [''];
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) parts.push('');
    else parts[parts.length - 1] += ch;
  }
  return parts.map(part => part.trim());
}

/** One argument of color-mix(): a colour with an optional percentage before or after it. */
function mixStop(part) {
  const match = /^(?:(\d*\.?\d+)%\s+)?(.+?)(?:\s+(\d*\.?\d+)%)?$/s.exec(part);
  const percent = match[1] ?? match[3];
  return { color: parseColor(match[2]), percent: percent === undefined ? null : Number(percent) };
}

/** Mixes two hues the short way round the circle; a missing hue takes the other's. */
function mixHue(h1, h2, weight) {
  if (h1 === null) return h2 ?? 0;
  if (h2 === null) return h1;
  let delta = h2 - h1;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return (h1 + delta * weight + 360) % 360;
}

/**
 * Reads `color-mix(in srgb | oklch, <colour> [p%], <colour> [p%])` as CSS
 * Color 5 defines it: a missing percentage is whatever the other one leaves
 * of 100%, a sum below 100% lowers the alpha, and channels are mixed
 * premultiplied by their alpha. Mixing a colour with `transparent` therefore
 * keeps the colour and only scales its alpha, which is what the tints do.
 */
export function parseColorMix(value) {
  const match = /^color-mix\(\s*in\s+(srgb|oklch)\s*,([\s\S]*)\)$/.exec(value.trim());
  if (!match) return null;
  const stops = splitTopLevel(match[2]).map(mixStop);
  if (stops.length !== 2 || !stops[0].color || !stops[1].color) return null;

  let [p1, p2] = stops.map(stop => stop.percent);
  if (p1 === null && p2 === null) p1 = p2 = 50;
  else if (p1 === null) p1 = 100 - p2;
  else if (p2 === null) p2 = 100 - p1;
  const sum = p1 + p2;
  if (sum <= 0) return null;

  const [c1, c2] = stops.map(stop => stop.color);
  const weight = p2 / sum; // share of the second colour
  const alpha = c1.alpha * (1 - weight) + c2.alpha * weight;
  // Premultiplied mix of one component, divided by the mixed alpha again.
  const mix = (v1, v2) => (alpha === 0 ? 0 : (v1 * c1.alpha * (1 - weight) + v2 * c2.alpha * weight) / alpha);

  let rgb;
  if (match[1] === 'srgb') {
    rgb = { r: mix(c1.r, c2.r), g: mix(c1.g, c2.g), b: mix(c1.b, c2.b) };
  } else {
    const [o1, o2] = [rgbToOklch(c1), rgbToOklch(c2)];
    rgb = oklchToRgb(mix(o1.L, o2.L), mix(o1.C, o2.C), mixHue(o1.H, o2.H, weight));
  }
  return { ...rgb, alpha: alpha * Math.min(1, sum / 100) };
}

/** `{ r, g, b }` with channels from 0 to 255 as `#rrggbb`. */
function toHex({ r, g, b }) {
  const channel = c =>
    Math.round(Math.min(255, Math.max(0, c)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Reads `rgb(r g b)` or `rgb(r g b / alpha)` into a hex colour. The alpha is
 * dropped: every translucent token is checked as if it were opaque.
 */
export function parseRgb(rgb) {
  return RGB_RE.test(rgb) ? toHex(parseColor(rgb)) : null;
}

/** Reads `oklch(L C H)` or `oklch(L C H / alpha)` into a hex colour, alpha dropped. */
export function parseOklch(oklch) {
  return OKLCH_RE.test(oklch.trim()) ? toHex(parseColor(oklch)) : null;
}

/**
 * A token value as a hex colour, or null when it is not a literal colour. The
 * alpha is dropped, as for rgb(): translucent tokens are checked as if opaque.
 */
export function resolveColor(value) {
  if (!value) return null;
  const color = parseColor(value);
  return color ? toHex(color) : null;
}
