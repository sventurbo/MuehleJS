/**
 * audio.js
 * Synthesizes the game's sound effects with the Web Audio API.
 * 100% self-contained, no external audio files required.
 *
 * Every effect is just a short list of oscillator bursts, so the sounds are
 * written down as data (SOUNDS) and played by one scheduler (_schedule).
 * Adding or tuning a sound therefore means editing a note, never repeating the
 * oscillator/gain wiring.
 */

const MUTE_STORAGE_KEY = 'muehle_muted';

/**
 * One oscillator burst.
 *
 * @param {string} type Oscillator waveform ('sine', 'triangle', 'square', 'sawtooth').
 * @param {number} freq Pitch in Hz at the start of the burst.
 * @param {number} gain Peak volume; every burst fades from here to silence.
 * @param {number} duration Length in seconds.
 * @param {number} [to] Pitch to glide to over `duration` (null keeps `freq`).
 * @param {number} [at] Delay in seconds before the burst starts.
 */
function note({ type, freq, gain, duration, to = null, at = 0 }) {
  return { type, freq, gain, duration, to, at };
}

/** Equal-length notes played one after another, `step` seconds apart. */
function arpeggio(type, freqs, { gain, duration, step }) {
  return freqs.map((freq, i) => note({ type, freq, gain, duration, at: i * step }));
}

/** Notes of individual length, each starting just before the previous has faded. */
function melody(type, steps, { gain, overlap = 0.9 }) {
  let at = 0;
  return steps.map(({ freq, duration }) => {
    const burst = note({ type, freq, gain, duration, at });
    at += duration * overlap;
    return burst;
  });
}

// C5, E5, G5, C6 — the major triad both winning fanfares are built from.
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

/** The complete sound set, one entry per game event. */
const SOUNDS = {
  // A stone dropping onto the board: a short, low-going knock.
  place: [note({ type: 'triangle', freq: 320, to: 120, gain: 0.3, duration: 0.08 })],
  // A stone sliding along a line: a soft rising blip.
  move: [note({ type: 'sine', freq: 260, to: 440, gain: 0.25, duration: 0.12 })],
  // A stone being captured: a hard, falling buzz.
  remove: [note({ type: 'square', freq: 180, to: 60, gain: 0.3, duration: 0.18 })],
  // A closed mill: the triad, quick and bright.
  mill: arpeggio('triangle', [C5, E5, G5, C6], { gain: 0.2, duration: 0.35, step: 0.07 }),
  // Victory: the same triad, held on the last note.
  win: melody('triangle', [
    { freq: C5, duration: 0.12 },
    { freq: E5, duration: 0.12 },
    { freq: G5, duration: 0.12 },
    { freq: C6, duration: 0.35 }
  ], { gain: 0.25 }),
  // Defeat: four descending, rougher notes.
  lose: arpeggio('sawtooth', [440, 415.3, 392, 349.2], { gain: 0.18, duration: 0.25, step: 0.12 })
};

/**
 * Reads the stored mute preference.
 *
 * Safari in private mode — and any browser with site data switched off —
 * throws on localStorage instead of handing back an empty store. Swallowing
 * that here keeps the constructor from throwing, which would leave
 * window.soundController undefined and take every later sound call with it.
 * The fallback is the default: sound on, preference simply not remembered.
 */
function loadMuted() {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

/** Stores the mute preference; a blocked or full store just means it is not remembered. */
function storeMuted(muted) {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
  } catch (e) {
    // Preference stays in memory for this session only.
  }
}

class SoundController {
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

  playPlace() { this._play(SOUNDS.place); }
  playMove() { this._play(SOUNDS.move); }
  playMill() { this._play(SOUNDS.mill); }
  playRemove() { this._play(SOUNDS.remove); }
  playWin() { this._play(SOUNDS.win); }
  playLose() { this._play(SOUNDS.lose); }

  /**
   * Mobile Safari (and Chrome's autoplay policy) only let an AudioContext
   * start from inside a real user gesture. The first game sound is triggered
   * by a socket event instead, so app.js calls this on the first tap/click to
   * create and resume the context while a gesture is still on the stack.
   */
  unlock() {
    this._init();
    if (!this.ctx) return;
    try {
      // A silent blip finishes the unlock on older iOS versions.
      this._schedule(this.ctx.currentTime, note({ type: 'sine', freq: 440, gain: 0, duration: 0.01 }));
    } catch (e) {
      // Nothing to do — sound simply stays off on this device.
    }
  }

  /** Creates the audio context on first use and resumes a suspended one. */
  _init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.ctx = new AudioContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Plays one of the SOUNDS entries, unless the player has muted the game or
   * this browser has no usable audio context.
   */
  _play(notes) {
    if (this.muted) return;
    this._init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      notes.forEach(burst => this._schedule(now + burst.at, burst));
    } catch (e) {
      // A device that refuses to play (autoplay policy, no output) stays silent;
      // sound is decoration and must never interrupt the game.
    }
  }

  /**
   * Wires one oscillator through its own gain node and schedules its whole life
   * up front, so the burst plays even if the main thread is busy rendering.
   */
  _schedule(startAt, { type, freq, gain, duration, to }) {
    const osc = this.ctx.createOscillator();
    const level = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(to, startAt + duration);

    // exponentialRamp cannot reach 0, so every burst fades to near-silence.
    level.gain.setValueAtTime(gain, startAt);
    if (gain > 0) level.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

    osc.connect(level);
    level.connect(this.ctx.destination);

    osc.start(startAt);
    osc.stop(startAt + duration);
  }
}

window.soundController = new SoundController();
