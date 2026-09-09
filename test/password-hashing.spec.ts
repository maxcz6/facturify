import {
  PasswordHashingService,
  HASH_ALGORITHM,
  CURRENT_HASH_VERSION,
  DEFAULT_SCRYPT_PARAMS,
  PROHIBITED_HASHING_OUTPUT_FIELDS,
  parseScryptHash,
} from '../src/password-hashing';

describe('PasswordHashingModule', () => {
  let service: PasswordHashingService;

  beforeEach(() => {
    service = new PasswordHashingService();
  });

  describe('Password Hashing & Format Verification', () => {
    it('generates a versioned self-contained scrypt hash string', async () => {
      const password = 'Super-Secure_Password!2026';
      const encodedHash = await service.hash(password);

      expect(typeof encodedHash).toBe('string');
      const parts = encodedHash.split('$');
      expect(parts).toHaveLength(7);
      expect(parts[0]).toBe(HASH_ALGORITHM);
      expect(parts[1]).toBe(CURRENT_HASH_VERSION);
      expect(Number(parts[2])).toBe(DEFAULT_SCRYPT_PARAMS.N);
      expect(Number(parts[3])).toBe(DEFAULT_SCRYPT_PARAMS.r);
      expect(Number(parts[4])).toBe(DEFAULT_SCRYPT_PARAMS.p);

      // salt and hash must be valid base64url strings
      expect(parts[5]).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(parts[6]).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates distinct salts and distinct hashes for identical passwords', async () => {
      const password = 'IdenticalPassword123!';
      const hash1 = await service.hash(password);
      const hash2 = await service.hash(password);

      expect(hash1).not.toBe(hash2);

      const parsed1 = parseScryptHash(hash1);
      const parsed2 = parseScryptHash(hash2);
      expect(parsed1).not.toBeNull();
      expect(parsed2).not.toBeNull();
      expect(parsed1?.salt.equals(parsed2!.salt)).toBe(false);
    });

    it('does not alter, trim or normalize passwords silently (preserves leading/trailing spaces)', async () => {
      const p1 = ' Password123! ';
      const p2 = 'Password123!';

      const hash1 = await service.hash(p1);

      // Verifying p1 against hash1 succeeds
      expect(await service.verify(p1, hash1)).toBe(true);

      // Verifying trimmed p2 against hash1 fails because password was preserved as-is
      expect(await service.verify(p2, hash1)).toBe(false);
    });

    it('handles unicode characters and accents accurately', async () => {
      const unicodePassword = 'Contraseña-Segura-ñ-á-é-í-ó-ú-§';
      const encodedHash = await service.hash(unicodePassword);

      expect(await service.verify(unicodePassword, encodedHash)).toBe(true);
      expect(await service.verify('Contrasena-Segura-n-a-e-i-o-u-§', encodedHash)).toBe(false);
    });

    it('handles maximum length passwords (e.g. 128 chars)', async () => {
      const longPassword = 'A!1' + 'a'.repeat(125);
      expect(longPassword).toHaveLength(128);

      const encodedHash = await service.hash(longPassword);
      expect(await service.verify(longPassword, encodedHash)).toBe(true);
      expect(await service.verify(longPassword + 'x', encodedHash)).toBe(false);
    });

    it('rejects hashing inputs above the administrative password limit', async () => {
      await expect(service.hash('A!1' + 'a'.repeat(126))).rejects.toThrow();
    });
  });

  describe('Verification: Correct and Incorrect Passwords', () => {
    it('returns true when password matches', async () => {
      const password = 'CorrectPassword#2026';
      const encodedHash = await service.hash(password);

      const isValid = await service.verify(password, encodedHash);
      expect(isValid).toBe(true);
    });

    it('returns false on incorrect password without throwing', async () => {
      const encodedHash = await service.hash('ActualPassword!1');
      const isValid = await service.verify('WrongPassword!1', encodedHash);
      expect(isValid).toBe(false);
    });

    it('returns false on empty or invalid password input', async () => {
      const encodedHash = await service.hash('ValidPass123!');
      expect(await service.verify('', encodedHash)).toBe(false);
      expect(await service.verify(null as unknown as string, encodedHash)).toBe(false);
      expect(await service.verify(undefined as unknown as string, encodedHash)).toBe(false);
    });
  });

  describe('Defense against Tampering, Corruption & Malicious Hashes', () => {
    let validHash: string;

    beforeEach(async () => {
      validHash = await service.hash('TestPassword123!');
    });

    it('rejects truncated hashes', async () => {
      const truncated = validHash.slice(0, -10);
      expect(await service.verify('TestPassword123!', truncated)).toBe(false);
    });

    it('rejects hashes with missing dollar segments', async () => {
      const badFormat = 'scrypt';
      expect(await service.verify('TestPassword123!', badFormat)).toBe(false);
    });

    it('rejects unknown algorithm or version', async () => {
      const parts = validHash.split('$');

      parts[0] = 'argon2id';
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);

      parts[0] = HASH_ALGORITHM;
      parts[1] = 'v2'; // unsupported version
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);
    });

    it('rejects altered cost parameter N (excessive N, negative, or not power of 2)', async () => {
      const parts = validHash.split('$');

      // Excessive N (e.g. 1048576) to prevent CPU DoS
      parts[2] = '1048576';
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);

      // Not a power of two
      parts[2] = '16000';
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);

      // Negative N
      parts[2] = '-16384';
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);
    });

    it('rejects altered block size r or parallelism p outside bounds', async () => {
      const parts = validHash.split('$');

      parts[3] = '100'; // r too large
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);

      parts[3] = '8';
      parts[4] = '64'; // p too large
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);
    });

    it('rejects invalid base64url characters in salt or hash', async () => {
      const parts = validHash.split('$');

      parts[5] = 'invalid+salt/with=padding!';
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);

      parts[5] = 'validBase64urlSalt';
      parts[6] = 'invalid+hash/with=padding!';
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);
    });

    it('rejects salt or hash with invalid lengths (too short)', async () => {
      const parts = validHash.split('$');

      // 4 bytes salt is too short
      parts[5] = Buffer.from('1234').toString('base64url');
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);

      // 8 bytes hash is too short
      parts[5] = Buffer.alloc(16).toString('base64url');
      parts[6] = Buffer.from('short-key').toString('base64url');
      expect(await service.verify('TestPassword123!', parts.join('$'))).toBe(false);
    });
  });

  describe('needsRehash Method', () => {
    it('returns false for current standard hash', async () => {
      const hash = await service.hash('SecurePassword#1');
      expect(service.needsRehash(hash)).toBe(false);
    });

    it('returns true for malformed hash', () => {
      expect(service.needsRehash('malformed')).toBe(true);
      expect(service.needsRehash('')).toBe(true);
    });

    it('returns true when version or parameters differ from defaults', async () => {
      const hash = await service.hash('SecurePassword#1');
      const parts = hash.split('$');

      // Older version
      parts[1] = 'v0';
      expect(service.needsRehash(parts.join('$'))).toBe(true);

      // Lower cost N
      parts[1] = CURRENT_HASH_VERSION;
      parts[2] = '8192';
      expect(service.needsRehash(parts.join('$'))).toBe(true);
    });
  });

  describe('Privacy & Absence of Sensitive Fields', () => {
    it('hash rejects invalid input types', async () => {
      await expect(service.hash(12345 as unknown as string)).rejects.toThrow(TypeError);
      await expect(service.hash('')).rejects.toThrow('La contrasena no puede estar vacia.');
    });

    it('does not expose internal parameters, secrets, or binary buffers in errors or outputs', async () => {
      const password = 'SuperSecretPassword!';
      const hash = await service.hash(password);

      expect(hash).not.toContain(password);

      for (const prohibited of PROHIBITED_HASHING_OUTPUT_FIELDS) {
        expect((service as unknown as Record<string, unknown>)[prohibited]).toBeUndefined();
      }
    });
  });
});
