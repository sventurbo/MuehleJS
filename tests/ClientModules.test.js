/**
 * ClientModules.test.js
 * Guards for the split client, the JavaScript counterpart of CssModules.test.js.
 *
 * public/index.html is the manifest of the client: a module only reaches the
 * browser — and the static client tests — if the page loads it. These
 * assertions keep that list complete and in dependency order, and they pin the
 * one architectural rule the split exists for: the views draw, the controller
 * talks to the server.
 */

const fs = require('fs');
const path = require('path');
const { listScripts, resolveScript, loadClientScripts } = require('../scripts/client-bundle');

const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'public', 'js');
const scripts = listScripts();

/** Strips comments, so assertions only see code a browser would run. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('The page manifest', () => {
  test('loads every module in public/js, exactly once', () => {
    const onDisk = fs.readdirSync(jsDir).filter(name => name.endsWith('.js')).sort();
    const loaded = scripts
      .filter(src => src.startsWith('js/'))
      .map(src => src.slice('js/'.length));

    expect([...loaded].sort()).toEqual(onDisk);
    expect(new Set(loaded).size).toBe(loaded.length);
  });

  test('loads the shared rule module, the same file the server requires', () => {
    expect(scripts[0]).toBe('/shared/muehleRules.js');
    expect(resolveScript(scripts[0])).toBe(path.join(root, 'shared', 'muehleRules.js'));
    expect(fs.existsSync(resolveScript(scripts[0]))).toBe(true);
  });

  test('loads the controller last, after everything it wires together', () => {
    expect(scripts[scripts.length - 1]).toBe('js/app.js');
  });

  test('every script it names exists on disk', () => {
    expect(() => loadClientScripts()).not.toThrow();
  });
});

describe('The views draw, the controller talks', () => {
  const views = ['hudView.js', 'dockView.js', 'overlays.js', 'boardRenderer.js'];

  test.each(views)('%s holds no socket of its own', (name) => {
    const source = code(fs.readFileSync(path.join(jsDir, name), 'utf8'));
    expect(source).not.toMatch(/\bthis\.socket\b/);
    expect(source).not.toMatch(/\bio\(\)/);
  });

  test('app.js is the only module that emits to the server', () => {
    const controller = code(fs.readFileSync(path.join(jsDir, 'app.js'), 'utf8'));
    expect(controller).toContain('this.socket.emit(');

    const elsewhere = scripts
      .filter(src => src !== 'js/app.js')
      .map(src => code(fs.readFileSync(resolveScript(src), 'utf8')))
      .join('\n');
    expect(elsewhere).not.toContain('.emit(');
  });
});
