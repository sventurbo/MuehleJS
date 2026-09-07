/**
 * server.js
 * Main server entry point for Web-Spiel Mühle.
 * Uses Express and Socket.io.
 * Supports IPv6 (primary) and IPv4 dual-stack binding.
 */

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { GameManager } = require('./lib/GameManager');

// Parse port from CLI argument (e.g., "node server.js 8080" or "npm start -- 8080") or environment
const args = process.argv.slice(2);
const cliPort = args.find(arg => /^\d+$/.test(arg));
const PORT = parseInt(process.env.PORT || cliPort || '3000', 10);

// Initialize Express application
const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.json({ limit: '10kb' }));

// API health and info endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    game: 'Mühle / Nine Men\'s Morris',
    stats: gameManager ? gameManager.getStats() : {}
  });
});

// Primary HTTP server
const primaryServer = http.createServer(app);

// Socket.io instance with cross-origin support and heartbeat tuning
// Socket.io instance with cross-origin support, heartbeat tuning, and max payload protection (DOS-03)
const io = new Server(primaryServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e4, // 10 KB max payload per WebSocket frame (prevents DoS large payload attacks)
  pingTimeout: 10000,
  pingInterval: 5000
});

const gameManager = new GameManager(io);

// Socket.io event orchestration
io.on('connection', (socket) => {
  // Client logs in / enters matchmaking
  socket.on('login', (data) => {
    try {
      const username = (data && data.username) ? String(data.username) : '';
      gameManager.enqueuePlayer(socket, username);
    } catch (err) {
      console.error(`[Error] login failed for socket ${socket.id}:`, err);
      socket.emit('serverError', { message: 'Ein Fehler ist beim Login aufgetreten.' });
    }
  });

  // Player places a piece (Phase 1)
  socket.on('placePiece', (data) => {
    try {
      if (!data || typeof data.point !== 'string') return;
      gameManager.handlePlacePiece(socket, data.point);
    } catch (err) {
      console.error(`[Error] placePiece for ${socket.id}:`, err);
      socket.emit('serverError', { message: 'Aktion konnte nicht verarbeitet werden.' });
    }
  });

  // Player moves a piece (Phase 2 & 3)
  socket.on('movePiece', (data) => {
    try {
      if (!data || typeof data.from !== 'string' || typeof data.to !== 'string') return;
      gameManager.handleMovePiece(socket, data.from, data.to);
    } catch (err) {
      console.error(`[Error] movePiece for ${socket.id}:`, err);
      socket.emit('serverError', { message: 'Aktion konnte nicht verarbeitet werden.' });
    }
  });

  // Player removes an opponent piece after closing a mill
  socket.on('removePiece', (data) => {
    try {
      if (!data || typeof data.point !== 'string') return;
      gameManager.handleRemovePiece(socket, data.point);
    } catch (err) {
      console.error(`[Error] removePiece for ${socket.id}:`, err);
      socket.emit('serverError', { message: 'Aktion konnte nicht verarbeitet werden.' });
    }
  });

  // Player surrenders
  socket.on('forfeit', () => {
    try {
      gameManager.handleForfeit(socket);
    } catch (err) {
      console.error(`[Error] forfeit for ${socket.id}:`, err);
    }
  });

  // In-game chat message
  socket.on('chatMessage', (data) => {
    try {
      if (data && data.text) {
        gameManager.handleChatMessage(socket, data.text);
      }
    } catch (err) {
      console.error(`[Error] chatMessage for ${socket.id}:`, err);
    }
  });

  // Player leaves game / returns to lobby
  socket.on('leaveGame', () => {
    try {
      gameManager.leaveGame(socket.id);
    } catch (err) {
      console.error(`[Error] leaveGame for ${socket.id}:`, err);
    }
  });

  // Player disconnected
  socket.on('disconnect', (reason) => {
    try {
      gameManager.handlePlayerDisconnect(socket.id);
    } catch (err) {
      console.error(`[Error] disconnect handler for ${socket.id}:`, err);
    }
  });
});

// Dual-Stack Server Startup (IPv6 Primary + IPv4 Secondary Fallback/Complement)
function startServer() {
  // 1. Try IPv6 unspecified binding '::' (supports both IPv6 and IPv4 on dual-stack OS)
  primaryServer.once('error', (errV6) => {
    console.warn(`[Network] IPv6 binding on '::' failed (${errV6.code}). Falling back to IPv4 0.0.0.0...`);
    
    // Fallback to pure IPv4
    const v4Server = http.createServer(app);
    io.attach(v4Server);
    v4Server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Network] Server listening on IPv4: http://127.0.0.1:${PORT}`);
    });
  });

  primaryServer.listen(PORT, '::', () => {
    console.log(`[Network] Mühle Server listening on IPv6: [::]:${PORT}`);
    console.log(`[Network] Web interface: http://[::1]:${PORT}`);

    // 2. Ensure IPv4 is also accessible if OS has net.ipv6.bindv6only = 1
    const secondaryV4Server = http.createServer(app);
    secondaryV4Server.once('error', (errV4) => {
      if (errV4.code === 'EADDRINUSE') {
        // IPv4 is already fully served by the dual-stack IPv6 socket on '::'
        console.log(`[Network] IPv4 is active and handled by dual-stack IPv6 socket (http://127.0.0.1:${PORT})`);
      } else {
        console.warn(`[Network] Secondary IPv4 listener error: ${errV4.message}`);
      }
    });

    secondaryV4Server.listen(PORT, '0.0.0.0', () => {
      // If this succeeds, bindv6only was 1, so we attach socket.io to the IPv4 server as well!
      io.attach(secondaryV4Server);
      console.log(`[Network] Dedicated IPv4 listener active: http://127.0.0.1:${PORT}`);
    });
  });
}

// Global safety handlers to ensure the server NEVER crashes
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught exception caught safely:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled rejection caught safely:', reason);
});

// Start listening if run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, primaryServer, io, gameManager };

