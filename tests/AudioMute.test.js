/**
 * AudioMute.test.js
 * Guards the mute preference against a blocked storage.
 *
 * A browser with site data blocked throws a SecurityError on the very access
 * to localStorage instead of handing back an empty store. audio.js reads the
 * preference while the module is evaluated, so a throw there would abort the
 * module and, with it, app.js and every other module in the page's graph.
 * These tests construct the real controller against storage stand-ins that
 * throw, and pin that it still comes up and the Ton button still toggles.
 */

import { SoundController } from '../public/js/audio.js';

/** Installs `storage` as the global localStorage the controller reads. */
function useStorage(storage) {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
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

/** A localStorage whose very access throws, as a blocked one does. */
function blockStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
    configurable: true
  });
}

afterEach(() => {
  delete globalThis.localStorage;
});

describe('The sound controller with a working storage', () => {
  test('starts muted when the preference says so', () => {
    useStorage(workingStorage({ muehle_muted: 'true' }));
    expect(new SoundController().isMuted()).toBe(true);
  });

  test('starts unmuted when nothing is stored', () => {
    useStorage(workingStorage());
    expect(new SoundController().isMuted()).toBe(false);
  });

  test('persists both directions of the toggle', () => {
    const storage = workingStorage();
    useStorage(storage);
    const controller = new SoundController();

    expect(controller.toggleMute()).toBe(true);
    expect(storage.data.muehle_muted).toBe('true');

    expect(controller.toggleMute()).toBe(false);
    expect(storage.data.muehle_muted).toBe('false');
  });
});

describe('The sound controller with a blocked storage', () => {
  test('still gets constructed', () => {
    blockStorage();
    let controller;
    expect(() => { controller = new SoundController(); }).not.toThrow();
    expect(controller).toBeDefined();
  });

  test('falls back to sound on', () => {
    blockStorage();
    expect(new SoundController().isMuted()).toBe(false);
  });

  test('keeps the toggle working, in memory', () => {
    blockStorage();
    const controller = new SoundController();

    expect(controller.toggleMute()).toBe(true);
    expect(controller.isMuted()).toBe(true);
    expect(controller.toggleMute()).toBe(false);
    expect(controller.isMuted()).toBe(false);
  });

  test('survives a store that reads but refuses to write', () => {
    const readOnly = workingStorage();
    readOnly.setItem = () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
    useStorage(readOnly);
    const controller = new SoundController();

    expect(controller.toggleMute()).toBe(true);
    expect(controller.isMuted()).toBe(true);
  });
});
