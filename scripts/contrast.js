/**
 * WCAG 2.1 Contrast Calculation Module
 * 
 * Provides functions for calculating relative luminance and contrast ratios
 * per WCAG 2.1 §1.4.3.
 */

function hexToRgb(hex) {
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

function sRGBtoLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = sRGBtoLinear(rgb.r);
  const g = sRGBtoLinear(rgb.g);
  const b = sRGBtoLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgba(rgba) {
  const result = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/.exec(rgba);
  if (!result) return null;
  const r = parseInt(result[1], 10).toString(16).padStart(2, '0');
  const g = parseInt(result[2], 10).toString(16).padStart(2, '0');
  const b = parseInt(result[3], 10).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function resolveColor(value, themeVars) {
  if (!value) return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;
  if (value.startsWith('rgba(')) return parseRgba(value);
  if (value.startsWith('rgb(')) return parseRgba(value.replace('rgb(', 'rgba(').replace(')', ', 1)'));
  if (value.startsWith('var(')) return null;
  return null;
}

module.exports = { hexToRgb, sRGBtoLinear, relativeLuminance, contrastRatio, parseRgba, resolveColor };
