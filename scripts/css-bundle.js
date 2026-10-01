#!/usr/bin/env node

/**
 * css-bundle.js
 * Resolves the @import graph of public/css/style.css into the single string a
 * browser effectively sees.
 *
 * The stylesheet is split into modules (see public/css/style.css), but the
 * contrast checker and the static CSS tests reason about the whole sheet —
 * about the cascade order, and about rules living in whichever module. They
 * read it through here instead of through one file, so moving a rule between
 * modules stays a refactor and never a silent loss of coverage.
 *
 * This is deliberately a resolver, not a preprocessor: imports are inlined at
 * their own position — inside an `@layer <name> { … }` block when they are
 * imported into a cascade layer, exactly as the browser applies them — and
 * everything else is passed through byte for byte.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The project's stylesheet entry point: the manifest of public/css. */
const ENTRY = path.join(import.meta.dirname, '..', 'public', 'css', 'style.css');

/**
 * `@import "a.css";` and `@import url("a.css");`, with either quote style and
 * optionally into a cascade layer: `@import url("a.css") layer(a);`.
 */
export const IMPORT_RE = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?(?:\s+layer\(\s*([\w.-]+)\s*\))?\s*;/g;

/** The `@layer a, b, c;` statement that fixes the order of the cascade layers. */
export const LAYER_ORDER_RE = /@layer\s+([\w.-]+(?:\s*,\s*[\w.-]+)*)\s*;/;

/**
 * Reads `entryFile` and replaces every @import with the (recursively resolved)
 * content of the imported file.
 *
 * @param {string} entryFile Absolute or cwd-relative path to a CSS file.
 * @param {Set<string>} [seen] Guards against import cycles.
 * @returns {string} The concatenated stylesheet.
 */
export function bundleCss(entryFile, seen = new Set()) {
  const absolute = path.resolve(entryFile);
  if (seen.has(absolute)) {
    throw new Error(`Circular @import: ${absolute}`);
  }
  seen.add(absolute);

  const dir = path.dirname(absolute);
  return fs.readFileSync(absolute, 'utf8').replace(IMPORT_RE, (_match, href, layer) => {
    const target = path.resolve(dir, href);
    if (!fs.existsSync(target)) {
      throw new Error(`@import target missing: ${href} (imported by ${absolute})`);
    }
    const content = bundleCss(target, seen);
    return layer ? `@layer ${layer} {\n${content}\n}` : content;
  });
}

/** The project's own stylesheet entry point, resolved and concatenated. */
export function loadStylesheet() {
  return bundleCss(ENTRY);
}

/** The manifest itself: public/css/style.css, unresolved. */
function readManifest() {
  return fs.readFileSync(ENTRY, 'utf8');
}

/** The imports listed in style.css, in import order: `{ href, layer }`. */
export function listImports() {
  return Array.from(readManifest().matchAll(IMPORT_RE), ([, href, layer]) => ({ href, layer: layer ?? null }));
}

/** The module paths listed in style.css, in import order. */
export function listModules() {
  return listImports().map(({ href }) => href);
}

/** The layer names of the manifest's `@layer` statement, lowest precedence first. */
export function listLayers() {
  const statement = readManifest().match(LAYER_ORDER_RE);
  return statement ? statement[1].split(',').map(name => name.trim()) : [];
}

// Called directly (`node scripts/css-bundle.js`): print the resolved sheet, so
// the bundle can be piped into any external CSS tool.
if (import.meta.main) {
  process.stdout.write(loadStylesheet());
}
