/**
 * hudView.js
 * Everything around the board that shows *state*: the phase label, the turn
 * badge, the instruction banner, both player panels and the turn countdown.
 *
 * The view is a pure function of the state it is handed — it never talks to the
 * socket and never decides anything. In particular the countdown only draws the
 * clock the server announced; stopping or tampering with the interval here
 * changes nothing about the game, because the only clock that counts runs in
 * GameManager.
 */

(function (window) {
  'use strict';

  const RULES = window.MuehleRules;

  /** Nine pips per player, so the stones in hand can be read at a glance. */
  const PIECES_PER_PLAYER = 9;

  /** Last five seconds of a turn are drawn in red on both sides of the board. */
  const URGENT_MS = 5000;

  /** How often the ring is redrawn. Four steps per second is smooth enough. */
  const TICK_MS = 200;

  /** The one instruction that carries markup; everything else is plain text. */
  const CAPTURE_INSTRUCTION =
    '<strong>Mühle geschlossen!</strong> Klicke auf einen gegnerischen Stein, um ihn zu schlagen.';

  class HudView {
    constructor() {
      this.phaseText = document.getElementById('hud-phase-text');
      this.turnBadge = document.getElementById('hud-turn-badge');
      this.statusBanner = document.getElementById('hud-status-banner');
      this.instructionText = document.getElementById('hud-instruction-text');

      this.timerBox = document.getElementById('hud-turn-timer');
      this.timerValue = document.getElementById('hud-timer-value');
      this.timerArc = document.getElementById('hud-timer-arc');

      // Both player panels share one shape, so they are addressed by colour
      // instead of being written out twice.
      this.panels = {
        W: this._panel('w', 'white'),
        B: this._panel('b', 'black')
      };

      this.myColor = null;
      this.myName = '';
      this.opponentName = '';
      this.state = null;

      // { turn, durationMs, endsAt } while a turn is being timed.
      this.countdown = null;
      this.tick = null;
    }

    /** Collects one panel's nodes and creates its pips once and for all. */
    _panel(idPart, colorClass) {
      const pipsContainer = document.getElementById(`player-${idPart}-pips`);
      const pips = [];
      for (let i = 0; i < PIECES_PER_PLAYER; i++) {
        const pip = document.createElement('span');
        pip.className = `pip pip-${colorClass}`;
        pipsContainer.appendChild(pip);
        pips.push(pip);
      }

      return {
        card: document.getElementById(`player-${idPart}-card`),
        name: document.getElementById(`player-${idPart}-name`),
        piecesLeft: document.getElementById(`player-${idPart}-pieces-left`),
        captured: document.getElementById(`player-${idPart}-captured`),
        pips
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

      const isMyTurn = state.turn === this.myColor && !state.winner;

      this._renderPanels(state);
      this._renderPhase(state);
      this._renderStatus(state, isMyTurn);
      this._renderCountdown();
    }

    /** Names, stones in hand, captured stones and whose turn it is. */
    _renderPanels(state) {
      ['W', 'B'].forEach(color => {
        const panel = this.panels[color];
        const isMine = color === this.myColor;

        panel.card.classList.toggle('active-turn', state.turn === color && !state.winner);
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

    /** "Phase 1: Setzen" / "Phase 2: Ziehen" / "Phase 3: Springen". */
    _renderPhase(state) {
      if (state.phase === 'SETTING') {
        this.phaseText.textContent = 'Phase 1: Setzen';
      } else if (state.phase === 'MOVING') {
        const jumping = state.piecesOnBoard.W === 3 || state.piecesOnBoard.B === 3;
        this.phaseText.textContent = jumping ? 'Phase 3: Springen' : 'Phase 2: Ziehen';
      } else {
        this.phaseText.textContent = 'Partie Beendet';
      }
    }

    /** The turn badge and the tinted instruction banner below it. */
    _renderStatus(state, isMyTurn) {
      let tone;
      let badge;

      if (state.winner) {
        tone = 'finished';
        badge = 'Spiel Beendet';
      } else if (isMyTurn) {
        tone = 'my-turn';
        badge = 'Du bist am Zug';
      } else {
        tone = 'opponent-turn';
        badge = 'Gegner ist am Zug';
      }

      this.turnBadge.textContent = badge;
      this.turnBadge.className = `hud-badge ${tone}`;
      this.statusBanner.className = `hud-status-banner ${tone}`;

      if (isMyTurn && state.awaitingRemoval) {
        this.instructionText.innerHTML = CAPTURE_INSTRUCTION;
      } else {
        this.instructionText.textContent = this._instructionFor(state, isMyTurn);
      }
    }

    /**
     * What the player should do (or wait for) right now, in one sentence.
     */
    _instructionFor(state, isMyTurn) {
      if (state.winner) return state.winReason || 'Partie abgeschlossen.';

      if (!isMyTurn) {
        if (state.awaitingRemoval) return 'Gegner hat eine Mühle geschlossen und wählt einen Stein zum Schlagen...';
        if (state.phase === 'SETTING') return 'Gegner setzt einen Stein...';
        return 'Gegner überlegt seinen nächsten Zug...';
      }

      if (state.phase === 'SETTING') {
        return `Setzphase: Platziere einen Stein auf ein freies Feld (${state.unplacedPieces[this.myColor]} übrig).`;
      }
      if (state.piecesOnBoard[this.myColor] === 3) {
        return 'Endphase (Springen): Du hast nur noch 3 Steine! Du darfst auf jedes freie Feld springen.';
      }
      return 'Zugphase: Wähle einen deiner Steine aus und ziehe auf ein benachbartes freies Feld.';
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
        this.tick = setInterval(() => this._renderCountdown(), TICK_MS);
      }
      this._renderCountdown();
    }

    /** Stops and hides the countdown (game over, lost connection, new game). */
    stopCountdown() {
      if (this.tick) {
        clearInterval(this.tick);
        this.tick = null;
      }
      this.countdown = null;
      this._renderCountdown();
    }

    /**
     * Draws the remaining seconds and the shrinking ring.
     *
     * Once it hits zero the display stays at 0 until the server has played the
     * automatic move and announced the next turn — the client never decides that
     * a turn is over.
     */
    _renderCountdown() {
      if (!this.timerBox) return;

      const timer = this.countdown;
      if (!timer || !this.state || this.state.winner) {
        this.timerBox.classList.add('hidden');
        return;
      }

      const remainingMs = Math.max(0, timer.endsAt - Date.now());
      const seconds = Math.ceil(remainingMs / 1000);
      const isMine = timer.turn === this.myColor;

      this.timerBox.classList.remove('hidden');
      this.timerBox.classList.toggle('is-mine', isMine);
      this.timerBox.classList.toggle('is-urgent', remainingMs <= URGENT_MS);
      this.timerBox.setAttribute(
        'aria-label',
        `${isMine ? 'Deine Bedenkzeit' : 'Bedenkzeit des Gegners'}: noch ${seconds} Sekunden`
      );
      this.timerBox.title = isMine
        ? 'Deine Bedenkzeit für diesen Zug'
        : 'Bedenkzeit des Gegners für diesen Zug';

      if (this.timerValue) this.timerValue.textContent = String(seconds);

      if (this.timerArc) {
        const radius = Number(this.timerArc.getAttribute('r')) || 0;
        const circumference = 2 * Math.PI * radius;
        const fraction = Math.max(0, Math.min(1, remainingMs / timer.durationMs));
        this.timerArc.style.strokeDasharray = String(circumference);
        this.timerArc.style.strokeDashoffset = String(circumference * (1 - fraction));
      }
    }
  }

  window.HudView = HudView;
})(window);
