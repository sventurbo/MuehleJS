#!/usr/bin/env node

/**
 * client-bundle.js
 * Resolves the <script> list of public/index.html into the single string a
 * browser effectively runs.
 *
 * The client is split into modules (the shared rules, the sound controller, the
 * board renderer, three views and the controller), but the static client tests
 * reason about the client as a whole — about behaviour that has to exist
 * *somewhere*, not about the file it currently lives in. They read it through
 * here, so moving a function between modules stays a refactor and never a
 * silent loss of coverage.
 *
 * This is the JavaScript twin of scripts/css-bundle.js, and deliberately a
 * resolver rather than a bundler: files are concatenated in load order and
 * otherwise passed through byte for byte.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'public', 'index.html');

/** `<script src="…">`, in document order. */
const SCRIPT_RE = /<script[^>]*\ssrc="([^"]+)"/g;

/** Served by Socket.io at runtime, so there is no file of ours behind it. */
const EXTERNAL = ['/socket.io/socket.io.js'];

/**
 * Turns a src attribute into the file on disk that serves it.
 * Mirrors the two static mounts in server.js: /shared → shared/, else public/.
 *
 * @param {string} src The src attribute as written in index.html.
 * @returns {string} Absolute path of the file.
 */
function resolveScript(src) {
  const relative = src.startsWith('/shared/')
    ? path.join('shared', src.slice('/shared/'.length))
    : path.join('public', src.replace(/^\//, ''));
  return path.join(ROOT, relative);
}

/** The project's own scripts named by index.html, in load order. */
function listScripts() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  return Array.from(html.matchAll(SCRIPT_RE), match => match[1])
    .filter(src => !EXTERNAL.includes(src));
}

/**
 * The client source as the browser sees it: every script the page loads,
 * concatenated in load order.
 */
function loadClientScripts() {
  return listScripts()
    .map(src => {
      const file = resolveScript(src);
      if (!fs.existsSync(file)) {
        throw new Error(`<script src="${src}"> points nowhere: ${file} is missing`);
      }
      return fs.readFileSync(file, 'utf8');
    })
    .join('\n');
}

module.exports = { listScripts, resolveScript, loadClientScripts, SCRIPT_RE };

// Called directly (`node scripts/client-bundle.js`): print the resolved source.
if (require.main === module) {
  process.stdout.write(loadClientScripts());
}
