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
import {
  ArtifactType,
  DocumentStorage,
  StorageSizeLimits,
  StoredArtifact,
  StoredArtifactMetadata,
} from './storage.interface';

const MIME_TYPES: Record<ArtifactType, { mime: string; ext: string }> = {
  XML: { mime: 'application/xml', ext: 'xml' },
  ZIP: { mime: 'application/zip', ext: 'zip' },
  CDR: { mime: 'application/zip', ext: 'zip' },
};

const DEFAULT_LIMITS: StorageSizeLimits = {
  XML: 5 * 1024 * 1024, // 5 MB
  ZIP: 15 * 1024 * 1024, // 15 MB
  CDR: 5 * 1024 * 1024, // 5 MB
};

@Injectable()
export class DocumentStorageService implements DocumentStorage, OnModuleInit {
  private readonly rootStoragePath: string;
  private readonly sizeLimits: StorageSizeLimits;

  constructor(private readonly configService?: ConfigService) {
    const configuredPath =
      this.configService?.get<string>('DOCUMENT_STORAGE_PATH') ||
      process.env.DOCUMENT_STORAGE_PATH ||
      path.join(process.cwd(), 'storage', 'documents');

    this.rootStoragePath = path.resolve(configuredPath);

    this.sizeLimits = {
      XML: this.parseSizeLimit('STORAGE_MAX_XML_BYTES', DEFAULT_LIMITS.XML),
      ZIP: this.parseSizeLimit('STORAGE_MAX_ZIP_BYTES', DEFAULT_LIMITS.ZIP),
      CDR: this.parseSizeLimit('STORAGE_MAX_CDR_BYTES', DEFAULT_LIMITS.CDR),
    };
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.rootStoragePath, { recursive: true });
  }

  getSizeLimits(): StorageSizeLimits {
    return { ...this.sizeLimits };
  }

  async save(
    companyId: string,
    type: ArtifactType,
    content: Buffer | string,
  ): Promise<StoredArtifactMetadata> {
    this.assertValidCompanyId(companyId);

    if (!MIME_TYPES[type]) {
      throw new BadRequestException(`Unsupported artifact type: ${type}`);
    }

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const sizeBytes = buffer.length;

    // Configurable size limit enforcement
    const limit = this.sizeLimits[type] ?? DEFAULT_LIMITS[type];
    if (sizeBytes > limit) {
      throw new BadRequestException(
        `Artifact size of ${sizeBytes} bytes exceeds maximum allowed limit of ${limit} bytes for type ${type}.`,
      );
    }

    const { mime, ext } = MIME_TYPES[type];
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Generate safe internal unique identifier
    const artifactId = `art_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const derivedFilename = `${artifactId}.${ext}`;

    const companyDir = this.getCompanyDirectory(companyId);
    await fs.mkdir(companyDir, { recursive: true });

    const targetFilePath = this.resolvePath(companyDir, derivedFilename);
    const metaFilePath = this.resolvePath(companyDir, `${artifactId}.meta.json`);

    const metadata: StoredArtifactMetadata = {
      id: artifactId,
      companyId,
      type,
      sha256,
      sizeBytes,
      mimeType: mime,
      filename: derivedFilename,
      createdAt: new Date(),
    };

    // Atomic write with cleanup on failure
    try {
      await this.atomicWrite(targetFilePath, buffer);
      await this.atomicWrite(
        metaFilePath,
        Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'),
      );
    } catch (err) {
      // Clean up any artifacts on failure
      await fs.unlink(targetFilePath).catch(() => {});
      await fs.unlink(metaFilePath).catch(() => {});
      throw err;
    }

    return metadata;
  }

  async get(companyId: string, artifactId: string): Promise<StoredArtifact> {
    this.assertValidCompanyId(companyId);
    this.assertValidArtifactId(artifactId);

    const companyDir = this.getCompanyDirectory(companyId);
    const metaFilePath = this.resolvePath(companyDir, `${artifactId}.meta.json`);

    let metadataRaw: string;
    try {
      metadataRaw = await fs.readFile(metaFilePath, 'utf8');
    } catch {
      throw new NotFoundException(`Artifact '${artifactId}' not found for company '${companyId}'.`);
    }

    const metadata: StoredArtifactMetadata = JSON.parse(metadataRaw);

    if (!MIME_TYPES[metadata.type]) {
      throw new BadRequestException(`Unknown artifact type '${metadata.type}' in metadata.`);
    }

    // Never trust metadata.filename directly: derive strictly from artifactId and verified type
    const derivedFilename = `${artifactId}.${MIME_TYPES[metadata.type].ext}`;
    const targetFilePath = this.resolvePath(companyDir, derivedFilename);

    let content: Buffer;
    try {
      content = await fs.readFile(targetFilePath);
    } catch {
      throw new NotFoundException(`Artifact file for '${artifactId}' is missing on disk.`);
    }

    // Verify cryptographic integrity
    const currentHash = crypto.createHash('sha256').update(content).digest('hex');
    if (currentHash !== metadata.sha256) {
      throw new BadRequestException(
        `Cryptographic integrity mismatch for artifact '${artifactId}'. Expected ${metadata.sha256}, got ${currentHash}.`,
      );
    }

    return {
      metadata: {
        ...metadata,
        filename: derivedFilename,
        createdAt: new Date(metadata.createdAt),
      },
      content,
    };
  }

  async exists(companyId: string, artifactId: string): Promise<boolean> {
    this.assertValidCompanyId(companyId);
    this.assertValidArtifactId(artifactId);

    try {
      const companyDir = this.getCompanyDirectory(companyId);
      const metaFilePath = this.resolvePath(companyDir, `${artifactId}.meta.json`);
      await fs.access(metaFilePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(companyId: string, artifactId: string): Promise<boolean> {
    this.assertValidCompanyId(companyId);
    this.assertValidArtifactId(artifactId);

    const companyDir = this.getCompanyDirectory(companyId);
    const metaFilePath = this.resolvePath(companyDir, `${artifactId}.meta.json`);

    try {
      const metaRaw = await fs.readFile(metaFilePath, 'utf8');
      const metadata: StoredArtifactMetadata = JSON.parse(metaRaw);

      // Derive filename safely instead of trusting metadata.filename
      const derivedExt = MIME_TYPES[metadata.type]?.ext || 'bin';
      const targetFilePath = this.resolvePath(companyDir, `${artifactId}.${derivedExt}`);

      await fs.unlink(metaFilePath).catch(() => {});
      await fs.unlink(targetFilePath).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs an atomic write by saving to a temporary file in the same directory and renaming.
   * If any step fails, temporary files are immediately cleaned up.
   */
  private async atomicWrite(targetPath: string, buffer: Buffer): Promise<void> {
    const tempPath = `${targetPath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;
    try {
      await fs.writeFile(tempPath, buffer);
      await fs.rename(tempPath, targetPath);
    } catch (error) {
      // Ensure temp file is cleaned up if write or rename fails
      await fs.unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  private getCompanyDirectory(companyId: string): string {
    return this.resolvePath(this.rootStoragePath, companyId);
  }

  /**
   * Resolves a path and verifies with path.relative() that it strictly resides within baseDir.
   */
  private resolvePath(baseDir: string, relativeOrChild: string): string {
    const resolvedBase = path.resolve(baseDir);
    const resolved = path.resolve(resolvedBase, relativeOrChild);

    // Strict path traversal validation using path.relative()
    const relative = path.relative(resolvedBase, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('Security violation: Path traversal detected.');
    }

    return resolved;
  }

  private assertValidCompanyId(companyId: string): void {
    if (!companyId || typeof companyId !== 'string') {
      throw new BadRequestException('Invalid companyId parameter.');
    }

    // Must be alphanumeric with underscores/hyphens, preventing ../ or slashes
    if (!/^[a-zA-Z0-9_-]+$/.test(companyId)) {
      throw new BadRequestException(
        `Invalid companyId format: '${companyId}'. Must only contain letters, numbers, hyphens or underscores.`,
      );
    }
  }

  private assertValidArtifactId(artifactId: string): void {
    if (!artifactId || typeof artifactId !== 'string') {
      throw new BadRequestException('Invalid artifactId parameter.');
    }

    // Must start with art_ and alphanumeric
    if (!/^art_[a-zA-Z0-9]+$/.test(artifactId)) {
      throw new BadRequestException(
        `Invalid artifactId format: '${artifactId}'. Must match system format ^art_[a-zA-Z0-9]+$.`,
      );
    }
  }

  private parseSizeLimit(envKey: string, defaultValue: number): number {
    const envVal = this.configService?.get<string>(envKey) || process.env[envKey];
    if (!envVal) return defaultValue;
    const parsed = parseInt(envVal, 10);
    return isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
  }
}
