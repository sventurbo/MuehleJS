/**
 * GameManager.js
 * Handles matchmaking queue, active game rooms, and multiplayer socket interactions.
 * Includes rate-limiting, non-recursive queue processing, and DoS protections.
 */

const crypto = require('crypto');
const { MuehleGame } = require('./MuehleGame');
const { RateLimiter } = require('./RateLimiter');

/**
 * Basic HTML sanitizer to neutralize XSS characters on server side
 */
function sanitizeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class GameManager {
  constructor(io) {
    this.io = io;
    
    // Array of { socket, username, joinedAt }
    this.waitingQueue = [];

    // Map: socketId -> { gameId, color, username }
    this.socketMap = new Map();

    // Map: gameId -> { game, players: { W: { socket, username }, B: { socket, username } } }
    this.games = new Map();

    // Capacity boundaries (DoS protection: DOS-01, DOS-02)
    this.maxQueueSize = 500;
    this.maxActiveGames = 1000;

    // In-memory sliding-window rate limiters (CH-05, DOS-01)
    this.chatLimiter = new RateLimiter({ windowMs: 2000, max: 4 }); // max 4 messages per 2s
    this.queueLimiter = new RateLimiter({ windowMs: 5000, max: 5 }); // max 5 matchmaking requests per 5s
    this.actionLimiter = new RateLimiter({ windowMs: 1000, max: 10 }); // max 10 game moves per 1s
    this.violationCounts = new Map(); // socket.id -> violation count for spam disconnection

    // Periodic cleanup of rate-limiter maps to prevent memory accumulation
    this.cleanupTimer = setInterval(() => {
      this.chatLimiter.cleanup();
      this.queueLimiter.cleanup();
      this.actionLimiter.cleanup();
    }, 60000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Returns current count of connected players and active games.
   */
  getStats() {
    return {
      inQueue: this.waitingQueue.length,
      activeGames: this.games.size,
      totalPlayers: this.socketMap.size + this.waitingQueue.length
    };
  }

  /**
   * Adds a player to the matchmaking queue.
   * Hardened against queue flooding, recursive stack overflow, and spamming (DOS-01).
   */
  enqueuePlayer(socket, username) {
    // 1. Rate-limit check per socket and per IP
    const clientIp = socket.handshake ? (socket.handshake.headers?.['x-forwarded-for'] || socket.handshake.address) : socket.id;
    if (this.queueLimiter.isLimited(socket.id) || this.queueLimiter.isLimited(clientIp)) {
      socket.emit('actionError', { message: 'Zu viele Anmeldeversuche. Bitte warte einen Moment.' });
      return;
    }

    const rawName = (typeof username === 'string' && username.trim().length > 0)
      ? username.trim().substring(0, 20)
      : `Spieler_${socket.id.substring(0, 4)}`;
    const cleanName = sanitizeHtml(rawName);

    // 2. Remove if already in queue or existing game
    this.dequeuePlayer(socket.id);
    this.handlePlayerDisconnect(socket.id);

    // 3. Guard against active game saturation
    if (this.games.size >= this.maxActiveGames) {
      socket.emit('serverError', { message: 'Serverauslastung zu hoch. Bitte versuche es später erneut.' });
      return;
    }

    // 4. Iteratively search for a connected waiting opponent (NON-RECURSIVE, prevents Call Stack Overflow)
    let opponentEntry = null;
    while (this.waitingQueue.length > 0) {
      const candidate = this.waitingQueue.shift();
      if (candidate.socket && candidate.socket.connected) {
        opponentEntry = candidate;
        break;
      }
    }

    if (opponentEntry) {
      this._createGame(opponentEntry, { socket, username: cleanName });
    } else {
      // 5. Guard against unbounded queue growth
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

  /**
   * Removes a player from the waiting queue if present.
   */
  dequeuePlayer(socketId) {
    const index = this.waitingQueue.findIndex(p => p.socket.id === socketId);
    if (index !== -1) {
      this.waitingQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Pairs two players and initializes a new game session.
   * Generates cryptographically secure game IDs (MQ-01).
   */
  _createGame(player1, player2) {
    const randomUuid = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '_' + Math.random().toString(36).substring(2, 9));
    const gameId = 'game_' + randomUuid;
    const game = new MuehleGame(gameId);

    // Randomize who gets White and Black
    const isP1White = Math.random() < 0.5;
    const whitePlayer = isP1White ? player1 : player2;
    const blackPlayer = isP1White ? player2 : player1;

    // Register players in socket map
    this.socketMap.set(whitePlayer.socket.id, { gameId, color: 'W', username: whitePlayer.username });
    this.socketMap.set(blackPlayer.socket.id, { gameId, color: 'B', username: blackPlayer.username });

    // Register active game
    this.games.set(gameId, {
      game,
      players: {
        W: { socket: whitePlayer.socket, username: whitePlayer.username },
        B: { socket: blackPlayer.socket, username: blackPlayer.username }
      }
    });

    // Join Socket.io room
    whitePlayer.socket.join(gameId);
    blackPlayer.socket.join(gameId);

    const initialGameState = game.getState();

    // Notify White player
    whitePlayer.socket.emit('gameStart', {
      gameId,
      yourColor: 'W',
      yourName: whitePlayer.username,
      opponentName: blackPlayer.username,
      opponentColor: 'B',
      state: initialGameState
    });

    // Notify Black player
    blackPlayer.socket.emit('gameStart', {
      gameId,
      yourColor: 'B',
      yourName: blackPlayer.username,
      opponentName: whitePlayer.username,
      opponentColor: 'W',
      state: initialGameState
    });
  }

  /**
   * Handles piece placement action with rate-limiting.
   */
  handlePlacePiece(socket, point) {
    if (this.actionLimiter.isLimited(socket.id)) {
      socket.emit('actionError', { message: 'Zu viele Aktionen. Bitte langsamer spielen.' });
      return { success: false, error: 'Zu viele Aktionen' };
    }

    const playerInfo = this.socketMap.get(socket.id);
    if (!playerInfo) return { success: false, error: 'Kein aktives Spiel gefunden' };

    const gameSession = this.games.get(playerInfo.gameId);
    if (!gameSession) return { success: false, error: 'Spiel existiert nicht mehr' };

    const result = gameSession.game.placePiece(playerInfo.color, point);
    if (!result.success) {
      socket.emit('actionError', { message: result.error });
      return result;
    }

    this._broadcastGameState(playerInfo.gameId, result);
    return result;
  }

  /**
   * Handles piece move action with rate-limiting.
   */
  handleMovePiece(socket, from, to) {
    if (this.actionLimiter.isLimited(socket.id)) {
      socket.emit('actionError', { message: 'Zu viele Aktionen. Bitte langsamer spielen.' });
      return { success: false, error: 'Zu viele Aktionen' };
    }

    const playerInfo = this.socketMap.get(socket.id);
    if (!playerInfo) return { success: false, error: 'Kein aktives Spiel gefunden' };

    const gameSession = this.games.get(playerInfo.gameId);
    if (!gameSession) return { success: false, error: 'Spiel existiert nicht mehr' };

    const result = gameSession.game.movePiece(playerInfo.color, from, to);
    if (!result.success) {
      socket.emit('actionError', { message: result.error });
      return result;
    }

    this._broadcastGameState(playerInfo.gameId, result);
    return result;
  }

  /**
   * Handles piece removal action after closing a mill with rate-limiting.
   */
  handleRemovePiece(socket, point) {
    if (this.actionLimiter.isLimited(socket.id)) {
      socket.emit('actionError', { message: 'Zu viele Aktionen. Bitte langsamer spielen.' });
      return { success: false, error: 'Zu viele Aktionen' };
    }

    const playerInfo = this.socketMap.get(socket.id);
    if (!playerInfo) return { success: false, error: 'Kein aktives Spiel gefunden' };

    const gameSession = this.games.get(playerInfo.gameId);
    if (!gameSession) return { success: false, error: 'Spiel existiert nicht mehr' };

    const result = gameSession.game.removePiece(playerInfo.color, point);
    if (!result.success) {
      socket.emit('actionError', { message: result.error });
      return result;
    }

    this._broadcastGameState(playerInfo.gameId, result);
    return result;
  }

  /**
   * Handles surrender / forfeit.
   */
  handleForfeit(socket) {
    const playerInfo = this.socketMap.get(socket.id);
    if (!playerInfo) return { success: false, error: 'Kein aktives Spiel gefunden' };

    const gameSession = this.games.get(playerInfo.gameId);
    if (!gameSession) return { success: false, error: 'Spiel existiert nicht mehr' };

    const result = gameSession.game.forfeit(playerInfo.color);
    if (result.success) {
      this._broadcastGameState(playerInfo.gameId, result);
    }
    return result;
  }

  /**
   * Handles in-game chat messages.
   * Rate-limited to prevent chat spamming and floods (CH-05).
   * Disconnects aggressive spammers.
   */
  handleChatMessage(socket, message) {
    // 1. Check chat rate limit
    if (this.chatLimiter.isLimited(socket.id)) {
      const violations = (this.violationCounts.get(socket.id) || 0) + 1;
      this.violationCounts.set(socket.id, violations);

      if (violations > 10) {
        // Disconnect abusive flooders
        socket.emit('actionError', { message: 'Verbindung getrennt wegen Chat-Spammings.' });
        socket.disconnect(true);
        return;
      }

      socket.emit('actionError', { message: 'Zu viele Nachrichten gesendet. Bitte warte einen Moment.' });
      return;
    }

    const playerInfo = this.socketMap.get(socket.id);
    if (!playerInfo) return;

    const trimmed = (typeof message === 'string') ? message.trim().substring(0, 150) : '';
    if (trimmed.length === 0) return;
    const cleanMsg = sanitizeHtml(trimmed);

    this.io.to(playerInfo.gameId).emit('chatMessage', {
      sender: playerInfo.username,
      color: playerInfo.color,
      text: cleanMsg,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcasts state update to both players in the room.
   */
  _broadcastGameState(gameId, actionResult) {
    const gameSession = this.games.get(gameId);
    if (!gameSession) return;

    const state = gameSession.game.getState();

    // Broadcast full updated state to room
    this.io.to(gameId).emit('gameStateUpdate', {
      state,
      lastAction: actionResult
    });

    // Check if game is finished
    if (state.winner) {
      const winnerName = (state.winner === 'W')
        ? gameSession.players.W.username
        : gameSession.players.B.username;

      this.io.to(gameId).emit('gameOver', {
        winner: state.winner,
        winnerName,
        winReason: state.winReason,
        state
      });
    }
  }

  /**
   * Cleans up when a player leaves or disconnects.
   */
  handlePlayerDisconnect(socketId) {
    // Clean up rate-limiter maps for this socket
    this.chatLimiter.reset(socketId);
    this.queueLimiter.reset(socketId);
    this.actionLimiter.reset(socketId);
    this.violationCounts.delete(socketId);

    // 1. Remove from waiting queue if waiting
    this.dequeuePlayer(socketId);

    // 2. Check if player was in an active game
    const playerInfo = this.socketMap.get(socketId);
    if (!playerInfo) return;

    this.socketMap.delete(socketId);
    const gameSession = this.games.get(playerInfo.gameId);
    if (!gameSession) return;

    const otherColor = playerInfo.color === 'W' ? 'B' : 'W';
    const opponent = gameSession.players[otherColor];

    // If game was still running, terminate gracefully and declare remaining player winner
    if (!gameSession.game.winner) {
      gameSession.game.winner = otherColor;
      gameSession.game.winReason = `Gegner (${playerInfo.username}) hat die Verbindung getrennt`;
      gameSession.game.phase = 'FINISHED';

      if (opponent && opponent.socket.connected) {
        opponent.socket.emit('opponentDisconnected', {
          winner: otherColor,
          winnerName: opponent.username,
          winReason: `Gegner (${playerInfo.username}) hat die Verbindung getrennt`,
          state: gameSession.game.getState()
        });
      }
    }

    // Clean up game session
    this.games.delete(playerInfo.gameId);
  }

  /**
   * Allows a player to leave their finished game and return to lobby.
   */
  leaveGame(socketId) {
    const playerInfo = this.socketMap.get(socketId);
    if (playerInfo) {
      this.socketMap.delete(socketId);
      const gameSession = this.games.get(playerInfo.gameId);
      if (gameSession && gameSession.game.winner) {
        this.games.delete(playerInfo.gameId);
      }
    }
  }
}

module.exports = { GameManager, sanitizeHtml };
