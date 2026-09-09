/**
 * Pluggable DNS Resolver interface to allow safe dependency injection and testing
 */
export interface DnsResolver {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
}

/**
 * Result returned by WebhookDnsSafetyService when validation succeeds.
 * Exclusively contains allowed: true and normalized public addresses.
 */
export interface DnsSafetyValidationResult {
  readonly allowed: true;
  readonly addresses: readonly string[];
}

/**
 * Options for WebhookDnsSafetyService evaluation
 */
export interface DnsSafetyOptions {
  timeoutMs?: number;
  maxAddresses?: number;
}
