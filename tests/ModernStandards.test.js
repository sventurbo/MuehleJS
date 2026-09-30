/**
 * ModernStandards.test.js
 * The game targets the current versions of Chrome, Firefox, Safari and Node.js
 * only. These guards keep backward-compatibility code from creeping back in:
 * vendor prefixes, fallback declarations, vendor meta tags, legacy module
 * formats and feature detection for APIs every supported engine ships.
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
});

describe('Server, shared rules and tooling', () => {
  test.each(serverFiles)('%s is an ES module', (file) => {
    const source = code(read(file));
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bmodule\.exports\b/);
    expect(source).not.toMatch(/\b__dirname\b/);
  });

  test.each(serverFiles)('%s imports Node built-ins through the node: scheme', (file) => {
    const builtins = ['fs', 'path', 'http', 'https', 'crypto', 'os', 'url', 'vm'];
    const specifiers = Array.from(read(file).matchAll(/\bfrom\s+'([^']+)'/g), match => match[1]);
    specifiers.forEach(specifier => expect(builtins).not.toContain(specifier));
  });
});
