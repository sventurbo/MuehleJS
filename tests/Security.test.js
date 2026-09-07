const { RateLimiter } = require('../lib/RateLimiter');
const { GameManager, sanitizeHtml } = require('../lib/GameManager');
const { io: serverIo } = require('../server');

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

    test('sanitizes HTML tags in chat message (CH-01/CH-02 hardening)', () => {
      gm.handleChatMessage(socket1, '<script>alert(1)</script> Hello & Welcome!');
      expect(roomEmitMock).toHaveBeenCalledWith('chatMessage', expect.objectContaining({
        text: '&lt;script&gt;alert(1)&lt;/script&gt; Hello &amp; Welcome!'
      }));
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

  describe('DOS-03: maxHttpBufferSize Configuration', () => {
    test('server io configuration restricts maxHttpBufferSize to <= 10 KB', () => {
      expect(serverIo.opts.maxHttpBufferSize).toBeDefined();
      expect(serverIo.opts.maxHttpBufferSize).toBeLessThanOrEqual(10240); // 10 KB
    });
  });
});

