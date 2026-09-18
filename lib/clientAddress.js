/**
 * clientAddress.js
 * Resolves the address a client is rate-limited under, and folds that address
 * into a stable rate-limit key.
 *
 * Two separate problems are solved here:
 *
 * 1. Which address is the client's? `X-Forwarded-For` is a plain request header
 *    and anyone can send it, so honouring it unconditionally hands every client
 *    a free rate-limit bypass. The header is therefore only read when the peer
 *    that opened the socket is a configured, trusted proxy.
 *
 * 2. Which addresses share a budget? The server binds IPv6-first (`::`), and an
 *    IPv6 client normally controls at least a whole /64 (frequently a /56 or a
 *    /48). Keyed on the full address it could pick a fresh source address per
 *    connection and never spend its budget, which makes a per-address limit
 *    decorative. Native IPv6 is therefore keyed on its /64 prefix.
 */

const ipaddr = require('ipaddr.js');
const proxyaddr = require('proxy-addr');

/**
 * Compiles a trust-proxy configuration into the predicate proxy-addr expects.
 *
 * Accepts what an operator would plausibly write in an environment variable:
 * a falsy value or `"false"`/`"0"`/`"off"` (trust nothing — the default),
 * `"true"`/`"1"`/`"on"` (trust every hop, only sane when nothing but the proxy
 * can reach the port), or a comma-separated list of addresses, CIDR ranges and
 * proxy-addr presets such as `loopback` or `uniquelocal`.
 *
 * @param {string|boolean|Array<string>|Function} [value]
 * @returns {Function|null} trust predicate, or null when no proxy is trusted
 */
function parseTrustProxy(value) {
  if (typeof value === 'function') return value;
  if (value === undefined || value === null || value === false) return null;
  if (value === true) return () => true;

  const entries = (Array.isArray(value) ? value : String(value).split(','))
    .map(entry => String(entry).trim())
    .filter(entry => entry.length > 0);

  if (entries.length === 0) return null;

  if (entries.length === 1) {
    const single = entries[0].toLowerCase();
    if (single === 'false' || single === '0' || single === 'off' || single === 'no') return null;
    if (single === 'true' || single === '1' || single === 'on' || single === 'yes') return () => true;
  }

  try {
    return proxyaddr.compile(entries);
  } catch (err) {
    // A typo in the deployment config must not silently widen trust to everyone.
    console.warn(`[Network] Ignoring unusable trust-proxy configuration "${value}": ${err.message}`);
    return null;
  }
}

/**
 * Determines the address of the client behind a Socket.io connection.
 *
 * Without a trusted proxy this is simply the peer address of the socket. With
 * one, the `X-Forwarded-For` chain is walked from the right and stops at the
 * first hop that is not itself trusted — that hop is the client.
 *
 * Mock sockets in the test suite carry no handshake at all; those fall back to
 * `socket.id`, which keeps every socket on its own budget.
 *
 * @param {Object} socket - Socket.io socket (or a mock carrying `handshake`)
 * @param {Function|null} [trustProxy] - predicate from {@link parseTrustProxy}
 * @returns {string} the client address, or `socket.id` when none is available
 */
function getClientAddress(socket, trustProxy) {
  const handshake = socket && socket.handshake;
  if (!handshake) return socket && socket.id;

  const peerAddress = handshake.address;
  if (!trustProxy) return peerAddress || (socket && socket.id);

  try {
    // proxy-addr reads `req.headers` and the peer address off the socket.
    const req = {
      headers: handshake.headers || {},
      socket: { remoteAddress: peerAddress },
      connection: { remoteAddress: peerAddress }
    };
    return proxyaddr(req, trustProxy) || peerAddress || (socket && socket.id);
  } catch (err) {
    // A malformed header must never cost a client its connection; fall back to
    // the one address that cannot be forged.
    return peerAddress || (socket && socket.id);
  }
}

/**
 * Folds an address into the key its rate-limit budget is counted against.
 *
 * - IPv4 and IPv4-mapped IPv6 (`::ffff:a.b.c.d`) collapse to the plain IPv4
 *   address, so the same client keeps one budget whether it reaches the
 *   dual-stack listener over IPv4 or the IPv4-mapped path.
 * - Native IPv6 collapses to its `/64` prefix, the smallest block a client is
 *   normally handed in full, so picking fresh addresses inside it buys nothing.
 * - Anything that is not an IP address (a `socket.id` fallback) passes through
 *   unchanged.
 *
 * @param {string} address
 * @returns {string} the rate-limit key
 */
function rateLimitKey(address) {
  if (typeof address !== 'string' || address.trim().length === 0) return address;

  const candidate = address.trim();
  if (!ipaddr.isValid(candidate)) return address;

  const parsed = ipaddr.parse(candidate);
  if (parsed.kind() === 'ipv4') return parsed.toString();
  if (parsed.isIPv4MappedAddress()) return parsed.toIPv4Address().toString();

  const parts = parsed.parts;
  const prefix = new ipaddr.IPv6([parts[0], parts[1], parts[2], parts[3], 0, 0, 0, 0]);
  return `${prefix.toString()}/64`;
}

module.exports = { parseTrustProxy, getClientAddress, rateLimitKey };
