/**
 * server.js
 * Entry point of the Mühle web game.
 *
 * It does three things and nothing else:
 *   1. serve the static client (public/) and the shared rule module (shared/),
 *   2. translate Socket.io events into GameManager calls,
 *   3. bind the network, IPv6-first with a working IPv4 path in every case.
 *
 * Everything that can be decided about a game is decided in lib/, so this file
 * stays a thin, readable map of the client/server protocol.
 */

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { GameManager } = require('./lib/GameManager');

// Port from CLI argument ("node server.js 8080" / "npm start -- 8080") or environment.
const cliPort = process.argv.slice(2).find(arg => /^\d+$/.test(arg));
const PORT = parseInt(process.env.PORT || cliPort || '3000', 10);

// ── Express: static client + status endpoint ────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
// The rule module the browser and lib/MuehleGame.js share. Serving it from its
// own folder keeps a single copy on disk instead of one per side.
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use(express.json({ limit: '10kb' })); // DOS-03: bounded request bodies

const primaryServer = http.createServer(app);

// Socket.io with cross-origin support, heartbeat tuning and a payload cap
// (DOS-03: a 10 KB frame limit stops oversized-message floods).
const io = new Server(primaryServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e4,
  pingTimeout: 10000,
  pingInterval: 5000
});

// TRUST_PROXY names the reverse proxies whose X-Forwarded-For may identify the
// client (see README). Unset, the header is ignored and the connection's own
// address counts, since any client can write the header itself.
//
// TURN_TIMEOUT_MS overrides the 25 s a player has per decision; an unusable
// value falls back to that default inside the GameManager, so a typo in the
// environment can never switch the timer off.
const gameManager = new GameManager(io, {
  trustProxy: process.env.TRUST_PROXY,
  turnTimeoutMs: process.env.TURN_TIMEOUT_MS
});

// Health and info endpoint.
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    game: 'Mühle / Nine Men\'s Morris',
    stats: gameManager.getStats()
  });
});

// ── Socket.io protocol ──────────────────────────────────────────────────────

/**
 * Registers a socket event handler that can never take the server down.
 *
 * Every inbound event is attacker-controlled, so each handler runs inside the
 * same guard: an exception is logged and answered with a generic message
 * instead of escaping into Socket.io's error path. The requirement is that a
 * faulty or malicious client terminates its own game, never the process.
 *
 * @param {Object} socket The client socket.
 * @param {string} event The event name the client emits.
 * @param {Function} handler Receives the (already untrusted) payload.
 * @param {boolean} [notify] Whether to answer the client with `serverError`.
 */
function safeOn(socket, event, handler, notify = true) {
  socket.on(event, (payload) => {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[Error] ${event} for socket ${socket.id}:`, err);
      if (notify) socket.emit('serverError', { message: 'Aktion konnte nicht verarbeitet werden.' });
    }
  });
}

/** Reads a string field out of an untrusted payload; '' when it is anything else. */
function readText(data, field) {
  return (data && typeof data[field] === 'string') ? data[field] : '';
}

io.on('connection', (socket) => {
  // Enter matchmaking with a display name.
  safeOn(socket, 'login', (data) => {
    gameManager.enqueuePlayer(socket, readText(data, 'username'));
  });

  // Phase 1: place a stone.
  safeOn(socket, 'placePiece', (data) => {
    const point = readText(data, 'point');
    if (point) gameManager.handlePlacePiece(socket, point);
  });

  // Phase 2 & 3: move (or jump with) a stone.
  safeOn(socket, 'movePiece', (data) => {
    const from = readText(data, 'from');
    const to = readText(data, 'to');
    if (from && to) gameManager.handleMovePiece(socket, from, to);
  });

  // Capture an opponent stone after closing a mill.
  safeOn(socket, 'removePiece', (data) => {
    const point = readText(data, 'point');
    if (point) gameManager.handleRemovePiece(socket, point);
  });

  // Give up the running game.
  safeOn(socket, 'forfeit', () => gameManager.handleForfeit(socket), false);

  // In-game chat.
  safeOn(socket, 'chatMessage', (data) => {
    const text = readText(data, 'text');
    if (text) gameManager.handleChatMessage(socket, text);
  }, false);

  // Cancel the search, or return to the lobby from a finished game.
  safeOn(socket, 'leaveGame', () => gameManager.leaveGame(socket.id), false);

  // Connection dropped: end the session and let the opponent win.
  safeOn(socket, 'disconnect', () => gameManager.handlePlayerDisconnect(socket.id), false);
});

// ── Network binding ─────────────────────────────────────────────────────────

/**
 * Starts listening so the game is reachable over IPv6 *and* IPv4.
 *
 * The unspecified IPv6 address '::' already serves IPv4 clients on a normal
 * dual-stack host. Two cases need help, and both are handled here:
 *   - the host has no IPv6 at all  → fall back to a plain 0.0.0.0 listener,
 *   - the host sets bindv6only=1   → '::' is IPv6-only, so a second listener
 *     on 0.0.0.0 is added (EADDRINUSE simply means it was not needed).
 */
function startServer() {
  primaryServer.once('error', (errV6) => {
    console.warn(`[Network] IPv6 binding on '::' failed (${errV6.code}). Falling back to IPv4 0.0.0.0...`);

    const v4Server = http.createServer(app);
    io.attach(v4Server);
    v4Server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Network] Server listening on IPv4: http://127.0.0.1:${PORT}`);
    });
  });

  primaryServer.listen(PORT, '::', () => {
    console.log(`[Network] Mühle Server listening on IPv6: [::]:${PORT}`);
    console.log(`[Network] Web interface: http://[::1]:${PORT}`);

    const secondaryV4Server = http.createServer(app);
    secondaryV4Server.once('error', (errV4) => {
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

// Last line of defence: whatever slips past the per-event guards above must not
// end the process while two people are playing.
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught exception caught safely:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL] Unhandled rejection caught safely:', reason);
});

// Start listening if run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, primaryServer, io, gameManager };
