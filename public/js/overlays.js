/**
 * overlays.js
 * Everything that sits *above* the app: the connection badge, transient toasts,
 * the rules dialog and the game-over dialog.
 *
 * These are the only parts of the UI that can appear over the board, so they
 * also own the scroll lock that keeps a phone from scrolling the board around
 * underneath an open dialog.
 */

(function (window, document) {
  'use strict';

  const RULES = window.MuehleRules;

  /** How long a toast stays before it starts to fade, and how long it fades. */
  const TOAST_VISIBLE_MS = 3000;
  const TOAST_FADE_MS = 400;

  class Overlays {
    /**
     * @param {Object} handlers
     * @param {Function} handlers.onPlayAgain Player wants another game.
     * @param {Function} handlers.onBackToLobby Player returns to the start screen.
     */
    constructor({ onPlayAgain, onBackToLobby } = {}) {
      this.connStatus = document.getElementById('conn-status-indicator');
      this.toastContainer = document.getElementById('toast-container');

      this.rulesModal = document.getElementById('modal-rules');
      this.gameOverModal = document.getElementById('modal-game-over');
      this.gameOverTitle = document.getElementById('game-over-title');
      this.gameOverReason = document.getElementById('game-over-reason');
      this.gameOverWinner = document.getElementById('game-over-winner-name');

      // Three buttons open the rules (login screen, game HUD, header).
      ['btn-rules-login', 'btn-rules-game', 'btn-rules-header'].forEach(id => {
        document.getElementById(id).addEventListener('click', () => this.showRules(true));
      });
      document.getElementById('btn-close-rules')
        .addEventListener('click', () => this.showRules(false));
      this.rulesModal.addEventListener('click', (e) => {
        if (e.target === this.rulesModal) this.showRules(false);
      });

      document.getElementById('btn-play-again').addEventListener('click', () => {
        this.hideGameOver();
        if (onPlayAgain) onPlayAgain();
      });
      document.getElementById('btn-back-to-lobby').addEventListener('click', () => {
        if (onBackToLobby) onBackToLobby();
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
      this.toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('toast-fade');
        setTimeout(() => toast.remove(), TOAST_FADE_MS);
      }, TOAST_VISIBLE_MS);
    }

    showRules(show) {
      this.rulesModal.classList.toggle('hidden', !show);
      this._syncScrollLock();
    }

    /**
     * Announces the result of a finished game.
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

      this.gameOverModal.classList.remove('hidden');
      this._syncScrollLock();
    }

    hideGameOver() {
      this.gameOverModal.classList.add('hidden');
      this._syncScrollLock();
    }

    /**
     * Freezes the page behind an open dialog so touch scrolling stays inside it
     * instead of moving the board around underneath.
     */
    _syncScrollLock() {
      const anyOpen = !this.rulesModal.classList.contains('hidden') ||
        !this.gameOverModal.classList.contains('hidden');
      document.body.classList.toggle('modal-open', anyOpen);
    }
  }

  window.Overlays = Overlays;
})(window, document);
