const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const { GameManager } = require('../lib/GameManager');
const fs = require('fs');
const path = require('path');

describe('Full Server & Socket.io Integration Flow', () => {
  let httpServer;
  let ioServer;
  let gameManager;
  let port;
  let client1;
  let client2;

  beforeAll((done) => {
    const app = express();
    httpServer = http.createServer(app);
    ioServer = new Server(httpServer);
    gameManager = new GameManager(ioServer);

    ioServer.on('connection', (socket) => {
      socket.on('login', (data) => gameManager.enqueuePlayer(socket, data ? data.username : ''));
      socket.on('placePiece', (data) => gameManager.handlePlacePiece(socket, data.point));
      socket.on('movePiece', (data) => gameManager.handleMovePiece(socket, data.from, data.to));
      socket.on('removePiece', (data) => gameManager.handleRemovePiece(socket, data.point));
      socket.on('chatMessage', (data) => gameManager.handleChatMessage(socket, data.text));
      socket.on('disconnect', () => gameManager.handlePlayerDisconnect(socket.id));
    });

    httpServer.listen(0, '127.0.0.1', () => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (client1 && client1.connected) client1.disconnect();
    if (client2 && client2.connected) client2.disconnect();
    ioServer.close();
    httpServer.close(done);
  });

  test('Matchmaking pairs two clients and plays through a move', (done) => {
    client1 = Client(`http://127.0.0.1:${port}`);
    client2 = Client(`http://127.0.0.1:${port}`);

    let p1Data = null;
    let p2Data = null;

    client1.on('connect', () => {
      client1.emit('login', { username: 'SpielerAlpha' });
    });

    client1.on('queueWaiting', (data) => {
      expect(data.position).toBe(1);
      // Once client1 is waiting, connect client2
      client2.emit('login', { username: 'SpielerBeta' });
    });

    let gamesStarted = 0;
    const checkGameStart = () => {
      gamesStarted++;
      if (gamesStarted === 2) {
        // Both received gameStart
        expect(p1Data.gameId).toBe(p2Data.gameId);
        expect(p1Data.yourColor).not.toBe(p2Data.yourColor);

        // Identify who is White ('W') and places first
        const whiteClient = (p1Data.yourColor === 'W') ? client1 : client2;
        const blackClient = (p1Data.yourColor === 'W') ? client2 : client1;

        // White places on 'a1'
        whiteClient.emit('placePiece', { point: 'a1' });

        // Both clients should receive gameStateUpdate
        blackClient.once('gameStateUpdate', (update) => {
          expect(update.state.board['a1']).toBe('W');
          expect(update.state.turn).toBe('B');
          expect(update.lastAction.action).toBe('place');
          done();
        });
      }
    };

    client1.on('gameStart', (data) => {
      p1Data = data;
      checkGameStart();
    });

    client2.on('gameStart', (data) => {
      p2Data = data;
      checkGameStart();
    });
  });

  test('Opponent disconnect notifies remaining player', (done) => {
    // If client2 disconnects, client1 should receive opponentDisconnected
    client1.once('opponentDisconnected', (data) => {
      expect(data.winReason).toContain('Verbindung getrennt');
      done();
    });

    client2.disconnect();
  });
});

describe('Turn timer over the socket interface', () => {
  // A short turn keeps the test fast; the server treats it exactly like the
  // 25 s it runs with in production.
  const TURN_TIMEOUT_MS = 400;

  let httpServer;
  let ioServer;
  let gameManager;
  let port;
  let clientA;
  let clientB;

  beforeAll((done) => {
    const app = express();
    httpServer = http.createServer(app);
    ioServer = new Server(httpServer);
    gameManager = new GameManager(ioServer, { turnTimeoutMs: TURN_TIMEOUT_MS });

    ioServer.on('connection', (socket) => {
      socket.on('login', (data) => gameManager.enqueuePlayer(socket, data ? data.username : ''));
      socket.on('placePiece', (data) => gameManager.handlePlacePiece(socket, data.point));
      socket.on('disconnect', () => gameManager.handlePlayerDisconnect(socket.id));
    });

    httpServer.listen(0, '127.0.0.1', () => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (clientA && clientA.connected) clientA.disconnect();
    if (clientB && clientB.connected) clientB.disconnect();
    ioServer.close();
    httpServer.close(done);
  });

  /** Resolves with the first `event` a client receives. */
  const nextEvent = (client, event) => new Promise(resolve => client.once(event, resolve));

  /**
   * Pairs two clients and resolves once both are in the game, so a test can
   * start from a running session.
   *
   * The listeners for the opening `turnTimer` are attached before the login, so
   * the announcement that arrives together with `gameStart` is not missed.
   */
  const pairClients = () => {
    clientA = Client(`http://127.0.0.1:${port}`);
    clientB = Client(`http://127.0.0.1:${port}`);

    const openings = {
      a: nextEvent(clientA, 'gameStart'),
      b: nextEvent(clientB, 'gameStart'),
      timerA: nextEvent(clientA, 'turnTimer'),
      timerB: nextEvent(clientB, 'turnTimer')
    };

    clientA.on('connect', () => clientA.emit('login', { username: 'Alice' }));
    clientA.on('queueWaiting', () => clientB.emit('login', { username: 'Bob' }));

    return Promise.all([openings.a, openings.b]).then(([a, b]) => ({
      a,
      b,
      timerA: openings.timerA,
      timerB: openings.timerB
    }));
  };

  test('nobody moves: the timer expires and both clients see the automatic move', async () => {
    const started = await pairClients();

    // Both clients are told how long the player on turn has.
    const announcements = await Promise.all([started.timerA, started.timerB]);
    announcements.forEach(announcement => {
      expect(announcement).toEqual(expect.objectContaining({
        turn: 'W',
        durationMs: TURN_TIMEOUT_MS
      }));
    });

    // Neither client sends a move; the server has to play for White.
    const [timeoutA, timeoutB, updateA, updateB] = await Promise.all([
      nextEvent(clientA, 'turnTimeout'),
      nextEvent(clientB, 'turnTimeout'),
      nextEvent(clientA, 'gameStateUpdate'),
      nextEvent(clientB, 'gameStateUpdate')
    ]);

    // Both sides learn who ran out of time and which move was played for them.
    [timeoutA, timeoutB].forEach(event => {
      expect(event.player).toBe('W');
      expect(event.timeoutMs).toBe(TURN_TIMEOUT_MS);
      expect(event.autoMove).toEqual(expect.objectContaining({ action: 'place', player: 'W' }));
      expect(typeof event.message).toBe('string');
    });
    expect(timeoutA.autoMove.point).toBe(timeoutB.autoMove.point);

    // The move really happened, on a point that was free, and the turn moved on.
    [updateA, updateB].forEach(update => {
      expect(update.lastAction).toEqual(expect.objectContaining({ action: 'place', auto: true }));
      expect(update.state.board[timeoutA.autoMove.point]).toBe('W');
      expect(update.state.moveCount).toBe(1);
      expect(update.state.turn).toBe('B');
    });

    // Both clients are in the same game, so both saw the same session.
    expect(started.a.gameId).toBe(started.b.gameId);
    expect(started.a.yourColor).not.toBe(started.b.yourColor);
  });

  test('a move made in time keeps the server from playing that turn', async () => {
    const started = await pairClients();
    const whiteClient = started.a.yourColor === 'W' ? clientA : clientB;
    const blackClient = started.a.yourColor === 'W' ? clientB : clientA;

    whiteClient.emit('placePiece', { point: 'a7' });

    const update = await nextEvent(blackClient, 'gameStateUpdate');
    expect(update.lastAction.auto).toBeUndefined();
    expect(update.state.board['a7']).toBe('W');

    // Black now owns the clock: the next automatic move is Black's, not a
    // second one for White.
    const timeout = await nextEvent(whiteClient, 'turnTimeout');
    expect(timeout.player).toBe('B');
  });

  afterEach(() => {
    if (clientA && clientA.connected) clientA.disconnect();
    if (clientB && clientB.connected) clientB.disconnect();
  });
});

describe('Turn timer UI', () => {
  let htmlContent;
  let appJs;

  beforeAll(() => {
    htmlContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  });

  test('the HUD carries a countdown element', () => {
    expect(htmlContent).toContain('id="hud-turn-timer"');
    expect(htmlContent).toContain('id="hud-timer-value"');
    expect(htmlContent).toContain('id="hud-timer-arc"');
  });

  test('the countdown is fed by the server events', () => {
    expect(appJs).toContain("this.socket.on('turnTimer'");
    expect(appJs).toContain("this.socket.on('turnTimeout'");
  });

  test('the client only displays the clock and never plays on it', () => {
    // Everything between the countdown helpers: if a move were emitted from a
    // browser timer, the 25 s limit would be as manipulable as the client.
    const countdown = appJs.slice(
      appJs.indexOf('_startTurnCountdown(data) {'),
      appJs.indexOf('_colorName(color) {')
    );
    expect(countdown.length).toBeGreaterThan(0);
    expect(countdown).not.toContain('socket.emit');
    expect(countdown).toContain('setInterval');
  });

  test('a move the server played for a player is marked in the log', () => {
    expect(appJs).toContain("const autoSuffix = lastAction.auto ? ' (automatisch)' : '';");
  });
});

describe('Game Over Modal UI (Issue #8)', () => {
  let htmlContent;

  beforeAll(() => {
    htmlContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  });

  test('Button "Erneut Spielen" label exists and old label is removed', () => {
    expect(htmlContent).toContain('>Erneut Spielen<');
    expect(htmlContent).not.toContain('Erneut an Start gehen');
  });

  test('Button "Erneut Spielen" does not contain icon emoji', () => {
    const btnMatch = htmlContent.match(/id="btn-play-again"[^>]*>([\s\S]*?)<\/button>/);
    expect(btnMatch).toBeTruthy();
    expect(btnMatch[1]).not.toContain('🔄');
  });
});

