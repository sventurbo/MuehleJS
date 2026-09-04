/**
 * MuehleGame.js
 * Core authoritative rule engine for the board game "Mühle" (Nine Men's Morris).
 *
 * Coordinates: Standard algebraic notation for 24 points:
 * Outer square:  a7, d7, g7, g4, g1, d1, a1, a4
 * Middle square: b6, d6, f6, f4, f2, d2, b2, b4
 * Inner square:  c5, d5, e5, e4, e3, d3, c3, c4
 */

// All 24 points on the board
const POINTS = [
  'a7', 'd7', 'g7',
  'b6', 'd6', 'f6',
  'c5', 'd5', 'e5',
  'a4', 'b4', 'c4', 'e4', 'f4', 'g4',
  'c3', 'd3', 'e3',
  'b2', 'd2', 'f2',
  'a1', 'd1', 'g1'
];

// Adjacency graph: 32 undirected edges
const ADJACENCY = {
  // Outer square
  'a7': ['d7', 'a4'],
  'd7': ['a7', 'g7', 'd6'],
  'g7': ['d7', 'g4'],
  'a4': ['a7', 'a1', 'b4'],
  'g4': ['g7', 'g1', 'f4'],
  'a1': ['a4', 'd1'],
  'd1': ['a1', 'g1', 'd2'],
  'g1': ['d1', 'g4'],

  // Middle square
  'b6': ['d6', 'b4'],
  'd6': ['b6', 'f6', 'd7', 'd5'],
  'f6': ['d6', 'f4'],
  'b4': ['b6', 'b2', 'a4', 'c4'],
  'f4': ['f6', 'f2', 'e4', 'g4'],
  'b2': ['b4', 'd2'],
  'd2': ['b2', 'f2', 'd1', 'd3'],
  'f2': ['d2', 'f4'],

  // Inner square
  'c5': ['d5', 'c4'],
  'd5': ['c5', 'e5', 'd6'],
  'e5': ['d5', 'e4'],
  'c4': ['c5', 'c3', 'b4'],
  'e4': ['e5', 'e3', 'f4'],
  'c3': ['c4', 'd3'],
  'd3': ['c3', 'e3', 'd2'],
  'e3': ['d3', 'e4']
};

// All 16 possible mills (triplets of collinear points)
const MILLS = [
  // Horizontal lines on squares
  ['a7', 'd7', 'g7'],
  ['b6', 'd6', 'f6'],
  ['c5', 'd5', 'e5'],
  ['c3', 'd3', 'e3'],
  ['b2', 'd2', 'f2'],
  ['a1', 'd1', 'g1'],

  // Vertical lines on squares
  ['a7', 'a4', 'a1'],
  ['b6', 'b4', 'b2'],
  ['c5', 'c4', 'c3'],
  ['e5', 'e4', 'e3'],
  ['f6', 'f4', 'f2'],
  ['g7', 'g4', 'g1'],

  // Cross lines connecting squares
  ['d7', 'd6', 'd5'], // North
  ['g4', 'f4', 'e4'], // East
  ['d1', 'd2', 'd3'], // South
  ['a4', 'b4', 'c4']  // West
];

// Precompute which mills contain each point for fast lookup
const MILLS_BY_POINT = {};
POINTS.forEach(p => {
  MILLS_BY_POINT[p] = MILLS.filter(m => m.includes(p));
});

class MuehleGame {
  constructor(gameId = null) {
    this.gameId = gameId || ('game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    
    // Board state: mapping each point to 'W', 'B', or null
    this.board = {};
    POINTS.forEach(p => { this.board[p] = null; });

    this.turn = 'W'; // 'W' (White) moves first
    this.phase = 'SETTING'; // 'SETTING' (Phase 1) | 'MOVING' (Phase 2 & 3) | 'FINISHED'
    
    // Pieces remaining in hand to be placed (Phase 1)
    this.unplacedPieces = { W: 9, B: 9 };

    // Current pieces physically on the board
    this.piecesOnBoard = { W: 0, B: 0 };

    // Total pieces captured from each player
    this.capturedPieces = { W: 0, B: 0 };

    // If a mill is formed on current move, true until player selects piece to remove
    this.awaitingRemoval = false;
    this.millTriggerPoint = null;

    // Game over state
    this.winner = null;
    this.winReason = null;

    // History of moves
    this.moveHistory = [];
  }

  /**
   * Returns a clean JSON representation of the current game state.
   */
  getState() {
    return {
      gameId: this.gameId,
      board: { ...this.board },
      turn: this.turn,
      phase: this.phase,
      unplacedPieces: { ...this.unplacedPieces },
      piecesOnBoard: { ...this.piecesOnBoard },
      capturedPieces: { ...this.capturedPieces },
      awaitingRemoval: this.awaitingRemoval,
      millTriggerPoint: this.millTriggerPoint,
      winner: this.winner,
      winReason: this.winReason,
      moveCount: this.moveHistory.length
    };
  }

  /**
   * Returns the opponent color.
   */
  getOpponent(player = this.turn) {
    return player === 'W' ? 'B' : 'W';
  }

  /**
   * Checks if placing/moving to a point formed one or more new mills for the player.
   */
  formsMillAt(point, player = this.turn, customBoard = this.board) {
    const relevantMills = MILLS_BY_POINT[point] || [];
    return relevantMills.some(mill => mill.every(pt => customBoard[pt] === player));
  }

  /**
   * Checks if a point on the board is currently part of any completed mill for the given player.
   */
  isPointInMill(point, player, customBoard = this.board) {
    if (customBoard[point] !== player) return false;
    const relevantMills = MILLS_BY_POINT[point] || [];
    return relevantMills.some(mill => mill.every(pt => customBoard[pt] === player));
  }

  /**
   * Checks if all pieces of a player currently on the board are in mills.
   */
  areAllPiecesInMills(player, customBoard = this.board) {
    const playerPoints = POINTS.filter(pt => customBoard[pt] === player);
    if (playerPoints.length === 0) return true;
    return playerPoints.every(pt => this.isPointInMill(pt, player, customBoard));
  }

  /**
   * Returns all opponent points that can legally be removed.
   * Rule: Cannot remove an opponent piece in a mill, UNLESS all opponent pieces are in mills.
   */
  getRemovablePieces(player = this.turn) {
    const opponent = this.getOpponent(player);
    const opponentPoints = POINTS.filter(pt => this.board[pt] === opponent);
    
    if (opponentPoints.length === 0) return [];

    const allInMills = this.areAllPiecesInMills(opponent, this.board);
    if (allInMills) {
      // Exception: All pieces are in mills, any piece may be removed
      return opponentPoints;
    }

    // Standard: Only pieces NOT in a mill may be removed
    return opponentPoints.filter(pt => !this.isPointInMill(pt, opponent, this.board));
  }

  /**
   * Returns whether a player is allowed to jump (fly) to any open point.
   * Rule: Only in MOVING phase when down to exactly 3 pieces.
   */
  canJump(player = this.turn) {
    return this.phase === 'MOVING' && this.piecesOnBoard[player] === 3;
  }

  /**
   * Returns all valid destinations for a piece at `from` point for `player`.
   */
  getValidDestinations(from, player = this.turn) {
    if (this.board[from] !== player) return [];
    
    if (this.canJump(player)) {
      // Can jump to any vacant point
      return POINTS.filter(pt => this.board[pt] === null);
    }

    // Must move along adjacent lines
    return (ADJACENCY[from] || []).filter(pt => this.board[pt] === null);
  }

  /**
   * Returns a map of all legal moves for a player in MOVING phase: { fromPoint: [toPoint1, toPoint2, ...] }
   */
  getLegalMoves(player = this.turn) {
    if (this.phase !== 'MOVING') return {};

    const legalMoves = {};
    const playerPoints = POINTS.filter(pt => this.board[pt] === player);
    
    playerPoints.forEach(from => {
      const dests = this.getValidDestinations(from, player);
      if (dests.length > 0) {
        legalMoves[from] = dests;
      }
    });

    return legalMoves;
  }

  /**
   * Checks if player has at least one valid move.
   */
  hasLegalMoves(player = this.turn) {
    if (this.phase === 'SETTING') {
      return POINTS.some(pt => this.board[pt] === null);
    }
    const moves = this.getLegalMoves(player);
    return Object.keys(moves).length > 0;
  }

  /**
   * Phase 1: Place a piece on the board.
   */
  placePiece(player, point) {
    if (this.winner) return { success: false, error: 'Spiel ist bereits beendet' };
    if (this.phase !== 'SETTING') return { success: false, error: 'Nicht in der Setzphase' };
    if (this.turn !== player) return { success: false, error: 'Nicht an der Reihe' };
    if (this.awaitingRemoval) return { success: false, error: 'Muss zuerst einen gegnerischen Stein schlagen' };
    if (!POINTS.includes(point)) return { success: false, error: 'Ungültiger Punkt' };
    if (this.board[point] !== null) return { success: false, error: 'Punkt ist bereits besetzt' };
    if (this.unplacedPieces[player] <= 0) return { success: false, error: 'Keine Steine mehr zum Setzen' };

    // Place piece
    this.board[point] = player;
    this.unplacedPieces[player]--;
    this.piecesOnBoard[player]++;

    this.moveHistory.push({
      action: 'place',
      player,
      point,
      timestamp: Date.now()
    });

    // Check mill
    const formsMill = this.formsMillAt(point, player);
    if (formsMill) {
      const removable = this.getRemovablePieces(player);
      if (removable.length > 0) {
        this.awaitingRemoval = true;
        this.millTriggerPoint = point;
        return {
          success: true,
          action: 'place',
          millFormed: true,
          removablePieces: removable,
          state: this.getState()
        };
      }
    }

    // Check if phase transitions to MOVING
    this._checkPhaseTransition();

    // Pass turn
    this.turn = this.getOpponent(player);

    return {
      success: true,
      action: 'place',
      millFormed: false,
      state: this.getState()
    };
  }

  /**
   * Phase 2 / 3: Move a piece on the board.
   */
  movePiece(player, from, to) {
    if (this.winner) return { success: false, error: 'Spiel ist bereits beendet' };
    if (this.phase !== 'MOVING') return { success: false, error: 'Nicht in der Zugphase' };
    if (this.turn !== player) return { success: false, error: 'Nicht an der Reihe' };
    if (this.awaitingRemoval) return { success: false, error: 'Muss zuerst einen gegnerischen Stein schlagen' };
    if (!POINTS.includes(from) || !POINTS.includes(to)) return { success: false, error: 'Ungültiger Punkt' };
    if (this.board[from] !== player) return { success: false, error: 'Gewählter Stein gehört nicht dem Spieler' };
    if (this.board[to] !== null) return { success: false, error: 'Zielfeld ist bereits besetzt' };

    const validDests = this.getValidDestinations(from, player);
    if (!validDests.includes(to)) {
      return { success: false, error: 'Ungültiger Zug (keine Verbindung oder Feld besetzt)' };
    }

    // Execute move
    this.board[from] = null;
    this.board[to] = player;

    this.moveHistory.push({
      action: 'move',
      player,
      from,
      to,
      timestamp: Date.now()
    });

    // Check mill formed
    const formsMill = this.formsMillAt(to, player);
    if (formsMill) {
      const removable = this.getRemovablePieces(player);
      if (removable.length > 0) {
        this.awaitingRemoval = true;
        this.millTriggerPoint = to;
        return {
          success: true,
          action: 'move',
          millFormed: true,
          removablePieces: removable,
          state: this.getState()
        };
      }
    }

    // Switch turn to opponent
    this.turn = this.getOpponent(player);

    // Check if opponent is trapped (has no legal moves left)
    if (!this.hasLegalMoves(this.turn)) {
      this.winner = player;
      this.winReason = `Gegner (${this.turn === 'W' ? 'Weiß' : 'Schwarz'}) kann keinen Zug mehr machen (eingesperrt)`;
      this.phase = 'FINISHED';
    }

    return {
      success: true,
      action: 'move',
      millFormed: false,
      state: this.getState()
    };
  }

  /**
   * Remove an opponent's piece after closing a mill.
   */
  removePiece(player, point) {
    if (this.winner) return { success: false, error: 'Spiel ist bereits beendet' };
    if (!this.awaitingRemoval) return { success: false, error: 'Kein Stein zum Schlagen gefordert' };
    if (this.turn !== player) return { success: false, error: 'Nicht an der Reihe' };
    
    const opponent = this.getOpponent(player);
    const removable = this.getRemovablePieces(player);

    if (!removable.includes(point)) {
      return {
        success: false,
        error: 'Dieser Stein darf nicht geschlagen werden (befindet sich in einer Mühle oder gehört nicht dem Gegner)'
      };
    }

    // Remove piece
    this.board[point] = null;
    this.piecesOnBoard[opponent]--;
    this.capturedPieces[opponent]++;
    this.awaitingRemoval = false;
    this.millTriggerPoint = null;

    this.moveHistory.push({
      action: 'remove',
      player,
      point,
      opponent,
      timestamp: Date.now()
    });

    // Check win condition (opponent reduced to < 3 pieces in MOVING phase)
    if (this.phase === 'MOVING' && this.piecesOnBoard[opponent] < 3) {
      this.winner = player;
      this.winReason = `Gegner (${opponent === 'W' ? 'Weiß' : 'Schwarz'}) hat weniger als 3 Steine übrig`;
      this.phase = 'FINISHED';
      return {
        success: true,
        action: 'remove',
        state: this.getState()
      };
    }

    // Check if phase transitions to MOVING (if this was the final placement)
    this._checkPhaseTransition();

    // Turn switches to opponent
    this.turn = opponent;

    // Check if opponent is trapped after removal
    if (this.phase === 'MOVING' && !this.hasLegalMoves(this.turn)) {
      this.winner = player;
      this.winReason = `Gegner (${this.turn === 'W' ? 'Weiß' : 'Schwarz'}) kann keinen Zug mehr machen (eingesperrt)`;
      this.phase = 'FINISHED';
    }

    return {
      success: true,
      action: 'remove',
      state: this.getState()
    };
  }

  /**
   * Resigns / forfeits the game.
   */
  forfeit(player) {
    if (this.winner) return { success: false, error: 'Spiel ist bereits beendet' };
    const winner = this.getOpponent(player);
    this.winner = winner;
    this.winReason = `Spieler ${player === 'W' ? 'Weiß' : 'Schwarz'} hat aufgegeben`;
    this.phase = 'FINISHED';
    return {
      success: true,
      state: this.getState()
    };
  }

  /**
   * Internal helper to transition from SETTING to MOVING phase when all 18 pieces placed.
   */
  _checkPhaseTransition() {
    if (this.phase === 'SETTING' && this.unplacedPieces.W === 0 && this.unplacedPieces.B === 0) {
      this.phase = 'MOVING';
    }
  }
}

module.exports = {
  MuehleGame,
  POINTS,
  ADJACENCY,
  MILLS,
  MILLS_BY_POINT
};

