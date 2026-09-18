const { GameManager, DEFAULT_TURN_TIMEOUT_MS } = require('../lib/GameManager');

describe('GameManager Matchmaking & Session Management', () => {
  let ioMock;
  let roomEmitMock;
  let gameManager;

  const createMockSocket = (id) => ({
    id,
    connected: true,
    join: jest.fn(),
    emit: jest.fn()
  });

  beforeEach(() => {
    roomEmitMock = jest.fn();
    ioMock = {
      to: jest.fn().mockReturnValue({ emit: roomEmitMock })
    };
    gameManager = new GameManager(ioMock);
  });

  test('enqueuing a single player puts them in queue and emits queueWaiting', () => {
    const socket1 = createMockSocket('sock_1');
    gameManager.enqueuePlayer(socket1, 'Alice');

    expect(gameManager.waitingQueue.length).toBe(1);
    expect(socket1.emit).toHaveBeenCalledWith('queueWaiting', expect.objectContaining({
      position: 1
    }));
  });

  test('enqueuing a second player creates a game and emits gameStart to both', () => {
    const socket1 = createMockSocket('sock_1');
    const socket2 = createMockSocket('sock_2');

    gameManager.enqueuePlayer(socket1, 'Alice');
    gameManager.enqueuePlayer(socket2, 'Bob');

    expect(gameManager.waitingQueue.length).toBe(0);
    expect(gameManager.games.size).toBe(1);

    expect(socket1.join).toHaveBeenCalled();
    expect(socket2.join).toHaveBeenCalled();

    expect(socket1.emit).toHaveBeenCalledWith('gameStart', expect.objectContaining({
      state: expect.any(Object)
    }));
    expect(socket2.emit).toHaveBeenCalledWith('gameStart', expect.objectContaining({
      state: expect.any(Object)
    }));

    const p1Color = socket1.emit.mock.calls.find(c => c[0] === 'gameStart')[1].yourColor;
    const p2Color = socket2.emit.mock.calls.find(c => c[0] === 'gameStart')[1].yourColor;
    expect(['W', 'B']).toContain(p1Color);
    expect(['W', 'B']).toContain(p2Color);
    expect(p1Color).not.toBe(p2Color);
  });

  test('disconnect while waiting removes player from queue', () => {
    const socket1 = createMockSocket('sock_1');
    gameManager.enqueuePlayer(socket1, 'Alice');
    expect(gameManager.waitingQueue.length).toBe(1);

    gameManager.handlePlayerDisconnect('sock_1');
    expect(gameManager.waitingQueue.length).toBe(0);
  });

  test('disconnect during active game declares remaining player winner and cleans up session', () => {
    const socket1 = createMockSocket('sock_1');
    const socket2 = createMockSocket('sock_2');

    gameManager.enqueuePlayer(socket1, 'Alice');
    gameManager.enqueuePlayer(socket2, 'Bob');

    const gameId = gameManager.socketMap.get('sock_1').gameId;
    expect(gameManager.games.has(gameId)).toBe(true);

    // Alice disconnects
    gameManager.handlePlayerDisconnect('sock_1');

    // Bob should receive opponentDisconnected
    expect(socket2.emit).toHaveBeenCalledWith('opponentDisconnected', expect.objectContaining({
      winReason: expect.stringContaining('Verbindung getrennt')
    }));

    // Game session is cleaned up
    expect(gameManager.games.has(gameId)).toBe(false);
  });

  describe('leaving a session (Abbrechen / Zurück zur Startseite)', () => {
    test('leaveGame removes a waiting player from the queue', () => {
      const socket1 = createMockSocket('sock_1');
      gameManager.enqueuePlayer(socket1, 'Alice');
      expect(gameManager.waitingQueue.length).toBe(1);

      gameManager.leaveGame('sock_1');

      // Regression: the player stayed queued and was pulled into a game from
      // the login screen as soon as the next player signed in.
      expect(gameManager.waitingQueue.length).toBe(0);

      const socket2 = createMockSocket('sock_2');
      gameManager.enqueuePlayer(socket2, 'Bob');
      expect(socket1.emit).not.toHaveBeenCalledWith('gameStart', expect.anything());
      expect(gameManager.games.size).toBe(0);
    });

    test('leaveGame during a running game notifies the opponent and frees the session', () => {
      const socket1 = createMockSocket('sock_1');
      const socket2 = createMockSocket('sock_2');
      gameManager.enqueuePlayer(socket1, 'Alice');
      gameManager.enqueuePlayer(socket2, 'Bob');
      const gameId = gameManager.socketMap.get('sock_1').gameId;

      gameManager.leaveGame('sock_1');

      expect(socket2.emit).toHaveBeenCalledWith('opponentDisconnected', expect.objectContaining({
        winReason: expect.stringContaining('verlassen')
      }));
      // Regression: the session used to stay in `games` forever, so a client
      // could exhaust maxActiveGames by looping login + leaveGame.
      expect(gameManager.games.has(gameId)).toBe(false);
      expect(gameManager.socketMap.size).toBe(0);
    });

    test('leaveGame after a finished game frees the session without a second winner', () => {
      const socket1 = createMockSocket('sock_1');
      const socket2 = createMockSocket('sock_2');
      gameManager.enqueuePlayer(socket1, 'Alice');
      gameManager.enqueuePlayer(socket2, 'Bob');
      const gameId = gameManager.socketMap.get('sock_1').gameId;

      gameManager.handleForfeit(socket1);
      socket2.emit.mockClear();

      gameManager.leaveGame('sock_1');

      expect(socket2.emit).not.toHaveBeenCalledWith('opponentDisconnected', expect.anything());
      expect(gameManager.games.has(gameId)).toBe(false);
    });

    test('a session is never orphaned when both players leave a running game', () => {
      const socket1 = createMockSocket('sock_1');
      const socket2 = createMockSocket('sock_2');
      gameManager.enqueuePlayer(socket1, 'Alice');
      gameManager.enqueuePlayer(socket2, 'Bob');

      gameManager.leaveGame('sock_1');
      gameManager.leaveGame('sock_2');
      gameManager.handlePlayerDisconnect('sock_1');
      gameManager.handlePlayerDisconnect('sock_2');

      expect(gameManager.games.size).toBe(0);
      expect(gameManager.getStats().activeGames).toBe(0);
    });
  });

  describe('actions on a session the server no longer knows', () => {
    const expectGameNotFound = (socket) => {
      expect(socket.emit).toHaveBeenCalledWith('gameNotFound', expect.objectContaining({
        message: expect.any(String)
      }));
    };

    test('placePiece answers gameNotFound instead of staying silent', () => {
      const socket = createMockSocket('sock_lost');
      gameManager.handlePlacePiece(socket, 'a7');
      expectGameNotFound(socket);
    });

    test('movePiece answers gameNotFound', () => {
      const socket = createMockSocket('sock_lost');
      gameManager.handleMovePiece(socket, 'a7', 'd7');
      expectGameNotFound(socket);
    });

    test('removePiece answers gameNotFound', () => {
      const socket = createMockSocket('sock_lost');
      gameManager.handleRemovePiece(socket, 'a7');
      expectGameNotFound(socket);
    });

    test('forfeit answers gameNotFound', () => {
      const socket = createMockSocket('sock_lost');
      gameManager.handleForfeit(socket);
      expectGameNotFound(socket);
    });

    test('a player whose opponent left is told the game is gone', () => {
      const socket1 = createMockSocket('sock_1');
      const socket2 = createMockSocket('sock_2');
      gameManager.enqueuePlayer(socket1, 'Alice');
      gameManager.enqueuePlayer(socket2, 'Bob');

      gameManager.handlePlayerDisconnect('sock_1');
      socket2.emit.mockClear();

      gameManager.handlePlacePiece(socket2, 'a7');
      expectGameNotFound(socket2);
    });
  });

  describe('turn timer (25 s per decision, enforced server-side)', () => {
    let manager;

    /**
     * Pairs two fresh sockets and hands back everything a timer test needs:
     * the session, and the sockets addressed by the colour they were dealt.
     */
    const startGame = (gameManagerInstance, idA, idB) => {
      const socketA = createMockSocket(idA);
      const socketB = createMockSocket(idB);
      gameManagerInstance.enqueuePlayer(socketA, 'Alice');
      gameManagerInstance.enqueuePlayer(socketB, 'Bob');

      const gameId = gameManagerInstance.socketMap.get(idA).gameId;
      const session = gameManagerInstance.games.get(gameId);

      return {
        gameId,
        session,
        game: session.game,
        socketOf: (color) => session.players[color].socket
      };
    };

    const emittedTo = (event) => roomEmitMock.mock.calls.filter(call => call[0] === event);

    beforeEach(() => {
      // Fake timers have to be in place before the manager exists, so every
      // timer it owns (turn clock and limiter cleanup) is under test control.
      jest.useFakeTimers();
      manager = new GameManager(ioMock);
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    test('the default is 25 seconds, and an unusable setting cannot switch it off', () => {
      expect(DEFAULT_TURN_TIMEOUT_MS).toBe(25000);
      expect(manager.turnTimeoutMs).toBe(25000);
      expect(new GameManager(ioMock, { turnTimeoutMs: 'bald' }).turnTimeoutMs).toBe(25000);
      expect(new GameManager(ioMock, { turnTimeoutMs: 0 }).turnTimeoutMs).toBe(25000);
      expect(new GameManager(ioMock, { turnTimeoutMs: -1000 }).turnTimeoutMs).toBe(25000);
      expect(new GameManager(ioMock, { turnTimeoutMs: '5000' }).turnTimeoutMs).toBe(5000);
    });

    test('a new game starts its clock and announces it to both players', () => {
      const { gameId, session } = startGame(manager, 'sock_1', 'sock_2');

      expect(session.turnTimer).not.toBeNull();
      expect(session.turnDeadline).toBe(Date.now() + 25000);
      expect(ioMock.to).toHaveBeenCalledWith(gameId);
      expect(roomEmitMock).toHaveBeenCalledWith('turnTimer', expect.objectContaining({
        turn: 'W',
        durationMs: 25000,
        remainingMs: 25000
      }));
    });

    test('nothing happens while the 25 seconds are still running', () => {
      const { game } = startGame(manager, 'sock_1', 'sock_2');

      jest.advanceTimersByTime(24999);

      expect(game.moveHistory).toHaveLength(0);
      expect(emittedTo('turnTimeout')).toHaveLength(0);
    });

    test('after 25 seconds the server plays a legal move for the player on turn', () => {
      const { game } = startGame(manager, 'sock_1', 'sock_2');
      const legalBefore = game.getLegalActions('W');

      jest.advanceTimersByTime(25000);

      // Exactly one move was played, by the engine, for the player who timed out.
      expect(game.moveHistory).toHaveLength(1);
      const played = game.moveHistory[0];
      expect(played.player).toBe('W');
      expect(played.action).toBe('place');
      // ... and it is one of the moves that were legal a moment earlier.
      expect(legalBefore.some(a => a.action === 'place' && a.point === played.point)).toBe(true);
      expect(game.board[played.point]).toBe('W');
      expect(game.turn).toBe('B');
    });

    test('the automatic move is logged in the move history as automatic', () => {
      const { game } = startGame(manager, 'sock_1', 'sock_2');

      jest.advanceTimersByTime(25000);

      expect(game.moveHistory[0]).toEqual(expect.objectContaining({
        action: 'place',
        player: 'W',
        auto: true
      }));
    });

    test('both clients are told which move was played for them', () => {
      const { gameId, game } = startGame(manager, 'sock_1', 'sock_2');

      jest.advanceTimersByTime(25000);

      const point = game.moveHistory[0].point;
      expect(ioMock.to).toHaveBeenCalledWith(gameId);
      expect(roomEmitMock).toHaveBeenCalledWith('turnTimeout', expect.objectContaining({
        player: 'W',
        timeoutMs: 25000,
        autoMove: expect.objectContaining({ action: 'place', player: 'W', point }),
        message: expect.any(String)
      }));
      // The state update carries the same flag, so the move log can mark it.
      expect(roomEmitMock).toHaveBeenCalledWith('gameStateUpdate', expect.objectContaining({
        lastAction: expect.objectContaining({ action: 'place', auto: true })
      }));
    });

    test('every executed move resets the clock', () => {
      const { session, game, socketOf } = startGame(manager, 'sock_1', 'sock_2');

      jest.advanceTimersByTime(20000);
      manager.handlePlacePiece(socketOf('W'), 'a7');
      expect(game.moveHistory).toHaveLength(1);
      expect(session.turnDeadline).toBe(Date.now() + 25000);

      // 40 s after the game started, but only 20 s after the last move: the
      // clock was restarted, so Black still has time.
      jest.advanceTimersByTime(20000);
      expect(game.moveHistory).toHaveLength(1);

      jest.advanceTimersByTime(5000);
      expect(game.moveHistory).toHaveLength(2);
      expect(game.moveHistory[1]).toEqual(expect.objectContaining({ player: 'B', auto: true }));
    });

    test('the capture after a closed mill is timed as well', () => {
      const { game, socketOf } = startGame(manager, 'sock_1', 'sock_2');

      // White closes a7-d7-g7; Black's stones stay outside any mill.
      manager.handlePlacePiece(socketOf('W'), 'a7');
      manager.handlePlacePiece(socketOf('B'), 'b6');
      manager.handlePlacePiece(socketOf('W'), 'd7');
      manager.handlePlacePiece(socketOf('B'), 'b4');
      manager.handlePlacePiece(socketOf('W'), 'g7');

      expect(game.awaitingRemoval).toBe(true);
      const removable = game.getRemovablePieces('W');

      jest.advanceTimersByTime(25000);

      expect(game.awaitingRemoval).toBe(false);
      expect(game.capturedPieces.B).toBe(1);
      const captured = game.moveHistory[game.moveHistory.length - 1];
      expect(captured).toEqual(expect.objectContaining({ action: 'remove', player: 'W', auto: true }));
      expect(removable).toContain(captured.point);
      expect(game.turn).toBe('B');
    });

    test('a game played entirely on the clock stays a legal game', () => {
      const { game } = startGame(manager, 'sock_1', 'sock_2');

      // 40 expirations carry the game well past the setting phase.
      for (let i = 0; i < 40 && !game.winner; i++) {
        const legalBefore = game.getLegalActions(game.turn);
        const historyBefore = game.moveHistory.length;

        jest.advanceTimersByTime(25000);

        expect(game.moveHistory).toHaveLength(historyBefore + 1);
        const played = game.moveHistory[historyBefore];
        expect(legalBefore).toContainEqual(expect.objectContaining({
          action: played.action,
          ...(played.action === 'move' ? { from: played.from, to: played.to } : { point: played.point })
        }));
      }

      // The board the engine ends up with still matches its own counters.
      const state = game.getState();
      ['W', 'B'].forEach(color => {
        const onBoard = Object.values(state.board).filter(v => v === color).length;
        expect(state.piecesOnBoard[color]).toBe(onBoard);
      });
    });

    test('parallel games keep independent clocks', () => {
      const first = startGame(manager, 'sock_1', 'sock_2');
      const second = startGame(manager, 'sock_3', 'sock_4');
      expect(first.gameId).not.toBe(second.gameId);

      jest.advanceTimersByTime(20000);
      manager.handlePlacePiece(first.socketOf('W'), 'a7');

      jest.advanceTimersByTime(6000);

      // Only the second game ran out of time; the first one was reset by its move.
      expect(first.game.moveHistory).toHaveLength(1);
      expect(first.game.moveHistory[0].auto).toBeUndefined();
      expect(second.game.moveHistory).toHaveLength(1);
      expect(second.game.moveHistory[0].auto).toBe(true);
    });

    test('a disconnect during the countdown stops the clock instead of firing into a dead game', () => {
      const { session, socketOf } = startGame(manager, 'sock_1', 'sock_2');
      const whiteId = socketOf('W').id;

      manager.handlePlayerDisconnect(whiteId);
      roomEmitMock.mockClear();

      expect(session.turnTimer).toBeNull();
      expect(manager.games.size).toBe(0);
      expect(() => jest.advanceTimersByTime(120000)).not.toThrow();
      expect(emittedTo('turnTimeout')).toHaveLength(0);
    });

    test('a finished game gets no new clock', () => {
      const { session, socketOf } = startGame(manager, 'sock_1', 'sock_2');

      manager.handleForfeit(socketOf('W'));
      roomEmitMock.mockClear();

      expect(session.turnTimer).toBeNull();
      jest.advanceTimersByTime(60000);
      expect(emittedTo('turnTimeout')).toHaveLength(0);
      expect(emittedTo('turnTimer')).toHaveLength(0);
    });

    test('a timeout for a session the server no longer knows is a no-op', () => {
      expect(() => manager.handleTurnTimeout('game_does_not_exist')).not.toThrow();
      expect(manager.handleTurnTimeout('game_does_not_exist')).toEqual({
        success: false,
        error: expect.any(String)
      });
    });

    test('the turn time is configurable for the whole server', () => {
      const fastManager = new GameManager(ioMock, { turnTimeoutMs: 1000 });
      const { game } = startGame(fastManager, 'sock_fast_1', 'sock_fast_2');

      jest.advanceTimersByTime(999);
      expect(game.moveHistory).toHaveLength(0);

      jest.advanceTimersByTime(1);
      expect(game.moveHistory).toHaveLength(1);
    });
  });

  test('chat messages are broadcast to the room', () => {
    const socket1 = createMockSocket('sock_1');
    const socket2 = createMockSocket('sock_2');

    gameManager.enqueuePlayer(socket1, 'Alice');
    gameManager.enqueuePlayer(socket2, 'Bob');

    const gameId = gameManager.socketMap.get('sock_1').gameId;

    gameManager.handleChatMessage(socket1, 'Hallo Bob!');
    expect(ioMock.to).toHaveBeenCalledWith(gameId);
    expect(roomEmitMock).toHaveBeenCalledWith('chatMessage', expect.objectContaining({
      sender: 'Alice',
      text: 'Hallo Bob!'
    }));
  });
});

