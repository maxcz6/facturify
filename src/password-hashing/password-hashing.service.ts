import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import {
  HASH_ALGORITHM,
  CURRENT_HASH_VERSION,
  DEFAULT_SCRYPT_PARAMS,
  SCRYPT_SAFETY_BOUNDS,
} from './password-hashing.constants';
import { parseScryptHash, needsRehash } from './password-hashing.util';

/**
 * Promisified wrapper around crypto.scrypt supporting ScryptOptions.
 */
function scryptAsync(
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        return reject(err);
      }
      resolve(derivedKey as Buffer);
    });
  });
}

@Injectable()
export class PasswordHashingService {
  /**
   * Hashes a password asynchronously using node:crypto scrypt and a cryptographic salt.
   * Does NOT trim, normalize, or alter the password in any way.
   * Returns a versioned format string:
   * scrypt
   */
  public async hash(password: string): Promise<string> {
    if (typeof password !== 'string') {
      throw new TypeError('La contrasena debe ser una cadena de texto.');
    }
    if (password.length === 0 || password.length > SCRYPT_SAFETY_BOUNDS.MAX_PASSWORD_LENGTH) {
      throw new Error('La contrasena no puede estar vacia.');
    }

    // 1. Generate 16 bytes cryptographic random salt
    const salt = crypto.randomBytes(DEFAULT_SCRYPT_PARAMS.saltLength);

    // 2. Compute key derivation asynchronously via scryptAsync
    const derivedKey = await scryptAsync(
      password,
      salt,
      DEFAULT_SCRYPT_PARAMS.keyLength,
      {
        cost: DEFAULT_SCRYPT_PARAMS.N,
        blockSize: DEFAULT_SCRYPT_PARAMS.r,
        parallelization: DEFAULT_SCRYPT_PARAMS.p,
        maxmem: DEFAULT_SCRYPT_PARAMS.maxmem,
      },
    );

    // 3. Encode into canonical versioned string
    const saltBase64url = salt.toString('base64url');
    const hashBase64url = derivedKey.toString('base64url');

    return [
      HASH_ALGORITHM,
      CURRENT_HASH_VERSION,
      DEFAULT_SCRYPT_PARAMS.N,
      DEFAULT_SCRYPT_PARAMS.r,
      DEFAULT_SCRYPT_PARAMS.p,
      saltBase64url,
      hashBase64url,
    ].join('$');
  }

  /**
   * Verifies a password against an encoded scrypt hash string.
   * Performs strict validation before calculation and uses timingSafeEqual.
   * Returns purely boolean (true if match, false otherwise) without leaking failure reasons.
   */
  public async verify(password: string, encodedHash: string): Promise<boolean> {
    if (
      typeof password !== 'string' ||
      typeof encodedHash !== 'string' ||
      password.length === 0 ||
      password.length > SCRYPT_SAFETY_BOUNDS.MAX_PASSWORD_LENGTH ||
      encodedHash.length === 0
    ) {
      return false;
    }

    // 1. Strict parsing and defensive bounds check
    const parsed = parseScryptHash(encodedHash);
    if (!parsed) {
      return false;
    }

    try {
      // 2. Derive key using parameters stored in the versioned hash
      const derivedKey = await scryptAsync(
        password,
        parsed.salt,
        parsed.hash.length,
        {
          cost: parsed.N,
          blockSize: parsed.r,
          parallelization: parsed.p,
          maxmem: SCRYPT_SAFETY_BOUNDS.MAX_MEM,
        },
      );

      // 3. Constant-time equality comparison
      if (derivedKey.length !== parsed.hash.length) {
        return false;
      }

      return crypto.timingSafeEqual(derivedKey, parsed.hash);
    } catch {
      // Return false on memory errors, computation exceptions, or invalid parameters
      return false;
    }
  }

  /**
   * Determines if a hash needs to be recomputed using upgraded or current parameters.
   * Delegates to utility without executing scrypt.
   */
  public needsRehash(encodedHash: string): boolean {
    return needsRehash(encodedHash);
  }
}
