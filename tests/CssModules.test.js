/**
 * CssModules.test.js
 * Guards for the split stylesheet.
 *
 * public/css/style.css is a manifest: it holds no rules, only the @import
 * list that defines the cascade order. These assertions keep that contract
 * intact — a module that is never imported would silently stop applying, and
 * a rule that creeps back into the manifest would sit outside the modules.
 *
 * They also pin the seam the split had to cross: scripts/contrast-check.js
 * reads the design tokens out of the stylesheet, and skips whatever it cannot
 * find, so a sheet it stops understanding would pass CI reporting nothing.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadStylesheet, listModules, bundleCss } = require('../scripts/css-bundle');
const { parseCssVariables, runContrastCheck, CONTRAST_TESTS } = require('../scripts/contrast-check');

const cssDir = path.join(__dirname, '..', 'public', 'css');
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
    expect(rules(manifest).replace(/@import[^;]+;/g, '').trim()).toBe('');
  });

  test('loads the tokens first and the device adaptations last', () => {
    expect(modules[0]).toBe('tokens.css');
    expect(modules[modules.length - 1]).toBe('responsive.css');
  });

  test('is the only stylesheet the page links', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
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

describe('The resolver', () => {
  test('refuses an import cycle instead of looping forever', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-cycle-'));
    fs.writeFileSync(path.join(dir, 'a.css'), '@import url("b.css");\n');
    fs.writeFileSync(path.join(dir, 'b.css'), '@import url("a.css");\n');
    expect(() => bundleCss(path.join(dir, 'a.css'))).toThrow(/Circular @import/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('names the module when an import points nowhere', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-missing-'));
    fs.writeFileSync(path.join(dir, 'a.css'), '@import url("gone.css");\n');
    expect(() => bundleCss(path.join(dir, 'a.css'))).toThrow(/gone\.css/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
