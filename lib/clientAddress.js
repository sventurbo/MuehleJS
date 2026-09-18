/**
 * clientAddress.js
 * Works out which address a socket's per-address rate limit is charged to.
 *
 * X-Forwarded-For is written by whoever sends the request, so it only counts
 * when it arrives through a proxy the operator has explicitly trusted
 * (TRUST_PROXY). Honouring it unconditionally let any client send a fresh value
 * per connection and never run out of login attempts.
 *
 * The resolved address is not the key by itself, though. The server binds
 * IPv6-first ('::'), and an IPv6 client normally controls at least a whole /64
 * (frequently a /56 or a /48), so it could pick a fresh source address per
 * connection for the very same reason. rateLimitKey() therefore charges every
 * address to the block its client actually owns.
 */

const ipaddr = require('ipaddr.js');
const proxyaddr = require('proxy-addr');

/**
 * Compiles the TRUST_PROXY setting into a trust function, or returns null when
 * no proxy is trusted and the header must be ignored.
 *
 * Accepted values:
 * - unset, '', 'false' or '0': trust no proxy (default)
 * - a positive integer n: trust the n hops closest to the server
 * - a comma-separated list of addresses, CIDR ranges or the presets
 *   'loopback', 'linklocal' and 'uniquelocal'
 *
 * 'true' is rejected: trusting every hop means taking the left-most entry of
 * the chain, which is exactly the part the client writes itself.
 *
 * @param {string|undefined} value - raw setting, usually process.env.TRUST_PROXY
 * @returns {Function|null} trust function for proxy-addr, or null
 */
function compileTrustProxy(value) {
  const setting = value == null ? '' : String(value).trim();
  const lower = setting.toLowerCase();
  if (lower === '' || lower === 'false' || lower === '0') return null;

  if (lower === 'true') {
    throw new TypeError(
      'TRUST_PROXY=true would trust every hop, so clients could pick their own address. ' +
      'List the proxy addresses or give the number of proxies instead.'
    );
  }

  if (/^\d+$/.test(setting)) {
    const hops = parseInt(setting, 10);
    return (addr, hop) => hop < hops;
  }

  const entries = setting.split(',').map(entry => entry.trim()).filter(Boolean);
  try {
    return proxyaddr.compile(entries);
  } catch (err) {
    throw new TypeError(`TRUST_PROXY: ${err.message}`);
  }
}

/**
 * Returns the address a socket's per-address rate limit is charged to.
 *
 * Without a trusted proxy that is the address the connection comes from. With
 * one, the X-Forwarded-For chain is walked from the right: every hop that is a
 * trusted proxy is skipped and the first one that is not is the client. The
 * entries left of it came from the client and are never used.
 *
 * @param {Object} socket - Socket.io socket
 * @param {Function|null} trust - result of compileTrustProxy()
 * @returns {string}
 */
function getClientAddress(socket, trust) {
  const handshake = socket.handshake;
  // Mock sockets without a handshake fall back to their id.
  if (!handshake) return socket.id;
  if (!trust || !handshake.address) return handshake.address;

  return proxyaddr({
    socket: { remoteAddress: handshake.address },
    headers: handshake.headers || {}
  }, trust);
}

/**
 * Folds an address into the key its per-address budget is counted against, so
 * that one client cannot hold several budgets at once.
 *
 * - IPv4 and IPv4-mapped IPv6 ('::ffff:a.b.c.d') collapse to the plain IPv4
 *   address. The dual-stack listener reports the same client either way, and
 *   both forms must therefore share one budget.
 * - Native IPv6 collapses to its /64 prefix, the smallest block a client is
 *   normally handed in full, so moving to the next address inside it buys
 *   nothing.
 * - Anything that is not an IP address passes through unchanged. That is the
 *   socket.id fallback above, which keeps such sockets on their own budget.
 *
 * @param {string} address - result of getClientAddress()
 * @returns {string} the key to charge
 */
function rateLimitKey(address) {
  if (typeof address !== 'string' || address.trim().length === 0) return address;

  const candidate = address.trim();
  if (!ipaddr.isValid(candidate)) return address;

  const parsed = ipaddr.parse(candidate);
  if (parsed.kind() === 'ipv4') return parsed.toString();
  if (parsed.isIPv4MappedAddress()) return parsed.toIPv4Address().toString();

  const [a, b, c, d] = parsed.parts;
  return `${new ipaddr.IPv6([a, b, c, d, 0, 0, 0, 0]).toString()}/64`;
}

module.exports = { compileTrustProxy, getClientAddress, rateLimitKey };
