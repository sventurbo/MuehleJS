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

