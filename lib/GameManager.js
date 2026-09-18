/**
 * GameManager.js
 * Handles matchmaking queue, active game rooms, and multiplayer socket interactions.
 * Includes rate-limiting, non-recursive queue processing, and DoS protections.
 */

const crypto = require('crypto');
const { MuehleGame } = require('./MuehleGame');
const { RateLimiter } = require('./RateLimiter');
const { compileTrustProxy, getClientAddress } = require('./clientAddress');

/**
 * Normalizes free text coming from a client (names, chat).
 *
 * Deliberately does NOT escape HTML: the only consumer is the browser client,
 * which already renders every one of these strings through `textContent` /
 * `_escapeHtml()`. Escaping here as well produced literal `&amp;` and `&lt;b&gt;`
 * on screen, so escaping stays where the markup is actually built.
 *
 * What is removed here are control characters, which no legitimate name or
 * chat message contains and which would otherwise garble the log output.
 */
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    // Strip C0 controls and DEL; no legitimate name or chat message has them.
    if (code > 31 && code !== 127) out += ch;
  }
  return out;
}

class GameManager {
  /**
   * @param {Object} io - Socket.io server
   * @param {Object} [options]
   * @param {string} [options.trustProxy] - TRUST_PROXY setting: which reverse
   *   proxies may name the client in X-Forwarded-For (default: none)
   */
  constructor(io, { trustProxy } = {}) {
    this.io = io;

    // null unless a proxy is configured; X-Forwarded-For is ignored then.
    this.trustProxy = compileTrustProxy(trustProxy);
    
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
    this.queueLimiter = new RateLimiter({ windowMs: 5000, max: 5 }); // max 5 matchmaking requests per 5s per socket
    // Several players can share one address (same WLAN behind NAT, two tabs), so
    // the per-address budget must be larger than the per-socket one. With equal
    // budgets the address always tripped first and the socket limit never mattered.
    this.queueIpLimiter = new RateLimiter({ windowMs: 5000, max: 20 }); // max 20 matchmaking requests per 5s per address
    this.actionLimiter = new RateLimiter({ windowMs: 1000, max: 10 }); // max 10 game moves per 1s
    this.violationCounts = new Map(); // socket.id -> violation count for spam disconnection

    // Periodic cleanup of rate-limiter maps to prevent memory accumulation
    this.cleanupTimer = setInterval(() => {
      this.chatLimiter.cleanup();
      this.queueLimiter.cleanup();
      this.queueIpLimiter.cleanup();
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
    // 1. Rate-limit check per socket and per IP. X-Forwarded-For only counts
    // behind a trusted proxy; otherwise a client could send a different one on
    // every connection and never hit the per-address limit.
    const clientIp = getClientAddress(socket, this.trustProxy);
    if (this.queueLimiter.isLimited(socket.id) || this.queueIpLimiter.isLimited(clientIp)) {
      socket.emit('actionError', { message: 'Zu viele Anmeldeversuche. Bitte warte einen Moment.' });
      return;
    }

const rawName = (typeof username === 'string' && username.trim().length > 0)
       ? username.trim().substring(0, 12)
       : null;
     if (!rawName) return;
     const cleanName = sanitizeText(rawName);

    // 2. Remove if already in queue or existing game. The socket stays connected,
    // so only the session ends; its rate-limit history must survive.
    this.dequeuePlayer(socket.id);
    this._endSession(socket.id);

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
   * Looks up the game a socket is playing in.
   *
   * Always answers the client: a socket whose game the server no longer knows
   * (opponent left, or the client reconnected and therefore carries a fresh
   * socket id) used to get no reply at all and was left staring at a dead
   * board. `gameNotFound` lets the client end the session instead.
   */
  _resolveSession(socket) {
    const playerInfo = this.socketMap.get(socket.id);
    const gameSession = playerInfo ? this.games.get(playerInfo.gameId) : null;

    if (!playerInfo || !gameSession) {
      socket.emit('gameNotFound', { message: 'Deine Partie ist nicht mehr aktiv.' });
      return null;
    }

    return { playerInfo, gameSession };
  }

  /**
   * Handles piece placement action with rate-limiting.
   */
  handlePlacePiece(socket, point) {
    if (this.actionLimiter.isLimited(socket.id)) {
      socket.emit('actionError', { message: 'Zu viele Aktionen. Bitte langsamer spielen.' });
      return { success: false, error: 'Zu viele Aktionen' };
    }

    const session = this._resolveSession(socket);
    if (!session) return { success: false, error: 'Kein aktives Spiel gefunden' };
    const { playerInfo, gameSession } = session;

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

    const session = this._resolveSession(socket);
    if (!session) return { success: false, error: 'Kein aktives Spiel gefunden' };
    const { playerInfo, gameSession } = session;

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

    const session = this._resolveSession(socket);
    if (!session) return { success: false, error: 'Kein aktives Spiel gefunden' };
    const { playerInfo, gameSession } = session;

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
    const session = this._resolveSession(socket);
    if (!session) return { success: false, error: 'Kein aktives Spiel gefunden' };
    const { playerInfo, gameSession } = session;

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
    const cleanMsg = sanitizeText(trimmed);
    if (cleanMsg.length === 0) return;

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
   * Cleans up when a socket disconnects: forgets what is tracked per socket and
   * ends its session.
   */
  handlePlayerDisconnect(socketId) {
    // The socket is gone for good, so its rate-limit history can go too.
    this.chatLimiter.reset(socketId);
    this.queueLimiter.reset(socketId);
    this.actionLimiter.reset(socketId);
    this.violationCounts.delete(socketId);

    this._endSession(socketId);
  }

  /**
   * Takes the player out of the queue and tears down their game, declaring the
   * opponent the winner if it was still running.
   *
   * Deliberately leaves the per-socket rate limiters alone: logging in again and
   * leaving a game end up here while the socket stays connected. Resetting them
   * here let every login wipe its own count, so the socket limit never tripped
   * (issue #22).
   *
   * `reasonLabel` is appended to the opponent's win reason so that dropping the
   * connection and deliberately leaving read differently in the UI.
   */
  _endSession(socketId, reasonLabel = 'hat die Verbindung getrennt') {
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
      const winReason = `Gegner (${playerInfo.username}) ${reasonLabel}`;
      gameSession.game.winner = otherColor;
      gameSession.game.winReason = winReason;
      gameSession.game.phase = 'FINISHED';

      if (opponent && opponent.socket.connected) {
        opponent.socket.emit('opponentDisconnected', {
          winner: otherColor,
          winnerName: opponent.username,
          winReason,
          state: gameSession.game.getState()
        });
      }
    }

    // The session is gone for BOTH players, so neither may keep pointing at it.
    if (opponent) this.socketMap.delete(opponent.socket.id);
    this.games.delete(playerInfo.gameId);
  }

  /**
   * Handles a player leaving on their own: cancelling the search, or returning
   * to the lobby from a finished game.
   */
  leaveGame(socketId) {
    // "Abbrechen" on the queue screen ends up here. Without this the player
    // stayed queued and was pulled into a game from the login screen.
    this.dequeuePlayer(socketId);

    const playerInfo = this.socketMap.get(socketId);
    if (!playerInfo) return;

    const gameSession = this.games.get(playerInfo.gameId);

    // Leaving a game that is still running is treated exactly like dropping the
    // connection: the opponent wins and the session is torn down. Previously the
    // session stayed in `this.games` forever and the opponent waited for a move
    // that could never come.
    if (gameSession && !gameSession.game.winner) {
      this._endSession(socketId, 'hat die Partie verlassen');
      return;
    }

    this.socketMap.delete(socketId);
    if (gameSession) this.games.delete(playerInfo.gameId);
  }
}

module.exports = { GameManager, sanitizeText };
