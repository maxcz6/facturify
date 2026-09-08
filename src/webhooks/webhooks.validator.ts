import { BadRequestException } from '@nestjs/common';
import * as net from 'node:net';

export class WebhookValidator {
  /**
   * Validates a webhook URL against SSRF vulnerabilities and protocol requirements.
   */
  static validateUrl(
    urlString: string,
    isProduction: boolean = process.env.NODE_ENV === 'production',
  ): void {
    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      throw new BadRequestException('Invalid webhook URL format.');
    }

    // Protocol check
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException(
        `Invalid URL protocol '${parsed.protocol}'. Only HTTP/HTTPS are supported.`,
      );
    }

    if (isProduction && parsed.protocol !== 'https:') {
      throw new BadRequestException(
        'In production environments, webhook endpoints MUST use HTTPS.',
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check prohibited hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan')
    ) {
      throw new BadRequestException(
        `Webhook URL cannot point to internal/local host '${hostname}' (SSRF protection).`,
      );
    }

    // IP address checks
    const cleanHostname = hostname.replace(/^\[|\]$/g, '');
    const ipType = net.isIP(cleanHostname);
    if (ipType === 4) {
      if (this.isPrivateOrRestrictedIPv4(cleanHostname)) {
        throw new BadRequestException(
          `Webhook URL cannot point to private, loopback, or restricted IP address '${hostname}' (SSRF protection).`,
        );
      }
    } else if (ipType === 6) {
      if (this.isPrivateOrRestrictedIPv6(cleanHostname)) {
        throw new BadRequestException(
          `Webhook URL cannot point to private, loopback, or link-local IPv6 address '${hostname}' (SSRF protection).`,
        );
      }
    }
  }

  private static isPrivateOrRestrictedIPv4(ip: string): boolean {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed is unsafe
    }

    const [a, b] = parts;

    // 0.0.0.0/8
    if (a === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (a === 10) return true;
    // 100.64.0.0/10 (Shared Address Space / CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata service)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private network: 172.16.x.x - 172.31.x.x)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF protocol assignments)
    if (a === 192 && b === 0 && parts[2] === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && parts[2] === 2) return true;
    // 192.168.0.0/16 (Private network)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved) & 255.255.255.255 (Broadcast)
    if (a >= 240) return true;

    return false;
  }

  private static isPrivateOrRestrictedIPv6(ip: string): boolean {
    const cleanIp = ip.replace(/^\[|\]$/g, '').toLowerCase();

    // Loopback
    if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1') return true;
    // Unspecified
    if (cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:0') return true;
    // Link-local: fe80::/10 (fe8, fe9, fea, feb)
    if (cleanIp.startsWith('fe8') || cleanIp.startsWith('fe9') || cleanIp.startsWith('fea') || cleanIp.startsWith('feb')) {
      return true;
    }
    // Unique local: fc00::/7 (fc, fd)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true;
    }
    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    if (cleanIp.startsWith('::ffff:') || cleanIp.startsWith('0:0:0:0:0:ffff:')) {
      const ipv4Part = cleanIp.split(':').pop();
      if (ipv4Part && net.isIP(ipv4Part) === 4) {
        return this.isPrivateOrRestrictedIPv4(ipv4Part);
      }
    }

    return false;
  }
}
