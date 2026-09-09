import {
  AdminTokenPolicyService,
  ADMIN_ROLES,
  ADMIN_TOKEN_TYPE,
  TOKEN_TIME_LIMITS,
  TOKEN_ERROR_CODES,
  PROHIBITED_TOKEN_FIELDS,
  AdminTokenPolicyException,
  normalizeClockTolerance,
  isValidUuid,
  isValidAdminRole,
  deepFreeze,
  BuildAdminClaimsInput,
} from '../src/admin-token-policy';

describe('AdminTokenPolicyModule', () => {
  const validSub = 'a1111111-1111-4111-8111-111111111111';
  const expectedIss = 'facturify-auth-service';
  const expectedAud = 'facturify-admin-portal';

  let currentTime: number;
  let service: AdminTokenPolicyService;

  beforeEach(() => {
    currentTime = 1700000000;
    service = new AdminTokenPolicyService(() => currentTime);
  });

  describe('Initialization with default clock', () => {
    it('initializes with real clock when omitted', () => {
      const defaultService = new AdminTokenPolicyService();
      const claims = defaultService.buildClaims({
        sub: validSub,
        role: 'ADMIN',
        iss: expectedIss,
        aud: expectedAud,
      });
      expect(claims.iat).toBeGreaterThan(0);
    });
  });

  describe('buildClaims', () => {
    it('builds valid admin claims with exact required schema', () => {
      const claims = service.buildClaims({
        sub: validSub,
        role: 'ADMIN',
        iss: expectedIss,
        aud: expectedAud,
        ttlSeconds: 3600,
      });

      expect(claims).toEqual({
        sub: validSub,
        role: 'ADMIN',
        tokenType: ADMIN_TOKEN_TYPE,
        iss: expectedIss,
        aud: expectedAud,
        iat: currentTime,
        exp: currentTime + 3600,
      });

      // Claims object must be deeply frozen
      expect(Object.isFrozen(claims)).toBe(true);
      expect(() => {
        (claims as unknown as Record<string, unknown>).role = 'SUPERADMIN';
      }).toThrow();
    });

    it('defaults to 8 hours (28,800 seconds) when ttlSeconds is omitted', () => {
      const claims = service.buildClaims({
        sub: validSub,
        role: 'SUPERADMIN',
        iss: expectedIss,
        aud: expectedAud,
      });

      expect(claims.exp - claims.iat).toBe(TOKEN_TIME_LIMITS.MAX_TTL_SECONDS);
      expect(claims.exp).toBe(currentTime + 28800);
    });

    it('rejects ttlSeconds exceeding 8 hours', () => {
      expect(() =>
        service.buildClaims({
          sub: validSub,
          role: 'ADMIN',
          iss: expectedIss,
          aud: expectedAud,
          ttlSeconds: 28801,
        }),
      ).toThrow(AdminTokenPolicyException);
    });

    it('rejects invalid sub (non-UUID)', () => {
      expect(() =>
        service.buildClaims({
          sub: 'not-a-uuid',
          role: 'ADMIN',
          iss: expectedIss,
          aud: expectedAud,
        }),
      ).toThrow(AdminTokenPolicyException);
    });

    it('rejects invalid role in buildClaims', () => {
      expect(() =>
        service.buildClaims({
          sub: validSub,
          role: 'USER' as unknown as typeof ADMIN_ROLES[0],
          iss: expectedIss,
          aud: expectedAud,
        }),
      ).toThrow(AdminTokenPolicyException);
    });

    it('rejects empty iss or aud in buildClaims', () => {
      expect(() =>
        service.buildClaims({
          sub: validSub,
          role: 'ADMIN',
          iss: '   ',
          aud: expectedAud,
        }),
      ).toThrow(AdminTokenPolicyException);

      expect(() =>
        service.buildClaims({
          sub: validSub,
          role: 'ADMIN',
          iss: expectedIss,
          aud: '',
        }),
      ).toThrow(AdminTokenPolicyException);
    });

    it('rejects null input in buildClaims', () => {
      expect(() =>
        service.buildClaims(null as unknown as BuildAdminClaimsInput),
      ).toThrow(AdminTokenPolicyException);
    });

    it('rejects negative or invalid iat in buildClaims', () => {
      expect(() =>
        service.buildClaims({
          sub: validSub,
          role: 'ADMIN',
          iss: expectedIss,
          aud: expectedAud,
          iat: -1,
        }),
      ).toThrow(AdminTokenPolicyException);
    });
  });

  describe('validateClaims: Happy Path & Core Properties', () => {
    const context = {
      expectedIss,
      expectedAud,
      clockToleranceSeconds: 5,
    };

    it('successfully validates a well-formed claims payload', () => {
      const claims = service.buildClaims({
        sub: validSub,
        role: 'ADMIN',
        iss: expectedIss,
        aud: expectedAud,
        ttlSeconds: 1800,
      });

      const result = service.validateClaims(claims, context);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.claims.sub).toBe(validSub);
        expect(result.claims.role).toBe('ADMIN');
        expect(result.claims.tokenType).toBe(ADMIN_TOKEN_TYPE);
        expect(result.claims.iss).toBe(expectedIss);
        expect(result.claims.aud).toBe(expectedAud);
        expect(result.claims.iat).toBe(currentTime);
        expect(result.claims.exp).toBe(currentTime + 1800);
        expect(Object.isFrozen(result.claims)).toBe(true);
      }
    });

    it('validates SUPERADMIN role correctly', () => {
      const claims = service.buildClaims({
        sub: validSub,
        role: 'SUPERADMIN',
        iss: expectedIss,
        aud: expectedAud,
      });

      const result = service.validateClaims(claims, context);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.claims.role).toBe('SUPERADMIN');
      }
    });
  });

  describe('validateClaims: Timing, Expiration & Clock Skew', () => {
    const context = {
      expectedIss,
      expectedAud,
      clockToleranceSeconds: 30,
    };

    it('rejects expired token', () => {
      const claims = service.buildClaims({
        sub: validSub,
        role: 'ADMIN',
        iss: expectedIss,
        aud: expectedAud,
        ttlSeconds: 600,
      });

      // Advance clock past expiration and tolerance (600 + 31 seconds)
      currentTime += 631;

      const result = service.validateClaims(claims, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_EXPIRED);
      }
    });

    it('accepts token within clock tolerance of expiration', () => {
      const claims = service.buildClaims({
        sub: validSub,
        role: 'ADMIN',
        iss: expectedIss,
        aud: expectedAud,
        ttlSeconds: 600,
      });

      // Advance clock 610 seconds (expired by 10s, but tolerance is 30s)
      currentTime += 610;

      const result = service.validateClaims(claims, context);
      expect(result.valid).toBe(true);
    });

    it('rejects token issued in the future beyond tolerance (TOKEN_NOT_ACTIVE)', () => {
      const futureClaims = service.buildClaims({
        sub: validSub,
        role: 'ADMIN',
        iss: expectedIss,
        aud: expectedAud,
        iat: currentTime + 100, // 100s in the future, tolerance is 30s
        ttlSeconds: 600,
      });

      const result = service.validateClaims(futureClaims, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_NOT_ACTIVE);
      }
    });

    it('accepts token issued slightly in future within tolerance', () => {
      const futureClaims = service.buildClaims({
        sub: validSub,
        role: 'ADMIN',
        iss: expectedIss,
        aud: expectedAud,
        iat: currentTime + 20, // 20s in the future, tolerance is 30s
        ttlSeconds: 600,
      });

      const result = service.validateClaims(futureClaims, context);
      expect(result.valid).toBe(true);
    });

    it('rejects token where exp <= iat', () => {
      const invalidTimingClaims = {
        sub: validSub,
        role: 'ADMIN',
        tokenType: ADMIN_TOKEN_TYPE,
        iss: expectedIss,
        aud: expectedAud,
        iat: currentTime,
        exp: currentTime, // exp equals iat
      };

      const result = service.validateClaims(invalidTimingClaims, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('rejects token with non-integer iat or exp', () => {
      const nonIntClaims = {
        sub: validSub,
        role: 'ADMIN',
        tokenType: ADMIN_TOKEN_TYPE,
        iss: expectedIss,
        aud: expectedAud,
        iat: '1700000000',
        exp: 1700001000,
      };

      const result = service.validateClaims(nonIntClaims, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('rejects token with duration exceeding 8 hours', () => {
      const overLongClaims = {
        sub: validSub,
        role: 'ADMIN',
        tokenType: ADMIN_TOKEN_TYPE,
        iss: expectedIss,
        aud: expectedAud,
        iat: currentTime,
        exp: currentTime + 28801, // 8h + 1s
      };

      const result = service.validateClaims(overLongClaims, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_INVALID);
      }
    });
  });

  describe('validateClaims: Schema Strictness & Issuer/Audience Mismatch', () => {
    const context = {
      expectedIss,
      expectedAud,
    };

    it('rejects token with missing mandatory claims', () => {
      const missingSub = {
        role: 'ADMIN',
        tokenType: ADMIN_TOKEN_TYPE,
        iss: expectedIss,
        aud: expectedAud,
        iat: currentTime,
        exp: currentTime + 3600,
      };

      const result = service.validateClaims(missingSub, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('rejects token with invalid sub UUID in validateClaims', () => {
      const badSubClaims = {
        sub: 'not-a-valid-uuid',
        role: 'ADMIN',
        tokenType: ADMIN_TOKEN_TYPE,
        iss: expectedIss,
        aud: expectedAud,
        iat: currentTime,
        exp: currentTime + 3600,
      };

      const result = service.validateClaims(badSubClaims, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('rejects token with invalid role in validateClaims', () => {
      const badRoleClaims = {
        sub: validSub,
        role: 'USER',
        tokenType: ADMIN_TOKEN_TYPE,
        iss: expectedIss,
        aud: expectedAud,
        iat: currentTime,
        exp: currentTime + 3600,
      };

      const result = service.validateClaims(badRoleClaims, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_SCOPE_INVALID);
      }
    });

    it('rejects token with extra unknown fields', () => {
      const claimsWithExtra = {
        ...service.buildClaims({
          sub: validSub,
          role: 'ADMIN',
          iss: expectedIss,
          aud: expectedAud,
        }),
        customClaim: 'unexpected-data',
      };

      const result = service.validateClaims(claimsWithExtra, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('rejects token with issuer mismatch', () => {
      const claims = service.buildClaims({
        sub: validSub,
        role: 'ADMIN',
        iss: 'other-issuer',
        aud: expectedAud,
      });

      const result = service.validateClaims(claims, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('rejects token with audience mismatch', () => {
      const claims = service.buildClaims({
        sub: validSub,
        role: 'ADMIN',
        iss: expectedIss,
        aud: 'other-audience',
      });

      const result = service.validateClaims(claims, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('rejects invalid tokenType', () => {
      const wrongType = {
        sub: validSub,
        role: 'ADMIN',
        tokenType: 'user_token',
        iss: expectedIss,
        aud: expectedAud,
        iat: currentTime,
        exp: currentTime + 3600,
      };

      const result = service.validateClaims(wrongType, context);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_SCOPE_INVALID);
      }
    });

    it('rejects non-object or array payloads', () => {
      expect(service.validateClaims(null, context).valid).toBe(false);
      expect(service.validateClaims('string-payload', context).valid).toBe(false);
      expect(service.validateClaims([], context).valid).toBe(false);
    });
  });

  describe('Security & Privacy: Absence of Prohibited Fields', () => {
    it('strictly rejects any token containing sensitive personal or internal data', () => {
      for (const prohibited of PROHIBITED_TOKEN_FIELDS) {
        const sensitivePayload = {
          ...service.buildClaims({
            sub: validSub,
            role: 'ADMIN',
            iss: expectedIss,
            aud: expectedAud,
          }),
          [prohibited]: 'sensitive-value',
        };

        const result = service.validateClaims(sensitivePayload, {
          expectedIss,
          expectedAud,
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.code).toBe(TOKEN_ERROR_CODES.TOKEN_INVALID);
          expect(result.error.message).not.toContain('sensitive-value');
        }
      }
    });
  });

  describe('Utility Edge Cases', () => {
    it('normalizes clock tolerance with bounds', () => {
      expect(normalizeClockTolerance()).toBe(0);
      expect(normalizeClockTolerance(null)).toBe(0);
      expect(normalizeClockTolerance('')).toBe(0);
      expect(normalizeClockTolerance('not-a-number')).toBe(0);
      expect(normalizeClockTolerance(-10)).toBe(0);
      expect(normalizeClockTolerance(30)).toBe(30);
      expect(normalizeClockTolerance(100)).toBe(60); // capped at 60s
    });

    it('deepFreeze handles null and non-objects gracefully', () => {
      expect(deepFreeze(null)).toBeNull();
      expect(deepFreeze(123)).toBe(123);
      expect(deepFreeze('string')).toBe('string');
      const nested = { a: { b: 2 } };
      deepFreeze(nested);
      expect(Object.isFrozen(nested.a)).toBe(true);
    });

    it('validates UUIDs and roles correctly', () => {
      expect(isValidUuid(validSub)).toBe(true);
      expect(isValidUuid('123')).toBe(false);
      expect(isValidAdminRole('ADMIN')).toBe(true);
      expect(isValidAdminRole('SUPERADMIN')).toBe(true);
      expect(isValidAdminRole('GUEST')).toBe(false);
    });
  });
});
