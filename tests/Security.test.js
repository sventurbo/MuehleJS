const { RateLimiter } = require('../lib/RateLimiter');
const { GameManager, sanitizeText } = require('../lib/GameManager');
const { compileTrustProxy, getClientAddress, rateLimitKey } = require('../lib/clientAddress');
const { io: serverIo, app: serverApp } = require('../server');

describe('Security & DoS Hardening Tests (CH-05, DOS-01, DOS-03)', () => {
  describe('RateLimiter Unit Tests', () => {
    test('allows requests within threshold and blocks excess', () => {
      const limiter = new RateLimiter({ windowMs: 1000, max: 3 });
      expect(limiter.isLimited('user1')).toBe(false); // 1
      expect(limiter.isLimited('user1')).toBe(false); // 2
      expect(limiter.isLimited('user1')).toBe(false); // 3
      expect(limiter.isLimited('user1')).toBe(true);  // 4 -> Blocked!
      expect(limiter.isLimited('user1')).toBe(true);  // 5 -> Blocked!

      // Independent keys
      expect(limiter.isLimited('user2')).toBe(false);
    });

    test('resets rate limit for key', () => {
      const limiter = new RateLimiter({ windowMs: 1000, max: 2 });
      limiter.isLimited('user1');
      limiter.isLimited('user1');
      expect(limiter.isLimited('user1')).toBe(true);

      limiter.reset('user1');
      expect(limiter.isLimited('user1')).toBe(false);
    });

    test('cleanup removes stale timestamps', () => {
      const limiter = new RateLimiter({ windowMs: 10, max: 5 });
      limiter.isLimited('tempUser');
      return new Promise((resolve) => {
        setTimeout(() => {
          limiter.cleanup();
          expect(limiter.size).toBe(0);
          resolve();
        }, 20);
      });
    });
  });

  describe('CH-05: Chat-Spam & Flooding Protection', () => {
    let ioMock;
    let roomEmitMock;
    let gm;
    let socket1;
    let socket2;

    beforeEach(() => {
      roomEmitMock = jest.fn();
      ioMock = {
        to: jest.fn().mockReturnValue({ emit: roomEmitMock })
      };
      gm = new GameManager(ioMock);

      socket1 = {
        id: 'sock_chat_1',
        connected: true,
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn()
      };

      socket2 = {
        id: 'sock_chat_2',
        connected: true,
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn()
      };

      gm.enqueuePlayer(socket1, 'Alice');
      gm.enqueuePlayer(socket2, 'Bob');
    });

    test('rate limits chat messages when sent in rapid succession', () => {
      // Send 4 messages (within limit)
      for (let i = 0; i < 4; i++) {
        gm.handleChatMessage(socket1, `Msg ${i}`);
      }
      expect(roomEmitMock).toHaveBeenCalledTimes(4);

      // 5th message exceeds limit!
      gm.handleChatMessage(socket1, 'Spam Message');
      expect(roomEmitMock).toHaveBeenCalledTimes(4); // NOT broadcasted!
      expect(socket1.emit).toHaveBeenCalledWith('actionError', expect.objectContaining({
        message: expect.stringContaining('Zu viele Nachrichten')
      }));
    });

    test('disconnects abusive flooders after repeated violations', () => {
      // Exceed threshold multiple times
      for (let i = 0; i < 20; i++) {
        gm.handleChatMessage(socket1, `Spam ${i}`);
      }

      expect(socket1.disconnect).toHaveBeenCalledWith(true);
      expect(socket1.emit).toHaveBeenCalledWith('actionError', expect.objectContaining({
        message: expect.stringContaining('Spam')
      }));
    });

    test('forwards chat text verbatim - escaping belongs to the renderer (CH-01/CH-02)', () => {
      // Escaping here as well produced literal "&amp;" / "&lt;b&gt;" on screen.
      // The client renders every message through textContent / _escapeHtml, so
      // the payload must arrive exactly as it was typed.
      gm.handleChatMessage(socket1, '<script>alert(1)</script> Hello & Welcome!');
      expect(roomEmitMock).toHaveBeenCalledWith('chatMessage', expect.objectContaining({
        text: '<script>alert(1)</script> Hello & Welcome!'
      }));
    });

    test('strips control characters from chat messages', () => {
      const NUL = String.fromCharCode(0);
      const BEL = String.fromCharCode(7);
      gm.handleChatMessage(socket1, 'Hallo' + NUL + BEL + ' Welt');
      expect(roomEmitMock).toHaveBeenCalledWith('chatMessage', expect.objectContaining({
        text: 'Hallo Welt'
      }));
    });

    test('drops a message that is only control characters', () => {
      roomEmitMock.mockClear();
      const controls = [0, 1, 2].map(c => String.fromCharCode(c)).join('');
      gm.handleChatMessage(socket1, controls);
      expect(roomEmitMock).not.toHaveBeenCalled();
    });
  });

  describe('DOS-01: Queue Flooding & Stack Overflow Protection', () => {
    let ioMock;
    let gm;

    beforeEach(() => {
      ioMock = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
      gm = new GameManager(ioMock);
    });

    test('rate limits repeated rapid matchmaking enqueue attempts', () => {
      const spamSocket = {
        id: 'spam_socket',
        connected: true,
        handshake: { address: '127.0.0.1', headers: {} },
        join: jest.fn(),
        emit: jest.fn()
      };

      // Up to 5 allowed
      for (let i = 0; i < 5; i++) {
        gm.enqueuePlayer(spamSocket, `Spammer_${i}`);
      }

      // 6th attempt is throttled
      gm.enqueuePlayer(spamSocket, 'Spammer_6');
      expect(spamSocket.emit).toHaveBeenCalledWith('actionError', expect.objectContaining({
        message: expect.stringContaining('Zu viele Anmeldeversuche')
      }));
    });

    describe('login budget per socket and per address (issue #22)', () => {
      const mockSocket = (id, address) => ({
        id,
        connected: true,
        handshake: { address, headers: {} },
        join: jest.fn(),
        emit: jest.fn()
      });

      const wasThrottled = (socket) => socket.emit.mock.calls.some(
        ([event, payload]) => event === 'actionError' && payload.message.includes('Zu viele Anmeldeversuche')
      );

      test('counts every login of a socket, although each one ends the previous session', () => {
        const socket = mockSocket('hopping_socket', '10.1.0.0');
        const budget = gm.queueLimiter.max;

        // A fresh address per attempt keeps the per-address limit out of play,
        // so only the per-socket count can stop the next login.
        for (let i = 0; i < budget; i++) {
          socket.handshake.address = `10.1.0.${i}`;
          gm.enqueuePlayer(socket, `Player_${i}`);
        }
        expect(wasThrottled(socket)).toBe(false);

        socket.handshake.address = `10.1.0.${budget}`;
        gm.enqueuePlayer(socket, 'Player_X');
        expect(wasThrottled(socket)).toBe(true);
      });

      test('leaving a running game does not reset the socket\'s login count', () => {
        const socket = mockSocket('leaving_socket', '10.2.0.0');
        const budget = gm.queueLimiter.max;

        for (let i = 0; i < budget; i++) {
          socket.handshake.address = `10.2.0.${i}`;
          gm.enqueuePlayer(mockSocket(`opponent_${i}`, `10.3.0.${i}`), 'Opponent');
          gm.enqueuePlayer(socket, 'Leaver');
          expect(gm.socketMap.has(socket.id)).toBe(true);
          gm.leaveGame(socket.id);
        }
        expect(wasThrottled(socket)).toBe(false);

        socket.handshake.address = `10.2.0.${budget}`;
        gm.enqueuePlayer(socket, 'Leaver');
        expect(wasThrottled(socket)).toBe(true);
      });

      test('players sharing one address get their own budget', () => {
        // Same WLAN behind NAT, or two tabs on one machine.
        const tab1 = mockSocket('tab_1', '192.168.0.10');
        const tab2 = mockSocket('tab_2', '192.168.0.10');

        for (let i = 0; i < gm.queueLimiter.max; i++) {
          gm.enqueuePlayer(tab1, 'Tab1');
          gm.enqueuePlayer(tab2, 'Tab2');
        }

        expect(wasThrottled(tab1)).toBe(false);
        expect(wasThrottled(tab2)).toBe(false);
      });

      test('still caps the logins of many sockets from one address', () => {
        const budget = gm.queueIpLimiter.max;
        const sockets = Array.from({ length: budget + 1 }, (_, i) => mockSocket(`flood_${i}`, '203.0.113.7'));

        sockets.forEach((socket, i) => gm.enqueuePlayer(socket, `Flood_${i}`));

        expect(sockets.slice(0, budget).some(wasThrottled)).toBe(false);
        expect(wasThrottled(sockets[budget])).toBe(true);
      });
    });

    test('iterative queue search handles 5000 disconnected sockets without Call Stack Overflow', () => {
      // Populate queue with 5000 disconnected candidate entries
      for (let i = 0; i < 5000; i++) {
        gm.waitingQueue.push({
          socket: { id: `dead_${i}`, connected: false },
          username: `Ghost_${i}`,
          joinedAt: Date.now()
        });
      }

      const liveSocket1 = {
        id: 'live_socket_1',
        connected: true,
        handshake: { address: '10.0.0.1', headers: {} },
        join: jest.fn(),
        emit: jest.fn()
      };

      const liveSocket2 = {
        id: 'live_socket_2',
        connected: true,
        handshake: { address: '10.0.0.2', headers: {} },
        join: jest.fn(),
        emit: jest.fn()
      };

      // Non-recursive enqueue should cleanly drain disconnected sockets without RangeError
      expect(() => {
        gm.enqueuePlayer(liveSocket1, 'LivePlayer1');
      }).not.toThrow();

      expect(() => {
        gm.enqueuePlayer(liveSocket2, 'LivePlayer2');
      }).not.toThrow();

      // The two live sockets must be matched!
      expect(liveSocket1.emit).toHaveBeenCalledWith('gameStart', expect.any(Object));
      expect(liveSocket2.emit).toHaveBeenCalledWith('gameStart', expect.any(Object));
      expect(gm.games.size).toBe(1);
    });
  });

  describe('DOS-01: X-Forwarded-For only counts behind a trusted proxy', () => {
    let ioMock;

    beforeEach(() => {
      ioMock = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
    });

    const makeSocket = (id, address, forwardedFor) => ({
      id,
      connected: true,
      handshake: {
        address,
        headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor }
      },
      join: jest.fn(),
      emit: jest.fn()
    });

    const wasThrottled = (socket) => socket.emit.mock.calls.some(([event, payload]) =>
      event === 'actionError' && payload.message.includes('Zu viele Anmeldeversuche'));

    // More than any per-address budget, so the limit must trip if the key holds.
    const FLOOD = 30;

    test('ignores a spoofed header when no proxy is trusted', () => {
      const socket = makeSocket('s1', '203.0.113.7', '198.51.100.1');
      expect(getClientAddress(socket, compileTrustProxy(undefined))).toBe('203.0.113.7');
    });

    test('a forged header per connection no longer escapes the address limit', () => {
      const gm = new GameManager(ioMock);
      const sockets = [];
      for (let i = 0; i < FLOOD; i++) {
        const socket = makeSocket(`forger_${i}`, '203.0.113.7', `198.51.100.${i}`);
        sockets.push(socket);
        gm.enqueuePlayer(socket, `Forger${i}`);
      }
      expect(sockets.some(wasThrottled)).toBe(true);
    });

    test('uses the client entry of the chain, not the raw header', () => {
      // The client forged 198.51.100.1; the trusted proxy appended its real address.
      const socket = makeSocket('s1', '10.0.0.1', '198.51.100.1, 203.0.113.7');
      expect(getClientAddress(socket, compileTrustProxy('10.0.0.1'))).toBe('203.0.113.7');
    });

    test('skips every trusted proxy in a longer chain', () => {
      const socket = makeSocket('s1', '10.0.0.2', '198.51.100.1, 203.0.113.7, 10.0.0.1');
      expect(getClientAddress(socket, compileTrustProxy('10.0.0.1, 10.0.0.2'))).toBe('203.0.113.7');
      expect(getClientAddress(socket, compileTrustProxy('10.0.0.0/8'))).toBe('203.0.113.7');
    });

    test('a hop count trusts that many proxies closest to the server', () => {
      const socket = makeSocket('s1', '10.0.0.2', '198.51.100.1, 203.0.113.7, 10.0.0.1');
      expect(getClientAddress(socket, compileTrustProxy('1'))).toBe('10.0.0.1');
      expect(getClientAddress(socket, compileTrustProxy('2'))).toBe('203.0.113.7');
    });

    test('ignores the header on a connection that does not come from a trusted proxy', () => {
      const socket = makeSocket('s1', '203.0.113.7', '198.51.100.1');
      expect(getClientAddress(socket, compileTrustProxy('10.0.0.1'))).toBe('203.0.113.7');
    });

    test('recognises a proxy by its IPv4-mapped address on the dual-stack socket', () => {
      const socket = makeSocket('s1', '::ffff:127.0.0.1', '203.0.113.7');
      expect(getClientAddress(socket, compileTrustProxy('loopback'))).toBe('203.0.113.7');
    });

    test('clients behind one trusted proxy get separate budgets', () => {
      const gm = new GameManager(ioMock, { trustProxy: '10.0.0.1' });
      const flooder = [];
      for (let i = 0; i < FLOOD; i++) {
        const socket = makeSocket(`flood_${i}`, '10.0.0.1', `198.51.100.${i}, 203.0.113.7`);
        flooder.push(socket);
        gm.enqueuePlayer(socket, `Flood${i}`);
      }
      expect(flooder.some(wasThrottled)).toBe(true);

      const other = makeSocket('other', '10.0.0.1', '203.0.113.8');
      gm.enqueuePlayer(other, 'Bob');
      expect(wasThrottled(other)).toBe(false);
    });

    test('an unset or disabled setting trusts no proxy', () => {
      for (const value of [undefined, '', '  ', 'false', 'FALSE', '0']) {
        expect(compileTrustProxy(value)).toBeNull();
      }
    });

    test('rejects TRUST_PROXY=true, which would let the client choose its address', () => {
      expect(() => compileTrustProxy('true')).toThrow(/TRUST_PROXY/);
    });

    test('rejects entries that are not addresses', () => {
      expect(() => compileTrustProxy('proxy.example.com')).toThrow(/TRUST_PROXY/);
      expect(() => new GameManager(ioMock, { trustProxy: '10.0.0.1/99' })).toThrow(/TRUST_PROXY/);
    });
  });

  describe('DOS-01: the address budget is charged to the address block', () => {
    let ioMock;
    let gm;

    beforeEach(() => {
      ioMock = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
      gm = new GameManager(ioMock);
    });

    const makeSocket = (id, address) => ({
      id,
      connected: true,
      handshake: { address, headers: {} },
      join: jest.fn(),
      emit: jest.fn()
    });

    const wasThrottled = (socket) => socket.emit.mock.calls.some(([event, payload]) =>
      event === 'actionError' && payload.message.includes('Zu viele Anmeldeversuche'));

    // One login per socket, so only the shared address budget can stop them.
    const floodFrom = (addresses, prefix) => {
      const sockets = addresses.map((address, i) => makeSocket(`${prefix}_${i}`, address));
      sockets.forEach((socket, i) => gm.enqueuePlayer(socket, `${prefix}${i}`));
      return sockets;
    };

    test('two addresses in one /64 share a single budget', () => {
      const budget = gm.queueIpLimiter.max;
      // A client owning 2001:db8:1:2::/64 picks a fresh address per connection;
      // both ends of the block must still be counted together.
      const addresses = Array.from({ length: budget + 1 }, (_, i) => (
        i % 2 === 0 ? '2001:db8:1:2::1' : '2001:db8:1:2:ffff:ffff:ffff:ffff'
      ));

      const sockets = floodFrom(addresses, 'hop');

      expect(sockets.slice(0, budget).some(wasThrottled)).toBe(false);
      expect(wasThrottled(sockets[budget])).toBe(true);
    });

    test('addresses in different /64s keep their own budget', () => {
      const budget = gm.queueIpLimiter.max;
      floodFrom(Array.from({ length: budget }, (_, i) => `2001:db8:1:2::${(i + 1).toString(16)}`), 'blockA');

      // The exhausted block stays exhausted ...
      const sameBlock = makeSocket('blockA_extra', '2001:db8:1:2:ffff:ffff:ffff:ffff');
      gm.enqueuePlayer(sameBlock, 'SameBlock');
      expect(wasThrottled(sameBlock)).toBe(true);

      // ... while the neighbouring /64 is untouched by it.
      const otherBlock = makeSocket('blockB_1', '2001:db8:1:3::1');
      gm.enqueuePlayer(otherBlock, 'OtherBlock');
      expect(wasThrottled(otherBlock)).toBe(false);
    });

    test('an IPv4-mapped address shares the budget of the plain IPv4 address', () => {
      const budget = gm.queueIpLimiter.max;
      // The dual-stack listener reports the same client either way.
      floodFrom(Array(budget).fill('::ffff:1.2.3.4'), 'mapped');

      const plain = makeSocket('plain_v4', '1.2.3.4');
      gm.enqueuePlayer(plain, 'PlainV4');
      expect(wasThrottled(plain)).toBe(true);
    });

    test('rateLimitKey folds IPv4, IPv4-mapped IPv6 and native IPv6', () => {
      expect(rateLimitKey('1.2.3.4')).toBe('1.2.3.4');
      expect(rateLimitKey('::ffff:1.2.3.4')).toBe('1.2.3.4');
      expect(rateLimitKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
      expect(rateLimitKey('2001:db8:1:2::abcd')).toBe('2001:db8:1:2::/64');
      expect(rateLimitKey('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
    });

    test('rateLimitKey passes non-IP values through unchanged', () => {
      // Mock sockets without a handshake fall back to socket.id.
      expect(rateLimitKey('sock_chat_1')).toBe('sock_chat_1');
      expect(rateLimitKey('')).toBe('');
      expect(rateLimitKey(undefined)).toBeUndefined();
    });
  });

describe('Username Validation (Issue #1)', () => {
     let ioMock;
     let gm;

     beforeEach(() => {
       ioMock = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
       gm = new GameManager(ioMock);
     });

     test('rejects empty username from matchmaking queue', () => {
       const socket = {
         id: 'sock_empty',
         connected: true,
         join: jest.fn(),
         emit: jest.fn()
       };
       gm.enqueuePlayer(socket, '');
       expect(gm.waitingQueue.length).toBe(0);
       expect(socket.emit).not.toHaveBeenCalled();
     });

     test('rejects whitespace-only username from matchmaking queue', () => {
       const socket = {
         id: 'sock_ws',
         connected: true,
         join: jest.fn(),
         emit: jest.fn()
       };
       gm.enqueuePlayer(socket, '   ');
       expect(gm.waitingQueue.length).toBe(0);
     });

     test('truncates username longer than 12 characters', () => {
       const socket = {
         id: 'sock_long',
         connected: true,
         join: jest.fn(),
         emit: jest.fn()
       };
       gm.enqueuePlayer(socket, 'ThisNameIsWayTooLong');
       expect(gm.waitingQueue.length).toBe(1);
       expect(gm.waitingQueue[0].username).toHaveLength(12);
     });

     test('accepts exactly 12 character username', () => {
       const socket = {
         id: 'sock_exact',
         connected: true,
         join: jest.fn(),
         emit: jest.fn()
       };
       gm.enqueuePlayer(socket, '123456789012');
       expect(gm.waitingQueue.length).toBe(1);
       expect(gm.waitingQueue[0].username).toBe('123456789012');
     });

     test('accepts short username without truncation', () => {
       const socket = {
         id: 'sock_short',
         connected: true,
         join: jest.fn(),
         emit: jest.fn()
       };
       gm.enqueuePlayer(socket, 'Alice');
       expect(gm.waitingQueue.length).toBe(1);
       expect(gm.waitingQueue[0].username).toBe('Alice');
     });
   });

   describe('XSS: the client is the escaping boundary', () => {
     const fs = require('fs');
     const path = require('path');
     const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

     test('sanitizeText keeps ampersands and angle brackets intact', () => {
       expect(sanitizeText('Tom&Jerry')).toBe('Tom&Jerry');
       expect(sanitizeText('a < b & c > d')).toBe('a < b & c > d');
     });

     test('sanitizeText drops control characters and non-strings', () => {
       expect(sanitizeText('Ali' + String.fromCharCode(0) + 'ce')).toBe('Alice');
       expect(sanitizeText(null)).toBe('');
       expect(sanitizeText(42)).toBe('');
     });

     // The server deliberately no longer escapes, so the markup the client
     // builds by hand must run every server-supplied string through _escapeHtml.
     test('chat markup escapes both sender and text', () => {
       expect(appJs).toContain('this._escapeHtml(msg.sender)');
       expect(appJs).toContain('this._escapeHtml(msg.text)');
     });

     test('player names are written with textContent, never innerHTML', () => {
       expect(appJs).toMatch(/playerWName\.textContent\s*=/);
       expect(appJs).toMatch(/playerBName\.textContent\s*=/);
       expect(appJs).not.toMatch(/player[WB]Name\.innerHTML/);
     });
   });

   describe('DOS-03: maxHttpBufferSize Configuration', () => {
     test('server io configuration restricts maxHttpBufferSize to <= 10 KB', () => {
       expect(serverIo.opts.maxHttpBufferSize).toBeDefined();
       expect(serverIo.opts.maxHttpBufferSize).toBeLessThanOrEqual(10240); // 10 KB
     });
   });

   describe('DOS-03: express.json body limit (Issue #21)', () => {
     const http = require('http');
     let httpServer;
     let port;

     beforeAll((done) => {
       httpServer = http.createServer(serverApp);
       httpServer.listen(0, '127.0.0.1', () => {
         port = httpServer.address().port;
         done();
       });
     });

     afterAll((done) => {
       httpServer.close(done);
     });

     const postJson = (body) => new Promise((resolve, reject) => {
       const req = http.request({
         host: '127.0.0.1',
         port,
         path: '/api/status',
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
       }, (res) => {
         res.resume();
         res.on('end', () => resolve(res.statusCode));
       });
       req.on('error', reject);
       req.end(body);
     });

     test('rejects JSON bodies above 10 KB with 413', async () => {
       const body = JSON.stringify({ padding: 'x'.repeat(11 * 1024) });
       expect(await postJson(body)).toBe(413);
     });

     test('accepts JSON bodies below 10 KB', async () => {
       const body = JSON.stringify({ padding: 'x'.repeat(9 * 1024) });
       // There is no POST route, so a parsed body falls through to 404.
       expect(await postJson(body)).toBe(404);
     });
   });
 });

