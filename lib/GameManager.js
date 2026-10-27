import { randomUUID } from 'node:crypto';
import { MuehleGame } from './MuehleGame.js';
import { RateLimiter } from './RateLimiter.js';
import { compileTrustProxy, getClientAddress, rateLimitKey } from './clientAddress.js';
import { colorName } from '../shared/muehleRules.js';

export const DEFAULT_TURN_TIMEOUT_MS = 25000;

export const MAX_CONSECUTIVE_TIMEOUTS = 3;

export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code > 31 && code !== 127) out += ch;
  }
  return out;
}

export class GameManager {
  constructor(io, { trustProxy, turnTimeoutMs } = {}) {
    this.io = io;

    this.trustProxy = compileTrustProxy(trustProxy);

    const configuredTimeout = Number(turnTimeoutMs);
    this.turnTimeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? Math.floor(configuredTimeout)
        : DEFAULT_TURN_TIMEOUT_MS;

    this.waitingQueue = [];

    this.socketMap = new Map();

    this.games = new Map();

    this.maxQueueSize = 500;
    this.maxActiveGames = 1000;

    this.chatLimiter = new RateLimiter({ windowMs: 2000, max: 4 });
    this.queueLimiter = new RateLimiter({ windowMs: 5000, max: 5 });
    this.queueIpLimiter = new RateLimiter({ windowMs: 5000, max: 100 });
    this.actionLimiter = new RateLimiter({ windowMs: 1000, max: 10 });
    this.violationCounts = new Map();

    this.cleanupTimer = setInterval(() => {
      this.chatLimiter.cleanup();
      this.queueLimiter.cleanup();
      this.queueIpLimiter.cleanup();
      this.actionLimiter.cleanup();
    }, 60000);
    this.cleanupTimer.unref();
  }

  getStats() {
    return {
      inQueue: this.waitingQueue.length,
      activeGames: this.games.size,
      totalPlayers: this.socketMap.size + this.waitingQueue.length
    };
  }

  enqueuePlayer(socket, username) {
    const clientIp = rateLimitKey(getClientAddress(socket, this.trustProxy));
    if (this.queueLimiter.isLimited(socket.id) || this.queueIpLimiter.isLimited(clientIp)) {
      socket.emit('actionError', { message: 'Zu viele Anmeldeversuche. Bitte warte einen Moment.' });
      return;
    }

    const cleanName = sanitizeText(typeof username === 'string' ? username.trim() : '').substring(0, 12);
    if (!cleanName) return;

    this.dequeuePlayer(socket.id);
    this.#endSession(socket.id);

    if (this.games.size >= this.maxActiveGames) {
      socket.emit('serverError', { message: 'Serverauslastung zu hoch. Bitte versuche es später erneut.' });
      return;
    }

    let opponentEntry = null;
    while (this.waitingQueue.length > 0) {
      const candidate = this.waitingQueue.shift();
      if (candidate.socket && candidate.socket.connected) {
        opponentEntry = candidate;
        break;
      }
    }

    if (opponentEntry) {
      this.#createGame(opponentEntry, { socket, username: cleanName });
    } else {
      if (this.waitingQueue.length >= this.maxQueueSize) {
        socket.emit('serverError', { message: 'Die Warteschlange ist voll. Bitte versuche es später erneut.' });
        return;
      }

      this.waitingQueue.push({ socket, username: cleanName, joinedAt: Date.now() });
      socket.emit('queueWaiting', {
        position: this.waitingQueue.length,
        message: 'Warte auf einen weiteren Mitspieler...'
      });
    }
  }

  dequeuePlayer(socketId) {
    const index = this.waitingQueue.findIndex(p => p.socket.id === socketId);
    if (index !== -1) {
      this.waitingQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  #createGame(player1, player2) {
    const gameId = `game_${randomUUID()}`;
    const game = new MuehleGame(gameId);

    const isP1White = Math.random() < 0.5;
    const whitePlayer = isP1White ? player1 : player2;
    const blackPlayer = isP1White ? player2 : player1;

    const players = {
      W: { socket: whitePlayer.socket, username: whitePlayer.username },
      B: { socket: blackPlayer.socket, username: blackPlayer.username }
    };

    this.games.set(gameId, {
      game,
      players,
      turnTimer: null,
      turnDeadline: null,
      consecutiveTimeouts: { W: 0, B: 0 }
    });

    const initialGameState = game.getState();
    ['W', 'B'].forEach(color => {
      const you = players[color];
      const opponentColor = color === 'W' ? 'B' : 'W';
      const opponent = players[opponentColor];

      this.socketMap.set(you.socket.id, { gameId, color, username: you.username });
      you.socket.join(gameId);
      you.socket.emit('gameStart', {
        gameId,
        yourColor: color,
        yourName: you.username,
        opponentName: opponent.username,
        opponentColor,
        state: initialGameState
      });
    });

    this.#startTurnTimer(gameId);
  }

  #startTurnTimer(gameId) {
    const gameSession = this.games.get(gameId);
    if (!gameSession) return;

    this.#clearTurnTimer(gameId);
    if (gameSession.game.phase === 'FINISHED') return;

    const durationMs = this.turnTimeoutMs;
    gameSession.turnDeadline = Date.now() + durationMs;
    gameSession.turnTimer = setTimeout(() => {
      try {
        this.handleTurnTimeout(gameId);
      } catch (err) {
        console.error(`[Error] turn timeout for game ${gameId}:`, err);
      }
    }, durationMs);

    gameSession.turnTimer.unref();

    const state = gameSession.game.getState();
    this.io.to(gameId).emit('turnTimer', {
      turn: state.turn,
      awaitingRemoval: state.awaitingRemoval,
      durationMs,
      remainingMs: durationMs
    });
  }

  #clearTurnTimer(gameId) {
    const gameSession = this.games.get(gameId);
    if (!gameSession) return;

    if (gameSession.turnTimer) clearTimeout(gameSession.turnTimer);
    gameSession.turnTimer = null;
    gameSession.turnDeadline = null;
  }

  handleTurnTimeout(gameId) {
    const gameSession = this.games.get(gameId);
    if (!gameSession) return { success: false, error: 'Kein aktives Spiel gefunden' };

    gameSession.turnTimer = null;
    gameSession.turnDeadline = null;

    const game = gameSession.game;
    if (game.phase === 'FINISHED') return { success: false, error: 'Spiel ist bereits beendet' };

    const player = game.turn;
    const consecutiveTimeouts = ++gameSession.consecutiveTimeouts[player];

    if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
      const result = game.forfeit(
        player,
        `Spieler ${colorName(player)} hat ${MAX_CONSECUTIVE_TIMEOUTS}-mal in Folge die Bedenkzeit überschritten`
      );
      this.#broadcastGameState(gameId, result);
      return result;
    }

    const result = game.makeRandomLegalMove(player);

    if (!result.success) {
      console.warn(`[Warn] no legal automatic move for ${player} in game ${gameId}: ${result.error}`);
      return result;
    }

    this.io.to(gameId).emit('turnTimeout', {
      player,
      timeoutMs: this.turnTimeoutMs,
      consecutiveTimeouts,
      timeoutLimit: MAX_CONSECUTIVE_TIMEOUTS,
      action: result.action,
      autoMove: {
        action: result.action,
        player,
        point: result.point,
        from: result.from,
        to: result.to
      },
      message: `Zeit abgelaufen – für ${colorName(player)} wurde automatisch gezogen.`
    });

    this.#broadcastGameState(gameId, result);
    return result;
  }

  #resolveSession(socket) {
    const playerInfo = this.socketMap.get(socket.id);
    const gameSession = playerInfo ? this.games.get(playerInfo.gameId) : null;

    if (!playerInfo || !gameSession) {
      socket.emit('gameNotFound', { message: 'Deine Partie ist nicht mehr aktiv.' });
      return null;
    }

    return { playerInfo, gameSession };
  }

  #runGameAction(socket, play) {
    if (this.actionLimiter.isLimited(socket.id)) {
      socket.emit('actionError', { message: 'Zu viele Aktionen. Bitte langsamer spielen.' });
      return { success: false, error: 'Zu viele Aktionen' };
    }

    const session = this.#resolveSession(socket);
    if (!session) return { success: false, error: 'Kein aktives Spiel gefunden' };
    const { playerInfo, gameSession } = session;

    const result = play(gameSession.game, playerInfo.color);
    if (!result.success) {
      socket.emit('actionError', { message: result.error });
      return result;
    }

    gameSession.consecutiveTimeouts[playerInfo.color] = 0;
    this.#broadcastGameState(playerInfo.gameId, result);
    return result;
  }

  handlePlacePiece(socket, point) {
    return this.#runGameAction(socket, (game, color) => game.placePiece(color, point));
  }

  handleMovePiece(socket, from, to) {
    return this.#runGameAction(socket, (game, color) => game.movePiece(color, from, to));
  }

  handleRemovePiece(socket, point) {
    return this.#runGameAction(socket, (game, color) => game.removePiece(color, point));
  }

  handleForfeit(socket) {
    const session = this.#resolveSession(socket);
    if (!session) return { success: false, error: 'Kein aktives Spiel gefunden' };
    const { playerInfo, gameSession } = session;

    const result = gameSession.game.forfeit(playerInfo.color);
    if (result.success) {
      this.#broadcastGameState(playerInfo.gameId, result);
    }
    return result;
  }

  handleChatMessage(socket, message) {
    if (this.chatLimiter.isLimited(socket.id)) {
      const violations = (this.violationCounts.get(socket.id) ?? 0) + 1;
      this.violationCounts.set(socket.id, violations);

      if (violations > 10) {
        socket.emit('actionError', { message: 'Verbindung getrennt wegen Chat-Spammings.' });
        socket.disconnect(true);
        return;
      }

      socket.emit('actionError', { message: 'Zu viele Nachrichten gesendet. Bitte warte einen Moment.' });
      return;
    }

    const playerInfo = this.socketMap.get(socket.id);
    if (!playerInfo) return;

    const trimmed = typeof message === 'string' ? message.trim().substring(0, 150) : '';
    if (trimmed.length === 0) return;
    const cleanMsg = sanitizeText(trimmed);
    if (cleanMsg.length === 0) return;

    this.io.to(playerInfo.gameId).emit('chatMessage', {
      sender: playerInfo.username,
      color: playerInfo.color,
      text: cleanMsg,
      timestamp: Date.now()
    });
  }

  #broadcastGameState(gameId, actionResult) {
    const gameSession = this.games.get(gameId);
    if (!gameSession) return;

    const state = gameSession.game.getState();

    const lastAction = { ...actionResult };
    delete lastAction.state;

    this.io.to(gameId).emit('gameStateUpdate', {
      state,
      lastAction
    });

    if (state.phase === 'FINISHED') {
      this.#clearTurnTimer(gameId);

      this.io.to(gameId).emit('gameOver', {
        winner: state.winner,
        winnerName: state.winner ? gameSession.players[state.winner].username : null,
        endReason: state.endReason,
        state
      });
      return;
    }

    this.#startTurnTimer(gameId);
  }

  handlePlayerDisconnect(socketId) {
    this.chatLimiter.reset(socketId);
    this.queueLimiter.reset(socketId);
    this.actionLimiter.reset(socketId);
    this.violationCounts.delete(socketId);

    this.#endSession(socketId);
  }

  #endSession(socketId, reasonLabel = 'hat die Verbindung getrennt') {
    this.dequeuePlayer(socketId);

    const playerInfo = this.socketMap.get(socketId);
    if (!playerInfo) return;

    this.socketMap.delete(socketId);
    const gameSession = this.games.get(playerInfo.gameId);
    if (!gameSession) return;

    this.#clearTurnTimer(playerInfo.gameId);

    const otherColor = playerInfo.color === 'W' ? 'B' : 'W';
    const opponent = gameSession.players[otherColor];

    if (gameSession.game.phase !== 'FINISHED') {
      const endReason = `Gegner (${playerInfo.username}) ${reasonLabel}`;
      const { state } = gameSession.game.forfeit(playerInfo.color, endReason);

      if (opponent && opponent.socket.connected) {
        opponent.socket.emit('opponentDisconnected', {
          winner: otherColor,
          winnerName: opponent.username,
          endReason,
          state
        });
      }
    }

    if (opponent) this.socketMap.delete(opponent.socket.id);
    this.games.delete(playerInfo.gameId);
  }

  leaveGame(socketId) {
    this.dequeuePlayer(socketId);

    const playerInfo = this.socketMap.get(socketId);
    if (!playerInfo) return;

    const gameSession = this.games.get(playerInfo.gameId);

    if (gameSession && gameSession.game.phase !== 'FINISHED') {
      this.#endSession(socketId, 'hat die Partie verlassen');
      return;
    }

    this.socketMap.delete(socketId);
    if (gameSession) {
      this.#clearTurnTimer(playerInfo.gameId);
      this.games.delete(playerInfo.gameId);
    }
  }
}
