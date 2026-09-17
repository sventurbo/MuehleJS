const { GameManager } = require('../lib/GameManager');

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

