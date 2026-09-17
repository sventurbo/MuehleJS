/**
 * app.js
 * Main client controller for Mühle Web-Spiel.
 * Connects Socket.io, orchestrates UI views, board interaction, and chat.
 */

// Board geometry and capture rules live in gameRules.js so that the markers the
// renderer draws and the checks in _onPointClick are computed by the same code.
const RULES = window.MuehleRules;
const CLIENT_MILLS = RULES.MILLS;

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

    this.boardRenderer = null;

    this._cacheDom();
    this._bindEvents();
    this._initSocket();
  }

  /**
   * The opponent stones this client may capture right now.
   *
   * Derived from the current server state on every read instead of being cached
   * in a field: the renderer and _onPointClick therefore always see the same
   * set, and no branch can leave a stale one behind (which used to draw capture
   * rings the click handler then refused).
   */
  get removablePoints() {
    return RULES.getCaptureTargets(this.gameState, this.myColor);
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
    this.btnRulesGame = document.getElementById('btn-rules-game');
    this.btnRulesHeader = document.getElementById('btn-rules-header');
    this.btnCloseRules = document.getElementById('btn-close-rules');

    // Chat
    this.chatMessages = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');
    this.chatForm = document.getElementById('chat-form');

    // Dock tabs (only visible on small screens, where log and chat share a slot)
    this.dockTabs = Array.from(document.querySelectorAll('[data-dock-tab]'));
    this.dockPanels = Array.from(document.querySelectorAll('[data-dock-panel]'));
    this.chatUnreadDot = document.getElementById('chat-unread-dot');
    this.activeDockTab = 'log';

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
      this.btnSoundToggle.classList.toggle('is-muted', isMuted);
      this.btnSoundToggle.title = isMuted ? 'Ton aktivieren' : 'Ton stummschalten';
    });
    this.btnSoundToggle.classList.toggle('is-muted', window.soundController.isMuted());

    // Rules modal
    this.btnRulesLogin.addEventListener('click', () => this._showRulesModal(true));
    this.btnRulesGame.addEventListener('click', () => this._showRulesModal(true));
    this.btnRulesHeader.addEventListener('click', () => this._showRulesModal(true));
    this.btnCloseRules.addEventListener('click', () => this._showRulesModal(false));
    this.modalRules.addEventListener('click', (e) => {
      if (e.target === this.modalRules) this._showRulesModal(false);
    });

    // Audio has to be unlocked from a user gesture on iOS; the first game
    // sound is fired by a socket event, which would be too late.
    const unlockAudio = () => {
      window.soundController.unlock();
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('touchend', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('pointerdown', unlockAudio, { passive: true });
    document.addEventListener('touchend', unlockAudio, { passive: true });
    document.addEventListener('keydown', unlockAudio);

    // Dock tabs: log / chat on phones
    this.dockTabs.forEach(tab => {
      tab.addEventListener('click', () => this._activateDockTab(tab.dataset.dockTab));
    });

    // Chat form
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (text && this.socket) {
        this.socket.emit('chatMessage', { text });
        this.chatInput.value = '';
      }
      this.chatInput.focus();
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

      this.chatMessages.innerHTML = '';
      this.moveLogList.innerHTML = '';
      this._activateDockTab('log');

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
      }

      // Audio feedback & animations
      if (lastAction) {
        if (lastAction.action === 'place') {
          window.soundController.playPlace();
          this._addMoveLog(`${lastAction.player === 'W' ? 'Weiß' : 'Schwarz'} setzt auf ${lastAction.point}`);
        } else if (lastAction.action === 'move') {
          window.soundController.playMove();
          this._addMoveLog(`${lastAction.player === 'W' ? 'Weiß' : 'Schwarz'} zieht ${lastAction.from} → ${lastAction.to}`);
        } else if (lastAction.action === 'remove') {
          window.soundController.playRemove();
          this._addMoveLog(`${lastAction.player === 'W' ? 'Weiß' : 'Schwarz'} schlägt Stein auf ${lastAction.point}`);
        }

        if (lastAction.millFormed) {
          window.soundController.playMill();
          this._addSystemLog(`Mühle geschlossen von ${this.gameState.turn === 'W' ? 'Weiß' : 'Schwarz'}!`);
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
     const username = this.usernameInput.value.trim().substring(0, 12);
     if (!username) return;
     this.myName = username;
     this.socket.emit('login', { username });
   }

  _switchScreen(screenName) {
    window.scrollTo(0, 0);
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
        this.connStatusIndicator.textContent = 'Online';
        this.connStatusIndicator.className = 'conn-status online';
      } else {
        this.connStatusIndicator.textContent = 'Getrennt';
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
        this.hudInstructionText.innerHTML = '<strong>Mühle geschlossen!</strong> Klicke auf einen gegnerischen Stein, um ihn zu schlagen.';
      } else if (this.gameState.phase === 'SETTING') {
        this.hudInstructionText.textContent = `Setzphase: Platziere einen Stein auf ein freies Feld (${this.gameState.unplacedPieces[this.myColor]} übrig).`;
      } else if (this.gameState.phase === 'MOVING') {
        const canJump = this.gameState.piecesOnBoard[this.myColor] === 3;
        if (canJump) {
          this.hudInstructionText.textContent = 'Endphase (Springen): Du hast nur noch 3 Steine! Du darfst auf jedes freie Feld springen.';
        } else {
          this.hudInstructionText.textContent = 'Zugphase: Wähle einen deiner Steine aus und ziehe auf ein benachbartes freies Feld.';
        }
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

    // Re-render board SVG. The renderer derives the capture markers from the
    // same state and the same rule helper as `this.removablePoints`.
    this.boardRenderer.render(
      this.gameState,
      this.myColor,
      this.selectedPoint,
      this.validDestinations
    );
  }

  /**
   * Switches the small-screen dock between move log and chat.
   * On desktop both panels are visible, so this only tracks which one is
   * "current" for the unread marker.
   */
  _activateDockTab(name) {
    if (!name) return;
    this.activeDockTab = name;

    this.dockTabs.forEach(tab => {
      const isActive = tab.dataset.dockTab === name;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    this.dockPanels.forEach(panel => {
      panel.classList.toggle('is-active', panel.dataset.dockPanel === name);
    });

    if (name === 'chat') {
      if (this.chatUnreadDot) this.chatUnreadDot.classList.add('hidden');
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
  }

  /**
   * True while the dock tab bar is on screen (phone-sized viewports).
   */
  _isDockTabbed() {
    const tabs = document.querySelector('.dock-tabs');
    return !!tabs && tabs.offsetParent !== null;
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
          this.validDestinations = RULES.getValidDestinations(board, point, this.myColor, canJump);
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
      this.gameOverTitle.textContent = 'Sieg! Herzlichen Glückwunsch!';
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
    this._syncModalScrollLock();
  }

  _hideGameOverModal() {
    this.modalGameOver.classList.add('hidden');
    this._syncModalScrollLock();
  }

  _showRulesModal(show) {
    if (show) {
      this.modalRules.classList.remove('hidden');
    } else {
      this.modalRules.classList.add('hidden');
    }
    this._syncModalScrollLock();
  }

  /**
   * Freezes the page behind an open modal so touch scrolling stays inside the
   * dialog instead of moving the board around underneath it.
   */
  _syncModalScrollLock() {
    const anyOpen = !this.modalRules.classList.contains('hidden') ||
      !this.modalGameOver.classList.contains('hidden');
    document.body.classList.toggle('modal-open', anyOpen);
  }

  _addChatMessage(msg) {
    const item = document.createElement('div');
    const isMe = msg.sender === this.myName;
    item.className = `chat-msg ${isMe ? 'chat-me' : 'chat-other'}`;

    const colorBadge = `<span class="chat-stone chat-stone-${msg.color === 'W' ? 'w' : 'b'}" aria-hidden="true"></span>`;
    item.innerHTML = `
      <div class="chat-meta">${colorBadge} <strong>${this._escapeHtml(msg.sender)}</strong></div>
      <div class="chat-bubble">${this._escapeHtml(msg.text)}</div>
    `;
    this.chatMessages.appendChild(item);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

    // Phone layout: mark the hidden chat tab when the opponent writes.
    if (!isMe && this.chatUnreadDot && this._isDockTabbed() && this.activeDockTab !== 'chat') {
      this.chatUnreadDot.classList.remove('hidden');
    }
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

// React to system theme changes at runtime
if (window.matchMedia) {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeChange = () => {
    document.documentElement.classList.toggle('dark-theme', darkModeQuery.matches);
  };
  darkModeQuery.addEventListener('change', handleThemeChange);
  handleThemeChange();
}

