import * as RULES from '../shared/muehleRules.js';

const { POINTS, colorName } = RULES;

export { POINTS, ADJACENCY, MILLS, MILLS_BY_POINT } from '../shared/muehleRules.js';

const WRONG_PHASE = {
  SETTING: 'Nicht in der Setzphase',
  MOVING: 'Nicht in der Zugphase'
};

export const REPETITION_LIMIT = 3;
export const MOVES_WITHOUT_CAPTURE_LIMIT = 50;

export class MuehleGame {
  constructor(gameId = null) {
    this.gameId = gameId || 'game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    this.board = {};
    POINTS.forEach(p => {
      this.board[p] = null;
    });

    this.turn = 'W';
    this.phase = 'SETTING';

    this.unplacedPieces = { W: 9, B: 9 };

    this.piecesOnBoard = { W: 0, B: 0 };

    this.capturedPieces = { W: 0, B: 0 };

    this.awaitingRemoval = false;
    this.millTriggerPoint = null;

    this.winner = null;
    this.endReason = null;

    this.moveHistory = [];

    this.positionCounts = new Map();
    this.movesSinceCapture = 0;
  }

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
      endReason: this.endReason,
      moveCount: this.moveHistory.length
    };
  }

  getOpponent(player = this.turn) {
    return RULES.getOpponent(player);
  }

  getRemovablePieces(player = this.turn) {
    return RULES.getRemovablePoints(this.board, player);
  }

  canJump(player = this.turn) {
    return this.phase === 'MOVING' && this.piecesOnBoard[player] === 3;
  }

  getValidDestinations(from, player = this.turn) {
    return RULES.getValidDestinations(this.board, from, player, this.canJump(player));
  }

  getLegalMoves(player = this.turn) {
    if (this.phase !== 'MOVING') return {};

    const legalMoves = {};
    POINTS.filter(pt => this.board[pt] === player).forEach(from => {
      const dests = this.getValidDestinations(from, player);
      if (dests.length > 0) legalMoves[from] = dests;
    });

    return legalMoves;
  }

  hasLegalMoves(player = this.turn) {
    if (this.phase === 'SETTING') {
      return POINTS.some(pt => this.board[pt] === null);
    }
    return Object.keys(this.getLegalMoves(player)).length > 0;
  }

  getLegalActions(player = this.turn) {
    if (this.phase === 'FINISHED') return [];
    if (this.turn !== player) return [];

    if (this.awaitingRemoval) {
      return this.getRemovablePieces(player).map(point => ({ action: 'remove', player, point }));
    }

    if (this.phase === 'SETTING') {
      if (this.unplacedPieces[player] <= 0) return [];
      return POINTS.filter(pt => this.board[pt] === null).map(point => ({ action: 'place', player, point }));
    }

    const moves = this.getLegalMoves(player);
    return Object.entries(moves).flatMap(([from, destinations]) =>
      destinations.map(to => ({ action: 'move', player, from, to }))
    );
  }

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
      const lastEntry = this.moveHistory.at(-1);
      if (lastEntry) lastEntry.auto = true;
    }

    return result;
  }

  placePiece(player, point) {
    const rejection = this.#rejectAction(player, 'SETTING');
    if (rejection) return { success: false, error: rejection };

    if (!POINTS.includes(point)) return { success: false, error: 'Ungültiger Punkt' };
    if (this.board[point] !== null) return { success: false, error: 'Punkt ist bereits besetzt' };
    if (this.unplacedPieces[player] <= 0) return { success: false, error: 'Keine Steine mehr zum Setzen' };

    this.board[point] = player;
    this.unplacedPieces[player]--;
    this.piecesOnBoard[player]++;

    this.moveHistory.push({ action: 'place', player, point, timestamp: Date.now() });

    return this.#completeTurn(player, point, { success: true, action: 'place', player, point });
  }

  movePiece(player, from, to) {
    const rejection = this.#rejectAction(player, 'MOVING');
    if (rejection) return { success: false, error: rejection };

    if (!POINTS.includes(from) || !POINTS.includes(to)) return { success: false, error: 'Ungültiger Punkt' };
    if (this.board[from] !== player) return { success: false, error: 'Gewählter Stein gehört nicht dem Spieler' };
    if (this.board[to] !== null) return { success: false, error: 'Zielfeld ist bereits besetzt' };
    if (!this.getValidDestinations(from, player).includes(to)) {
      return { success: false, error: 'Ungültiger Zug (keine Verbindung oder Feld besetzt)' };
    }

    this.board[from] = null;
    this.board[to] = player;
    this.movesSinceCapture++;

    this.moveHistory.push({ action: 'move', player, from, to, timestamp: Date.now() });

    return this.#completeTurn(player, to, { success: true, action: 'move', player, from, to });
  }

  removePiece(player, point) {
    if (this.phase === 'FINISHED') return { success: false, error: 'Spiel ist bereits beendet' };
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

    this.positionCounts.clear();
    this.movesSinceCapture = 0;

    this.moveHistory.push({ action: 'remove', player, point, opponent, timestamp: Date.now() });

    // Stones still in hand count: in the setting phase a player can lose before moving a single stone.
    if (this.piecesOnBoard[opponent] + this.unplacedPieces[opponent] < 3) {
      this.#declareWinner(player, `Gegner (${colorName(opponent)}) hat weniger als 3 Steine übrig`);
    } else {
      this.#passTurn(player);
    }

    return { success: true, action: 'remove', player, point, state: this.getState() };
  }

  forfeit(player, reason = `Spieler ${colorName(player)} hat aufgegeben`) {
    if (this.phase === 'FINISHED') return { success: false, error: 'Spiel ist bereits beendet' };

    this.#declareWinner(this.getOpponent(player), reason);
    return { success: true, state: this.getState() };
  }

  #rejectAction(player, requiredPhase) {
    if (this.phase === 'FINISHED') return 'Spiel ist bereits beendet';
    if (this.phase !== requiredPhase) return WRONG_PHASE[requiredPhase];
    if (this.turn !== player) return 'Nicht an der Reihe';
    if (this.awaitingRemoval) return 'Muss zuerst einen gegnerischen Stein schlagen';
    return null;
  }

  #completeTurn(player, point, result) {
    if (RULES.isPointInMill(this.board, point, player)) {
      const removablePieces = this.getRemovablePieces(player);
      if (removablePieces.length > 0) {
        this.awaitingRemoval = true;
        this.millTriggerPoint = point;
        return { ...result, millFormed: true, removablePieces, state: this.getState() };
      }
    }

    this.#passTurn(player);

    return { ...result, millFormed: false, state: this.getState() };
  }

  #passTurn(player) {
    this.#checkPhaseTransition();
    this.turn = this.getOpponent(player);
    this.#checkTrapped(player);
    this.#checkDraw();
  }

  #checkPhaseTransition() {
    if (this.phase === 'SETTING' && this.unplacedPieces.W === 0 && this.unplacedPieces.B === 0) {
      this.phase = 'MOVING';
    }
  }

  #checkTrapped(player) {
    if (this.phase === 'MOVING' && !this.hasLegalMoves(this.turn)) {
      this.#declareWinner(player, `Gegner (${colorName(this.turn)}) kann keinen Zug mehr machen (eingesperrt)`);
    }
  }

  #checkDraw() {
    if (this.phase !== 'MOVING') return;

    const position = `${this.turn}:${POINTS.map(pt => this.board[pt] ?? '-').join('')}`;
    const occurrences = (this.positionCounts.get(position) ?? 0) + 1;
    this.positionCounts.set(position, occurrences);

    if (occurrences >= REPETITION_LIMIT) {
      this.#declareDraw('Remis: dreifache Stellungswiederholung');
    } else if (this.movesSinceCapture >= MOVES_WITHOUT_CAPTURE_LIMIT) {
      this.#declareDraw(`Remis: ${MOVES_WITHOUT_CAPTURE_LIMIT} Züge ohne Schlagen`);
    }
  }

  #declareWinner(winner, reason) {
    this.winner = winner;
    this.endReason = reason;
    this.phase = 'FINISHED';
  }

  #declareDraw(reason) {
    this.winner = null;
    this.endReason = reason;
    this.phase = 'FINISHED';
  }
}
