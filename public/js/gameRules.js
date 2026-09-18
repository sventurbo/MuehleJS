/**
 * gameRules.js
 * Pure, side-effect free board rules shared by the client UI.
 *
 * This module holds the board geometry and the capture rule in ONE place so the
 * markers drawn by boardRenderer.js and the validation in app.js can never
 * disagree: both read `getCaptureTargets()`, which derives everything from the
 * authoritative game state pushed by the server.
 *
 * The rules mirror lib/MuehleGame.js (the server stays authoritative); the
 * client copy exists purely for immediate visual feedback.
 *
 * Runs unchanged in the browser (as `window.MuehleRules`) and in Node (Jest).
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MuehleRules = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Adjacency graph: 32 undirected edges over the 24 board points.
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

  const POINTS = Object.keys(ADJACENCY);

  // All 16 possible mills (triplets of collinear points).
  const MILLS = [
    ['a7', 'd7', 'g7'], ['b6', 'd6', 'f6'], ['c5', 'd5', 'e5'],
    ['c3', 'd3', 'e3'], ['b2', 'd2', 'f2'], ['a1', 'd1', 'g1'],
    ['a7', 'a4', 'a1'], ['b6', 'b4', 'b2'], ['c5', 'c4', 'c3'],
    ['e5', 'e4', 'e3'], ['f6', 'f4', 'f2'], ['g7', 'g4', 'g1'],
    ['d7', 'd6', 'd5'], ['g4', 'f4', 'e4'], ['d1', 'd2', 'd3'], ['a4', 'b4', 'c4']
  ];

  // Precomputed mills per point for fast lookups.
  const MILLS_BY_POINT = {};
  POINTS.forEach(p => {
    MILLS_BY_POINT[p] = MILLS.filter(m => m.includes(p));
  });

  const getOpponent = (player) => (player === 'W' ? 'B' : 'W');

  /**
   * Is the stone of `player` at `point` part of a completed mill?
   */
  function isPointInMill(board, point, player) {
    if (board[point] !== player) return false;
    return (MILLS_BY_POINT[point] || []).some(mill => mill.every(pt => board[pt] === player));
  }

  /**
   * Are all stones `player` has on the board part of a mill?
   */
  function areAllPiecesInMills(board, player) {
    const playerPoints = POINTS.filter(pt => board[pt] === player);
    if (playerPoints.length === 0) return true;
    return playerPoints.every(pt => isPointInMill(board, pt, player));
  }

  /**
   * All opponent stones `player` may legally capture.
   * Rule: a stone inside a mill is protected, unless every opponent stone is
   * inside a mill — then any of them may be taken.
   */
  function getRemovablePoints(board, player) {
    const opponent = getOpponent(player);
    const opponentPoints = POINTS.filter(pt => board[pt] === opponent);
    if (opponentPoints.length === 0) return [];

    if (areAllPiecesInMills(board, opponent)) {
      return opponentPoints;
    }
    return opponentPoints.filter(pt => !isPointInMill(board, pt, opponent));
  }

  /**
   * Single source of truth for the capture markers.
   *
   * Returns the points this client may click right now — which is also exactly
   * the set the board is allowed to draw a `.removal-target` ring on. Outside a
   * pending capture (not our turn, no mill closed, game already decided) the set
   * is empty, so no ring can outlive the state that produced it.
   */
  function getCaptureTargets(gameState, playerColor) {
    if (!gameState || !playerColor) return [];
    if (gameState.winner) return [];
    if (!gameState.awaitingRemoval) return [];
    if (gameState.turn !== playerColor) return [];
    return getRemovablePoints(gameState.board, playerColor);
  }

  /**
   * Destinations a stone at `from` may move to (jumping when down to 3 stones).
   */
  function getValidDestinations(board, from, player, canJump) {
    if (board[from] !== player) return [];
    if (canJump) return POINTS.filter(pt => board[pt] === null);
    return (ADJACENCY[from] || []).filter(pt => board[pt] === null);
  }

  /**
   * What changed between two boards, so the renderer can animate exactly that.
   *
   * A move shows up as one stone leaving a point and a stone of the same colour
   * arriving on another; it is reported as `moved` so it can travel instead of
   * vanishing and reappearing. Every other difference is a plain placement or
   * removal. Derived from the boards alone, so it cannot disagree with the
   * state the board is being brought in line with.
   */
  function diffBoards(prevBoard, nextBoard) {
    const placed = [];
    const removed = [];

    POINTS.forEach(pt => {
      const before = (prevBoard && prevBoard[pt]) || null;
      const after = (nextBoard && nextBoard[pt]) || null;
      if (before === after) return;
      if (before) removed.push(pt);
      if (after) placed.push(pt);
    });

    if (placed.length === 1 && removed.length === 1 &&
        prevBoard[removed[0]] === nextBoard[placed[0]]) {
      return { moved: { from: removed[0], to: placed[0] }, placed: [], removed: [] };
    }
    return { moved: null, placed, removed };
  }

  return {
    POINTS,
    ADJACENCY,
    MILLS,
    MILLS_BY_POINT,
    getOpponent,
    isPointInMill,
    areAllPiecesInMills,
    getRemovablePoints,
    getCaptureTargets,
    getValidDestinations,
    diffBoards
  };
});
