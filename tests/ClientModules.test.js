/**
 * ClientModules.test.js
 * Guards for the split client, the JavaScript counterpart of CssModules.test.js.
 *
 * public/index.html loads one ES module, the controller, and everything else
 * reaches the browser — and the static client tests — through its imports.
 * These assertions keep that graph complete and in evaluation order, and they
 * pin the one architectural rule the split exists for: the views draw, the
 * controller talks to the server.
 */

import fs from 'node:fs';
import path from 'node:path';
import { listScripts, resolveScript, loadClientScripts } from '../scripts/client-bundle.js';

const root = path.join(import.meta.dirname, '..');
const jsDir = path.join(root, 'public', 'js');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const scripts = listScripts();

/** Strips comments, so assertions only see code a browser would run. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('The module graph', () => {
  test('the page has a single entry: the controller, as an ES module', () => {
    const tags = html.match(/<script\b[^>]*>/gi);
    expect(tags).toEqual(['<script type="module" src="js/app.js">']);
  });

  test('reaches every module in public/js, exactly once', () => {
    const onDisk = fs
      .readdirSync(jsDir)
      .filter(name => name.endsWith('.js'))
      .sort();
    const loaded = scripts.filter(src => src.startsWith('/js/')).map(src => src.slice('/js/'.length));

    expect([...loaded].sort()).toEqual(onDisk);
    expect(new Set(loaded).size).toBe(loaded.length);
  });

  test('evaluates the shared rule module first, the same file the server imports', () => {
    expect(scripts[0]).toBe('/shared/muehleRules.js');
    expect(resolveScript(scripts[0])).toBe(path.join(root, 'shared', 'muehleRules.js'));
    expect(fs.existsSync(resolveScript(scripts[0]))).toBe(true);
  });

  test('evaluates the controller last, after everything it wires together', () => {
    expect(scripts.at(-1)).toBe('/js/app.js');
  });

  test('every script it names exists on disk', () => {
    expect(() => loadClientScripts()).not.toThrow();
  });
});

describe('The views draw, the controller talks', () => {
  const views = ['hudView.js', 'dockView.js', 'overlays.js', 'boardRenderer.js'];

  test.each(views)('%s holds no socket of its own', name => {
    const source = code(fs.readFileSync(path.join(jsDir, name), 'utf8'));
    expect(source).not.toMatch(/\bthis\.socket\b/);
    expect(source).not.toMatch(/\bio\(\)/);
    expect(source).not.toContain('/socket.io/');
  });

  test('app.js is the only module that emits to the server', () => {
    const controller = code(fs.readFileSync(path.join(jsDir, 'app.js'), 'utf8'));
    expect(controller).toContain('this.socket.emit(');

    const elsewhere = scripts
      .filter(src => src !== '/js/app.js')
      .map(src => code(fs.readFileSync(resolveScript(src), 'utf8')))
      .join('\n');
    expect(elsewhere).not.toContain('.emit(');
  });
});

describe('What the controller makes of the connection', () => {
  const controller = code(fs.readFileSync(path.join(jsDir, 'app.js'), 'utf8'));
  const dock = code(fs.readFileSync(path.join(jsDir, 'dockView.js'), 'utf8'));

  /** The body of the handler app.js registers for `event`. */
  const handlerOf = event => {
    const start = controller.indexOf(`this.socket.on('${event}'`);
    expect(start).toBeGreaterThan(-1);
    return controller.slice(start, controller.indexOf('\n    });', start));
  };

  test('a dropped connection ends a running game at once, not only after a reconnect', () => {
    // The server forgets the session the moment the socket drops; a board that
    // waits for a reconnect stays dead for as long as the server is gone.
    expect(handlerOf('disconnect')).toContain('this.#terminateSession(');
    expect(controller).not.toContain('connectionLost');
  });

  test('own chat messages are told apart by colour, since both players may pick the same name', () => {
    expect(dock).toContain('const isMine = msg.color === this.myColor;');
    expect(dock).not.toMatch(/msg\.sender\s*===/);
    expect(controller).toContain('this.dock.reset(this.myColor)');
  });
});
