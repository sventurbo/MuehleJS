#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const INDEX_HTML = path.join(ROOT, 'public', 'index.html');

const PAGE_URL = new URL('http://muehle.invalid/');

export const SCRIPT_RE = /<script\s+type="module"\s+src="([^"]+)"/gi;

export const IMPORT_RE = /^\s*import\s+(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

const EXTERNAL_PREFIXES = ['/socket.io/'];

export function resolveScript(urlPath) {
  const relative = urlPath.startsWith('/shared/')
    ? path.join('shared', urlPath.slice('/shared/'.length))
    : path.join('public', urlPath.slice(1));
  return path.join(ROOT, relative);
}

function readModule(urlPath) {
  const file = resolveScript(urlPath);
  if (!fs.existsSync(file)) {
    throw new Error(`module ${urlPath} points nowhere: ${file} is missing`);
  }
  return fs.readFileSync(file, 'utf8');
}

export function listScripts() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const entries = Array.from(html.matchAll(SCRIPT_RE), ([, src]) => new URL(src, PAGE_URL));
  const ordered = [];
  const seen = new Set();

  const visit = url => {
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

export function loadClientScripts() {
  return listScripts().map(readModule).join('\n');
}

if (import.meta.main) {
  process.stdout.write(loadClientScripts());
}
