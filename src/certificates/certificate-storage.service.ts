import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { EncryptedSecret } from '../security/secrets-encryption.service';

@Injectable()
export class CertificateStorageService implements OnModuleInit {
  private readonly rootPath: string;
  constructor(private readonly configService?: ConfigService) {
    const configured =
      this.configService?.get<string>('CERTIFICATES_STORAGE_PATH') ||
      this.configService?.get<string>('CERTIFICATE_STORAGE_PATH') ||
      process.env.CERTIFICATES_STORAGE_PATH ||
      path.join(process.cwd(), 'storage', 'certificates');

    this.rootPath = path.resolve(configured);
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.rootPath, { recursive: true });
  }

  async save(
    companyId: string,
    encryptedSecret: EncryptedSecret,
  ): Promise<string> {
    this.assertValidIdentifier(companyId, 'companyId');

    const artifactId = `pfx_${crypto.randomUUID()}`;
    const companyDir = this.resolveSafePath(companyId);
    const targetFile = this.resolveSafePath(companyId, `${artifactId}.enc`);
    const tempFile = this.resolveSafePath(companyId, `${artifactId}.${Date.now()}.tmp`);

    const payload = JSON.stringify(encryptedSecret);

    try {
      await fs.mkdir(companyDir, { recursive: true });
      await fs.writeFile(tempFile, payload, 'utf8');
      await fs.rename(tempFile, targetFile);
    } catch (error) {
      // If filesystem write fails, attempt to clean temp file
      try {
        await fs.unlink(tempFile);
      } catch {}
      throw error;
    }

    return artifactId;
  }

  async get(companyId: string, artifactId: string): Promise<EncryptedSecret> {
    this.assertValidIdentifier(companyId, 'companyId');
    this.assertValidIdentifier(artifactId, 'artifactId');

    const targetFile = this.resolveSafePath(companyId, `${artifactId}.enc`);

    try {
      const raw = await fs.readFile(targetFile, 'utf8');
      const parsed = JSON.parse(raw) as EncryptedSecret;
      if (!parsed.encrypted || !parsed.iv || !parsed.authTag) {
        throw new Error('Invalid encrypted certificate artifact.');
      }
      return parsed;
    } catch {
      throw new NotFoundException(
        `Certificate artifact '${artifactId}' not found.`,
      );
    }
  }

  async delete(companyId: string, artifactId: string): Promise<boolean> {
    this.assertValidIdentifier(companyId, 'companyId');
    this.assertValidIdentifier(artifactId, 'artifactId');

    const targetFile = this.resolveSafePath(companyId, `${artifactId}.enc`);
    try {
      await fs.unlink(targetFile);
      return true;
    } catch {
      return false;
    }
  }

  private assertValidIdentifier(id: string, name: string): void {
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new BadRequestException(`Invalid ${name} format.`);
    }
  }

  private resolveSafePath(...segments: string[]): string {
    const resolved = path.resolve(this.rootPath, ...segments);
    const relative = path.relative(this.rootPath, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('Path traversal detected in storage path.');
    }

    return resolved;
  }
}
