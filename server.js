import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { GameManager } from './lib/GameManager.js';

export function resolvePort(args = process.argv.slice(2), env = process.env) {
  const cliPort = args.find(arg => /^\d+$/.test(arg));
  return parseInt(cliPort || env.PORT || '3000', 10);
}

const PORT = resolvePort();

export const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(import.meta.dirname, 'public')));
app.use('/shared', express.static(path.join(import.meta.dirname, 'shared')));

export const primaryServer = http.createServer(app);

export const io = new Server(primaryServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e4,
  pingTimeout: 10000,
  pingInterval: 5000
});

export const gameManager = new GameManager(io, {
  trustProxy: process.env.TRUST_PROXY,
  turnTimeoutMs: process.env.TURN_TIMEOUT_MS
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    game: "Mühle / Nine Men's Morris",
    stats: gameManager.getStats()
  });
});

function safeOn(socket, event, handler, notify = true) {
  socket.on(event, payload => {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[Error] ${event} for socket ${socket.id}:`, err);
      if (notify) socket.emit('serverError', { message: 'Aktion konnte nicht verarbeitet werden.' });
    }
  });
}

function readText(data, field) {
  return typeof data?.[field] === 'string' ? data[field] : '';
}

io.on('connection', socket => {
  safeOn(socket, 'login', data => {
    gameManager.enqueuePlayer(socket, readText(data, 'username'));
  });

  safeOn(socket, 'placePiece', data => {
    const point = readText(data, 'point');
    if (point) gameManager.handlePlacePiece(socket, point);
  });

  safeOn(socket, 'movePiece', data => {
    const from = readText(data, 'from');
    const to = readText(data, 'to');
    if (from && to) gameManager.handleMovePiece(socket, from, to);
  });

  safeOn(socket, 'removePiece', data => {
    const point = readText(data, 'point');
    if (point) gameManager.handleRemovePiece(socket, point);
  });

  safeOn(socket, 'forfeit', () => gameManager.handleForfeit(socket), false);

  safeOn(
    socket,
    'chatMessage',
    data => {
      const text = readText(data, 'text');
      if (text) gameManager.handleChatMessage(socket, text);
    },
    false
  );

  safeOn(socket, 'leaveGame', () => gameManager.leaveGame(socket.id), false);

  safeOn(socket, 'disconnect', () => gameManager.handlePlayerDisconnect(socket.id), false);
});

const NO_IPV6_ERRORS = new Set(['EAFNOSUPPORT', 'EADDRNOTAVAIL']);

function abortStart(err) {
  const hint = err.code === 'EADDRINUSE' ? ' Is another server running? Pick another port: npm start 8080' : '';
  console.error(`[Network] Cannot listen on port ${PORT}: ${err.message}.${hint}`);
  process.exit(1);
}

function startServer() {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    abortStart(new RangeError('a port is a whole number between 1 and 65535'));
  }

  primaryServer.once('error', errV6 => {
    if (!NO_IPV6_ERRORS.has(errV6.code)) abortStart(errV6);
    console.warn(`[Network] IPv6 binding on '::' failed (${errV6.code}). Falling back to IPv4 0.0.0.0...`);

    const v4Server = http.createServer(app);
    v4Server.once('error', abortStart);
    io.attach(v4Server);
    v4Server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Network] Server listening on IPv4: http://127.0.0.1:${PORT}`);
    });
  });

  primaryServer.listen(PORT, '::', () => {
    console.log(`[Network] Mühle Server listening on IPv6: [::]:${PORT}`);
    console.log(`[Network] Web interface: http://[::1]:${PORT}`);

    const secondaryV4Server = http.createServer(app);
    secondaryV4Server.once('error', errV4 => {
      if (errV4.code === 'EADDRINUSE') {
        console.log(`[Network] IPv4 is active and handled by dual-stack IPv6 socket (http://127.0.0.1:${PORT})`);
      } else {
        console.warn(`[Network] Secondary IPv4 listener error: ${errV4.message}`);
      }
    });

    secondaryV4Server.listen(PORT, '0.0.0.0', () => {
      io.attach(secondaryV4Server);
      console.log(`[Network] Dedicated IPv4 listener active: http://127.0.0.1:${PORT}`);
    });
  });
}

process.on('uncaughtException', err => {
  console.error('[CRITICAL] Uncaught exception caught safely:', err);
});

process.on('unhandledRejection', reason => {
  console.error('[CRITICAL] Unhandled rejection caught safely:', reason);
});

if (import.meta.main) {
  startServer();
}
