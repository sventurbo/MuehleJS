export const ADJACENCY = {
  'a7': ['d7', 'a4'],
  'd7': ['a7', 'g7', 'd6'],
  'g7': ['d7', 'g4'],
  'a4': ['a7', 'a1', 'b4'],
  'g4': ['g7', 'g1', 'f4'],
  'a1': ['a4', 'd1'],
  'd1': ['a1', 'g1', 'd2'],
  'g1': ['d1', 'g4'],

  'b6': ['d6', 'b4'],
  'd6': ['b6', 'f6', 'd7', 'd5'],
  'f6': ['d6', 'f4'],
  'b4': ['b6', 'b2', 'a4', 'c4'],
  'f4': ['f6', 'f2', 'e4', 'g4'],
  'b2': ['b4', 'd2'],
  'd2': ['b2', 'f2', 'd1', 'd3'],
  'f2': ['d2', 'f4'],

  'c5': ['d5', 'c4'],
  'd5': ['c5', 'e5', 'd6'],
  'e5': ['d5', 'e4'],
  'c4': ['c5', 'c3', 'b4'],
  'e4': ['e5', 'e3', 'f4'],
  'c3': ['c4', 'd3'],
  'd3': ['c3', 'e3', 'd2'],
  'e3': ['d3', 'e4']
};

export const POINTS = Object.keys(ADJACENCY);

export const COLOR_NAMES = { W: 'Weiß', B: 'Schwarz' };

export const colorName = color => COLOR_NAMES[color] ?? '';

// prettier-ignore
export const MILLS = [
  ['a7', 'd7', 'g7'], ['b6', 'd6', 'f6'], ['c5', 'd5', 'e5'],
  ['c3', 'd3', 'e3'], ['b2', 'd2', 'f2'], ['a1', 'd1', 'g1'],
  ['a7', 'a4', 'a1'], ['b6', 'b4', 'b2'], ['c5', 'c4', 'c3'],
  ['e5', 'e4', 'e3'], ['f6', 'f4', 'f2'], ['g7', 'g4', 'g1'],
  ['d7', 'd6', 'd5'], ['g4', 'f4', 'e4'], ['d1', 'd2', 'd3'], ['a4', 'b4', 'c4']
];

export const MILLS_BY_POINT = {};
POINTS.forEach(p => {
  MILLS_BY_POINT[p] = MILLS.filter(m => m.includes(p));
});

export const getOpponent = player => (player === 'W' ? 'B' : 'W');

export const isGameOver = state => state?.phase === 'FINISHED';

export function isPointInMill(board, point, player) {
  if (board[point] !== player) return false;
  return (MILLS_BY_POINT[point] ?? []).some(mill => mill.every(pt => board[pt] === player));
}

export function areAllPiecesInMills(board, player) {
  const playerPoints = POINTS.filter(pt => board[pt] === player);
  if (playerPoints.length === 0) return true;
  return playerPoints.every(pt => isPointInMill(board, pt, player));
}

export function getRemovablePoints(board, player) {
  const opponent = getOpponent(player);
  const opponentPoints = POINTS.filter(pt => board[pt] === opponent);
  if (opponentPoints.length === 0) return [];

  if (areAllPiecesInMills(board, opponent)) {
    return opponentPoints;
  }
  return opponentPoints.filter(pt => !isPointInMill(board, pt, opponent));
}

export function getCaptureTargets(gameState, playerColor) {
  if (!gameState || !playerColor) return [];
  if (isGameOver(gameState)) return [];
  if (!gameState.awaitingRemoval) return [];
  if (gameState.turn !== playerColor) return [];
  return getRemovablePoints(gameState.board, playerColor);
}

export function getValidDestinations(board, from, player, canJump) {
  if (board[from] !== player) return [];
  if (canJump) return POINTS.filter(pt => board[pt] === null);
  return (ADJACENCY[from] ?? []).filter(pt => board[pt] === null);
}

export function diffBoards(prevBoard, nextBoard) {
  const placed = [];
  const removed = [];

  POINTS.forEach(pt => {
    const before = prevBoard?.[pt] ?? null;
    const after = nextBoard?.[pt] ?? null;
    if (before === after) return;
    if (before) removed.push(pt);
    if (after) placed.push(pt);
  });

  if (placed.length === 1 && removed.length === 1 && prevBoard[removed[0]] === nextBoard[placed[0]]) {
    return { moved: { from: removed[0], to: placed[0] }, placed: [], removed: [] };
  }
  return { moved: null, placed, removed };
}
