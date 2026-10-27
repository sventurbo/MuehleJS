import * as RULES from '/shared/muehleRules.js';

const TOAST_VISIBLE_MS = 3000;
const TOAST_FADE_MS = 400;

const CLOSE_ICON = `
  <svg class="icon toast-close-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.5 6.5l11 11"/>
    <path d="M17.5 6.5l-11 11"/>
  </svg>`;

const CLOSED_BY_APP = 'app';

const GAME_OVER_TITLES = {
  win: 'Sieg! Herzlichen Glückwunsch!',
  loss: 'Partie Verloren',
  draw: 'Unentschieden'
};

function onDialogClose(dialog, onChoice) {
  dialog.addEventListener('close', () => {
    const choice = dialog.returnValue;
    dialog.returnValue = '';
    onChoice(choice);
  });
}

export class Overlays {
  constructor({ onPlayAgain, onBackToLobby, onSurrender } = {}) {
    this.connStatus = document.getElementById('conn-status-indicator');
    this.toastContainer = document.getElementById('toast-container');

    this.surrenderModal = document.getElementById('modal-surrender');
    this.gameOverModal = document.getElementById('modal-game-over');
    this.gameOverTitle = document.getElementById('game-over-title');
    this.gameOverReason = document.getElementById('game-over-reason');
    this.gameOverWinner = document.getElementById('game-over-winner-name');

    onDialogClose(this.surrenderModal, choice => {
      if (choice === 'surrender') onSurrender?.();
    });

    onDialogClose(this.gameOverModal, choice => {
      if (choice === 'again') onPlayAgain?.();
      else if (choice !== CLOSED_BY_APP) onBackToLobby?.();
    });
  }

  setConnected(online) {
    if (!this.connStatus) return;
    this.connStatus.textContent = online ? 'Online' : 'Getrennt';
    this.connStatus.className = `conn-status ${online ? 'online' : 'offline'}`;
  }

  toast(message, type = 'info', { sticky = false } = {}) {
    const toast = document.createElement(sticky ? 'button' : 'div');
    toast.className = `toast toast-${type}`;

    if (sticky) {
      toast.type = 'button';
      toast.classList.add('toast-sticky');
      toast.title = 'Zum Schließen klicken';
      const text = document.createElement('span');
      text.textContent = message;
      toast.append(text);
      toast.insertAdjacentHTML('beforeend', CLOSE_ICON);
      toast.addEventListener('click', () => Overlays.#dismiss(toast), { once: true });
    } else {
      toast.textContent = message;
      setTimeout(() => Overlays.#dismiss(toast), TOAST_VISIBLE_MS);
    }

    this.toastContainer.append(toast);
  }

  static #dismiss(toast) {
    toast.classList.add('toast-fade');
    setTimeout(() => toast.remove(), TOAST_FADE_MS);
  }

  showGameOver({ winner, winnerName, endReason, isWin }) {
    const outcome = winner === null ? 'draw' : isWin ? 'win' : 'loss';
    this.gameOverTitle.textContent = GAME_OVER_TITLES[outcome];
    this.gameOverTitle.className = `game-over-title ${outcome}`;

    this.gameOverWinner.hidden = outcome === 'draw';
    this.gameOverWinner.textContent = outcome === 'draw' ? '' : `Gewinner: ${winnerName} (${RULES.colorName(winner)})`;
    this.gameOverReason.textContent = endReason || 'Spiel beendet';

    this.surrenderModal.close(CLOSED_BY_APP);
    if (!this.gameOverModal.open) this.gameOverModal.showModal();
  }

  closeGameDialogs() {
    this.surrenderModal.close(CLOSED_BY_APP);
    this.gameOverModal.close(CLOSED_BY_APP);
  }
}
