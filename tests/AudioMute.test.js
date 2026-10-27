import { jest } from '@jest/globals';
import { SoundController } from '../public/js/audio.js';

function useStorage(storage) {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

function workingStorage(entries = {}) {
  const data = { ...entries };
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    }
  };
}

function blockStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
    configurable: true
  });
}

function useRefusingAudioDevice() {
  globalThis.AudioContext = class {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    resume() {
      return Promise.reject(new DOMException('Failed to start the audio device', 'InvalidStateError'));
    }
    createOscillator() {
      return {
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {}
      };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
  };
}

async function unhandledRejectionsOf(run) {
  const rejections = [];
  const record = reason => rejections.push(reason);
  process.on('unhandledRejection', record);
  try {
    run();
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally {
    process.off('unhandledRejection', record);
  }
  return rejections;
}

afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.AudioContext;
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
    expect(() => {
      controller = new SoundController();
    }).not.toThrow();
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
    readOnly.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    useStorage(readOnly);
    const controller = new SoundController();

    expect(controller.toggleMute()).toBe(true);
    expect(controller.isMuted()).toBe(true);
  });
});

describe('The sound controller without a working audio output', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('a refused audio device never surfaces as an unhandled rejection', async () => {
    useStorage(workingStorage());
    useRefusingAudioDevice();
    const controller = new SoundController();

    const rejections = await unhandledRejectionsOf(() => {
      controller.unlock();
      controller.playPlace();
      controller.playWin();
    });

    expect(rejections).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  test('an audio context the browser will not create leaves the game silent, not broken', () => {
    useStorage(workingStorage());
    globalThis.AudioContext = class {
      constructor() {
        throw new DOMException('Too many audio contexts', 'NotSupportedError');
      }
    };
    const controller = new SoundController();

    expect(() => controller.unlock()).not.toThrow();
    expect(() => controller.playMill()).not.toThrow();
  });
});
