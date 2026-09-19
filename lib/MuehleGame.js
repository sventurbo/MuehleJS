/**
 * MuehleGame.js
 * Authoritative rule engine for the board game "Mühle" (Nine Men's Morris).
 *
 * This class owns the *state* of one game — the board, whose turn it is, the
 * phase, the stones still in hand, the history — and the transitions between
 * those states. The *geometry* and the stateless predicates it needs for that
 * (which points are adjacent, which triplets form a mill, which opponent stones
 * may be captured) come from shared/muehleRules.js, the one module both the
 * server and the browser read. Only that guarantees the board a player sees and
 * the board this engine validates against are the same board.
 *
 * Coordinates: standard algebraic notation for the 24 points:
 * Outer square:  a7, d7, g7, g4, g1, d1, a1, a4
 * Middle square: b6, d6, f6, f4, f2, d2, b2, b4
 * Inner square:  c5, d5, e5, e4, e3, d3, c3, c4
 *
 * Every entry point (placePiece, movePiece, removePiece, forfeit) answers with
 * either `{ success: false, error }` or `{ success: true, …, state }` and never
 * throws, so a malformed or cheating client can only ever be told "no".
 */

const RULES = require('../shared/muehleRules');

const { POINTS, ADJACENCY, MILLS, MILLS_BY_POINT, colorName } = RULES;

/** The phase an action requires, and what to answer when the game is not in it. */
const WRONG_PHASE = {
  SETTING: 'Nicht in der Setzphase',
  MOVING: 'Nicht in der Zugphase'
};

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
    return RULES.getOpponent(player);
  }

  /**
   * Returns all opponent points that can legally be removed.
   * Rule: cannot remove an opponent piece in a mill, UNLESS all of them are.
   */
  getRemovablePieces(player = this.turn) {
    return RULES.getRemovablePoints(this.board, player);
  }

  /**
   * Returns whether a player is allowed to jump (fly) to any open point.
   * Rule: only in MOVING phase when down to exactly 3 pieces.
   */
  canJump(player = this.turn) {
    return this.phase === 'MOVING' && this.piecesOnBoard[player] === 3;
  }

  /**
   * Returns all valid destinations for a piece at `from` point for `player`.
   */
  getValidDestinations(from, player = this.turn) {
    return RULES.getValidDestinations(this.board, from, player, this.canJump(player));
  }

  /**
   * Returns a map of all legal moves for a player in MOVING phase:
   * { fromPoint: [toPoint1, toPoint2, ...] }
   */
  getLegalMoves(player = this.turn) {
    if (this.phase !== 'MOVING') return {};

    const legalMoves = {};
    POINTS.filter(pt => this.board[pt] === player).forEach(from => {
      const dests = this.getValidDestinations(from, player);
      if (dests.length > 0) legalMoves[from] = dests;
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
    return Object.keys(this.getLegalMoves(player)).length > 0;
  }

  /**
   * Every action the player on turn may legally take right now, as descriptors
   * that can be handed straight back to placePiece / movePiece / removePiece.
   *
   * Which kind of action is legal depends only on the current state: a pending
   * capture comes first, then the phase decides between placing and moving.
   * The server-side turn timer picks from this list when a player runs out of
   * time (see GameManager.handleTurnTimeout).
   */
  getLegalActions(player = this.turn) {
    if (this.winner || this.phase === 'FINISHED') return [];
    if (this.turn !== player) return [];

    if (this.awaitingRemoval) {
      return this.getRemovablePieces(player).map(point => ({ action: 'remove', player, point }));
    }

    if (this.phase === 'SETTING') {
      if (this.unplacedPieces[player] <= 0) return [];
      return POINTS
        .filter(pt => this.board[pt] === null)
        .map(point => ({ action: 'place', player, point }));
    }

    const moves = this.getLegalMoves(player);
    return Object.entries(moves).flatMap(([from, destinations]) =>
      destinations.map(to => ({ action: 'move', player, from, to }))
    );
  }

  /**
   * Plays one randomly chosen legal action for `player`.
   *
   * The action is executed through the very same placePiece / movePiece /
   * removePiece entry points a human move goes through, so it is validated by
   * the ordinary rules and lands in `moveHistory` like any other move — only
   * flagged with `auto: true`, so clients can tell it apart.
   *
   * @param {string} player 'W' or 'B'
   * @param {Function} [random] Source of randomness, injectable for tests.
   * @returns {Object} The result of the executed action, or `{ success: false }`
   *   when the player has no legal action at all.
   */
  makeRandomLegalMove(player = this.turn, random = Math.random) {
    const actions = this.getLegalActions(player);
    if (actions.length === 0) {
      return { success: false, error: 'Kein legaler Zug verfügbar' };
    }

    const index = Math.min(actions.length - 1, Math.max(0, Math.floor(random() * actions.length)));
    const choice = actions[index];

    const play = {
      place: () => this.placePiece(player, choice.point),
      move: () => this.movePiece(player, choice.from, choice.to),
      remove: () => this.removePiece(player, choice.point)
    };
    const result = play[choice.action]();

    if (result.success) {
      result.auto = true;
      const lastEntry = this.moveHistory[this.moveHistory.length - 1];
      if (lastEntry) lastEntry.auto = true;
    }

    return result;
  }

  /**
   * Phase 1: Place a piece on the board.
   */
  placePiece(player, point) {
    const rejection = this._rejectAction(player, 'SETTING');
    if (rejection) return { success: false, error: rejection };

    if (!POINTS.includes(point)) return { success: false, error: 'Ungültiger Punkt' };
    if (this.board[point] !== null) return { success: false, error: 'Punkt ist bereits besetzt' };
    if (this.unplacedPieces[player] <= 0) return { success: false, error: 'Keine Steine mehr zum Setzen' };

    this.board[point] = player;
    this.unplacedPieces[player]--;
    this.piecesOnBoard[player]++;

    this.moveHistory.push({ action: 'place', player, point, timestamp: Date.now() });

    return this._completeTurn(player, point, { success: true, action: 'place', player, point });
  }

  /**
   * Phase 2 / 3: Move a piece on the board.
   */
  movePiece(player, from, to) {
    const rejection = this._rejectAction(player, 'MOVING');
    if (rejection) return { success: false, error: rejection };

    if (!POINTS.includes(from) || !POINTS.includes(to)) return { success: false, error: 'Ungültiger Punkt' };
    if (this.board[from] !== player) return { success: false, error: 'Gewählter Stein gehört nicht dem Spieler' };
    if (this.board[to] !== null) return { success: false, error: 'Zielfeld ist bereits besetzt' };
    if (!this.getValidDestinations(from, player).includes(to)) {
      return { success: false, error: 'Ungültiger Zug (keine Verbindung oder Feld besetzt)' };
    }

    this.board[from] = null;
    this.board[to] = player;

    this.moveHistory.push({ action: 'move', player, from, to, timestamp: Date.now() });

    return this._completeTurn(player, to, { success: true, action: 'move', player, from, to });
  }

  /**
   * Remove an opponent's piece after closing a mill.
   */
  removePiece(player, point) {
    if (this.winner) return { success: false, error: 'Spiel ist bereits beendet' };
    if (!this.awaitingRemoval) return { success: false, error: 'Kein Stein zum Schlagen gefordert' };
    if (this.turn !== player) return { success: false, error: 'Nicht an der Reihe' };

    if (!this.getRemovablePieces(player).includes(point)) {
      return {
        success: false,
        error: 'Dieser Stein darf nicht geschlagen werden (befindet sich in einer Mühle oder gehört nicht dem Gegner)'
      };
    }

    const opponent = this.getOpponent(player);

    this.board[point] = null;
    this.piecesOnBoard[opponent]--;
    this.capturedPieces[opponent]++;
    this.awaitingRemoval = false;
    this.millTriggerPoint = null;

    this.moveHistory.push({ action: 'remove', player, point, opponent, timestamp: Date.now() });

    // Win condition: an opponent below three stones can no longer close a mill.
    if (this.phase === 'MOVING' && this.piecesOnBoard[opponent] < 3) {
      this._declareWinner(player, `Gegner (${colorName(opponent)}) hat weniger als 3 Steine übrig`);
    } else {
      // The capture may have been the last action of the setting phase.
      this._checkPhaseTransition();
      this.turn = opponent;
      this._checkTrapped(player);
    }

    return { success: true, action: 'remove', player, point, state: this.getState() };
  }

  /**
   * Resigns / forfeits the game.
   */
  forfeit(player) {
    if (this.winner) return { success: false, error: 'Spiel ist bereits beendet' };

    this._declareWinner(this.getOpponent(player), `Spieler ${colorName(player)} hat aufgegeben`);
    return { success: true, state: this.getState() };
  }

  /**
   * The guards every board action shares, in the order a player runs into them:
   * a finished game, the wrong phase, the wrong player, and a capture that still
   * has to be made first.
   *
   * @returns {string|null} the message to answer with, or null when the action
   *   may proceed to its own, action-specific checks.
   */
  _rejectAction(player, requiredPhase) {
    if (this.winner) return 'Spiel ist bereits beendet';
    if (this.phase !== requiredPhase) return WRONG_PHASE[requiredPhase];
    if (this.turn !== player) return 'Nicht an der Reihe';
    if (this.awaitingRemoval) return 'Muss zuerst einen gegnerischen Stein schlagen';
    return null;
  }

  /**
   * Closes a placement or a move, which end identically: if the stone that
   * landed on `point` completed a mill and there is anything to capture, the
   * same player stays on turn and owes a capture; otherwise the turn passes and
   * the game ends if the opponent is now stuck.
   *
   * @param {string} player The player who just acted.
   * @param {string} point The point their stone landed on.
   * @param {Object} result The action-specific part of the answer.
   * @returns {Object} the completed result, including the fresh state.
   */
  _completeTurn(player, point, result) {
    if (RULES.isPointInMill(this.board, point, player)) {
      const removablePieces = this.getRemovablePieces(player);
      if (removablePieces.length > 0) {
        this.awaitingRemoval = true;
        this.millTriggerPoint = point;
        return { ...result, millFormed: true, removablePieces, state: this.getState() };
      }
    }

    this._checkPhaseTransition();
    this.turn = this.getOpponent(player);
    this._checkTrapped(player);

    return { ...result, millFormed: false, state: this.getState() };
  }

  /**
   * Internal helper to transition from SETTING to MOVING phase when all 18 pieces placed.
   */
  _checkPhaseTransition() {
    if (this.phase === 'SETTING' && this.unplacedPieces.W === 0 && this.unplacedPieces.B === 0) {
      this.phase = 'MOVING';
    }
  }

  /**
   * Internal helper: once the turn has passed, ends the game if the player now
   * on turn cannot move any piece. `player` is the one who just acted and wins.
   */
  _checkTrapped(player) {
    if (this.phase === 'MOVING' && !this.hasLegalMoves(this.turn)) {
      this._declareWinner(
        player,
        `Gegner (${colorName(this.turn)}) kann keinen Zug mehr machen (eingesperrt)`
      );
    }
  }

  /** Ends the game. Every win path goes through here, so none can forget a field. */
  _declareWinner(winner, reason) {
    this.winner = winner;
    this.winReason = reason;
    this.phase = 'FINISHED';
  }
}

module.exports = {
  MuehleGame,
  POINTS,
  ADJACENCY,
  MILLS,
  MILLS_BY_POINT
};
