/**
 * ModernStandards.test.js
 * The game targets the current versions of Chrome, Firefox, Safari and Node.js
 * only. These guards keep backward-compatibility code from creeping back in —
 * vendor prefixes, fallback declarations, vendor meta tags, legacy module
 * formats, feature detection for APIs every supported engine ships — and pin
 * the current standards that replaced the older idioms: native dialogs driven
 * by invoker commands, the hidden attribute, light-dark() tokens, media query
 * ranges, space-separated rgb() and private class members.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadStylesheet } from '../scripts/css-bundle.js';
import { loadClientScripts } from '../scripts/client-bundle.js';

const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** Strips comments, so assertions only see what an engine would run. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const css = loadStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
const html = read('public/index.html');
const clientJs = code(loadClientScripts());
const tokens = read('public/css/tokens.css');

/** The opening tag of the element with the given id. */
const tagOf = (id) => html.match(new RegExp('<[a-z]+\\b[^>]*\\bid="' + id + '"[^>]*>'))?.[0] ?? '';
const serverFiles = [
  'server.js',
  ...['lib', 'shared', 'scripts'].flatMap(dir =>
    fs.readdirSync(path.join(root, dir))
      .filter(name => name.endsWith('.js'))
      .map(name => `${dir}/${name}`))
];

describe('Stylesheet', () => {
  test('uses no vendor-prefixed properties, values or pseudo-elements', () => {
    expect(css).not.toMatch(/(?<![\w-])-(?:webkit|moz|ms|o)-/);
  });

  test('declares no property twice in a row as a fallback', () => {
    const pairs = Array.from(css.matchAll(/(?<![\w-])([\w-]+)\s*:[^;{}]+;\s*\1\s*:/g), match => match[0]);
    expect(pairs).toEqual([]);
  });

  test('uses no deprecated values', () => {
    expect(css).not.toMatch(/word-break:\s*break-word/);
  });

  test('writes media queries as ranges, not as min-/max- features', () => {
    expect(css).not.toMatch(/@media[^{]*\((?:min|max)-(?:width|height)\s*:/);
  });

  test('writes colours in the space-separated rgb() syntax', () => {
    expect(css).not.toMatch(/rgba\(|rgb\(\s*\d+\s*,/);
  });

  test('serves both themes from one token block through light-dark()', () => {
    expect(tokens).toMatch(/:root\s*\{\s*color-scheme:\s*light dark;/);
    expect(tokens).toContain('light-dark(');
    expect(css).not.toContain('prefers-color-scheme');
  });
});

describe('Page', () => {
  test('loads ES modules only', () => {
    const tags = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    tags.forEach(tag => expect(tag).toContain('type="module"'));
  });

  test('carries no vendor-specific meta tags', () => {
    expect(html).not.toMatch(/<meta\s+name="(?:apple-|mobile-web-app)/);
  });

  test('shows and hides with the hidden attribute, not a class', () => {
    expect(html).not.toMatch(/class="[^"]*\bhidden\b/);
    expect(tagOf('screen-game')).toMatch(/\shidden[\s>]/);
  });

  test('builds every overlay as a native dialog', () => {
    expect(html).not.toContain('modal-backdrop');
    ['modal-rules', 'modal-surrender', 'modal-game-over'].forEach(id => {
      expect(tagOf(id)).toMatch(/^<dialog\b/);
    });
  });

  test('opens and closes the rules and the surrender dialog through invoker commands', () => {
    ['btn-rules-login', 'btn-rules-game'].forEach(id => {
      expect(tagOf(id)).toContain('commandfor="modal-rules" command="show-modal"');
    });
    expect(tagOf('btn-close-rules')).toContain('commandfor="modal-rules" command="close"');
    expect(tagOf('btn-surrender')).toContain('commandfor="modal-surrender" command="show-modal"');
  });

  test('answers a dialog through its returnValue', () => {
    expect(html).toMatch(/<dialog id="modal-surrender"[\s\S]*?<form method="dialog"[\s\S]*?value="surrender"/);
    expect(tagOf('btn-play-again')).toContain('value="again"');
    expect(tagOf('btn-back-to-lobby')).toContain('value="lobby"');
  });
});

describe('Client', () => {
  test('uses no vendor-prefixed APIs', () => {
    expect(clientJs).not.toMatch(/\b(?:webkit|moz)[A-Z]\w*/);
  });

  test('does not feature-detect what every supported browser ships', () => {
    expect(clientJs).not.toMatch(/typeof\s+(?:window|document|module|globalThis)\b/);
    expect(clientJs).not.toMatch(/if\s*\(\s*window\.\w+\s*\)/);
  });

  test('shares code through imports, not through globals', () => {
    expect(clientJs).not.toMatch(/\bwindow\.\w+\s*=(?!=)/);
    expect(clientJs).not.toContain("'use strict'");
  });

  test('never blocks on the browser\'s own confirm, alert or prompt boxes', () => {
    expect(clientJs).not.toMatch(/\b(?:confirm|alert|prompt)\s*\(/);
  });

  test('toggles visibility through the hidden property, not a class', () => {
    expect(clientJs).not.toMatch(/classList\.\w+\(\s*'hidden'/);
  });
});

describe('Server, shared rules and tooling', () => {
  test.each(serverFiles)('%s is an ES module', (file) => {
    const source = code(read(file));
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bmodule\.exports\b/);
    expect(source).not.toMatch(/\b__dirname\b/);
  });

  test.each([...serverFiles, ...fs.readdirSync(path.join(root, 'public', 'js')).map(name => `public/js/${name}`)])('%s keeps its private members private (#), not by convention (_)', (file) => {
    expect(code(read(file))).not.toMatch(/^\s+(?:static\s+)?(?:get\s+)?_[A-Za-z]\w*\s*\(/m);
  });

  test.each(serverFiles)('%s imports Node built-ins through the node: scheme', (file) => {
    const builtins = ['fs', 'path', 'http', 'https', 'crypto', 'os', 'url', 'vm'];
    const specifiers = Array.from(read(file).matchAll(/\bfrom\s+'([^']+)'/g), match => match[1]);
    specifiers.forEach(specifier => expect(builtins).not.toContain(specifier));
  });
});
