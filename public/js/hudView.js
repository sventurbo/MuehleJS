import * as RULES from '/shared/muehleRules.js';

const PIECES_PER_PLAYER = 9;

const URGENT_MS = 5000;

const TICK_MS = 200;

export class HudView {
  constructor() {
    this.phaseText = document.getElementById('hud-phase-text');
    this.statusBanner = document.getElementById('hud-status-banner');
    this.instructionText = document.getElementById('hud-instruction-text');

    this.panels = {
      W: this.#panel('w', 'white'),
      B: this.#panel('b', 'black')
    };

    this.myColor = null;
    this.myName = '';
    this.opponentName = '';
    this.state = null;

    this.countdown = null;
    this.tick = null;
  }

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

  setPlayers({ myColor, myName, opponentName }) {
    this.myColor = myColor;
    this.myName = myName;
    this.opponentName = opponentName;
  }

  reset() {
    this.stopCountdown();
    this.state = null;
  }

  render(state) {
    if (!state) return;
    this.state = state;

    const isMyTurn = state.turn === this.myColor && !RULES.isGameOver(state);

    this.#renderPanels(state);
    this.#renderPhase(state);
    this.#renderStatus(state, isMyTurn);
    this.#renderCountdown();
  }

  #renderPanels(state) {
    ['W', 'B'].forEach(color => {
      const panel = this.panels[color];
      const isMine = color === this.myColor;

      panel.card.classList.toggle('active-turn', state.turn === color && !RULES.isGameOver(state));
      panel.name.textContent = isMine ? `${this.myName} (Du)` : this.opponentName;
      panel.piecesLeft.textContent = state.unplacedPieces[color];
      panel.captured.textContent = state.capturedPieces[RULES.getOpponent(color)];

      const inHand = state.unplacedPieces[color];
      panel.pips.forEach((pip, i) => {
        pip.classList.toggle('active', i < inHand);
        pip.classList.toggle('inactive', i >= inHand);
      });
    });
  }

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

  #renderStatus(state, isMyTurn) {
    let tone = 'opponent-turn';
    if (RULES.isGameOver(state)) tone = 'finished';
    else if (isMyTurn) tone = 'my-turn';

    this.statusBanner.className = `hud-status-banner ${tone}`;
    this.instructionText.textContent = this.#instructionFor(state, isMyTurn);
  }

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

  stopCountdown() {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
    this.countdown = null;
    this.#renderCountdown();
  }

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
    box.title = isMine ? 'Deine Bedenkzeit für diesen Zug' : 'Bedenkzeit des Gegners für diesen Zug';
    value.textContent = String(seconds);

    const radius = Number(arc.getAttribute('r')) || 0;
    const circumference = 2 * Math.PI * radius;
    const fraction = Math.max(0, Math.min(1, remainingMs / timer.durationMs));
    arc.style.strokeDasharray = String(circumference);
    arc.style.strokeDashoffset = String(circumference * (1 - fraction));
  }
}
