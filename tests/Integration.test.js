import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';
import { GameManager } from '../lib/GameManager.js';
import fs from 'node:fs';
import path from 'node:path';
import { loadStylesheet } from '../scripts/css-bundle.js';

describe('Full Server & Socket.io Integration Flow', () => {
  let httpServer;
  let ioServer;
  let gameManager;
  let port;
  let client1;
  let client2;

  beforeAll(done => {
    const app = express();
    httpServer = http.createServer(app);
    ioServer = new Server(httpServer);
    gameManager = new GameManager(ioServer);

    ioServer.on('connection', socket => {
      socket.on('login', data => gameManager.enqueuePlayer(socket, data ? data.username : ''));
      socket.on('placePiece', data => gameManager.handlePlacePiece(socket, data.point));
      socket.on('movePiece', data => gameManager.handleMovePiece(socket, data.from, data.to));
      socket.on('removePiece', data => gameManager.handleRemovePiece(socket, data.point));
      socket.on('chatMessage', data => gameManager.handleChatMessage(socket, data.text));
      socket.on('disconnect', () => gameManager.handlePlayerDisconnect(socket.id));
    });

    httpServer.listen(0, '127.0.0.1', () => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll(done => {
    if (client1 && client1.connected) client1.disconnect();
    if (client2 && client2.connected) client2.disconnect();
    ioServer.close();
    httpServer.close(done);
  });

  test('Matchmaking pairs two clients and plays through a move', done => {
    client1 = Client(`http://127.0.0.1:${port}`);
    client2 = Client(`http://127.0.0.1:${port}`);

    let p1Data = null;
    let p2Data = null;

    client1.on('connect', () => {
      client1.emit('login', { username: 'SpielerAlpha' });
    });

    client1.on('queueWaiting', data => {
      expect(data.position).toBe(1);
      client2.emit('login', { username: 'SpielerBeta' });
    });

    let gamesStarted = 0;
    const checkGameStart = () => {
      gamesStarted++;
      if (gamesStarted === 2) {
        expect(p1Data.gameId).toBe(p2Data.gameId);
        expect(p1Data.yourColor).not.toBe(p2Data.yourColor);

        const whiteClient = p1Data.yourColor === 'W' ? client1 : client2;
        const blackClient = p1Data.yourColor === 'W' ? client2 : client1;

        whiteClient.emit('placePiece', { point: 'a1' });

        blackClient.once('gameStateUpdate', update => {
          expect(update.state.board['a1']).toBe('W');
          expect(update.state.turn).toBe('B');
          expect(update.lastAction.action).toBe('place');
          done();
        });
      }
    };

    client1.on('gameStart', data => {
      p1Data = data;
      checkGameStart();
    });

    client2.on('gameStart', data => {
      p2Data = data;
      checkGameStart();
    });
  });

  test('Opponent disconnect notifies remaining player', done => {
    client1.once('opponentDisconnected', data => {
      expect(data.endReason).toContain('Verbindung getrennt');
      done();
    });

    client2.disconnect();
  });
});

describe('Game rooms over the socket interface', () => {
  let httpServer;
  let ioServer;
  let gameManager;
  let url;
  const clients = [];

  beforeAll(done => {
    httpServer = http.createServer(express());
    ioServer = new Server(httpServer);
    gameManager = new GameManager(ioServer);

    ioServer.on('connection', socket => {
      socket.on('login', data => gameManager.enqueuePlayer(socket, data.username));
      socket.on('forfeit', () => gameManager.handleForfeit(socket));
      socket.on('leaveGame', () => gameManager.leaveGame(socket.id));
      socket.on('chatMessage', data => gameManager.handleChatMessage(socket, data.text));
      socket.on('disconnect', () => gameManager.handlePlayerDisconnect(socket.id));
    });

    httpServer.listen(0, '127.0.0.1', () => {
      url = `http://127.0.0.1:${httpServer.address().port}`;
      done();
    });
  });

  afterAll(done => {
    clients.forEach(client => client.disconnect());
    ioServer.close();
    httpServer.close(done);
  });

  const nextEvent = (client, event) => new Promise(resolve => client.once(event, resolve));

  const connect = () => {
    const client = Client(url);
    clients.push(client);
    return nextEvent(client, 'connect').then(() => client);
  };

  const pair = async ([first, firstName], [second, secondName]) => {
    const started = Promise.all([nextEvent(first, 'gameStart'), nextEvent(second, 'gameStart')]);
    first.emit('login', { username: firstName });
    await nextEvent(first, 'queueWaiting');
    second.emit('login', { username: secondName });
    await started;
  };

  test('chat from a finished game does not follow a player into the next one', async () => {
    const [alice, bob, carol] = await Promise.all([connect(), connect(), connect()]);

    await pair([alice, 'Alice'], [bob, 'Bob']);
    const gameOver = nextEvent(alice, 'gameOver');
    bob.emit('forfeit');
    await gameOver;
    alice.emit('leaveGame');

    await pair([alice, 'Alice'], [carol, 'Carol']);
    const firstChat = nextEvent(alice, 'chatMessage');
    bob.emit('chatMessage', { text: 'Bob aus der alten Partie' });
    // The server handles Bob's events in order: once he hears back, his chat is through.
    bob.emit('forfeit');
    await nextEvent(bob, 'gameNotFound');
    carol.emit('chatMessage', { text: 'Carol in der neuen Partie' });

    expect(await firstChat).toMatchObject({ sender: 'Carol', text: 'Carol in der neuen Partie' });
  });
});

describe('Turn timer over the socket interface', () => {
  const TURN_TIMEOUT_MS = 400;

  let httpServer;
  let ioServer;
  let gameManager;
  let port;
  let clientA;
  let clientB;

  beforeAll(done => {
    const app = express();
    httpServer = http.createServer(app);
    ioServer = new Server(httpServer);
    gameManager = new GameManager(ioServer, { turnTimeoutMs: TURN_TIMEOUT_MS });

    ioServer.on('connection', socket => {
      socket.on('login', data => gameManager.enqueuePlayer(socket, data ? data.username : ''));
      socket.on('placePiece', data => gameManager.handlePlacePiece(socket, data.point));
      socket.on('disconnect', () => gameManager.handlePlayerDisconnect(socket.id));
    });

    httpServer.listen(0, '127.0.0.1', () => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll(done => {
    if (clientA && clientA.connected) clientA.disconnect();
    if (clientB && clientB.connected) clientB.disconnect();
    ioServer.close();
    httpServer.close(done);
  });

  const nextEvent = (client, event) => new Promise(resolve => client.once(event, resolve));

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

    const announcements = await Promise.all([started.timerA, started.timerB]);
    announcements.forEach(announcement => {
      expect(announcement).toEqual(
        expect.objectContaining({
          turn: 'W',
          durationMs: TURN_TIMEOUT_MS
        })
      );
    });

    const [timeoutA, timeoutB, updateA, updateB] = await Promise.all([
      nextEvent(clientA, 'turnTimeout'),
      nextEvent(clientB, 'turnTimeout'),
      nextEvent(clientA, 'gameStateUpdate'),
      nextEvent(clientB, 'gameStateUpdate')
    ]);

    [timeoutA, timeoutB].forEach(event => {
      expect(event.player).toBe('W');
      expect(event.timeoutMs).toBe(TURN_TIMEOUT_MS);
      expect(event.autoMove).toEqual(expect.objectContaining({ action: 'place', player: 'W' }));
      expect(typeof event.message).toBe('string');
    });
    expect(timeoutA.autoMove.point).toBe(timeoutB.autoMove.point);

    [updateA, updateB].forEach(update => {
      expect(update.lastAction).toEqual(expect.objectContaining({ action: 'place', auto: true }));
      expect(update.state.board[timeoutA.autoMove.point]).toBe('W');
      expect(update.state.moveCount).toBe(1);
      expect(update.state.turn).toBe('B');
    });

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
  let hudJs;
  let overlaysJs;
  let css;

  beforeAll(() => {
    htmlContent = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'index.html'), 'utf8');
    appJs = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    hudJs = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'js', 'hudView.js'), 'utf8');
    overlaysJs = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'js', 'overlays.js'), 'utf8');
    css = loadStylesheet();
  });

  test('each player panel carries a countdown element, like a chess clock', () => {
    ['w', 'b'].forEach(part => {
      const clock = htmlContent.match(new RegExp(`<div id="player-${part}-clock"[\\s\\S]*?</div>`))[0];
      expect(clock).toContain('role="timer"');
      expect(clock).toContain('class="turn-clock-arc"');
      expect(clock).toContain('class="turn-clock-value"');
    });
  });

  test('the notice of a move played for this player stays until it is clicked', () => {
    const handler = appJs.slice(
      appJs.indexOf("this.socket.on('turnTimeout'"),
      appJs.indexOf("this.socket.on('gameOver'")
    );
    expect(handler.match(/\{ sticky: true \}/g)).toHaveLength(1);
    expect(handler).toMatch(/if \(data\.player === this\.myColor\) \{[\s\S]*?\{ sticky: true \}[\s\S]*?\} else \{/);

    const sticky = overlaysJs.slice(
      overlaysJs.indexOf('if (sticky) {'),
      overlaysJs.indexOf('} else {', overlaysJs.indexOf('if (sticky) {'))
    );
    expect(overlaysJs).toContain("document.createElement(sticky ? 'button' : 'div')");
    expect(sticky).toContain("toast.addEventListener('click', () => Overlays.#dismiss(toast), { once: true })");
    expect(sticky).not.toContain('setTimeout');
    expect(sticky).toContain('text.textContent = message');
  });

  test('a sticky toast takes clicks even though its container lets them through', () => {
    expect(css).toMatch(/\.toast-container\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.toast\s*\{[^}]*pointer-events:\s*auto/);
    expect(css).toMatch(/\.toast-sticky\s*\{[^}]*cursor:\s*pointer/);
  });

  test('the countdown is fed by the server events', () => {
    expect(appJs).toContain("this.socket.on('turnTimer'");
    expect(appJs).toContain("this.socket.on('turnTimeout'");
  });

  test('the client only displays the clock and never plays on it', () => {
    const code = hudJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toContain('setInterval');
    expect(code).not.toContain('socket');
    expect(appJs).toContain('this.hud.startCountdown(data)');
  });

  test('a move the server played for a player is marked in the log', () => {
    expect(appJs).toContain("const autoSuffix = lastAction.auto ? ' (automatisch)' : '';");
  });
});

describe('Game Over Modal UI (Issue #8)', () => {
  let htmlContent;

  beforeAll(() => {
    htmlContent = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'index.html'), 'utf8');
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
