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

