import { io } from '/socket.io/socket.io.esm.min.js';
import * as RULES from '/shared/muehleRules.js';
import { soundController } from './audio.js';
import { BoardRenderer } from './boardRenderer.js';
import { HudView } from './hudView.js';
import { DockView } from './dockView.js';
import { Overlays } from './overlays.js';

const PLAYER_NAME_KEY = 'muehle_player_name';

function loadPlayerName() {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function storePlayerName(name) {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // Blocked or full storage: the name stays for this visit only.
  }
}

class MuehleApp {
  constructor() {
    this.socket = null;
    this.myColor = null;
    this.myName = '';
    this.opponentName = '';
    this.gameState = null;

    this.selectedPoint = null;
    this.validDestinations = [];

    this.sessionActive = false;

    this.screens = {
      login: document.getElementById('screen-login'),
      queue: document.getElementById('screen-queue'),
      game: document.getElementById('screen-game')
    };
    this.usernameInput = document.getElementById('username-input');
    this.queueStatusText = document.getElementById('queue-status-text');
    this.btnSoundToggle = document.getElementById('btn-sound-toggle');

    this.hud = new HudView();
    this.dock = new DockView({ onSend: text => this.socket.emit('chatMessage', { text }) });
    this.overlays = new Overlays({
      onPlayAgain: () => this.#handleLogin(),
      onBackToLobby: () => {
        this.socket.emit('leaveGame');
        this.#terminateSession(null);
      },
      onSurrender: () => this.socket.emit('forfeit')
    });
    this.board = new BoardRenderer(document.getElementById('board-container'), point => this.#onPointClick(point));

    this.#bindControls();
    this.#initSocket();
  }

  get #removablePoints() {
    return RULES.getCaptureTargets(this.gameState, this.myColor);
  }

  #bindControls() {
    this.usernameInput.value = loadPlayerName();
    document.getElementById('login-form').addEventListener('submit', e => {
      e.preventDefault();
      this.#handleLogin();
    });

    document.getElementById('btn-cancel-queue').addEventListener('click', () => {
      this.socket.emit('leaveGame');
      this.sessionActive = false;
      this.#switchScreen('login');
    });

    this.btnSoundToggle.addEventListener('click', () => this.#toggleSound());
    this.#markSoundButton(soundController.isMuted());

    const unlock = new AbortController();
    const unlockAudio = () => {
      soundController.unlock();
      unlock.abort();
    };
    document.addEventListener('pointerup', unlockAudio, { signal: unlock.signal });
    document.addEventListener('keydown', unlockAudio, { signal: unlock.signal });
  }

  #toggleSound() {
    this.#markSoundButton(soundController.toggleMute());
  }

  #markSoundButton(isMuted) {
    this.btnSoundToggle.classList.toggle('is-muted', isMuted);
    this.btnSoundToggle.title = isMuted ? 'Ton aktivieren' : 'Ton stummschalten';
  }

  #handleLogin() {
    const username = this.usernameInput.value.trim().substring(0, 12);
    if (!username) return;
    this.myName = username;
    storePlayerName(username);
    this.socket.emit('login', { username });
  }

  #initSocket() {
    this.socket = io();

    this.socket.on('connect', () => this.overlays.setConnected(true));

    this.socket.on('disconnect', () => {
      this.overlays.setConnected(false);
      this.hud.stopCountdown();

      if (!this.sessionActive) {
        this.overlays.toast('Verbindung zum Server unterbrochen', 'error');
        return;
      }
      const ended = this.screens.game.hidden ? 'die Suche wurde abgebrochen' : 'die Partie wurde beendet';
      this.#terminateSession(`Verbindung zum Server unterbrochen – ${ended}.`);
    });

    this.socket.on('gameNotFound', data => {
      if (!this.sessionActive) return;
      this.#terminateSession(data?.message || 'Deine Partie ist nicht mehr aktiv.');
    });

    this.socket.on('queueWaiting', data => {
      this.sessionActive = true;
      this.queueStatusText.textContent = data.message || 'Warte auf Mitspieler...';
      this.#switchScreen('queue');
    });

    this.socket.on('gameStart', data => this.#startGame(data));

    this.socket.on('gameStateUpdate', data => this.#applyUpdate(data));

    this.socket.on('turnTimer', data => this.hud.startCountdown(data));

    this.socket.on('turnTimeout', data => {
      if (!data) return;
      const actor = RULES.colorName(data.player);
      this.dock.addSystemNote(data.message || `Zeit abgelaufen – für ${actor} wurde automatisch gezogen.`);

      if (data.player === this.myColor) {
        this.overlays.toast(
          `Deine Bedenkzeit ist abgelaufen – es wurde automatisch für dich gezogen ` +
            `(${data.consecutiveTimeouts} von ${data.timeoutLimit}: beim ${data.timeoutLimit}. Mal ` +
            `in Folge verlierst du).`,
          'warning',
          { sticky: true }
        );
      } else {
        this.overlays.toast(`Bedenkzeit von ${actor} abgelaufen – der Zug wurde automatisch ausgeführt.`, 'warning');
      }
    });

    this.socket.on('gameOver', data => this.#endGame(data));

    this.socket.on('opponentDisconnected', data => {
      this.#endGame(data);
      this.overlays.toast(data.endReason || 'Die Partie wurde beendet.', 'warning');
    });

    this.socket.on('actionError', data => {
      this.overlays.toast(data.message || 'Ungültige Aktion', 'error');
    });

    this.socket.on('serverError', data => {
      this.overlays.toast(data.message || 'Serverfehler', 'error');
    });

    this.socket.on('chatMessage', msg => this.dock.addChatMessage(msg));
  }

  #startGame(data) {
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
    this.dock.reset(this.myColor);

    this.#switchScreen('game');
    this.dock.addSystemNote(`Spiel gestartet! Du spielst als ${RULES.colorName(this.myColor)}.`);

    soundController.playPlace();
    this.#render();
  }

  #applyUpdate(data) {
    const previousTurn = this.gameState?.turn;
    this.gameState = data.state;
    const lastAction = data.lastAction;

    if (previousTurn && previousTurn !== this.gameState.turn) {
      this.selectedPoint = null;
      this.validDestinations = [];
    }

    if (lastAction) {
      this.#reportAction(lastAction);
    }

    this.#render();
  }

  #reportAction(lastAction) {
    const actor = RULES.colorName(lastAction.player);

    const autoSuffix = lastAction.auto ? ' (automatisch)' : '';

    if (lastAction.action === 'place') {
      soundController.playPlace();
      this.dock.addMove(`${actor} setzt auf ${lastAction.point}${autoSuffix}`);
    } else if (lastAction.action === 'move') {
      soundController.playMove();
      this.dock.addMove(`${actor} zieht ${lastAction.from} → ${lastAction.to}${autoSuffix}`);
    } else if (lastAction.action === 'remove') {
      soundController.playRemove();
      this.dock.addMove(`${actor} schlägt Stein auf ${lastAction.point}${autoSuffix}`);
    }

    if (!lastAction.millFormed) return;

    soundController.playMill();
    this.dock.addSystemNote(`Mühle geschlossen von ${actor}!`);

    const trigger = this.gameState.millTriggerPoint;
    if (!trigger) return;
    const closedMill = RULES.MILLS.find(
      mill => mill.includes(trigger) && mill.every(pt => this.gameState.board[pt] === lastAction.player)
    );
    if (closedMill) this.board.highlightMill(closedMill);
  }

  #endGame(data) {
    this.gameState = data.state;
    this.hud.stopCountdown();
    this.#render();

    this.sessionActive = false;

    const isDraw = data.winner === null;
    const isWin = data.winner === this.myColor;
    if (isDraw) {
      soundController.playDraw();
    } else if (isWin) {
      soundController.playWin();
    } else {
      soundController.playLose();
    }
    this.overlays.showGameOver({
      winner: data.winner,
      winnerName: data.winnerName,
      endReason: data.endReason,
      isWin
    });
  }

  #terminateSession(message) {
    this.sessionActive = false;
    this.hud.reset();
    this.gameState = null;
    this.myColor = null;
    this.selectedPoint = null;
    this.validDestinations = [];

    this.overlays.closeGameDialogs();
    this.#switchScreen('login');
    if (message) this.overlays.toast(message, 'warning', { sticky: true });
  }

  #onPointClick(point) {
    if (!this.gameState || RULES.isGameOver(this.gameState)) return;
    if (this.gameState.turn !== this.myColor) {
      this.board.rejectPoint(point);
      return;
    }

    if (this.gameState.awaitingRemoval) {
      this.#tryCapture(point);
    } else if (this.gameState.phase === 'SETTING') {
      this.#tryPlace(point);
    } else if (this.gameState.phase === 'MOVING') {
      this.#trySelectOrMove(point);
    }
  }

  #tryCapture(point) {
    if (this.#removablePoints.includes(point)) {
      this.socket.emit('removePiece', { point });
    } else {
      this.board.rejectPoint(point);
    }
  }

  #tryPlace(point) {
    if (this.gameState.board[point] === null) {
      this.socket.emit('placePiece', { point });
    } else {
      this.board.rejectPoint(point);
    }
  }

  #trySelectOrMove(point) {
    const piece = this.gameState.board[point];

    if (piece === this.myColor) {
      if (this.selectedPoint === point) {
        this.selectedPoint = null;
        this.validDestinations = [];
      } else {
        const canJump = this.gameState.piecesOnBoard[this.myColor] === 3;
        this.selectedPoint = point;
        this.validDestinations = RULES.getValidDestinations(this.gameState.board, point, this.myColor, canJump);
      }
      this.#render();
      return;
    }

    if (this.selectedPoint && this.validDestinations.includes(point)) {
      this.socket.emit('movePiece', { from: this.selectedPoint, to: point });
      this.selectedPoint = null;
      this.validDestinations = [];
      this.#render();
      return;
    }

    this.board.rejectPoint(point);
  }

  #switchScreen(screenName) {
    window.scrollTo({ top: 0 });
    Object.entries(this.screens).forEach(([name, section]) => {
      section.hidden = name !== screenName;
    });
  }

  #render() {
    if (!this.gameState) return;
    this.hud.render(this.gameState);
    this.board.render(this.gameState, this.myColor, this.selectedPoint, this.validDestinations);
  }
}

new MuehleApp();
