/**
 * overlays.js
 * Everything that sits *above* the app: the connection badge, toasts and the
 * three dialogs (rules, surrender, game over).
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

/** The cross a sticky toast shows, the same glyph as the rules dialog's close button. */
const CLOSE_ICON = `
  <svg class="icon toast-close-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.5 6.5l11 11"/>
    <path d="M17.5 6.5l-11 11"/>
  </svg>`;

/** returnValue of a dialog the app closed itself, so it carries no choice. */
const CLOSED_BY_APP = 'app';

/** Heading of the game-over dialog for each outcome, seen from this player. */
const GAME_OVER_TITLES = {
  win: 'Sieg! Herzlichen Glückwunsch!',
  loss: 'Partie Verloren',
  draw: 'Unentschieden'
};

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

    onDialogClose(this.surrenderModal, choice => {
      if (choice === 'surrender') onSurrender?.();
    });

    // The game is over either way, so closing the dialog without a choice
    // (Escape) means leaving, just like the "Zurück zur Startseite" button.
    onDialogClose(this.gameOverModal, choice => {
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
   *
   * A sticky toast stays until the player clicks it away instead. It is meant
   * for news a player must not miss while looking elsewhere, such as a move
   * the server played for them; it is a button, so the keyboard reaches and
   * closes it as well.
   *
   * @param {string} message
   * @param {string} [type] 'info' | 'warning' | 'error'
   * @param {Object} [options]
   * @param {boolean} [options.sticky] Stay until clicked instead of fading out.
   */
  toast(message, type = 'info', { sticky = false } = {}) {
    const toast = document.createElement(sticky ? 'button' : 'div');
    toast.className = `toast toast-${type}`;

    if (sticky) {
      toast.type = 'button';
      toast.classList.add('toast-sticky');
      toast.title = 'Zum Schließen klicken';
      // The message goes in as text; only the static icon is markup.
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

  /** Lets a toast fade out and then takes it off the page. */
  static #dismiss(toast) {
    toast.classList.add('toast-fade');
    setTimeout(() => toast.remove(), TOAST_FADE_MS);
  }

  /**
   * Announces the result of a finished game. A surrender question that is
   * still open has nothing left to decide and is dropped.
   * @param {Object} result
   * @param {?string} result.winner Winning colour, 'W' or 'B'; null for a draw.
   * @param {?string} result.winnerName Display name of the winner.
   * @param {string} result.endReason Why the game ended.
   * @param {boolean} result.isWin Whether the local player won.
   */
  showGameOver({ winner, winnerName, endReason, isWin }) {
    const outcome = winner === null ? 'draw' : isWin ? 'win' : 'loss';
    this.gameOverTitle.textContent = GAME_OVER_TITLES[outcome];
    this.gameOverTitle.className = `game-over-title ${outcome}`;

    // A draw has nobody to name.
    this.gameOverWinner.hidden = outcome === 'draw';
    this.gameOverWinner.textContent = outcome === 'draw' ? '' : `Gewinner: ${winnerName} (${RULES.colorName(winner)})`;
    this.gameOverReason.textContent = endReason || 'Spiel beendet';

    this.surrenderModal.close(CLOSED_BY_APP);
    if (!this.gameOverModal.open) this.gameOverModal.showModal();
  }

  /** Closes the dialogs that belong to a game, without acting on them. */
  closeGameDialogs() {
    this.surrenderModal.close(CLOSED_BY_APP);
    this.gameOverModal.close(CLOSED_BY_APP);
  }
}
