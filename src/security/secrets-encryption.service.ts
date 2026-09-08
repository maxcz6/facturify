import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedSecret {
  encrypted: string;
  iv: string;
  authTag: string;
}

@Injectable()
export class SecretsEncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const encodedKey = config.get<string>('SECRETS_ENCRYPTION_KEY');
    if (!encodedKey) throw new Error('SECRETS_ENCRYPTION_KEY must be configured.');

    this.key = Buffer.from(encodedKey, 'base64');
    if (this.key.length !== 32) {
      throw new Error('SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes.');
    }
  }

  encrypt(value: string): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(value: EncryptedSecret): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(value.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
