/**
 * AudioMute.test.js
 * Guards the mute preference against a blocked storage.
 *
 * Safari in private mode — and any browser with site data switched off —
 * throws on localStorage instead of handing back an empty store. audio.js
 * runs as a plain script, so a throw while reading the preference aborts the
 * whole file: window.soundController would never be assigned and every later
 * sound call in app.js would fail on undefined. These tests load the real
 * file against storage stand-ins that throw, and pin that the controller
 * still comes up and the Ton button still toggles.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const audioJs = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'audio.js'),
  'utf8'
);

/** Runs audio.js against a window stand-in and returns the controller it exports. */
function loadController(win) {
  const sandbox = { window: win };
  vm.createContext(sandbox);
  vm.runInContext(audioJs, sandbox);
  return sandbox.window.soundController;
}

/** A localStorage that works, seeded with the given entries. */
function workingStorage(entries = {}) {
  const data = { ...entries };
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); }
  };
}

/** A window whose localStorage throws on property access, as private mode does. */
function windowWithBlockedStorage() {
  const win = {};
  Object.defineProperty(win, 'localStorage', {
    get() { throw new Error('SecurityError: The operation is insecure.'); }
  });
  return win;
}

describe('The sound controller with a working storage', () => {
  test('starts muted when the preference says so', () => {
    const controller = loadController({ localStorage: workingStorage({ muehle_muted: 'true' }) });
    expect(controller.isMuted()).toBe(true);
  });

  test('starts unmuted when nothing is stored', () => {
    const controller = loadController({ localStorage: workingStorage() });
    expect(controller.isMuted()).toBe(false);
  });

  test('persists both directions of the toggle', () => {
    const storage = workingStorage();
    const controller = loadController({ localStorage: storage });

    expect(controller.toggleMute()).toBe(true);
    expect(storage.data.muehle_muted).toBe('true');

    expect(controller.toggleMute()).toBe(false);
    expect(storage.data.muehle_muted).toBe('false');
  });
});

describe('The sound controller with a blocked storage', () => {
  test('still gets constructed and exported', () => {
    let controller;
    expect(() => { controller = loadController(windowWithBlockedStorage()); }).not.toThrow();
    expect(controller).toBeDefined();
  });

  test('falls back to sound on', () => {
    expect(loadController(windowWithBlockedStorage()).isMuted()).toBe(false);
  });

  test('keeps the toggle working, in memory', () => {
    const controller = loadController(windowWithBlockedStorage());

    expect(controller.toggleMute()).toBe(true);
    expect(controller.isMuted()).toBe(true);
    expect(controller.toggleMute()).toBe(false);
    expect(controller.isMuted()).toBe(false);
  });

  test('survives a store that reads but refuses to write', () => {
    const readOnly = workingStorage();
    readOnly.setItem = () => { throw new Error('QuotaExceededError'); };
    const controller = loadController({ localStorage: readOnly });

    expect(controller.toggleMute()).toBe(true);
    expect(controller.isMuted()).toBe(true);
  });
});
