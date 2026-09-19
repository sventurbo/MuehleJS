/**
 * app.js
 * The client controller of the Mühle web game.
 *
 * It owns exactly three things:
 *   - the Socket.io connection and what each server event means,
 *   - which of the three screens (login, queue, game) is visible,
 *   - what a click on a board point should ask the server for.
 *
 * Everything that only *draws* is delegated: HudView (state around the board),
 * DockView (move log and chat), Overlays (dialogs, toasts, connection badge)
 * and BoardRenderer (the SVG board). None of those views knows the socket, so
 * the server stays the only authority — the client merely shows what it is told
 * and asks for what the player clicked.
 */

// Board geometry and capture rules come from the module the server engine is
// built on, so the markers this client draws and the moves it offers are
// validated by the very same code that will judge them.
const RULES = window.MuehleRules;

class MuehleApp {
  constructor() {
    this.socket = null;
    this.myColor = null; // 'W' or 'B'
    this.myName = '';
    this.opponentName = '';
    this.gameState = null;

    this.selectedPoint = null;
    this.validDestinations = [];

    // True while the server holds something for us (a queue slot or a running
    // game). Socket.io reconnects with a fresh socket id, so anything the
    // server was holding is gone by then and the session has to be ended here.
    this.sessionActive = false;
    this.connectionLost = false;

    this.screens = {
      login: document.getElementById('screen-login'),
      queue: document.getElementById('screen-queue'),
      game: document.getElementById('screen-game')
    };
    this.usernameInput = document.getElementById('username-input');
    this.queueStatusText = document.getElementById('queue-status-text');
    this.btnSoundToggle = document.getElementById('btn-sound-toggle');

    this.hud = new window.HudView();
    this.dock = new window.DockView({ onSend: (text) => this.socket.emit('chatMessage', { text }) });
    this.overlays = new window.Overlays({
      onPlayAgain: () => this._handleLogin(),
      onBackToLobby: () => {
        this.socket.emit('leaveGame');
        this._terminateSession(null);
      }
    });
    this.board = new window.BoardRenderer(
      document.getElementById('board-container'),
      (point) => this._onPointClick(point)
    );

    this._bindControls();
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

  // ── Controls outside the views ────────────────────────────────────────────

  _bindControls() {
    document.getElementById('btn-find-game')
      .addEventListener('click', () => this._handleLogin());
    this.usernameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleLogin();
    });

    document.getElementById('btn-cancel-queue').addEventListener('click', () => {
      this.socket.emit('leaveGame');
      this.sessionActive = false;
      this._switchScreen('login');
    });

    document.getElementById('btn-surrender').addEventListener('click', () => {
      if (confirm('Möchtest du diese Partie wirklich aufgeben?')) {
        this.socket.emit('forfeit');
      }
    });

    this.btnSoundToggle.addEventListener('click', () => this._toggleSound());
    this._markSoundButton(window.soundController.isMuted());

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
  }

  _toggleSound() {
    this._markSoundButton(window.soundController.toggleMute());
  }

  _markSoundButton(isMuted) {
    this.btnSoundToggle.classList.toggle('is-muted', isMuted);
    this.btnSoundToggle.title = isMuted ? 'Ton aktivieren' : 'Ton stummschalten';
  }

  _handleLogin() {
    const username = this.usernameInput.value.trim().substring(0, 12);
    if (!username) return;
    this.myName = username;
    this.socket.emit('login', { username });
  }

  // ── Server events ─────────────────────────────────────────────────────────

  _initSocket() {
    this.socket = io();

    this.socket.on('connect', () => {
      this.overlays.setConnected(true);

      // Reconnecting gives us a new socket id, so the server has already ended
      // and forgotten the game we were in. Terminate it instead of leaving a
      // board on screen that no longer accepts a single move.
      if (this.connectionLost) {
        this.connectionLost = false;
        if (this.sessionActive) {
          this._terminateSession('Die Verbindung wurde unterbrochen – die Partie wurde beendet.');
        }
      }
    });

    this.socket.on('disconnect', () => {
      this.connectionLost = true;
      this.overlays.setConnected(false);
      this.hud.stopCountdown();
      this.overlays.toast('Verbindung zum Server unterbrochen', 'error');
    });

    // The server no longer knows this socket's game (opponent gone, or we
    // reconnected under a new id). Nothing is recoverable, so end the session.
    this.socket.on('gameNotFound', (data) => {
      if (!this.sessionActive) return;
      this._terminateSession((data && data.message) || 'Deine Partie ist nicht mehr aktiv.');
    });

    this.socket.on('queueWaiting', (data) => {
      this.sessionActive = true;
      this.queueStatusText.textContent = data.message || 'Warte auf Mitspieler...';
      this._switchScreen('queue');
    });

    this.socket.on('gameStart', (data) => this._startGame(data));

    this.socket.on('gameStateUpdate', (data) => this._applyUpdate(data));

    // The server restarts the turn clock after every accepted action and says
    // how much time the player on turn has left.
    this.socket.on('turnTimer', (data) => this.hud.startCountdown(data));

    // The clock ran out: the server played a legal move for the player on turn.
    this.socket.on('turnTimeout', (data) => {
      if (!data) return;
      const actor = RULES.colorName(data.player);
      this.dock.addSystemNote(data.message || `Zeit abgelaufen – für ${actor} wurde automatisch gezogen.`);
      this.overlays.toast(
        data.player === this.myColor
          ? 'Deine Bedenkzeit ist abgelaufen – es wurde automatisch für dich gezogen.'
          : `Bedenkzeit von ${actor} abgelaufen – der Zug wurde automatisch ausgeführt.`,
        'warning'
      );
    });

    this.socket.on('gameOver', (data) => this._endGame(data));

    this.socket.on('opponentDisconnected', (data) => {
      this._endGame(data);
      // The exact cause (dropped connection vs. deliberate exit) is in winReason.
      this.overlays.toast(data.winReason || 'Die Partie wurde beendet.', 'warning');
    });

    this.socket.on('actionError', (data) => {
      this.overlays.toast(data.message || 'Ungültige Aktion', 'error');
    });

    this.socket.on('serverError', (data) => {
      this.overlays.toast(data.message || 'Serverfehler', 'error');
    });

    this.socket.on('chatMessage', (msg) => this.dock.addChatMessage(msg));
  }

  /** A match was found: set up both views and show the board. */
  _startGame(data) {
    this.sessionActive = true;
    this.myColor = data.yourColor;
    this.myName = data.yourName;
    this.opponentName = data.opponentName;
    this.gameState = data.state;

    this.selectedPoint = null;
    this.validDestinations = [];

    this.hud.reset();
    this.hud.setPlayers({
      myColor: this.myColor,
      myName: this.myName,
      opponentName: this.opponentName
    });
    this.dock.reset(this.myName);

    this._switchScreen('game');
    this.dock.addSystemNote(`Spiel gestartet! Du spielst als ${RULES.colorName(this.myColor)}.`);

    window.soundController.playPlace();
    this._render();
  }

  /** An accepted action: log it, play its sound, then redraw. */
  _applyUpdate(data) {
    const previousTurn = this.gameState && this.gameState.turn;
    this.gameState = data.state;
    const lastAction = data.lastAction;

    // Reset local selection if turn switched
    if (previousTurn && previousTurn !== this.gameState.turn) {
      this.selectedPoint = null;
      this.validDestinations = [];
    }

    if (lastAction) {
      this._reportAction(lastAction);
    }

    this._render();
  }

  /** Move log entry, sound and mill beam for one accepted action. */
  _reportAction(lastAction) {
    const actor = RULES.colorName(lastAction.player);

    // A move the server played after the turn timer expired is marked, so
    // the protocol shows who actually decided it.
    const autoSuffix = lastAction.auto ? ' (automatisch)' : '';

    if (lastAction.action === 'place') {
      window.soundController.playPlace();
      this.dock.addMove(`${actor} setzt auf ${lastAction.point}${autoSuffix}`);
    } else if (lastAction.action === 'move') {
      window.soundController.playMove();
      this.dock.addMove(`${actor} zieht ${lastAction.from} → ${lastAction.to}${autoSuffix}`);
    } else if (lastAction.action === 'remove') {
      window.soundController.playRemove();
      this.dock.addMove(`${actor} schlägt Stein auf ${lastAction.point}${autoSuffix}`);
    }

    if (!lastAction.millFormed) return;

    window.soundController.playMill();
    this.dock.addSystemNote(`Mühle geschlossen von ${actor}!`);

    const trigger = this.gameState.millTriggerPoint;
    if (!trigger) return;
    const closedMill = RULES.MILLS.find(mill =>
      mill.includes(trigger) && mill.every(pt => this.gameState.board[pt] === lastAction.player)
    );
    if (closedMill) this.board.highlightMill(closedMill);
  }

  /** The game is decided — by a win, a forfeit or a lost opponent. */
  _endGame(data) {
    this.gameState = data.state;
    this.hud.stopCountdown();
    this._render();

    // The server is done with this game, so a later reconnect or `gameNotFound`
    // must not tear the result screen away before it has been read.
    this.sessionActive = false;

    const isWin = data.winner === this.myColor;
    if (isWin) {
      window.soundController.playWin();
    } else {
      window.soundController.playLose();
    }
    this.overlays.showGameOver({
      winner: data.winner,
      winnerName: data.winnerName,
      winReason: data.winReason,
      isWin
    });
  }

  /**
   * Ends the current session locally and returns to the lobby.
   *
   * Used whenever the server cannot possibly still know about us — after a
   * reconnect, or when it answers `gameNotFound`. The requirement is that a
   * connection error simply terminates the game; without this the client kept
   * showing a board that silently swallowed every click.
   */
  _terminateSession(message) {
    this.sessionActive = false;
    this.hud.reset();
    this.gameState = null;
    this.myColor = null;
    this.selectedPoint = null;
    this.validDestinations = [];

    this.overlays.hideGameOver();
    this._switchScreen('login');
    if (message) this.overlays.toast(message, 'warning');
  }

  // ── Board interaction ─────────────────────────────────────────────────────

  /**
   * A click on a board point. Nothing is decided here: the click is turned into
   * the one request it can be right now, and the server answers with the new
   * state (or an `actionError`).
   */
  _onPointClick(point) {
    if (!this.gameState || this.gameState.winner) return;
    if (this.gameState.turn !== this.myColor) {
      this.overlays.toast('Der Gegner ist am Zug!', 'info');
      return;
    }

    if (this.gameState.awaitingRemoval) {
      this._tryCapture(point);
    } else if (this.gameState.phase === 'SETTING') {
      this._tryPlace(point);
    } else if (this.gameState.phase === 'MOVING') {
      this._trySelectOrMove(point);
    }
  }

  /** A mill was closed: the click has to name a capturable opponent stone. */
  _tryCapture(point) {
    if (this.removablePoints.includes(point)) {
      this.socket.emit('removePiece', { point });
    } else {
      this.overlays.toast('Wähle einen gültigen gegnerischen Stein zum Schlagen (nicht in einer Mühle)!', 'warning');
    }
  }

  /** Phase 1: any free point takes a stone. */
  _tryPlace(point) {
    if (this.gameState.board[point] === null) {
      this.socket.emit('placePiece', { point });
    } else {
      this.overlays.toast('Dieses Feld ist bereits besetzt!', 'warning');
    }
  }

  /** Phase 2 & 3: first click selects a stone, second click moves it. */
  _trySelectOrMove(point) {
    const piece = this.gameState.board[point];

    // Own stone: select it, or deselect the one already selected.
    if (piece === this.myColor) {
      if (this.selectedPoint === point) {
        this.selectedPoint = null;
        this.validDestinations = [];
      } else {
        const canJump = this.gameState.piecesOnBoard[this.myColor] === 3;
        this.selectedPoint = point;
        this.validDestinations = RULES.getValidDestinations(
          this.gameState.board, point, this.myColor, canJump
        );
      }
      this._render();
      return;
    }

    // A stone is selected and this is one of its destinations.
    if (this.selectedPoint && this.validDestinations.includes(point)) {
      this.socket.emit('movePiece', { from: this.selectedPoint, to: point });
      this.selectedPoint = null;
      this.validDestinations = [];
      this._render();
      return;
    }

    if (piece === null && this.selectedPoint) {
      this.overlays.toast('Dieser Zug ist ungültig (keine direkte Verbindung)!', 'warning');
    }
  }

  // ── Screens ───────────────────────────────────────────────────────────────

  _switchScreen(screenName) {
    window.scrollTo(0, 0);
    Object.entries(this.screens).forEach(([name, section]) => {
      section.classList.toggle('hidden', name !== screenName);
    });
  }

  /** Redraws everything that depends on the current game state. */
  _render() {
    if (!this.gameState) return;
    this.hud.render(this.gameState);
    this.board.render(this.gameState, this.myColor, this.selectedPoint, this.validDestinations);
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
