/**
 * overlays.js
 * Everything that sits *above* the app: the connection badge, transient toasts
 * and the three dialogs (rules, surrender, game over).
 *
 * The dialogs are native <dialog> elements. The browser opens them in the top
 * layer, makes the page behind them inert, traps focus and closes them on
 * Escape; the buttons that open and close the rules and the surrender dialog
 * do so through invoker commands in index.html. What is left for this view is
 * to fill the game-over dialog and to hand each dialog's answer — its
 * returnValue — to the controller.
 */

import * as RULES from '/shared/muehleRules.js';

/** How long a toast stays before it starts to fade, and how long it fades. */
const TOAST_VISIBLE_MS = 3000;
const TOAST_FADE_MS = 400;

/** returnValue of a dialog the app closed itself, so it carries no choice. */
const CLOSED_BY_APP = 'app';

/**
 * Calls `onChoice` with the returnValue every time `dialog` closes, then clears
 * it: Escape and a click beside the dialog close it without setting one, and
 * must not replay the previous answer.
 */
function onDialogClose(dialog, onChoice) {
  dialog.addEventListener('close', () => {
    const choice = dialog.returnValue;
    dialog.returnValue = '';
    onChoice(choice);
  });
}

export class Overlays {
  /**
   * @param {Object} handlers
   * @param {Function} handlers.onPlayAgain Player wants another game.
   * @param {Function} handlers.onBackToLobby Player returns to the start screen.
   * @param {Function} handlers.onSurrender Player confirmed giving the game up.
   */
  constructor({ onPlayAgain, onBackToLobby, onSurrender } = {}) {
    this.connStatus = document.getElementById('conn-status-indicator');
    this.toastContainer = document.getElementById('toast-container');

    this.surrenderModal = document.getElementById('modal-surrender');
    this.gameOverModal = document.getElementById('modal-game-over');
    this.gameOverTitle = document.getElementById('game-over-title');
    this.gameOverReason = document.getElementById('game-over-reason');
    this.gameOverWinner = document.getElementById('game-over-winner-name');

    onDialogClose(this.surrenderModal, (choice) => {
      if (choice === 'surrender') onSurrender?.();
    });

    // The game is over either way, so closing the dialog without a choice
    // (Escape) means leaving, just like the "Zurück zur Startseite" button.
    onDialogClose(this.gameOverModal, (choice) => {
      if (choice === 'again') onPlayAgain?.();
      else if (choice !== CLOSED_BY_APP) onBackToLobby?.();
    });
  }

  /** Online / offline badge in the header. */
  setConnected(online) {
    if (!this.connStatus) return;
    this.connStatus.textContent = online ? 'Online' : 'Getrennt';
    this.connStatus.className = `conn-status ${online ? 'online' : 'offline'}`;
  }

  /**
   * Shows a short message that removes itself again.
   * @param {string} message
   * @param {string} [type] 'info' | 'warning' | 'error'
   */
  toast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.toastContainer.append(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade');
      setTimeout(() => toast.remove(), TOAST_FADE_MS);
    }, TOAST_VISIBLE_MS);
  }

  /**
   * Announces the result of a finished game. A surrender question that is
   * still open has nothing left to decide and is dropped.
   * @param {Object} result
   * @param {string} result.winner Winning colour, 'W' or 'B'.
   * @param {string} result.winnerName Display name of the winner.
   * @param {string} result.winReason Why the game ended.
   * @param {boolean} result.isWin Whether the local player won.
   */
  showGameOver({ winner, winnerName, winReason, isWin }) {
    this.gameOverTitle.textContent = isWin ? 'Sieg! Herzlichen Glückwunsch!' : 'Partie Verloren';
    this.gameOverTitle.className = `game-over-title ${isWin ? 'win' : 'loss'}`;
    this.gameOverWinner.textContent = `Gewinner: ${winnerName} (${RULES.colorName(winner)})`;
    this.gameOverReason.textContent = winReason || 'Spiel beendet';

    this.surrenderModal.close(CLOSED_BY_APP);
    if (!this.gameOverModal.open) this.gameOverModal.showModal();
  }

  /** Closes the dialogs that belong to a game, without acting on them. */
  closeGameDialogs() {
    this.surrenderModal.close(CLOSED_BY_APP);
    this.gameOverModal.close(CLOSED_BY_APP);
  }
}
