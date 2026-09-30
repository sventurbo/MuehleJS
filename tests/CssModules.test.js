/**
 * CssModules.test.js
 * Guards for the split stylesheet.
 *
 * public/css/style.css is a manifest: it holds no rules, only the @layer
 * statement that fixes the cascade order and the @import list that puts every
 * module into its layer. These assertions keep that contract
 * intact — a module that is never imported would silently stop applying, and
 * a rule that creeps back into the manifest would sit outside the modules.
 *
 * They also pin the seam the split had to cross: scripts/contrast-check.js
 * reads the design tokens out of the stylesheet, and skips whatever it cannot
 * find, so a sheet it stops understanding would pass CI reporting nothing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadStylesheet, listModules, listImports, listLayers, bundleCss } from '../scripts/css-bundle.js';
import { parseCssVariables, resolveScheme, runContrastCheck, CONTRAST_TESTS } from '../scripts/contrast-check.js';

const cssDir = path.join(import.meta.dirname, '..', 'public', 'css');
const manifest = fs.readFileSync(path.join(cssDir, 'style.css'), 'utf8');
const modules = listModules();

/** Strips comments, so assertions only see the rules a browser would apply. */
function rules(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

describe('The manifest', () => {
  test('imports every module in public/css, exactly once', () => {
    const onDisk = fs.readdirSync(cssDir)
      .filter(name => name.endsWith('.css') && name !== 'style.css')
      .sort();
    expect([...modules].sort()).toEqual(onDisk);
    expect(new Set(modules).size).toBe(modules.length);
  });

  test('carries no rules of its own', () => {
    expect(rules(manifest).replace(/@(?:import|layer)[^;{]+;/g, '').trim()).toBe('');
  });

  test('imports every module into a cascade layer of its own name', () => {
    listImports().forEach(({ href, layer }) => {
      expect({ href, layer }).toEqual({ href, layer: href.replace(/\.css$/, '') });
    });
  });

  test('declares the layer order once, matching the import order', () => {
    expect(listLayers()).toEqual(listImports().map(({ layer }) => layer));
  });

  test('loads the tokens first and the device adaptations last', () => {
    expect(modules[0]).toBe('tokens.css');
    expect(modules[modules.length - 1]).toBe('responsive.css');
  });

  test('is the only stylesheet the page links', () => {
    const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'index.html'), 'utf8');
    const hrefs = Array.from(html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g), m => m[1]);
    expect(hrefs).toEqual(['css/style.css']);
  });
});

describe('The resolved stylesheet', () => {
  const css = loadStylesheet();

  test('holds every module whole, in import order', () => {
    // Resolving is concatenation, nothing else: each module has to appear
    // verbatim, and after the one imported before it.
    const bundled = rules(css);
    let cursor = -1;
    for (const name of modules) {
      const body = rules(fs.readFileSync(path.join(cssDir, name), 'utf8'));
      const at = bundled.indexOf(body);
      expect({ module: name, found: at > -1 }).toEqual({ module: name, found: true });
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  test('every declared custom property comes from the token module', () => {
    const declaredIn = name => {
      const body = rules(fs.readFileSync(path.join(cssDir, name), 'utf8'));
      return new Set(Array.from(body.matchAll(/(--[\w-]+)\s*:/g), m => m[1]));
    };
    expect(declaredIn('tokens.css').size).toBeGreaterThan(50);
    for (const name of modules.filter(m => m !== 'tokens.css')) {
      // --travel-x/--travel-y are set inline by boardRenderer.js per stone and
      // only have a fallback in the module that animates them.
      const local = [...declaredIn(name)].filter(v => !v.startsWith('--travel-'));
      expect({ module: name, declared: local }).toEqual({ module: name, declared: [] });
    }
  });
});

describe('The contrast checker still reaches the tokens', () => {
  // runContrastCheck() skips a pair whose variables it cannot find, so a sheet
  // it can no longer parse does not fail the check — it reports nothing and
  // passes. These assertions make that silence loud.
  const variables = parseCssVariables(loadStylesheet());

  test('both themes are parsed out of the resolved sheet', () => {
    expect(Object.keys(variables.dark).length).toBeGreaterThan(50);
    expect(Object.keys(variables.light).length).toBeGreaterThan(30);
  });

  test('every pair it asserts resolves in both themes', () => {
    for (const theme of ['dark', 'light']) {
      const missing = CONTRAST_TESTS
        .flatMap(t => [t.fgVar, t.bgVar])
        .filter(name => !variables[theme][name]);
      expect({ theme, missing: [...new Set(missing)] }).toEqual({ theme, missing: [] });
    }
  });

  test('no pair is quietly dropped from the report', () => {
    const { results } = runContrastCheck(loadStylesheet());
    expect(results).toHaveLength(CONTRAST_TESTS.length * 2);
  });
});

describe('light-dark() pairs', () => {
  test('resolve to the side of the requested theme', () => {
    expect(resolveScheme('light-dark(#ffffff, #16161a)', 'light')).toBe('#ffffff');
    expect(resolveScheme('light-dark(#ffffff, #16161a)', 'dark')).toBe('#16161a');
  });

  test('may hold functions with their own commas and slashes', () => {
    const value = 'light-dark(rgb(0 0 0 / 0.09), rgb(255 255 255 / 0.09))';
    expect(resolveScheme(value, 'light')).toBe('rgb(0 0 0 / 0.09)');
    expect(resolveScheme(value, 'dark')).toBe('rgb(255 255 255 / 0.09)');
  });

  test('are resolved one by one inside a longer value', () => {
    const shadow = '0 1px 2px light-dark(rgb(0 0 0 / 0.04), rgb(0 0 0 / 0.5)), 0 8px 24px light-dark(#111111, #222222)';
    expect(resolveScheme(shadow, 'light')).toBe('0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px #111111');
    expect(resolveScheme(shadow, 'dark')).toBe('0 1px 2px rgb(0 0 0 / 0.5), 0 8px 24px #222222');
  });

  test('leave a value without a pair untouched', () => {
    expect(resolveScheme('#54545f', 'light')).toBe('#54545f');
  });

  test('refuse a malformed pair instead of guessing', () => {
    expect(() => resolveScheme('light-dark(#ffffff)', 'dark')).toThrow(/Malformed/);
  });
});

describe('The resolver', () => {
  test('refuses an import cycle instead of looping forever', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-cycle-'));
    fs.writeFileSync(path.join(dir, 'a.css'), '@import url("b.css");\n');
    fs.writeFileSync(path.join(dir, 'b.css'), '@import url("a.css");\n');
    expect(() => bundleCss(path.join(dir, 'a.css'))).toThrow(/Circular @import/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('wraps a layered import in its @layer block', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-layer-'));
    fs.writeFileSync(path.join(dir, 'a.css'), '@layer b;\n@import url("b.css") layer(b);\n');
    fs.writeFileSync(path.join(dir, 'b.css'), '.x { color: red; }');
    expect(bundleCss(path.join(dir, 'a.css'))).toBe('@layer b;\n@layer b {\n.x { color: red; }\n}\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('names the module when an import points nowhere', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-missing-'));
    fs.writeFileSync(path.join(dir, 'a.css'), '@import url("gone.css");\n');
    expect(() => bundleCss(path.join(dir, 'a.css'))).toThrow(/gone\.css/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
