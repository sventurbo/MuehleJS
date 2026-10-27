#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ENTRY = path.join(import.meta.dirname, '..', 'public', 'css', 'style.css');

export const IMPORT_RE = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?(?:\s+layer\(\s*([\w.-]+)\s*\))?\s*;/g;

export const LAYER_ORDER_RE = /@layer\s+([\w.-]+(?:\s*,\s*[\w.-]+)*)\s*;/;

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

export function loadStylesheet() {
  return bundleCss(ENTRY);
}

function readManifest() {
  return fs.readFileSync(ENTRY, 'utf8');
}

export function listImports() {
  return Array.from(readManifest().matchAll(IMPORT_RE), ([, href, layer]) => ({ href, layer: layer ?? null }));
}

export function listModules() {
  return listImports().map(({ href }) => href);
}

export function listLayers() {
  const statement = readManifest().match(LAYER_ORDER_RE);
  return statement ? statement[1].split(',').map(name => name.trim()) : [];
}

if (import.meta.main) {
  process.stdout.write(loadStylesheet());
}
