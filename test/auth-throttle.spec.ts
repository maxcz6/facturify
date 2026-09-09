import {
  AuthThrottleService,
  AUTH_ACTIONS,
  AuthRateLimitedException,
  RATE_LIMITED_ERROR_CODE,
  PROHIBITED_THROTTLE_OUTPUT_FIELDS,
  normalizeIdentifier,
  generateThrottleKey,
} from '../src/auth-throttle';

describe('AuthThrottleModule', () => {
  const TEST_SECRET = '0123456789abcdef0123456789abcdef';

  describe('Utility: normalizeIdentifier & generateThrottleKey', () => {
    it('normalizes email and tokens by trimming and lowercasing', () => {
      expect(normalizeIdentifier('  User@Domain.COM  ')).toBe('user@domain.com');
      expect(normalizeIdentifier('Admin-Token-XYZ ')).toBe('admin-token-xyz');
    });

    it('rejects empty or whitespace-only identifiers', () => {
      expect(() => normalizeIdentifier('')).toThrow();
      expect(() => normalizeIdentifier('   ')).toThrow();
      expect(() => normalizeIdentifier(null as unknown as string)).toThrow();
      expect(() => normalizeIdentifier(undefined as unknown as string)).toThrow();
    });

    it('generates deterministic HMAC-SHA256 keys', () => {
      const key1 = generateThrottleKey(AUTH_ACTIONS.LOGIN, 'user@domain.com', TEST_SECRET);
      const key2 = generateThrottleKey(AUTH_ACTIONS.LOGIN, ' USER@DOMAIN.COM ', TEST_SECRET);
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('partitions LOGIN and BOOTSTRAP actions with different keys for the same identifier', () => {
      const keyLogin = generateThrottleKey(AUTH_ACTIONS.LOGIN, 'identifier-123', TEST_SECRET);
      const keyBootstrap = generateThrottleKey(AUTH_ACTIONS.BOOTSTRAP, 'identifier-123', TEST_SECRET);
      expect(keyLogin).not.toBe(keyBootstrap);
    });

    it('rejects secrets that are too short (< 16 chars)', () => {
      expect(() => generateThrottleKey(AUTH_ACTIONS.LOGIN, 'user@test.com', 'short')).toThrow();
      expect(() => generateThrottleKey(AUTH_ACTIONS.LOGIN, 'user@test.com', '')).toThrow();
    });

    it('rejects invalid action types', () => {
      expect(() =>
        generateThrottleKey('UNKNOWN' as unknown as typeof AUTH_ACTIONS.LOGIN, 'user@test.com', TEST_SECRET),
      ).toThrow();
    });
  });

  describe('AuthThrottleService: Initialization', () => {
    it('initializes with valid options', () => {
      const service = new AuthThrottleService({ hmacSecret: TEST_SECRET });
      expect(service).toBeDefined();
      expect(service.getRecordCount()).toBe(0);
    });

    it('fails to initialize if hmacSecret is missing and env vars not set', () => {
      const origAuthSec = process.env.AUTH_THROTTLE_SECRET;
      const origJwtSec = process.env.JWT_SECRET;
      delete process.env.AUTH_THROTTLE_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => new AuthThrottleService({ hmacSecret: '' })).toThrow();

      process.env.AUTH_THROTTLE_SECRET = origAuthSec;
      process.env.JWT_SECRET = origJwtSec;
    });
  });

  describe('AuthThrottleService: LOGIN Policy (5 failures in 15m, 15m block)', () => {
    let currentTime = 1000000;
    let mockClock: () => number;
    let service: AuthThrottleService;

    beforeEach(() => {
      currentTime = 1000000;
      mockClock = () => currentTime;
      service = new AuthThrottleService({
        hmacSecret: TEST_SECRET,
        clock: mockClock,
      });
    });

    it('allows attempts initially', () => {
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).not.toThrow();
    });

    it('allows up to 4 failed attempts without blocking', () => {
      for (let i = 0; i < 4; i++) {
        expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).not.toThrow();
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      }
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).not.toThrow();
    });

    it('blocks on the 5th failed attempt for exactly 15 minutes', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      }

      // 5th failure reached -> blocked
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).toThrow(
        AuthRateLimitedException,
      );

      try {
        service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com');
        fail('Should have thrown AuthRateLimitedException');
      } catch (err: unknown) {
        const error = err as AuthRateLimitedException;
        expect(error.code).toBe(RATE_LIMITED_ERROR_CODE);
        expect(error.retryAfterSeconds).toBe(15 * 60); // 900 seconds
      }
    });

    it('calculates remaining retryAfterSeconds dynamically', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      }

      // Advance clock by 300 seconds (5 minutes)
      currentTime += 300 * 1000;

      try {
        service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com');
        fail('Should have thrown AuthRateLimitedException');
      } catch (err: unknown) {
        const error = err as AuthRateLimitedException;
        expect(error.code).toBe(RATE_LIMITED_ERROR_CODE);
        expect(error.retryAfterSeconds).toBe(10 * 60); // 600 seconds remaining
      }
    });

    it('automatically unblocks after 15 minutes (900 seconds)', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      }

      // Advance clock past the 15-minute block
      currentTime += 15 * 60 * 1000 + 10;

      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).not.toThrow();
    });

    it('resets failure record when failure occurs after a block period has elapsed', () => {
      for (let i = 0; i < 5; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      }

      // Fast forward past block duration
      currentTime += 16 * 60 * 1000;

      // New failure after expired block should reset state to 1 failure
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');

      // Still allowed, needs 4 more failures to block again
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).not.toThrow();
      for (let i = 0; i < 3; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      }
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).not.toThrow();

      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com'); // 5th failure
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).toThrow(
        AuthRateLimitedException,
      );
    });

    it('clears throttle record when recordSuccess is called', () => {
      for (let i = 0; i < 4; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      }

      expect(service.getRecordCount()).toBe(1);
      service.recordSuccess(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      expect(service.getRecordCount()).toBe(0);

      // Even if previously close to limit, after success fresh failures start from 1
      for (let i = 0; i < 4; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      }
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).not.toThrow();
    });

    it('resets window after 15 minutes if failure threshold was not reached', () => {
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');

      // Advance clock past window (15 minutes)
      currentTime += 15 * 60 * 1000 + 1000;

      // New failure should start a fresh window of 1 failure instead of 3
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');

      // It should take 4 more failures (total 5 in new window) to block
      for (let i = 0; i < 3; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
        expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).not.toThrow();
      }
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com'); // 5th in new window
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).toThrow(
        AuthRateLimitedException,
      );
    });
  });

  describe('AuthThrottleService: BOOTSTRAP Policy (3 failures in 30m, 30m block)', () => {
    let currentTime = 2000000;
    let mockClock: () => number;
    let service: AuthThrottleService;

    beforeEach(() => {
      currentTime = 2000000;
      mockClock = () => currentTime;
      service = new AuthThrottleService({
        hmacSecret: TEST_SECRET,
        clock: mockClock,
      });
    });

    it('blocks after 3 failed bootstrap attempts for 30 minutes', () => {
      service.recordFailure(AUTH_ACTIONS.BOOTSTRAP, '192.168.1.50');
      expect(() => service.assertAllowed(AUTH_ACTIONS.BOOTSTRAP, '192.168.1.50')).not.toThrow();

      service.recordFailure(AUTH_ACTIONS.BOOTSTRAP, '192.168.1.50');
      expect(() => service.assertAllowed(AUTH_ACTIONS.BOOTSTRAP, '192.168.1.50')).not.toThrow();

      service.recordFailure(AUTH_ACTIONS.BOOTSTRAP, '192.168.1.50');
      expect(() => service.assertAllowed(AUTH_ACTIONS.BOOTSTRAP, '192.168.1.50')).toThrow(
        AuthRateLimitedException,
      );

      try {
        service.assertAllowed(AUTH_ACTIONS.BOOTSTRAP, '192.168.1.50');
        fail('Should have thrown AuthRateLimitedException');
      } catch (err: unknown) {
        const error = err as AuthRateLimitedException;
        expect(error.retryAfterSeconds).toBe(30 * 60); // 1800 seconds
      }
    });

    it('unblocks bootstrap after 30 minutes', () => {
      for (let i = 0; i < 3; i++) {
        service.recordFailure(AUTH_ACTIONS.BOOTSTRAP, '192.168.1.50');
      }

      currentTime += 30 * 60 * 1000 + 10;
      expect(() => service.assertAllowed(AUTH_ACTIONS.BOOTSTRAP, '192.168.1.50')).not.toThrow();
    });
  });

  describe('AuthThrottleService: Action Isolation', () => {
    it('isolates LOGIN failures from BOOTSTRAP failures for identical identifier', () => {
      const currentTime = 3000000;
      const service = new AuthThrottleService({
        hmacSecret: TEST_SECRET,
        clock: () => currentTime,
      });

      const sharedIdentifier = 'admin@example.com';

      // 3 failures on BOOTSTRAP triggers block for BOOTSTRAP
      for (let i = 0; i < 3; i++) {
        service.recordFailure(AUTH_ACTIONS.BOOTSTRAP, sharedIdentifier);
      }
      expect(() => service.assertAllowed(AUTH_ACTIONS.BOOTSTRAP, sharedIdentifier)).toThrow(
        AuthRateLimitedException,
      );

      // But LOGIN for the same identifier must still be allowed!
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, sharedIdentifier)).not.toThrow();

      // Even if LOGIN has 2 failures, it is still allowed
      service.recordFailure(AUTH_ACTIONS.LOGIN, sharedIdentifier);
      service.recordFailure(AUTH_ACTIONS.LOGIN, sharedIdentifier);
      expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, sharedIdentifier)).not.toThrow();
    });
  });

  describe('AuthThrottleService: Memory Management & Eviction', () => {
    it('prunes expired entries successfully', () => {
      let currentTime = 4000000;
      const service = new AuthThrottleService({
        hmacSecret: TEST_SECRET,
        clock: () => currentTime,
      });

      // User 1 gets blocked
      for (let i = 0; i < 5; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      }

      // User 2 has 1 failure
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user2@test.com');

      expect(service.getRecordCount()).toBe(2);

      // Advance clock past 30 minutes
      currentTime += 35 * 60 * 1000;

      const pruned = service.pruneExpired();
      expect(pruned).toBe(2);
      expect(service.getRecordCount()).toBe(0);
    });

    it('frees capacity when entries expire before evicting newest active records', () => {
      let currentTime = 4500000;
      const maxEntries = 2;
      const service = new AuthThrottleService({
        hmacSecret: TEST_SECRET,
        clock: () => currentTime,
        maxEntries,
      });

      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
      currentTime += 100;
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user2@test.com');
      expect(service.getRecordCount()).toBe(2);

      // Fast forward past expiration for user1 and user2
      currentTime += 35 * 60 * 1000;

      // Adding user3 triggers pruneExpired() which frees user1 and user2
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user3@test.com');
      expect(service.getRecordCount()).toBe(1);
    });

    it('enforces maxEntries limit by evicting oldest entry when none are expired', () => {
      let currentTime = 5000000;
      const maxEntries = 3;
      const service = new AuthThrottleService({
        hmacSecret: TEST_SECRET,
        clock: () => currentTime,
        maxEntries,
      });

      currentTime += 100;
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');

      currentTime += 100;
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user2@test.com');

      currentTime += 100;
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user3@test.com');

      expect(service.getRecordCount()).toBe(3);

      // Adding 4th entry exceeds maxEntries and none are expired -> evicts oldest (user1)
      currentTime += 100;
      service.recordFailure(AUTH_ACTIONS.LOGIN, 'user4@test.com');

      expect(service.getRecordCount()).toBe(3);

      // User 2, 3, 4 should still have their failure recorded, user1 was evicted
      // If user1 failed 1 time before, it should now have 0 records and require 5 new failures
      for (let i = 0; i < 4; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, 'user1@test.com');
        expect(() => service.assertAllowed(AUTH_ACTIONS.LOGIN, 'user1@test.com')).not.toThrow();
      }
    });
  });

  describe('Security & Privacy: Absence of Sensitive Information', () => {
    it('never leaks emails, IPs, tokens, hashes or internal secrets in exception', () => {
      const email = 'confidential-executive@enterprise.com';
      const service = new AuthThrottleService({
        hmacSecret: TEST_SECRET,
      });

      for (let i = 0; i < 5; i++) {
        service.recordFailure(AUTH_ACTIONS.LOGIN, email);
      }

      try {
        service.assertAllowed(AUTH_ACTIONS.LOGIN, email);
        fail('Should throw AuthRateLimitedException');
      } catch (err: unknown) {
        const error = err as AuthRateLimitedException;
        const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));

        expect(serialized).not.toContain(email);
        expect(serialized).not.toContain(TEST_SECRET);

        for (const prohibitedField of PROHIBITED_THROTTLE_OUTPUT_FIELDS) {
          // ensure the exception object does not expose these sensitive property names
          expect((error as unknown as Record<string, unknown>)[prohibitedField]).toBeUndefined();
        }

        expect(error.code).toBe(RATE_LIMITED_ERROR_CODE);
        expect(typeof error.retryAfterSeconds).toBe('number');
        expect(error.retryAfterSeconds).toBeGreaterThan(0);
      }
    });
  });
});
