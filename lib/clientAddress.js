import ipaddr from 'ipaddr.js';
import proxyaddr from 'proxy-addr';

export function compileTrustProxy(value) {
  const setting = String(value ?? '').trim();
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

  const entries = setting
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  try {
    return proxyaddr.compile(entries);
  } catch (err) {
    throw new TypeError(`TRUST_PROXY: ${err.message}`, { cause: err });
  }
}

export function getClientAddress(socket, trust) {
  const handshake = socket.handshake;
  if (!handshake) return socket.id;
  if (!trust || !handshake.address) return handshake.address;

  return proxyaddr(
    {
      socket: { remoteAddress: handshake.address },
      headers: handshake.headers ?? {}
    },
    trust
  );
}

export function rateLimitKey(address) {
  if (typeof address !== 'string' || address.trim().length === 0) return address;

  const candidate = address.trim();
  if (!ipaddr.isValid(candidate)) return address;

  const parsed = ipaddr.parse(candidate);
  if (parsed.kind() === 'ipv4') return parsed.toString();
  if (parsed.isIPv4MappedAddress()) return parsed.toIPv4Address().toString();

  // A native IPv6 client usually owns its whole /64, so charge the block.
  const [a, b, c, d] = parsed.parts;
  return `${new ipaddr.IPv6([a, b, c, d, 0, 0, 0, 0]).toString()}/64`;
}
