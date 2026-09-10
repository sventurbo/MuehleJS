const { hexToRgb, sRGBtoLinear, relativeLuminance, contrastRatio, parseRgba, resolveColor } = require('../scripts/contrast');

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

  describe('parseRgba', () => {
    test('parses rgba string', () => {
      expect(parseRgba('rgba(255, 128, 0, 0.5)')).toBe('#ff8000');
    });
    test('returns null for invalid', () => {
      expect(parseRgba('invalid')).toBeNull();
    });
  });

  describe('resolveColor', () => {
    test('returns hex color as-is', () => {
      expect(resolveColor('#d8dce4', {})).toBe('#d8dce4');
    });
    test('returns null for var() references', () => {
      expect(resolveColor('var(--text-main)', {})).toBeNull();
    });
    test('parses rgba strings', () => {
      expect(resolveColor('rgba(255, 0, 0, 0.8)', {})).toBe('#ff0000');
    });
    test('returns null for undefined', () => {
      expect(resolveColor(undefined, {})).toBeNull();
    });
    test('returns null for empty string', () => {
      expect(resolveColor('', {})).toBeNull();
    });
  });
});
