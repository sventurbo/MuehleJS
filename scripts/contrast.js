/**
 * WCAG 2.1 Contrast Calculation Module
 * 
 * Provides functions for calculating relative luminance and contrast ratios
 * per WCAG 2.1 §1.4.3.
 */

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const expanded = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
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

/**
 * Reads `rgb(r g b)` or `rgb(r g b / alpha)` into a hex colour. The alpha is
 * dropped: every translucent token is checked as if it were opaque.
 */
export function parseRgb(rgb) {
  const result = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*[\d.]+%?\s*)?\)$/.exec(rgb);
  if (!result) return null;
  const r = parseInt(result[1], 10).toString(16).padStart(2, '0');
  const g = parseInt(result[2], 10).toString(16).padStart(2, '0');
  const b = parseInt(result[3], 10).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** A token value as a hex colour, or null when it is not a literal colour. */
export function resolveColor(value) {
  if (!value) return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;
  if (value.startsWith('rgb(')) return parseRgb(value);
  return null;
}
