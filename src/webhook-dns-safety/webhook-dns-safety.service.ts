import { promises as dnsPromises } from 'node:dns';
import * as net from 'node:net';
import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import {
  DEFAULT_DNS_TIMEOUT_MS,
  MAX_DNS_RESOLVED_ADDRESSES,
  GENERIC_DNS_SAFETY_ERROR_MESSAGE,
} from './webhook-dns-safety.constants';
import {
  DnsResolver,
  DnsSafetyOptions,
  DnsSafetyValidationResult,
} from './webhook-dns-safety.interface';
import {
  isPublicRoutableIp,
  normalizeIp,
} from './webhook-dns-safety.util';

/**
 * Default Node.js DNS resolver implementation
 */
export class NodeDnsResolver implements DnsResolver {
  async resolve4(hostname: string): Promise<string[]> {
    try {
      return await dnsPromises.resolve4(hostname);
    } catch {
      return [];
    }
  }

  async resolve6(hostname: string): Promise<string[]> {
    try {
      return await dnsPromises.resolve6(hostname);
    } catch {
      return [];
    }
  }
}

@Injectable()
export class WebhookDnsSafetyService {
  private readonly resolver: DnsResolver;

  constructor(@Optional() customResolver?: DnsResolver) {
    this.resolver = customResolver ?? new NodeDnsResolver();
  }

  /**
   * Evaluates a validated HTTPS URL before delivery:
   * 1. Rejects if not valid HTTPS URL string.
   * 2. Extracts hostname (lowercased, bracket-stripped).
   * 3. If hostname is a raw literal IP, validates public routability directly.
   * 4. Resolves all A and AAAA DNS records concurrently within timeoutMs.
   * 5. Enforces limits: fails if no addresses returned, or exceeds maxAddresses.
   * 6. Rejects if ANY resolved address is private, loopback, link-local, multicast, etc.
   *    (Defends against DNS rebinding).
   * 7. Returns strictly { allowed: true, addresses: [...] } with normalized public IPs.
   * 8. In case of any violation, timeout, or DNS failure, throws a generic BadRequestException
   *    without exposing URLs, hostnames, IPs, DNS codes or stack traces.
   */
  async validateWebhookDestination(
    urlString: unknown,
    options?: DnsSafetyOptions
  ): Promise<DnsSafetyValidationResult> {
    if (typeof urlString !== 'string' || !urlString.trim()) {
      throw new BadRequestException(GENERIC_DNS_SAFETY_ERROR_MESSAGE);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlString.trim());
    } catch {
      throw new BadRequestException(GENERIC_DNS_SAFETY_ERROR_MESSAGE);
    }

    // Only HTTPS is allowed
    if (parsedUrl.protocol !== 'https:') {
      throw new BadRequestException(GENERIC_DNS_SAFETY_ERROR_MESSAGE);
    }

    const rawHostname = parsedUrl.hostname.trim();
    if (!rawHostname) {
      throw new BadRequestException(GENERIC_DNS_SAFETY_ERROR_MESSAGE);
    }

    const cleanHostname = rawHostname.replace(/^\[|\]$/g, '').toLowerCase();

    // Check if hostname is already a raw literal IP address
    const literalIpVersion = net.isIP(cleanHostname);
    if (literalIpVersion !== 0) {
      if (!isPublicRoutableIp(cleanHostname)) {
        throw new BadRequestException(GENERIC_DNS_SAFETY_ERROR_MESSAGE);
      }
      return Object.freeze({
        allowed: true,
        addresses: Object.freeze([normalizeIp(cleanHostname)]),
      });
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
    const maxAddresses = options?.maxAddresses ?? MAX_DNS_RESOLVED_ADDRESSES;

    let resolvedAddresses: string[];
    try {
      resolvedAddresses = await this.resolveWithTimeout(cleanHostname, timeoutMs);
    } catch {
      throw new BadRequestException(GENERIC_DNS_SAFETY_ERROR_MESSAGE);
    }

    // Must resolve to at least one address
    if (!resolvedAddresses || resolvedAddresses.length === 0) {
      throw new BadRequestException(GENERIC_DNS_SAFETY_ERROR_MESSAGE);
    }

    // Anti-abuse: limit number of resolved addresses
    if (resolvedAddresses.length > maxAddresses) {
      throw new BadRequestException(GENERIC_DNS_SAFETY_ERROR_MESSAGE);
    }

    // Deduplicate and normalize
    const uniqueNormalized = Array.from(
      new Set(resolvedAddresses.map((ip) => normalizeIp(ip)))
    );

    // Strict check: every single resolved address MUST be a public routable IP.
    // If even ONE IP is private, reserved or restricted, the entire resolution is rejected (DNS Rebinding defense).
    for (const ip of uniqueNormalized) {
      if (!isPublicRoutableIp(ip)) {
        throw new BadRequestException(GENERIC_DNS_SAFETY_ERROR_MESSAGE);
      }
    }

    return Object.freeze({
      allowed: true,
      addresses: Object.freeze(uniqueNormalized),
    });
  }

  private async resolveWithTimeout(hostname: string, timeoutMs: number): Promise<string[]> {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('DNS_TIMEOUT'));
      }, timeoutMs);
    });

    const resolutionPromise = (async () => {
      const [v4Results, v6Results] = await Promise.all([
        this.resolver.resolve4(hostname),
        this.resolver.resolve6(hostname),
      ]);
      return [...(v4Results || []), ...(v6Results || [])];
    })();

    try {
      return await Promise.race([resolutionPromise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
