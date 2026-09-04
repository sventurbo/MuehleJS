const { MuehleGame, POINTS, ADJACENCY, MILLS } = require('../lib/MuehleGame');

describe('MuehleGame Rule Engine', () => {
  let game;

  beforeEach(() => {
    game = new MuehleGame('test_game_1');
  });

  describe('Board and Graph Geometry', () => {
    test('should have exactly 24 points', () => {
      expect(POINTS.length).toBe(24);
      expect(Object.keys(game.board).length).toBe(24);
    });

    test('should have exactly 16 mills', () => {
      expect(MILLS.length).toBe(16);
      MILLS.forEach(mill => {
        expect(mill.length).toBe(3);
        mill.forEach(p => expect(POINTS).toContain(p));
      });
    });

    test('should have symmetric adjacency connections', () => {
      POINTS.forEach(p => {
        const neighbors = ADJACENCY[p];
        expect(neighbors).toBeDefined();
        neighbors.forEach(neighbor => {
          expect(ADJACENCY[neighbor]).toContain(p);
        });
      });
    });

    test('outer corners should have degree 2 and outer midpoints degree 3', () => {
      expect(ADJACENCY['a7'].length).toBe(2);
      expect(ADJACENCY['d7'].length).toBe(3);
      expect(ADJACENCY['d6'].length).toBe(4); // middle midpoint connects 4 points
    });
  });

  describe('Phase 1: SETTING (Setzphase)', () => {
    test('initial state is clean', () => {
      expect(game.phase).toBe('SETTING');
      expect(game.turn).toBe('W');
      expect(game.unplacedPieces.W).toBe(9);
      expect(game.unplacedPieces.B).toBe(9);
      expect(game.piecesOnBoard.W).toBe(0);
      expect(game.piecesOnBoard.B).toBe(0);
      expect(game.awaitingRemoval).toBe(false);
      expect(game.winner).toBeNull();
    });

    test('alternates turns on valid placements', () => {
      const res1 = game.placePiece('W', 'a1');
      expect(res1.success).toBe(true);
      expect(game.board['a1']).toBe('W');
      expect(game.unplacedPieces.W).toBe(8);
      expect(game.piecesOnBoard.W).toBe(1);
      expect(game.turn).toBe('B');

      const res2 = game.placePiece('B', 'd1');
      expect(res2.success).toBe(true);
      expect(game.board['d1']).toBe('B');
      expect(game.unplacedPieces.B).toBe(8);
      expect(game.piecesOnBoard.B).toBe(1);
      expect(game.turn).toBe('W');
    });

    test('rejects placement on already occupied point', () => {
      game.placePiece('W', 'a1');
      const res = game.placePiece('B', 'a1');
      expect(res.success).toBe(false);
      expect(game.turn).toBe('B');
    });

    test('rejects move out of turn', () => {
      const res = game.placePiece('B', 'a1');
      expect(res.success).toBe(false);
      expect(game.turn).toBe('W');
    });

    test('detects mill formation and requires piece removal', () => {
      // W: a7, B: b6
      game.placePiece('W', 'a7');
      game.placePiece('B', 'b6');
      // W: d7, B: d6
      game.placePiece('W', 'd7');
      game.placePiece('B', 'd6');
      // W: g7 -> Completes mill ['a7', 'd7', 'g7']!
      const res = game.placePiece('W', 'g7');

      expect(res.success).toBe(true);
      expect(res.millFormed).toBe(true);
      expect(game.awaitingRemoval).toBe(true);
      expect(game.turn).toBe('W'); // Still W's turn to remove!
      expect(res.removablePieces).toEqual(expect.arrayContaining(['b6', 'd6']));

      // Try to place another piece while awaiting removal -> should fail
      const placeDuringRemoval = game.placePiece('W', 'c5');
      expect(placeDuringRemoval.success).toBe(false);

      // Remove opponent piece at 'b6'
      const removeRes = game.removePiece('W', 'b6');
      expect(removeRes.success).toBe(true);
      expect(game.board['b6']).toBeNull();
      expect(game.piecesOnBoard.B).toBe(1);
      expect(game.capturedPieces.B).toBe(1);
      expect(game.awaitingRemoval).toBe(false);
      expect(game.turn).toBe('B'); // Turn passes to B
    });

    test('protects opponent pieces that are in a mill unless all are in mills', () => {
      // Set up B with a mill at ['b6', 'd6', 'f6'] and one piece outside at ['f4']
      game.board['b6'] = 'B';
      game.board['d6'] = 'B';
      game.board['f6'] = 'B';
      game.board['f4'] = 'B';
      game.piecesOnBoard.B = 4;

      // W closes mill at ['a7', 'd7', 'g7']
      game.board['a7'] = 'W';
      game.board['d7'] = 'W';
      game.piecesOnBoard.W = 2;
      game.unplacedPieces.W = 7;
      game.turn = 'W';

      const res = game.placePiece('W', 'g7');
      expect(res.millFormed).toBe(true);

      // 'f4' is not in a mill, so it should be removable
      expect(res.removablePieces).toEqual(['f4']);

      // Attempting to remove 'b6' (which is protected in a mill) must fail
      const failRemove = game.removePiece('W', 'b6');
      expect(failRemove.success).toBe(false);
      expect(game.board['b6']).toBe('B');

      // Removing 'f4' must succeed
      const successRemove = game.removePiece('W', 'f4');
      expect(successRemove.success).toBe(true);
      expect(game.board['f4']).toBeNull();
    });

    test('allows removing a mill piece if ALL opponent pieces are in mills', () => {
      // B only has 3 pieces, all in a mill ['b6', 'd6', 'f6']
      game.board['b6'] = 'B';
      game.board['d6'] = 'B';
      game.board['f6'] = 'B';
      game.piecesOnBoard.B = 3;

      // W forms mill
      game.board['a7'] = 'W';
      game.board['d7'] = 'W';
      game.piecesOnBoard.W = 2;
      game.unplacedPieces.W = 7;
      game.turn = 'W';

      const res = game.placePiece('W', 'g7');
      expect(res.millFormed).toBe(true);
      // All 3 of B's pieces are in a mill, so all 3 become removable!
      expect(res.removablePieces.sort()).toEqual(['b6', 'd6', 'f6'].sort());

      const removeRes = game.removePiece('W', 'b6');
      expect(removeRes.success).toBe(true);
      expect(game.board['b6']).toBeNull();
    });

    test('transitions from SETTING to MOVING phase when 18 pieces placed', () => {
      game.unplacedPieces.W = 1;
      game.unplacedPieces.B = 1;
      game.turn = 'W';

      game.placePiece('W', 'a1');
      expect(game.phase).toBe('SETTING');
      expect(game.turn).toBe('B');

      game.placePiece('B', 'g1');
      expect(game.unplacedPieces.W).toBe(0);
      expect(game.unplacedPieces.B).toBe(0);
      expect(game.phase).toBe('MOVING');
      expect(game.turn).toBe('W');
    });
  });

  describe('Phase 2: MOVING (Zugphase)', () => {
    beforeEach(() => {
      game.phase = 'MOVING';
      game.unplacedPieces.W = 0;
      game.unplacedPieces.B = 0;
      game.piecesOnBoard.W = 4;
      game.piecesOnBoard.B = 4;
    });

    test('valid move along adjacent empty line succeeds', () => {
      game.board['a7'] = 'W';
      game.turn = 'W';

      const res = game.movePiece('W', 'a7', 'd7');
      expect(res.success).toBe(true);
      expect(game.board['a7']).toBeNull();
      expect(game.board['d7']).toBe('W');
      expect(game.turn).toBe('B');
    });

    test('rejects move to non-adjacent point when player has > 3 pieces', () => {
      game.board['a7'] = 'W';
      game.turn = 'W';

      const res = game.movePiece('W', 'a7', 'g7'); // g7 is not adjacent to a7
      expect(res.success).toBe(false);
      expect(game.board['a7']).toBe('W');
      expect(game.turn).toBe('W');
    });

    test('rejects move if target is occupied', () => {
      game.board['a7'] = 'W';
      game.board['d7'] = 'B';
      game.turn = 'W';

      const res = game.movePiece('W', 'a7', 'd7');
      expect(res.success).toBe(false);
    });

    test('closing a mill during MOVING phase allows capture', () => {
      game.board['a7'] = 'W';
      game.board['d7'] = 'W';
      game.board['g4'] = 'W';
      game.board['c5'] = 'B';
      game.turn = 'W';

      // Move g4 to g7 -> completes ['a7', 'd7', 'g7']
      const moveRes = game.movePiece('W', 'g4', 'g7');
      expect(moveRes.success).toBe(true);
      expect(moveRes.millFormed).toBe(true);
      expect(game.awaitingRemoval).toBe(true);

      // Remove opponent piece at 'c5'
      const remRes = game.removePiece('W', 'c5');
      expect(remRes.success).toBe(true);
      expect(game.board['c5']).toBeNull();
      expect(game.piecesOnBoard.B).toBe(3);
    });
  });

  describe('Phase 3: Springen (Jumping / Flying)', () => {
    beforeEach(() => {
      game.phase = 'MOVING';
      game.unplacedPieces.W = 0;
      game.unplacedPieces.B = 0;
      game.piecesOnBoard.W = 3; // White can fly!
      game.piecesOnBoard.B = 5; // Black cannot fly
    });

    test('allows player with 3 pieces to jump to any vacant spot', () => {
      game.board['a1'] = 'W';
      game.board['b2'] = 'W';
      game.board['c3'] = 'W';
      game.turn = 'W';

      expect(game.canJump('W')).toBe(true);
      expect(game.canJump('B')).toBe(false);

      // Jump from a1 to g7 (not adjacent!)
      const res = game.movePiece('W', 'a1', 'g7');
      expect(res.success).toBe(true);
      expect(game.board['a1']).toBeNull();
      expect(game.board['g7']).toBe('W');
      expect(game.turn).toBe('B');
    });

    test('player with > 3 pieces still cannot jump', () => {
      game.turn = 'B';
      game.board['d7'] = 'B';

      // B tries to jump from d7 to a1
      const res = game.movePiece('B', 'd7', 'a1');
      expect(res.success).toBe(false);
    });
  });

  describe('Win and Loss Conditions', () => {
    test('player wins when opponent is reduced to 2 pieces', () => {
      game.phase = 'MOVING';
      game.unplacedPieces.W = 0;
      game.unplacedPieces.B = 0;
      game.piecesOnBoard.W = 3;
      game.piecesOnBoard.B = 3;

      game.board['a7'] = 'W';
      game.board['d7'] = 'W';
      game.board['g7'] = 'W';
      game.board['a1'] = 'B';
      game.board['d1'] = 'B';
      game.board['g1'] = 'B';

      game.turn = 'W';
      game.awaitingRemoval = true;

      // W removes B's piece at 'a1' -> B now has 2 pieces
      const res = game.removePiece('W', 'a1');
      expect(res.success).toBe(true);
      expect(game.piecesOnBoard.B).toBe(2);
      expect(game.winner).toBe('W');
      expect(game.phase).toBe('FINISHED');
      expect(game.winReason).toContain('weniger als 3 Steine');
    });

    test('player wins when opponent has no legal moves left (trapped)', () => {
      game.phase = 'MOVING';
      game.unplacedPieces.W = 0;
      game.unplacedPieces.B = 0;
      game.piecesOnBoard.W = 4;
      game.piecesOnBoard.B = 4;

      // Trap Black's stone at a7:
      // a7 connects only to d7 and a4.
      // If B is at a7, and W blocks d7 and a4, B has no moves from a7.
      // Let's place all of B's pieces so they have no open neighbors:
      game.board['a7'] = 'B';
      game.board['d7'] = 'W';
      game.board['a4'] = 'W';

      // Place remaining B pieces also blocked:
      // g7 connects to d7 (W) and g4. Put W on g4.
      game.board['g7'] = 'B';
      game.board['g4'] = 'W';

      // a1 connects to a4 (W) and d1. Put W on d1.
      game.board['a1'] = 'B';
      game.board['d1'] = 'W';

      // B has 3 pieces: a7, g7, a1. BUT wait, if B has 3 pieces, B can jump!
      // So give B 4 pieces:
      // g1 connects to g4 (W) and d1 (W). Put B on g1.
      game.board['g1'] = 'B';
      game.board['d1'] = 'W';
      game.board['g4'] = 'W';

      // W makes a move that passes turn to B
      // Let W move d6 to d5 (not affecting the trap)
      game.board['d6'] = 'W';
      game.turn = 'W';

      const moveRes = game.movePiece('W', 'd6', 'd5');
      expect(moveRes.success).toBe(true);

      // Now it's B's turn, but B has 4 pieces on [a7, g7, a1, g1] and ALL neighbors are occupied by W!
      // B has no legal moves!
      expect(game.winner).toBe('W');
      expect(game.phase).toBe('FINISHED');
      expect(game.winReason).toContain('eingesperrt');
    });

    test('forfeit gives immediate victory to opponent', () => {
      const res = game.forfeit('W');
      expect(res.success).toBe(true);
      expect(game.winner).toBe('B');
      expect(game.phase).toBe('FINISHED');
    });
  });
});
