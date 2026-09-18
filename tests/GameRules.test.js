/**
 * GameRules.test.js
 * The client draws capture rings from public/js/gameRules.js. These tests pin
 * that module to the authoritative server engine in lib/MuehleGame.js, so a
 * stone the board marks is always a stone the server accepts.
 */

const RULES = require('../public/js/gameRules');
const { MuehleGame, POINTS, MILLS, ADJACENCY } = require('../lib/MuehleGame');

/** Builds a game whose board holds exactly the given stones. */
function gameWith(stones, overrides = {}) {
  const game = new MuehleGame('rules_test');
  Object.entries(stones).forEach(([pt, color]) => { game.board[pt] = color; });
  game.piecesOnBoard.W = POINTS.filter(pt => game.board[pt] === 'W').length;
  game.piecesOnBoard.B = POINTS.filter(pt => game.board[pt] === 'B').length;
  Object.assign(game, overrides);
  return game;
}

/** Deterministic PRNG so a failing random board is reproducible. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('Client rule module (gameRules.js)', () => {
  describe('Board geometry matches the server', () => {
    test('exposes the same 24 points as the engine', () => {
      expect(RULES.POINTS.length).toBe(24);
      expect([...RULES.POINTS].sort()).toEqual([...POINTS].sort());
    });

    test('exposes the same 16 mills as the engine', () => {
      const normalize = mills => mills.map(m => [...m].sort().join('-')).sort();
      expect(RULES.MILLS.length).toBe(16);
      expect(normalize(RULES.MILLS)).toEqual(normalize(MILLS));
    });

    test('exposes the same adjacency graph as the engine', () => {
      POINTS.forEach(pt => {
        expect([...RULES.ADJACENCY[pt]].sort()).toEqual([...ADJACENCY[pt]].sort());
      });
    });
  });

  describe('getRemovablePoints agrees with MuehleGame.getRemovablePieces', () => {
    test('protects opponent stones that sit in a mill', () => {
      const game = gameWith({
        b6: 'B', d6: 'B', f6: 'B', // closed mill, protected
        a1: 'B',                   // loose stone
        a7: 'W', d7: 'W', g7: 'W'
      });
      expect(RULES.getRemovablePoints(game.board, 'W')).toEqual(['a1']);
      expect(RULES.getRemovablePoints(game.board, 'W')).toEqual(game.getRemovablePieces('W'));
    });

    test('allows any stone when every opponent stone is in a mill', () => {
      const game = gameWith({
        b6: 'B', d6: 'B', f6: 'B',
        a1: 'W', d1: 'W'
      });
      const expected = ['b6', 'd6', 'f6'];
      expect(RULES.getRemovablePoints(game.board, 'W').sort()).toEqual(expected);
      expect(game.getRemovablePieces('W').sort()).toEqual(expected);
    });

    test('counts a stone shared by two mills as protected only once', () => {
      // b6 belongs to b6-d6-f6 and b6-b4-b2; both are closed, plus a loose stone.
      const game = gameWith({
        b6: 'B', d6: 'B', f6: 'B', b4: 'B', b2: 'B', e3: 'B',
        a7: 'W'
      });
      expect(RULES.getRemovablePoints(game.board, 'W')).toEqual(['e3']);
      expect(RULES.getRemovablePoints(game.board, 'W')).toEqual(game.getRemovablePieces('W'));
    });

    test('returns an empty set when the opponent has no stones', () => {
      const game = gameWith({ a7: 'W', d7: 'W' });
      expect(RULES.getRemovablePoints(game.board, 'W')).toEqual([]);
      expect(game.getRemovablePieces('W')).toEqual([]);
    });

    test('agrees with the engine on 5000 pseudo-random positions', () => {
      const random = makeRandom(20260917);
      const mismatches = [];

      for (let i = 0; i < 5000; i++) {
        const shuffled = [...POINTS].sort(() => random() - 0.5);
        const stones = {};
        let cursor = 0;
        const blackCount = 1 + Math.floor(random() * 9);
        const whiteCount = 1 + Math.floor(random() * 9);
        for (let n = 0; n < blackCount; n++) stones[shuffled[cursor++]] = 'B';
        for (let n = 0; n < whiteCount; n++) stones[shuffled[cursor++]] = 'W';

        const game = gameWith(stones);
        ['W', 'B'].forEach(player => {
          const client = [...RULES.getRemovablePoints(game.board, player)].sort();
          const server = [...game.getRemovablePieces(player)].sort();
          if (client.join(',') !== server.join(',')) {
            mismatches.push({ board: { ...stones }, player, client, server });
          }
        });
      }

      expect(mismatches).toEqual([]);
    });
  });

  describe('getCaptureTargets only marks stones the server would accept', () => {
    test('marks nothing while no capture is pending', () => {
      const game = gameWith({ b6: 'B', a7: 'W' });
      expect(RULES.getCaptureTargets(game.getState(), 'W')).toEqual([]);
    });

    test('marks nothing for the player who is not on turn', () => {
      const game = gameWith(
        { b6: 'B', a1: 'B', a7: 'W' },
        { awaitingRemoval: true, turn: 'W', millTriggerPoint: 'a7' }
      );
      expect(RULES.getCaptureTargets(game.getState(), 'B')).toEqual([]);
    });

    test('marks nothing once the game is decided', () => {
      // Regression: the capture set used to be cached in a field that the
      // game-over branch never reset, so rings stayed on a finished board while
      // the click handler refused them.
      const game = gameWith(
        { b6: 'B', a1: 'B', a7: 'W' },
        { awaitingRemoval: true, turn: 'W', winner: 'W', winReason: 'Test', phase: 'FINISHED' }
      );
      expect(RULES.getCaptureTargets(game.getState(), 'W')).toEqual([]);
    });

    test('marks no stone at all without a game state', () => {
      expect(RULES.getCaptureTargets(null, 'W')).toEqual([]);
      expect(RULES.getCaptureTargets({ board: {}, turn: 'W', awaitingRemoval: true }, null)).toEqual([]);
    });

    test('every marked stone is accepted and every unmarked one rejected', () => {
      const stones = {
        b6: 'B', d6: 'B', f6: 'B', // protected mill
        c5: 'B', f2: 'B',          // loose stones
        a7: 'W', d7: 'W', g7: 'W', a1: 'W'
      };
      const state = gameWith(stones, {
        awaitingRemoval: true, turn: 'W', millTriggerPoint: 'd7', phase: 'SETTING'
      }).getState();

      const marked = RULES.getCaptureTargets(state, 'W');
      expect(marked.sort()).toEqual(['c5', 'f2']);

      // Marked stones must be accepted by the authoritative engine.
      marked.forEach(point => {
        const game = gameWith(stones, {
          awaitingRemoval: true, turn: 'W', millTriggerPoint: 'd7', phase: 'SETTING'
        });
        expect(game.removePiece('W', point).success).toBe(true);
      });

      // Every other point must be rejected — so it must never carry a ring.
      POINTS.filter(pt => !marked.includes(pt)).forEach(point => {
        const game = gameWith(stones, {
          awaitingRemoval: true, turn: 'W', millTriggerPoint: 'd7', phase: 'SETTING'
        });
        expect(game.removePiece('W', point).success).toBe(false);
      });
    });

    test('accepts a protected stone once all opponent stones sit in mills', () => {
      const stones = { b6: 'B', d6: 'B', f6: 'B', a7: 'W', d7: 'W', g7: 'W' };
      const state = gameWith(stones, {
        awaitingRemoval: true, turn: 'W', millTriggerPoint: 'd7', phase: 'SETTING'
      }).getState();

      const marked = RULES.getCaptureTargets(state, 'W');
      expect(marked.sort()).toEqual(['b6', 'd6', 'f6']);

      marked.forEach(point => {
        const game = gameWith(stones, {
          awaitingRemoval: true, turn: 'W', millTriggerPoint: 'd7', phase: 'SETTING'
        });
        expect(game.removePiece('W', point).success).toBe(true);
      });
    });

    test('marked stones stay acceptable across pseudo-random capture positions', () => {
      const random = makeRandom(4711);

      for (let i = 0; i < 400; i++) {
        const shuffled = [...POINTS].sort(() => random() - 0.5);
        const stones = {};
        let cursor = 0;
        const blackCount = 3 + Math.floor(random() * 7);
        const whiteCount = 3 + Math.floor(random() * 7);
        for (let n = 0; n < blackCount; n++) stones[shuffled[cursor++]] = 'B';
        for (let n = 0; n < whiteCount; n++) stones[shuffled[cursor++]] = 'W';

        const setup = { awaitingRemoval: true, turn: 'W', millTriggerPoint: null, phase: 'SETTING' };
        const marked = RULES.getCaptureTargets(gameWith(stones, setup).getState(), 'W');

        marked.forEach(point => {
          const game = gameWith(stones, setup);
          const result = game.removePiece('W', point);
          expect({ point, stones, success: result.success })
            .toEqual({ point, stones, success: true });
        });

        POINTS.filter(pt => !marked.includes(pt)).forEach(point => {
          const game = gameWith(stones, setup);
          expect(game.removePiece('W', point).success).toBe(false);
        });
      }
    });
  });

  describe('getValidDestinations agrees with the engine', () => {
    test('follows adjacency in the normal moving phase', () => {
      const game = gameWith({ b4: 'W', b6: 'B' }, { phase: 'MOVING' });
      expect(RULES.getValidDestinations(game.board, 'b4', 'W', false).sort())
        .toEqual(game.getValidDestinations('b4', 'W').sort());
    });

    test('allows jumping to any free point with three stones left', () => {
      const game = gameWith(
        { a7: 'W', d7: 'W', g7: 'W', a1: 'B', d1: 'B', g1: 'B' },
        { phase: 'MOVING' }
      );
      expect(RULES.getValidDestinations(game.board, 'a7', 'W', true).sort())
        .toEqual(game.getValidDestinations('a7', 'W').sort());
    });

    test('returns nothing for a point the player does not own', () => {
      const game = gameWith({ b4: 'B' }, { phase: 'MOVING' });
      expect(RULES.getValidDestinations(game.board, 'b4', 'W', false)).toEqual([]);
    });
  });

  describe('diffBoards tells the renderer what changed', () => {
    const empty = () => Object.fromEntries(POINTS.map(pt => [pt, null]));
    const board = stones => ({ ...empty(), ...stones });

    test('reports nothing for identical boards', () => {
      const stones = board({ a7: 'W', g1: 'B' });
      expect(RULES.diffBoards(stones, { ...stones })).toEqual({ moved: null, placed: [], removed: [] });
    });

    test('reports a placement', () => {
      expect(RULES.diffBoards(board({ a7: 'W' }), board({ a7: 'W', d7: 'B' })))
        .toEqual({ moved: null, placed: ['d7'], removed: [] });
    });

    test('reports a capture', () => {
      expect(RULES.diffBoards(board({ a7: 'W', d7: 'B' }), board({ a7: 'W' })))
        .toEqual({ moved: null, placed: [], removed: ['d7'] });
    });

    test('reports a step and a jump as a move', () => {
      expect(RULES.diffBoards(board({ b2: 'W', a1: 'B' }), board({ b4: 'W', a1: 'B' })))
        .toEqual({ moved: { from: 'b2', to: 'b4' }, placed: [], removed: [] });
      expect(RULES.diffBoards(board({ g1: 'B', a7: 'W' }), board({ c5: 'B', a7: 'W' })))
        .toEqual({ moved: { from: 'g1', to: 'c5' }, placed: [], removed: [] });
    });

    test('does not mistake a vanished and an unrelated new stone for a move', () => {
      expect(RULES.diffBoards(board({ a7: 'W' }), board({ g1: 'B' })))
        .toEqual({ moved: null, placed: ['g1'], removed: ['a7'] });
      expect(RULES.diffBoards(board({ a7: 'W' }), board({ a7: 'B' })))
        .toEqual({ moved: null, placed: ['a7'], removed: ['a7'] });
    });

    test('treats a missing previous board as empty', () => {
      expect(RULES.diffBoards({}, board({ d5: 'W' })))
        .toEqual({ moved: null, placed: ['d5'], removed: [] });
    });

    test('matches every action of pseudo-random engine games', () => {
      const random = makeRandom(20260918);
      const pick = list => list[Math.floor(random() * list.length)];
      const mismatches = [];
      const seen = new Set();

      for (let g = 0; g < 60; g++) {
        const game = new MuehleGame(`diff_${g}`);

        for (let step = 0; step < 200 && !game.winner; step++) {
          const player = game.turn;
          const before = { ...game.board };
          let result;

          if (game.awaitingRemoval) {
            result = game.removePiece(player, pick(game.getRemovablePieces(player)));
          } else if (game.phase === 'SETTING') {
            result = game.placePiece(player, pick(POINTS.filter(pt => game.board[pt] === null)));
          } else {
            const moves = Object.entries(game.getLegalMoves(player))
              .flatMap(([from, tos]) => tos.map(to => [from, to]));
            const [from, to] = pick(moves);
            result = game.movePiece(player, from, to);
          }
          expect(result.success).toBe(true);

          const expected = {
            place: { moved: null, placed: [result.point], removed: [] },
            move: { moved: { from: result.from, to: result.to }, placed: [], removed: [] },
            remove: { moved: null, placed: [], removed: [result.point] }
          }[result.action];
          seen.add(result.action);

          const actual = RULES.diffBoards(before, result.state.board);
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            mismatches.push({ game: g, step, action: result.action, expected, actual });
          }
        }
      }

      expect([...seen].sort()).toEqual(['move', 'place', 'remove']);
      expect(mismatches).toEqual([]);
    });
  });
});
