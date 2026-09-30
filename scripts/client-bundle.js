#!/usr/bin/env node

/**
 * client-bundle.js
 * Resolves the module graph of public/index.html into the single string a
 * browser effectively runs.
 *
 * The client is split into ES modules (the shared rules, the sound controller,
 * the board renderer, three views and the controller), but the static client
 * tests reason about the client as a whole — about behaviour that has to exist
 * *somewhere*, not about the file it currently lives in. They read it through
 * here, so moving a function between modules stays a refactor and never a
 * silent loss of coverage.
 *
 * This is the JavaScript twin of scripts/css-bundle.js, and deliberately a
 * resolver rather than a bundler: starting at every `<script type="module">`
 * of the page, it follows the static `import` statements and concatenates the
 * modules in evaluation order (dependencies before their importers), otherwise
 * passing them through byte for byte.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const INDEX_HTML = path.join(ROOT, 'public', 'index.html');

/** Base the browser resolves the page's URLs against; only the path matters. */
const PAGE_URL = new URL('http://muehle.invalid/');

/** `<script type="module" src="…">`, in document order. */
export const SCRIPT_RE = /<script\s+type="module"\s+src="([^"]+)"/g;

/** A static `import … from '…'` or `import '…'` at the start of a line. */
export const IMPORT_RE = /^\s*import\s+(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

/** Served by Socket.io at runtime, so there is no file of ours behind it. */
const EXTERNAL_PREFIXES = ['/socket.io/'];

/**
 * Turns a URL path the browser requests into the file on disk that serves it.
 * Mirrors the two static mounts in server.js: /shared → shared/, else public/.
 *
 * @param {string} urlPath Absolute URL path, e.g. '/js/app.js'.
 * @returns {string} Absolute path of the file.
 */
export function resolveScript(urlPath) {
  const relative = urlPath.startsWith('/shared/')
    ? path.join('shared', urlPath.slice('/shared/'.length))
    : path.join('public', urlPath.slice(1));
  return path.join(ROOT, relative);
}

/** Reads a module named by its URL path, failing loudly when it is missing. */
function readModule(urlPath) {
  const file = resolveScript(urlPath);
  if (!fs.existsSync(file)) {
    throw new Error(`module ${urlPath} points nowhere: ${file} is missing`);
  }
  return fs.readFileSync(file, 'utf8');
}

/**
 * The project's own modules the page loads, as absolute URL paths in
 * evaluation order: every module after the modules it imports, the page's
 * entry modules last.
 */
export function listScripts() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const entries = Array.from(html.matchAll(SCRIPT_RE), ([, src]) => new URL(src, PAGE_URL));
  const ordered = [];
  const seen = new Set();

  const visit = (url) => {
    const urlPath = url.pathname;
    if (EXTERNAL_PREFIXES.some(prefix => urlPath.startsWith(prefix))) return;
    if (seen.has(urlPath)) return;
    seen.add(urlPath);

    for (const [, specifier] of readModule(urlPath).matchAll(IMPORT_RE)) {
      visit(new URL(specifier, url));
    }
    ordered.push(urlPath);
  };

  entries.forEach(visit);
  return ordered;
}

/**
 * The client source as the browser sees it: every module the page loads,
 * concatenated in evaluation order.
 */
export function loadClientScripts() {
  return listScripts().map(readModule).join('\n');
}

// Called directly (`node scripts/client-bundle.js`): print the resolved source.
if (import.meta.main) {
  process.stdout.write(loadClientScripts());
}
