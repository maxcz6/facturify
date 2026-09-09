import * as net from 'node:net';

/**
 * Checks if an IPv4 address belongs to private, loopback, link-local,
 * multicast, reserved, unspecified, CGNAT, documentation, or benchmarking ranges.
 */
export function isPrivateOrRestrictedIPv4(ip: string): boolean {
  if (net.isIP(ip) !== 4) return true;

  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network / "this host")
  if (a === 0) return true;

  // 10.0.0.0/8 (Private-Use Networks - RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared Address Space / CGNAT - RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback - RFC 1122)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-Local - RFC 3927)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private-Use Networks - RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments - RFC 6890)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1, Documentation - RFC 5737)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast - RFC 7526)
  if (a === 192 && b === 88 && c === 99) return true;

  // 192.168.0.0/16 (Private-Use Networks - RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network Interconnect Device Benchmark Testing - RFC 2544)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2, Documentation - RFC 5737)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3, Documentation - RFC 5737)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast - RFC 5771: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved for Future Use - RFC 1112: 240.0.0.0 - 255.255.255.254)
  // and 255.255.255.255 (Limited Broadcast - RFC 919)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address belongs to loopback, unspecified, unique-local,
 * link-local, multicast, documentation, or IPv4-mapped IPv6.
 */
export function isPrivateOrRestrictedIPv6(ip: string): boolean {
  if (net.isIP(ip) !== 6) return true;

  const cleanIp = ip.replace(/^\[|\]$/g, '').toLowerCase().trim();

  // IPv4-mapped IPv6 (::ffff:x.x.x.x or 0:0:0:0:0:ffff:x.x.x.x)
  // Requisite: block ::ffff:x.x.x.x regardless or check if private
  if (cleanIp.startsWith('::ffff:') || cleanIp.startsWith('0:0:0:0:0:ffff:')) {
    // All IPv4-mapped addresses should be blocked or their mapped IPv4 evaluated
    const lastColonIndex = cleanIp.lastIndexOf(':');
    const mappedV4 = cleanIp.slice(lastColonIndex + 1);
    if (net.isIP(mappedV4) === 4) {
      // Regardless, requirement explicitly asks: "Bloquea especialmente ... y ::ffff:x.x.x.x"
      return true;
    }
    return true;
  }

  // Unspecified ::/128
  if (cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:0' || /^0+(:0+)*$/.test(cleanIp)) {
    return true;
  }

  // Loopback ::1/128
  if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1' || /^0+(:0+)*:1$/.test(cleanIp)) {
    return true;
  }

  // Unique Local Addresses (ULA): fc00::/7 (starts with fc or fd)
  if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
    return true;
  }

  // Link-Local Unicast: fe80::/10 (fe8, fe9, fea, feb)
  if (
    cleanIp.startsWith('fe8') ||
    cleanIp.startsWith('fe9') ||
    cleanIp.startsWith('fea') ||
    cleanIp.startsWith('feb')
  ) {
    return true;
  }

  // Multicast: ff00::/8 (starts with ff)
  if (cleanIp.startsWith('ff')) {
    return true;
  }

  // Documentation: 2001:db8::/32
  if (cleanIp.startsWith('2001:db8:') || cleanIp.startsWith('2001:0db8:')) {
    return true;
  }

  return false;
}

/**
 * Validates if an IP (v4 or v6) is safe and publicly routable.
 */
export function isPublicRoutableIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return !isPrivateOrRestrictedIPv4(ip);
  }
  if (version === 6) {
    return !isPrivateOrRestrictedIPv6(ip);
  }
  return false;
}

/**
 * Normalizes an IP address (removes enclosing brackets for IPv6, lowercases)
 */
export function normalizeIp(ip: string): string {
  return ip.replace(/^\[|\]$/g, '').trim().toLowerCase();
}
