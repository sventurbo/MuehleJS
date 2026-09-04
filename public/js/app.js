/**
 * app.js
 * Main client controller for Mühle Web-Spiel.
 * Connects Socket.io, orchestrates UI views, board interaction, and chat.
 */

// Adjacency connections for client-side move highlighting
const CLIENT_ADJACENCY = {
  'a7': ['d7', 'a4'],
  'd7': ['a7', 'g7', 'd6'],
  'g7': ['d7', 'g4'],
  'a4': ['a7', 'a1', 'b4'],
  'g4': ['g7', 'g1', 'f4'],
  'a1': ['a4', 'd1'],
  'd1': ['a1', 'g1', 'd2'],
  'g1': ['d1', 'g4'],

  'b6': ['d6', 'b4'],
  'd6': ['b6', 'f6', 'd7', 'd5'],
  'f6': ['d6', 'f4'],
  'b4': ['b6', 'b2', 'a4', 'c4'],
  'f4': ['f6', 'f2', 'e4', 'g4'],
  'b2': ['b4', 'd2'],
  'd2': ['b2', 'f2', 'd1', 'd3'],
  'f2': ['d2', 'f4'],

  'c5': ['d5', 'c4'],
  'd5': ['c5', 'e5', 'd6'],
  'e5': ['d5', 'e4'],
  'c4': ['c5', 'c3', 'b4'],
  'e4': ['e5', 'e3', 'f4'],
  'c3': ['c4', 'd3'],
  'd3': ['c3', 'e3', 'd2'],
  'e3': ['d3', 'e4']
};

const ALL_POINTS = Object.keys(CLIENT_ADJACENCY);

// Mills list for client-side mill check
const CLIENT_MILLS = [
  ['a7', 'd7', 'g7'], ['b6', 'd6', 'f6'], ['c5', 'd5', 'e5'],
  ['c3', 'd3', 'e3'], ['b2', 'd2', 'f2'], ['a1', 'd1', 'g1'],
  ['a7', 'a4', 'a1'], ['b6', 'b4', 'b2'], ['c5', 'c4', 'c3'],
  ['e5', 'e4', 'e3'], ['f6', 'f4', 'f2'], ['g7', 'g4', 'g1'],
  ['d7', 'd6', 'd5'], ['g4', 'f4', 'e4'], ['d1', 'd2', 'd3'], ['a4', 'b4', 'c4']
];

class MuehleApp {
  constructor() {
    this.socket = null;
    this.myColor = null; // 'W' or 'B'
    this.myName = '';
    this.opponentName = '';
    this.opponentColor = null;
    this.gameState = null;

    this.selectedPoint = null;
    this.validDestinations = [];
    this.removablePoints = [];

    this.boardRenderer = null;

    this._cacheDom();
    this._bindEvents();
    this._initSocket();
  }

  _cacheDom() {
    // Screens
    this.screens = {
      login: document.getElementById('screen-login'),
      queue: document.getElementById('screen-queue'),
      game: document.getElementById('screen-game')
    };

    // Modals
    this.modalGameOver = document.getElementById('modal-game-over');
    this.modalRules = document.getElementById('modal-rules');

    // Login inputs
    this.usernameInput = document.getElementById('username-input');
    this.btnFindGame = document.getElementById('btn-find-game');
    this.btnRulesLogin = document.getElementById('btn-rules-login');

    // Queue elements
    this.btnCancelQueue = document.getElementById('btn-cancel-queue');
    this.queueStatusText = document.getElementById('queue-status-text');

    // Game HUD elements
    this.hudTurnBadge = document.getElementById('hud-turn-badge');
    this.hudPhaseText = document.getElementById('hud-phase-text');
    this.hudStatusBanner = document.getElementById('hud-status-banner');
    this.hudInstructionText = document.getElementById('hud-instruction-text');

    // Player White HUD
    this.playerWName = document.getElementById('player-w-name');
    this.playerWCard = document.getElementById('player-w-card');
    this.playerWPiecesLeft = document.getElementById('player-w-pieces-left');
    this.playerWCaptured = document.getElementById('player-w-captured');
    this.playerWPips = document.getElementById('player-w-pips');

    // Player Black HUD
    this.playerBName = document.getElementById('player-b-name');
    this.playerBCard = document.getElementById('player-b-card');
    this.playerBPiecesLeft = document.getElementById('player-b-pieces-left');
    this.playerBCaptured = document.getElementById('player-b-captured');
    this.playerBPips = document.getElementById('player-b-pips');

    // Controls
    this.btnSurrender = document.getElementById('btn-surrender');
    this.btnSoundToggle = document.getElementById('btn-sound-toggle');
    this.soundIcon = document.getElementById('sound-icon');
    this.btnRulesGame = document.getElementById('btn-rules-game');
    this.btnCloseRules = document.getElementById('btn-close-rules');

    // Chat
    this.chatMessages = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');
    this.chatForm = document.getElementById('chat-form');

    // Move Log
    this.moveLogList = document.getElementById('move-log-list');

    // Game Over Modal elements
    this.gameOverTitle = document.getElementById('game-over-title');
    this.gameOverReason = document.getElementById('game-over-reason');
    this.gameOverWinnerName = document.getElementById('game-over-winner-name');
    this.btnPlayAgain = document.getElementById('btn-play-again');
    this.btnBackToLobby = document.getElementById('btn-back-to-lobby');

    // Toast
    this.toastContainer = document.getElementById('toast-container');
    this.connStatusIndicator = document.getElementById('conn-status-indicator');

    // Board container
    this.boardContainer = document.getElementById('board-container');
  }

  _bindEvents() {
    // Login submit
    this.btnFindGame.addEventListener('click', () => this._handleLogin());
    this.usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this._handleLogin();
    });

    // Cancel queue
    this.btnCancelQueue.addEventListener('click', () => {
      this.socket.emit('leaveGame');
      this._switchScreen('login');
    });

    // Surrender
    this.btnSurrender.addEventListener('click', () => {
      if (confirm('Möchtest du diese Partie wirklich aufgeben?')) {
        this.socket.emit('forfeit');
      }
    });

    // Sound toggle
    this.btnSoundToggle.addEventListener('click', () => {
      const isMuted = window.soundController.toggleMute();
      this.soundIcon.textContent = isMuted ? '🔇' : '🔊';
      this.btnSoundToggle.title = isMuted ? 'Ton aktivieren' : 'Ton stummschalten';
    });
    this.soundIcon.textContent = window.soundController.isMuted() ? '🔇' : '🔊';

    // Rules modal
    this.btnRulesLogin.addEventListener('click', () => this._showRulesModal(true));
    this.btnRulesGame.addEventListener('click', () => this._showRulesModal(true));
    this.btnCloseRules.addEventListener('click', () => this._showRulesModal(false));
    this.modalRules.addEventListener('click', (e) => {
      if (e.target === this.modalRules) this._showRulesModal(false);
    });

    // Chat form
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (text && this.socket) {
        this.socket.emit('chatMessage', { text });
        this.chatInput.value = '';
      }
    });

    // Game over actions
    this.btnPlayAgain.addEventListener('click', () => {
      this._hideGameOverModal();
      this._handleLogin();
    });
    this.btnBackToLobby.addEventListener('click', () => {
      this._hideGameOverModal();
      this.socket.emit('leaveGame');
      this._switchScreen('login');
    });

    // Setup BoardRenderer
    this.boardRenderer = new window.BoardRenderer(this.boardContainer, (pt) => this._onPointClick(pt));
  }

  _initSocket() {
    this.socket = io();

    this.socket.on('connect', () => {
      this._updateConnStatus(true);
    });

    this.socket.on('disconnect', (reason) => {
      this._updateConnStatus(false);
      this._showToast('Verbindung zum Server unterbrochen', 'error');
    });

    this.socket.on('queueWaiting', (data) => {
      this.queueStatusText.textContent = data.message || 'Warte auf Mitspieler...';
      this._switchScreen('queue');
    });

    this.socket.on('gameStart', (data) => {
      this.myColor = data.yourColor;
      this.myName = data.yourName;
      this.opponentName = data.opponentName;
      this.opponentColor = data.opponentColor;
      this.gameState = data.state;

      this.selectedPoint = null;
      this.validDestinations = [];
      this.removablePoints = [];

      this.chatMessages.innerHTML = '';
      this.moveLogList.innerHTML = '';

      this._switchScreen('game');
      this._addSystemLog(`Spiel gestartet! Du spielst als ${this.myColor === 'W' ? 'Weiß' : 'Schwarz'}.`);

      window.soundController.playPlace();
      this._updateGameUI();
    });

    this.socket.on('gameStateUpdate', (data) => {
      const prevState = this.gameState;
      this.gameState = data.state;
      const lastAction = data.lastAction;

      // Reset local selection if turn switched
      if (prevState && prevState.turn !== this.gameState.turn) {
        this.selectedPoint = null;
        this.validDestinations = [];
        this.removablePoints = [];
      }

      // Audio feedback & animations
      if (lastAction) {
        if (lastAction.action === 'place') {
          window.soundController.playPlace();
          this._addMoveLog(`${lastAction.player === 'W' ? 'Weiß' : 'Schwarz'} setzt auf ${lastAction.point}`);
        } else if (lastAction.action === 'move') {
          window.soundController.playMove();
          this._addMoveLog(`${lastAction.player === 'W' ? 'Weiß' : 'Schwarz'} zieht ${lastAction.from} ➔ ${lastAction.to}`);
        } else if (lastAction.action === 'remove') {
          window.soundController.playRemove();
          this._addMoveLog(`${lastAction.player === 'W' ? 'Weiß' : 'Schwarz'} schlägt Stein auf ${lastAction.point}`);
        }

        if (lastAction.millFormed) {
          window.soundController.playMill();
          this._addSystemLog(`⭐ Mühle geschlossen von ${this.gameState.turn === 'W' ? 'Weiß' : 'Schwarz'}!`);
          if (this.gameState.millTriggerPoint) {
            // Find which mill was closed
            const formedMill = CLIENT_MILLS.find(m =>
              m.includes(this.gameState.millTriggerPoint) &&
              m.every(pt => this.gameState.board[pt] === this.gameState.turn)
            );
            if (formedMill) {
              this.boardRenderer.highlightMill(formedMill);
            }
          }
        }
      }

      this._updateGameUI();
    });

    this.socket.on('gameOver', (data) => {
      this.gameState = data.state;
      this._updateGameUI();
      this._showGameOverModal(data.winner, data.winnerName, data.winReason);
    });

    this.socket.on('opponentDisconnected', (data) => {
      this.gameState = data.state;
      this._updateGameUI();
      this._showGameOverModal(data.winner, data.winnerName, data.winReason);
      this._showToast('Gegner hat die Verbindung getrennt.', 'warning');
    });

    this.socket.on('actionError', (data) => {
      this._showToast(data.message || 'Ungültige Aktion', 'error');
    });

    this.socket.on('serverError', (data) => {
      this._showToast(data.message || 'Serverfehler', 'error');
    });

    this.socket.on('chatMessage', (msg) => {
      this._addChatMessage(msg);
    });
  }

  _handleLogin() {
    const username = this.usernameInput.value.trim() || 'Spieler';
    this.myName = username;
    this.socket.emit('login', { username });
  }

  _switchScreen(screenName) {
    Object.keys(this.screens).forEach(key => {
      if (key === screenName) {
        this.screens[key].classList.remove('hidden');
      } else {
        this.screens[key].classList.add('hidden');
      }
    });
  }

  _updateConnStatus(online) {
    if (this.connStatusIndicator) {
      if (online) {
        this.connStatusIndicator.textContent = '● Online';
        this.connStatusIndicator.className = 'conn-status online';
      } else {
        this.connStatusIndicator.textContent = '● Getrennt';
        this.connStatusIndicator.className = 'conn-status offline';
      }
    }
  }

  _updateGameUI() {
    if (!this.gameState) return;

    const isMyTurn = this.gameState.turn === this.myColor && !this.gameState.winner;
    const isWhiteTurn = this.gameState.turn === 'W';

    // Player Cards highlighting
    this.playerWCard.classList.toggle('active-turn', isWhiteTurn && !this.gameState.winner);
    this.playerBCard.classList.toggle('active-turn', !isWhiteTurn && !this.gameState.winner);

    // Names
    this.playerWName.textContent = (this.myColor === 'W' ? this.myName : this.opponentName) + (this.myColor === 'W' ? ' (Du)' : '');
    this.playerBName.textContent = (this.myColor === 'B' ? this.myName : this.opponentName) + (this.myColor === 'B' ? ' (Du)' : '');

    // Counts
    this.playerWPiecesLeft.textContent = this.gameState.unplacedPieces.W;
    this.playerBPiecesLeft.textContent = this.gameState.unplacedPieces.B;
    this.playerWCaptured.textContent = this.gameState.capturedPieces.B; // W captured B's stones
    this.playerBCaptured.textContent = this.gameState.capturedPieces.W; // B captured W's stones

    // Visual Pips for unplaced stones
    this._renderPips(this.playerWPips, this.gameState.unplacedPieces.W, 'white');
    this._renderPips(this.playerBPips, this.gameState.unplacedPieces.B, 'black');

    // Turn indicator and banner instructions
    if (this.gameState.winner) {
      this.hudTurnBadge.textContent = 'Spiel Beendet';
      this.hudTurnBadge.className = 'hud-badge finished';
      this.hudStatusBanner.className = 'hud-status-banner finished';
      this.hudInstructionText.textContent = this.gameState.winReason || 'Partie abgeschlossen.';
    } else if (isMyTurn) {
      this.hudTurnBadge.textContent = 'Du bist am Zug';
      this.hudTurnBadge.className = 'hud-badge my-turn';
      this.hudStatusBanner.className = 'hud-status-banner my-turn';

      if (this.gameState.awaitingRemoval) {
        this.hudInstructionText.innerHTML = '⭐ <strong>Mühle geschlossen!</strong> Klicke auf einen gegnerischen Stein, um ihn zu schlagen.';
        this.removablePoints = this._calculateRemovablePoints(this.myColor);
      } else if (this.gameState.phase === 'SETTING') {
        this.hudInstructionText.textContent = `Setzphase: Platziere einen Stein auf ein freies Feld (${this.gameState.unplacedPieces[this.myColor]} übrig).`;
        this.removablePoints = [];
      } else if (this.gameState.phase === 'MOVING') {
        const canJump = this.gameState.piecesOnBoard[this.myColor] === 3;
        if (canJump) {
          this.hudInstructionText.textContent = 'Endphase (Springen): Du hast nur noch 3 Steine! Du darfst auf jedes freie Feld springen.';
        } else {
          this.hudInstructionText.textContent = 'Zugphase: Wähle einen deiner Steine aus und ziehe auf ein benachbartes freies Feld.';
        }
        this.removablePoints = [];
      }
    } else {
      this.hudTurnBadge.textContent = 'Gegner ist am Zug';
      this.hudTurnBadge.className = 'hud-badge opponent-turn';
      this.hudStatusBanner.className = 'hud-status-banner opponent-turn';

      if (this.gameState.awaitingRemoval) {
        this.hudInstructionText.textContent = 'Gegner hat eine Mühle geschlossen und wählt einen Stein zum Schlagen...';
      } else if (this.gameState.phase === 'SETTING') {
        this.hudInstructionText.textContent = 'Gegner setzt einen Stein...';
      } else {
        this.hudInstructionText.textContent = 'Gegner überlegt seinen nächsten Zug...';
      }
      this.removablePoints = [];
    }

    // Phase label
    if (this.gameState.phase === 'SETTING') {
      this.hudPhaseText.textContent = 'Phase 1: Setzen';
    } else if (this.gameState.phase === 'MOVING') {
      const isJump = (this.gameState.piecesOnBoard.W === 3 || this.gameState.piecesOnBoard.B === 3);
      this.hudPhaseText.textContent = isJump ? 'Phase 3: Springen' : 'Phase 2: Ziehen';
    } else {
      this.hudPhaseText.textContent = 'Partie Beendet';
    }

    // Re-render board SVG
    this.boardRenderer.render(
      this.gameState,
      this.myColor,
      this.selectedPoint,
      this.validDestinations,
      this.removablePoints
    );
  }

  _renderPips(container, count, colorClass) {
    let pipsHtml = '';
    for (let i = 0; i < 9; i++) {
      const active = i < count;
      pipsHtml += `<span class="pip pip-${colorClass} ${active ? 'active' : 'inactive'}"></span>`;
    }
    container.innerHTML = pipsHtml;
  }

  /**
   * Calculates removable opponent stones for client visual feedback.
   */
  _calculateRemovablePoints(player) {
    const opponent = player === 'W' ? 'B' : 'W';
    const board = this.gameState.board;
    const opponentPoints = ALL_POINTS.filter(pt => board[pt] === opponent);

    // Helper: is opponent stone in a mill?
    const isOpponentMill = (pt) => {
      const mills = CLIENT_MILLS.filter(m => m.includes(pt));
      return mills.some(mill => mill.every(p => board[p] === opponent));
    };

    const allInMills = opponentPoints.every(pt => isOpponentMill(pt));
    if (allInMills) {
      return opponentPoints;
    }
    return opponentPoints.filter(pt => !isOpponentMill(pt));
  }

  /**
   * User clicked on a board point.
   */
  _onPointClick(point) {
    if (!this.gameState || this.gameState.winner) return;
    if (this.gameState.turn !== this.myColor) {
      this._showToast('Der Gegner ist am Zug!', 'info');
      return;
    }

    const board = this.gameState.board;
    const piece = board[point];

    // Case 1: Mill formed, must remove an opponent piece
    if (this.gameState.awaitingRemoval) {
      if (this.removablePoints.includes(point)) {
        this.socket.emit('removePiece', { point });
      } else {
        this._showToast('Wähle einen gültigen gegnerischen Stein zum Schlagen (nicht in einer Mühle)!', 'warning');
      }
      return;
    }

    // Case 2: SETTING phase (place stone on empty field)
    if (this.gameState.phase === 'SETTING') {
      if (piece === null) {
        this.socket.emit('placePiece', { point });
      } else {
        this._showToast('Dieses Feld ist bereits besetzt!', 'warning');
      }
      return;
    }

    // Case 3: MOVING phase
    if (this.gameState.phase === 'MOVING') {
      // If clicking own piece: select it
      if (piece === this.myColor) {
        if (this.selectedPoint === point) {
          // Deselect
          this.selectedPoint = null;
          this.validDestinations = [];
        } else {
          // Select piece and show destinations
          this.selectedPoint = point;
          const canJump = this.gameState.piecesOnBoard[this.myColor] === 3;
          if (canJump) {
            this.validDestinations = ALL_POINTS.filter(pt => board[pt] === null);
          } else {
            this.validDestinations = (CLIENT_ADJACENCY[point] || []).filter(pt => board[pt] === null);
          }
        }
        this._updateGameUI();
        return;
      }

      // If a piece is already selected and clicking a valid destination
      if (this.selectedPoint && this.validDestinations.includes(point)) {
        this.socket.emit('movePiece', {
          from: this.selectedPoint,
          to: point
        });
        this.selectedPoint = null;
        this.validDestinations = [];
        this._updateGameUI();
        return;
      }

      // Clicking empty point without valid selection
      if (piece === null && this.selectedPoint) {
        this._showToast('Dieser Zug ist ungültig (keine direkte Verbindung)!', 'warning');
      }
    }
  }

  _showGameOverModal(winner, winnerName, winReason) {
    const isWin = winner === this.myColor;
    if (isWin) {
      window.soundController.playWin();
      this.gameOverTitle.textContent = '🎉 Sieg! Herzlichen Glückwunsch!';
      this.gameOverTitle.className = 'game-over-title win';
      this.gameOverWinnerName.textContent = `Gewinner: ${winnerName} (${winner === 'W' ? 'Weiß' : 'Schwarz'})`;
    } else {
      window.soundController.playLose();
      this.gameOverTitle.textContent = 'Partie Verloren';
      this.gameOverTitle.className = 'game-over-title loss';
      this.gameOverWinnerName.textContent = `Gewinner: ${winnerName} (${winner === 'W' ? 'Weiß' : 'Schwarz'})`;
    }

    this.gameOverReason.textContent = winReason || 'Spiel beendet';
    this.modalGameOver.classList.remove('hidden');
  }

  _hideGameOverModal() {
    this.modalGameOver.classList.add('hidden');
  }

  _showRulesModal(show) {
    if (show) {
      this.modalRules.classList.remove('hidden');
    } else {
      this.modalRules.classList.add('hidden');
    }
  }

  _addChatMessage(msg) {
    const item = document.createElement('div');
    const isMe = msg.sender === this.myName;
    item.className = `chat-msg ${isMe ? 'chat-me' : 'chat-other'}`;

    const colorBadge = msg.color === 'W' ? '⚪' : '⚫';
    item.innerHTML = `
      <div class="chat-meta">${colorBadge} <strong>${this._escapeHtml(msg.sender)}</strong></div>
      <div class="chat-bubble">${this._escapeHtml(msg.text)}</div>
    `;
    this.chatMessages.appendChild(item);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  _addMoveLog(text) {
    const li = document.createElement('li');
    li.textContent = text;
    this.moveLogList.appendChild(li);
    this.moveLogList.scrollTop = this.moveLogList.scrollHeight;
  }

  _addSystemLog(text) {
    const li = document.createElement('li');
    li.className = 'log-system';
    li.textContent = text;
    this.moveLogList.appendChild(li);
    this.moveLogList.scrollTop = this.moveLogList.scrollHeight;
  }

  _showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new MuehleApp();
});

