/**
 * hudView.js
 * Everything around the board that shows *state*: the status row (phase and
 * what to do now), both player panels and the turn clock on the panel of the
 * player on turn.
 *
 * The view is a pure function of the state it is handed — it never talks to the
 * socket and never decides anything. In particular the countdown only draws the
 * clock the server announced; stopping or tampering with the interval here
 * changes nothing about the game, because the only clock that counts runs in
 * GameManager.
 */

import * as RULES from '/shared/muehleRules.js';

/** Nine pips per player, so the stones in hand can be read at a glance. */
const PIECES_PER_PLAYER = 9;

/** Last five seconds of a turn are drawn in red on both sides of the board. */
const URGENT_MS = 5000;

/** How often the ring is redrawn. Four steps per second is smooth enough. */
const TICK_MS = 200;

export class HudView {
  constructor() {
    this.phaseText = document.getElementById('hud-phase-text');
    this.statusBanner = document.getElementById('hud-status-banner');
    this.instructionText = document.getElementById('hud-instruction-text');

    // Both player panels share one shape, so they are addressed by colour
    // instead of being written out twice.
    this.panels = {
      W: this.#panel('w', 'white'),
      B: this.#panel('b', 'black')
    };

    this.myColor = null;
    this.myName = '';
    this.opponentName = '';
    this.state = null;

    // { turn, durationMs, endsAt } while a turn is being timed.
    this.countdown = null;
    this.tick = null;
  }

  /** Collects one panel's nodes, its clock included, and creates its pips once and for all. */
  #panel(idPart, colorClass) {
    const pipsContainer = document.getElementById(`player-${idPart}-pips`);
    const pips = [];
    for (let i = 0; i < PIECES_PER_PLAYER; i++) {
      const pip = document.createElement('span');
      pip.className = `pip pip-${colorClass}`;
      pipsContainer.append(pip);
      pips.push(pip);
    }

    const clock = document.getElementById(`player-${idPart}-clock`);

    return {
      card: document.getElementById(`player-${idPart}-card`),
      name: document.getElementById(`player-${idPart}-name`),
      piecesLeft: document.getElementById(`player-${idPart}-pieces-left`),
      captured: document.getElementById(`player-${idPart}-captured`),
      pips,
      clock: {
        box: clock,
        value: clock.querySelector('.turn-clock-value'),
        arc: clock.querySelector('.turn-clock-arc')
      }
    };
  }

  /** Tells the HUD who is playing, at the start of a game. */
  setPlayers({ myColor, myName, opponentName }) {
    this.myColor = myColor;
    this.myName = myName;
    this.opponentName = opponentName;
  }

  /** Clears the HUD between two games. */
  reset() {
    this.stopCountdown();
    this.state = null;
  }

  /**
   * Redraws the whole HUD from one game state.
   */
  render(state) {
    if (!state) return;
    this.state = state;

    const isMyTurn = state.turn === this.myColor && !RULES.isGameOver(state);

    this.#renderPanels(state);
    this.#renderPhase(state);
    this.#renderStatus(state, isMyTurn);
    this.#renderCountdown();
  }

  /** Names, stones in hand, captured stones and whose turn it is. */
  #renderPanels(state) {
    ['W', 'B'].forEach(color => {
      const panel = this.panels[color];
      const isMine = color === this.myColor;

      panel.card.classList.toggle('active-turn', state.turn === color && !RULES.isGameOver(state));
      panel.name.textContent = isMine ? `${this.myName} (Du)` : this.opponentName;
      panel.piecesLeft.textContent = state.unplacedPieces[color];
      // What this player captured is what their opponent lost.
      panel.captured.textContent = state.capturedPieces[RULES.getOpponent(color)];

      const inHand = state.unplacedPieces[color];
      panel.pips.forEach((pip, i) => {
        pip.classList.toggle('active', i < inHand);
        pip.classList.toggle('inactive', i >= inHand);
      });
    });
  }

  /** "Setzphase" / "Zugphase" / "Springphase", the lead of the status row. */
  #renderPhase(state) {
    if (state.phase === 'SETTING') {
      this.phaseText.textContent = 'Setzphase';
    } else if (state.phase === 'MOVING') {
      const jumping = state.piecesOnBoard.W === 3 || state.piecesOnBoard.B === 3;
      this.phaseText.textContent = jumping ? 'Springphase' : 'Zugphase';
    } else {
      this.phaseText.textContent = 'Partie beendet';
    }
  }

  /**
   * The status row, tinted by whose turn it is. It is the one place on screen
   * that says so in words; the highlighted player panel and its clock repeat
   * it at a glance.
   */
  #renderStatus(state, isMyTurn) {
    let tone = 'opponent-turn';
    if (RULES.isGameOver(state)) tone = 'finished';
    else if (isMyTurn) tone = 'my-turn';

    this.statusBanner.className = `hud-status-banner ${tone}`;
    this.instructionText.textContent = this.#instructionFor(state, isMyTurn);
  }

  /**
   * What the player should do (or wait for) right now, in one sentence. The
   * phase already leads the row, so the sentence does not repeat it.
   */
  #instructionFor(state, isMyTurn) {
    if (RULES.isGameOver(state)) return state.endReason || 'Partie abgeschlossen.';

    if (!isMyTurn) {
      const opponent = this.opponentName || 'Der Gegner';
      if (state.awaitingRemoval) return `${opponent} hat eine Mühle geschlossen und wählt einen Stein zum Schlagen …`;
      if (state.phase === 'SETTING') return `${opponent} setzt einen Stein …`;
      return `${opponent} überlegt den nächsten Zug …`;
    }

    if (state.awaitingRemoval) {
      return 'Mühle! Schlage einen rot markierten Stein des Gegners.';
    }
    if (state.phase === 'SETTING') {
      return `Du bist am Zug: Setze einen Stein (${state.unplacedPieces[this.myColor]} übrig).`;
    }
    if (state.piecesOnBoard[this.myColor] === 3) {
      return 'Du bist am Zug: Mit 3 Steinen darfst du auf jedes freie Feld springen.';
    }
    return 'Du bist am Zug: Ziehe einen Stein auf ein freies Nachbarfeld.';
  }

  /**
   * Takes over the clock the server just announced and keeps the ring updated.
   *
   * The remaining time is anchored on the local clock the moment the event
   * arrives, so a skewed system time cannot shift the display.
   */
  startCountdown(data) {
    if (!data) return;

    const durationMs = Number(data.durationMs);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      this.stopCountdown();
      return;
    }

    const remainingMs = Number(data.remainingMs);
    this.countdown = {
      turn: data.turn,
      durationMs,
      endsAt: Date.now() + (Number.isFinite(remainingMs) ? remainingMs : durationMs)
    };

    if (!this.tick) {
      this.tick = setInterval(() => this.#renderCountdown(), TICK_MS);
    }
    this.#renderCountdown();
  }

  /** Stops and hides the countdown (game over, lost connection, new game). */
  stopCountdown() {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
    this.countdown = null;
    this.#renderCountdown();
  }

  /**
   * Draws the remaining seconds and the shrinking ring on the panel of the
   * player on turn, like a chess clock; the other panel's clock is hidden.
   *
   * Once it hits zero the display stays at 0 until the server has played the
   * automatic move and announced the next turn — the client never decides that
   * a turn is over.
   */
  #renderCountdown() {
    const timer = this.countdown;
    const running = timer && this.state && !RULES.isGameOver(this.state);

    ['W', 'B'].forEach(color => {
      this.panels[color].clock.box.hidden = !running || timer.turn !== color;
    });
    if (!running) return;

    const { box, value, arc } = this.panels[timer.turn].clock;
    const remainingMs = Math.max(0, timer.endsAt - Date.now());
    const seconds = Math.ceil(remainingMs / 1000);
    const isMine = timer.turn === this.myColor;

    box.classList.toggle('is-mine', isMine);
    box.classList.toggle('is-urgent', remainingMs <= URGENT_MS);
    box.setAttribute(
      'aria-label',
      `${isMine ? 'Deine Bedenkzeit' : 'Bedenkzeit des Gegners'}: noch ${seconds} Sekunden`
    );
    box.title = isMine
      ? 'Deine Bedenkzeit für diesen Zug'
      : 'Bedenkzeit des Gegners für diesen Zug';
    value.textContent = String(seconds);

    const radius = Number(arc.getAttribute('r')) || 0;
    const circumference = 2 * Math.PI * radius;
    const fraction = Math.max(0, Math.min(1, remainingMs / timer.durationMs));
    arc.style.strokeDasharray = String(circumference);
    arc.style.strokeDashoffset = String(circumference * (1 - fraction));
  }
}
