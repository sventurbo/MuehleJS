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
 * their own position, everything else is passed through byte for byte.
 */

const fs = require('fs');
const path = require('path');

/** `@import "a.css";` and `@import url("a.css");`, with either quote style. */
const IMPORT_RE = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/g;

/**
 * Reads `entryFile` and replaces every @import with the (recursively resolved)
 * content of the imported file.
 *
 * @param {string} entryFile Absolute or cwd-relative path to a CSS file.
 * @param {Set<string>} [seen] Guards against import cycles.
 * @returns {string} The concatenated stylesheet.
 */
function bundleCss(entryFile, seen = new Set()) {
  const absolute = path.resolve(entryFile);
  if (seen.has(absolute)) {
    throw new Error(`Circular @import: ${absolute}`);
  }
  seen.add(absolute);

  const dir = path.dirname(absolute);
  return fs.readFileSync(absolute, 'utf8').replace(IMPORT_RE, (_match, href) => {
    const target = path.resolve(dir, href);
    if (!fs.existsSync(target)) {
      throw new Error(`@import target missing: ${href} (imported by ${absolute})`);
    }
    return bundleCss(target, seen);
  });
}

/** The project's own stylesheet entry point, resolved and concatenated. */
function loadStylesheet() {
  return bundleCss(path.join(__dirname, '..', 'public', 'css', 'style.css'));
}

/** The module paths listed in style.css, in cascade order. */
function listModules() {
  const entry = path.join(__dirname, '..', 'public', 'css', 'style.css');
  const source = fs.readFileSync(entry, 'utf8');
  return Array.from(source.matchAll(IMPORT_RE), match => match[1]);
}

module.exports = { bundleCss, loadStylesheet, listModules, IMPORT_RE };

// Called directly (`node scripts/css-bundle.js`): print the resolved sheet, so
// the bundle can be piped into any external CSS tool.
if (require.main === module) {
  process.stdout.write(loadStylesheet());
}
