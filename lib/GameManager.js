/**
 * GameManager.js
 * Handles matchmaking queue, active game rooms, and multiplayer socket interactions.
 */

const { MuehleGame } = require('./MuehleGame');

class GameManager {
  constructor(io) {
    this.io = io;
    
    // Array of { socket, username, joinedAt }
    this.waitingQueue = [];

    // Map: socketId -> { gameId, color, username }
    this.socketMap = new Map();

    // Map: gameId -> { game, players: { W: { socket, username }, B: { socket, username } } }
    this.games = new Map();
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
   */
  enqueuePlayer(socket, username) {
    const cleanName = (typeof username === 'string' && username.trim().length > 0)
      ? username.trim().substring(0, 20)
      : `Spieler_${socket.id.substring(0, 4)}`;

    // Remove if already in queue or existing game
    this.dequeuePlayer(socket.id);
    this.handlePlayerDisconnect(socket.id);

    // Check if another player is already waiting
    if (this.waitingQueue.length > 0) {
      const opponentEntry = this.waitingQueue.shift();
      
      // Make sure opponent socket is still connected
      if (!opponentEntry.socket.connected) {
        // Opponent disconnected while waiting, continue queuing current player
        this.enqueuePlayer(socket, cleanName);
        return;
      }

      this._createGame(opponentEntry, { socket, username: cleanName });
    } else {
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
   */
  _createGame(player1, player2) {
    const gameId = 'game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
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
   * Handles piece placement action.
   */
  handlePlacePiece(socket, point) {
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
   * Handles piece move action.
   */
  handleMovePiece(socket, from, to) {
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
   * Handles piece removal action after closing a mill.
   */
  handleRemovePiece(socket, point) {
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
   */
  handleChatMessage(socket, message) {
    const playerInfo = this.socketMap.get(socket.id);
    if (!playerInfo) return;

    const cleanMsg = (typeof message === 'string') ? message.trim().substring(0, 150) : '';
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

      // Leave socket mappings intact so players can review board or click "Neu anmelden"
    }
  }

  /**
   * Cleans up when a player leaves or disconnects.
   */
  handlePlayerDisconnect(socketId) {
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

module.exports = { GameManager };

