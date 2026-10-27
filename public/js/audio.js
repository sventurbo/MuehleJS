const MUTE_STORAGE_KEY = 'muehle_muted';

function note({ type, freq, gain, duration, to = null, at = 0 }) {
  return { type, freq, gain, duration, to, at };
}

function arpeggio(type, freqs, { gain, duration, step }) {
  return freqs.map((freq, i) => note({ type, freq, gain, duration, at: i * step }));
}

function melody(type, steps, { gain, overlap = 0.9 }) {
  let at = 0;
  return steps.map(({ freq, duration }) => {
    const burst = note({ type, freq, gain, duration, at });
    at += duration * overlap;
    return burst;
  });
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

const SOUNDS = {
  place: [note({ type: 'triangle', freq: 320, to: 120, gain: 0.3, duration: 0.08 })],
  move: [note({ type: 'sine', freq: 260, to: 440, gain: 0.25, duration: 0.12 })],
  remove: [note({ type: 'square', freq: 180, to: 60, gain: 0.3, duration: 0.18 })],
  mill: arpeggio('triangle', [C5, E5, G5, C6], { gain: 0.2, duration: 0.35, step: 0.07 }),
  win: melody(
    'triangle',
    [
      { freq: C5, duration: 0.12 },
      { freq: E5, duration: 0.12 },
      { freq: G5, duration: 0.12 },
      { freq: C6, duration: 0.35 }
    ],
    { gain: 0.25 }
  ),
  lose: arpeggio('sawtooth', [440, 415.3, 392, 349.2], { gain: 0.18, duration: 0.25, step: 0.12 }),
  draw: arpeggio('sine', [C5, G5], { gain: 0.2, duration: 0.4, step: 0.18 })
};

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function storeMuted(muted) {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
  } catch {
    // Blocked or full storage: the preference stays for this session only.
  }
}

export class SoundController {
  constructor() {
    this.ctx = null;
    this.muted = loadMuted();
  }

  isMuted() {
    return this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    storeMuted(this.muted);
    return this.muted;
  }

  playPlace() {
    this.#play(SOUNDS.place);
  }
  playMove() {
    this.#play(SOUNDS.move);
  }
  playMill() {
    this.#play(SOUNDS.mill);
  }
  playRemove() {
    this.#play(SOUNDS.remove);
  }
  playWin() {
    this.#play(SOUNDS.win);
  }
  playLose() {
    this.#play(SOUNDS.lose);
  }
  playDraw() {
    this.#play(SOUNDS.draw);
  }

  unlock() {
    this.#init();
  }

  #init() {
    try {
      this.ctx ??= new AudioContext();
    } catch (err) {
      console.warn('[Audio] No audio context, the game stays silent:', err);
      return false;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(err => console.warn('[Audio] Could not start the audio output:', err));
    }
    return true;
  }

  #play(notes) {
    if (this.muted || !this.#init()) return;

    try {
      const now = this.ctx.currentTime;
      notes.forEach(burst => this.#schedule(now + burst.at, burst));
    } catch {
      // Sound must never interrupt the game.
    }
  }

  #schedule(startAt, { type, freq, gain, duration, to }) {
    const osc = this.ctx.createOscillator();
    const level = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(to, startAt + duration);

    // exponentialRamp cannot reach 0.
    level.gain.setValueAtTime(gain, startAt);
    level.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

    osc.connect(level);
    level.connect(this.ctx.destination);

    osc.start(startAt);
    osc.stop(startAt + duration);
  }
}

export const soundController = new SoundController();
