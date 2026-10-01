import {
  hexToRgb,
  sRGBtoLinear,
  relativeLuminance,
  contrastRatio,
  parseRgb,
  parseOklch,
  parseColor,
  parseColorMix,
  resolveColor
} from '../scripts/contrast.js';

describe('WCAG 2.1 Contrast Calculation', () => {
  describe('hexToRgb', () => {
    test('parses 6-digit hex', () => {
      expect(hexToRgb('#d8dce4')).toEqual({ r: 216, g: 220, b: 228 });
    });
    test('parses 3-digit hex', () => {
      expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    });
    test('parses hex without #', () => {
      expect(hexToRgb('d8dce4')).toEqual({ r: 216, g: 220, b: 228 });
    });
    test('returns null for invalid', () => {
      expect(hexToRgb('invalid')).toBeNull();
    });
  });

  describe('sRGBtoLinear', () => {
    test('returns linear for 0', () => {
      expect(sRGBtoLinear(0)).toBe(0);
    });
    test('returns linear for 255', () => {
      expect(sRGBtoLinear(255)).toBeCloseTo(1.0, 5);
    });
    test('returns linear for mid-range', () => {
      expect(sRGBtoLinear(128)).toBeGreaterThan(0);
      expect(sRGBtoLinear(128)).toBeLessThan(1);
    });
    test('handles threshold correctly', () => {
      expect(sRGBtoLinear(10)).toBeCloseTo(10 / 255 / 12.92, 5);
    });
  });

  describe('relativeLuminance', () => {
    test('white has luminance 1', () => {
      expect(relativeLuminance('#ffffff')).toBeCloseTo(1.0, 5);
    });
    test('black has luminance 0', () => {
      expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    });
    test('returns 0 for invalid hex', () => {
      expect(relativeLuminance('invalid')).toBe(0);
    });
  });

  describe('contrastRatio', () => {
    test('white on black is 21:1', () => {
      expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21.0, 1);
    });
    test('black on white is 21:1', () => {
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21.0, 1);
    });
    test('same color is 1:1', () => {
      expect(contrastRatio('#d8dce4', '#d8dce4')).toBeCloseTo(1.0, 1);
    });
    test('dark text on light background exceeds 4.5:1', () => {
      const ratio = contrastRatio('#1a1a2e', '#f0f2f5');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
    test('dark body text on dark bg exceeds 4.5:1', () => {
      const ratio = contrastRatio('#d8dce4', '#181c22');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
    test('dark accent on dark bg exceeds 3:1', () => {
      const ratio = contrastRatio('#5a70d0', '#181c22');
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
    test('light accent on light bg exceeds 3:1', () => {
      const ratio = contrastRatio('#1e4a94', '#f0f2f5');
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
  });

  describe('parseRgb', () => {
    test('parses rgb() with alpha', () => {
      expect(parseRgb('rgb(255 128 0 / 0.5)')).toBe('#ff8000');
    });
    test('parses opaque rgb()', () => {
      expect(parseRgb('rgb(18 129 63)')).toBe('#12813f');
    });
    test('does not read the legacy comma syntax', () => {
      expect(parseRgb('rgba(255, 128, 0, 0.5)')).toBeNull();
    });
    test('returns null for invalid', () => {
      expect(parseRgb('invalid')).toBeNull();
    });
  });

  // Expected values were taken from Chromium's getComputedStyle for the same
  // colours, so the checker reads them the way the browser draws them.
  describe('parseOklch', () => {
    test('reads white and black', () => {
      expect(parseOklch('oklch(100% 0 0)')).toBe('#ffffff');
      expect(parseOklch('oklch(0 0 0)')).toBe('#000000');
    });
    test('reads a token back to the hex value it was converted from', () => {
      expect(parseOklch('oklch(52.23% 0.1936 258.83)')).toBe('#0b62d6');
    });
    test('drops the alpha like parseRgb', () => {
      expect(parseOklch('oklch(52.23% 0.1936 258.83 / 0.1)')).toBe('#0b62d6');
    });
    test('returns null for anything else', () => {
      expect(parseOklch('rgb(0 0 0)')).toBeNull();
      expect(parseOklch('oklch(50% 0.1)')).toBeNull();
    });
  });

  describe('parseColorMix', () => {
    test('mixes in srgb, 50/50 when no percentage is given', () => {
      expect(resolveColor('color-mix(in srgb, #ff0000 50%, #0000ff)')).toBe('#800080');
      expect(resolveColor('color-mix(in srgb, #ff0000, #0000ff)')).toBe('#800080');
    });
    test('keeps the colour and only lowers the alpha when mixed with transparent', () => {
      const tint = parseColorMix('color-mix(in srgb, #0b62d6 10%, transparent)');
      expect(tint.r).toBeCloseTo(11, 10);
      expect(tint.g).toBeCloseTo(98, 10);
      expect(tint.b).toBeCloseTo(214, 10);
      expect(tint.alpha).toBeCloseTo(0.1, 10);
    });
    test('lowers the alpha when the percentages add up to less than 100%', () => {
      const mix = parseColorMix('color-mix(in srgb, #ff0000 20%, #0000ff 20%)');
      expect(mix.r).toBeCloseTo(127.5, 10);
      expect(mix.alpha).toBeCloseTo(0.4, 10);
    });
    test('mixes in oklch the short way round the hue circle', () => {
      // Chromium: oklch(0.539974 0.285457 326.643)
      expect(resolveColor('color-mix(in oklch, #ff0000, #0000ff)')).toBe('#ba00c2');
      // Chromium: oklch(0.556741 0.189725 299.144)
      expect(resolveColor('color-mix(in oklch, 30% #c9221c, #2f6fe0)')).toBe('#8550d1');
    });
    test('returns null when a colour in it cannot be read', () => {
      expect(parseColorMix('color-mix(in srgb, var(--accent-blue) 10%, transparent)')).toBeNull();
      expect(parseColorMix('color-mix(in hsl, #ff0000, #0000ff)')).toBeNull();
    });
  });

  describe('parseColor', () => {
    test('reads transparent as black with alpha 0', () => {
      expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, alpha: 0 });
    });
    test('reads hex and rgb() as opaque or with their alpha', () => {
      expect(parseColor('#12813f')).toEqual({ r: 18, g: 129, b: 63, alpha: 1 });
      expect(parseColor('rgb(18 129 63 / 0.2)')).toEqual({ r: 18, g: 129, b: 63, alpha: 0.2 });
    });
  });

  describe('resolveColor', () => {
    test('returns hex color as-is', () => {
      expect(resolveColor('#d8dce4')).toBe('#d8dce4');
    });
    test('returns null for var() references', () => {
      expect(resolveColor('var(--text-main)')).toBeNull();
    });
    test('parses rgb() strings', () => {
      expect(resolveColor('rgb(255 0 0 / 0.8)')).toBe('#ff0000');
    });
    test('parses oklch() and color-mix() strings', () => {
      expect(resolveColor('oklch(100% 0 0)')).toBe('#ffffff');
      expect(resolveColor('color-mix(in srgb, #ffffff 72%, transparent)')).toBe('#ffffff');
    });
    test('returns null for undefined', () => {
      expect(resolveColor(undefined)).toBeNull();
    });
    test('returns null for empty string', () => {
      expect(resolveColor('')).toBeNull();
    });
  });
});
