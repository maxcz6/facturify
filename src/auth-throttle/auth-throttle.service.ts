import { Injectable, Optional } from '@nestjs/common';
import {
  AuthAction,
  THROTTLE_LIMITS,
  DEFAULT_MAX_ENTRIES,
  ActionThrottleLimits,
} from './auth-throttle.constants';
import {
  AuthThrottleOptions,
  Clock,
  AuthRateLimitedException,
} from './auth-throttle.interface';
import { generateThrottleKey, validateAuthAction } from './auth-throttle.util';

interface ThrottleRecord {
  failureCount: number;
  firstFailureAt: number;
  blockedUntil: number;
  lastAttemptAt: number;
}

@Injectable()
export class AuthThrottleService {
  private readonly hmacSecret: string;
  private readonly clock: Clock;
  private readonly maxEntries: number;
  private readonly records: Map<string, ThrottleRecord> = new Map();

  constructor(@Optional() options?: AuthThrottleOptions) {
    const secret = options?.hmacSecret || process.env.AUTH_THROTTLE_SECRET || process.env.JWT_SECRET;
    if (!secret || typeof secret !== 'string' || secret.length < 16) {
      throw new Error('AuthThrottleService requiere un hmacSecret valido de al menos 16 caracteres');
    }
    this.hmacSecret = secret;
    this.clock = options?.clock || (() => Date.now());
    this.maxEntries = options?.maxEntries && options.maxEntries > 0 ? options.maxEntries : DEFAULT_MAX_ENTRIES;
  }

  /**
   * Asserts that an authentication attempt is allowed for the given action and identifier.
   * Throws AuthRateLimitedException if the action is currently blocked.
   */
  public assertAllowed(action: AuthAction, identifier: string): void {
    validateAuthAction(action);
    const key = generateThrottleKey(action, identifier, this.hmacSecret);
    const record = this.records.get(key);
    if (!record) {
      return;
    }

    const now = this.clock();

    // Check if actively blocked
    if (record.blockedUntil > now) {
      const remainingMs = record.blockedUntil - now;
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      throw new AuthRateLimitedException(retryAfterSeconds);
    }

    // If block expired or window passed with no active block, prune/reset if expired
    const limits: ActionThrottleLimits = THROTTLE_LIMITS[action];
    if (now - record.firstFailureAt >= limits.windowMs && record.blockedUntil <= now) {
      this.records.delete(key);
    }
  }

  /**
   * Records a failed authentication attempt. Increments failure count,
   * establishes a sliding/fixed window, and triggers block if failure threshold is reached.
   */
  public recordFailure(action: AuthAction, identifier: string): void {
    validateAuthAction(action);
    const key = generateThrottleKey(action, identifier, this.hmacSecret);
    const limits: ActionThrottleLimits = THROTTLE_LIMITS[action];
    const now = this.clock();

    const record = this.records.get(key);

    if (!record) {
      this.ensureCapacity();
      this.records.set(key, {
        failureCount: 1,
        firstFailureAt: now,
        blockedUntil: 0,
        lastAttemptAt: now,
      });
      return;
    }

    // If the record was previously blocked but the block has already passed, reset
    if (record.blockedUntil > 0 && now >= record.blockedUntil) {
      record.failureCount = 1;
      record.firstFailureAt = now;
      record.blockedUntil = 0;
      record.lastAttemptAt = now;
      return;
    }

    // If the window has expired without hitting the limit, start fresh window
    if (record.blockedUntil === 0 && now - record.firstFailureAt >= limits.windowMs) {
      record.failureCount = 1;
      record.firstFailureAt = now;
      record.blockedUntil = 0;
      record.lastAttemptAt = now;
      return;
    }

    // Increment failures within active window
    record.failureCount += 1;
    record.lastAttemptAt = now;

    // Check if threshold reached
    if (record.failureCount >= limits.maxFailures) {
      record.blockedUntil = now + limits.blockDurationMs;
    }
  }

  /**
   * Records a successful authentication attempt. Clears any stored failure state
   * for the given action and identifier.
   */
  public recordSuccess(action: AuthAction, identifier: string): void {
    validateAuthAction(action);
    const key = generateThrottleKey(action, identifier, this.hmacSecret);
    this.records.delete(key);
  }

  /**
   * Prunes all expired records from memory.
   * A record is expired if:
   * 1. It is blocked and block has expired (now >= blockedUntil).
   * 2. It is not blocked and window has elapsed (now - firstFailureAt >= windowMs).
   * Returns the count of deleted records.
   */
  public pruneExpired(): number {
    const now = this.clock();
    let deletedCount = 0;

    for (const [key, record] of this.records.entries()) {
      if (this.isRecordExpired(record, now)) {
        this.records.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Returns the current number of active records in memory.
   * Useful for monitoring and capacity verification.
   */
  public getRecordCount(): number {
    return this.records.size;
  }

  private isRecordExpired(record: ThrottleRecord, now: number): boolean {
    if (record.blockedUntil > 0) {
      return now >= record.blockedUntil;
    }
    // Max window across all action types is 30 minutes
    const maxWindowMs = 30 * 60 * 1000;
    return now - record.firstFailureAt >= maxWindowMs;
  }

  private ensureCapacity(): void {
    if (this.records.size < this.maxEntries) {
      return;
    }

    // First attempt: prune expired records
    this.pruneExpired();

    if (this.records.size < this.maxEntries) {
      return;
    }

    // If still full, evict oldest entry by lastAttemptAt to avoid unbounded memory growth
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, record] of this.records.entries()) {
      if (record.lastAttemptAt < oldestTime) {
        oldestTime = record.lastAttemptAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.records.delete(oldestKey);
    }
  }
}
