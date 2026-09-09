import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DocumentStorageService } from '../src/storage/document-storage.service';

describe('DocumentStorageService (Artifact Storage & Path Traversal Prevention)', () => {
  let service: DocumentStorageService;
  let tempStorageDir: string;

  beforeEach(async () => {
    // Create a temporary isolated directory for tests
    tempStorageDir = path.join(
      os.tmpdir(),
      `facturify_test_storage_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    );
    await fs.mkdir(tempStorageDir, { recursive: true });

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'DOCUMENT_STORAGE_PATH') return tempStorageDir;
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new DocumentStorageService(mockConfig);
    await service.onModuleInit();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempStorageDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for isolated test storage.
    }
  });

  describe('Artifact Saving (XML, ZIP, CDR)', () => {
    const sampleXml = '<?xml version="1.0" encoding="UTF-8"?><Invoice><ID>F001-1</ID></Invoice>';
    const sampleZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]); // ZIP header bytes

    it('should save and retrieve an XML document with correct metadata and SHA-256', async () => {
      const metadata = await service.save('cmp_company_1', 'XML', sampleXml);

      expect(metadata.id).toMatch(/^art_[a-zA-Z0-9]+$/);
      expect(metadata.companyId).toBe('cmp_company_1');
      expect(metadata.type).toBe('XML');
      expect(metadata.mimeType).toBe('application/xml');
      expect(metadata.filename).toMatch(/^art_[a-zA-Z0-9]+\.xml$/);
      expect(metadata.sizeBytes).toBe(Buffer.byteLength(sampleXml));

      const expectedSha256 = crypto.createHash('sha256').update(sampleXml).digest('hex');
      expect(metadata.sha256).toBe(expectedSha256);

      // Verify retrieval
      const retrieved = await service.get('cmp_company_1', metadata.id);
      expect(retrieved.content.toString('utf8')).toBe(sampleXml);
      expect(retrieved.metadata.sha256).toBe(expectedSha256);
      expect(retrieved.metadata.id).toBe(metadata.id);
    });

    it('should save and retrieve a ZIP artifact with correct MIME type', async () => {
      const metadata = await service.save('cmp_company_1', 'ZIP', sampleZip);

      expect(metadata.type).toBe('ZIP');
      expect(metadata.mimeType).toBe('application/zip');
      expect(metadata.filename).toMatch(/^art_[a-zA-Z0-9]+\.zip$/);

      const retrieved = await service.get('cmp_company_1', metadata.id);
      expect(retrieved.content.equals(sampleZip)).toBe(true);
    });

    it('should save and retrieve a CDR artifact with application/zip MIME type', async () => {
      const sampleCdr = Buffer.from('R-20123456789-01-F001-1.zip mock binary');
      const metadata = await service.save('cmp_company_1', 'CDR', sampleCdr);

      expect(metadata.type).toBe('CDR');
      expect(metadata.mimeType).toBe('application/zip');
      expect(metadata.filename).toMatch(/^art_[a-zA-Z0-9]+\.zip$/);

      const retrieved = await service.get('cmp_company_1', metadata.id);
      expect(retrieved.content.equals(sampleCdr)).toBe(true);
    });
  });

  describe('Path Traversal Prevention using path.relative()', () => {
    it('should reject companyId containing directory traversal sequences (../)', async () => {
      await expect(service.save('../etc/passwd', 'XML', '<doc/>')).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.save('..\\windows\\system32', 'XML', '<doc/>')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject companyId containing slashes or illegal path characters', async () => {
      await expect(service.save('cmp/company', 'XML', '<doc/>')).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.save('cmp\\company', 'XML', '<doc/>')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject artifactId containing directory traversal sequences', async () => {
      await expect(service.get('cmp_123', '../../secret')).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.exists('cmp_123', '../something')).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.delete('cmp_123', 'art_123/../../hack')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should catch path traversal attempts in internal resolvePath using path.relative()', () => {
      // Test resolvePath directly with relative traversal
      const resolvePath = (service as any).resolvePath.bind(service);
      expect(() => resolvePath(tempStorageDir, '../escape.txt')).toThrow(
        'Security violation: Path traversal detected.',
      );
      expect(() => resolvePath(tempStorageDir, 'sub/../../escape.txt')).toThrow(
        'Security violation: Path traversal detected.',
      );
    });
  });

  describe('Security: Deriving Filename from Artifact ID (Untrusted Metadata Defense)', () => {
    it('should ignore tampered metadata.filename and safely derive the filename from artifactId', async () => {
      const content = '<trusted-content/>';
      const metadata = await service.save('cmp_security_test', 'XML', content);

      // Create an untrusted/malicious file in the directory
      const maliciousPath = path.join(tempStorageDir, 'cmp_security_test', 'malicious.txt');
      await fs.writeFile(maliciousPath, 'evil content');

      // Tamper with the saved .meta.json to point metadata.filename to the malicious file
      const metaFilePath = path.join(
        tempStorageDir,
        'cmp_security_test',
        `${metadata.id}.meta.json`,
      );
      const metaJson = JSON.parse(await fs.readFile(metaFilePath, 'utf8'));
      metaJson.filename = 'malicious.txt';
      await fs.writeFile(metaFilePath, JSON.stringify(metaJson));

      // Retrieve via service.get(): it must derive ${metadata.id}.xml and NOT open malicious.txt!
      const retrieved = await service.get('cmp_security_test', metadata.id);
      expect(retrieved.content.toString('utf8')).toBe(content);
      expect(retrieved.metadata.filename).toBe(`${metadata.id}.xml`);
    });
  });

  describe('Configurable Size Limits for XML, ZIP and CDR', () => {
    let customLimitedService: DocumentStorageService;
    let customStorageDir: string;

    beforeEach(async () => {
      customStorageDir = path.join(
        os.tmpdir(),
        `facturify_custom_limits_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      );
      await fs.mkdir(customStorageDir, { recursive: true });

      const customConfig = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'DOCUMENT_STORAGE_PATH') return customStorageDir;
          if (key === 'STORAGE_MAX_XML_BYTES') return '100'; // 100 bytes
          if (key === 'STORAGE_MAX_ZIP_BYTES') return '200'; // 200 bytes
          if (key === 'STORAGE_MAX_CDR_BYTES') return '150'; // 150 bytes
          return undefined;
        }),
      } as unknown as ConfigService;

      customLimitedService = new DocumentStorageService(customConfig);
      await customLimitedService.onModuleInit();
    });

    afterEach(async () => {
      try {
        await fs.rm(customStorageDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup for isolated test storage.
      }
    });

    it('should reject XML exceeding STORAGE_MAX_XML_BYTES', async () => {
      const largeXml = `<invoice>${'A'.repeat(150)}</invoice>`; // > 100 bytes
      await expect(customLimitedService.save('cmp_test', 'XML', largeXml)).rejects.toThrow(
        /exceeds maximum allowed limit of 100 bytes for type XML/,
      );

      const smallXml = '<invoice>ok</invoice>'; // < 100 bytes
      const saved = await customLimitedService.save('cmp_test', 'XML', smallXml);
      expect(saved.id).toBeDefined();
    });

    it('should reject ZIP exceeding STORAGE_MAX_ZIP_BYTES', async () => {
      const largeZip = Buffer.alloc(250); // > 200 bytes
      await expect(customLimitedService.save('cmp_test', 'ZIP', largeZip)).rejects.toThrow(
        /exceeds maximum allowed limit of 200 bytes for type ZIP/,
      );

      const smallZip = Buffer.alloc(50); // < 200 bytes
      const saved = await customLimitedService.save('cmp_test', 'ZIP', smallZip);
      expect(saved.id).toBeDefined();
    });

    it('should reject CDR exceeding STORAGE_MAX_CDR_BYTES', async () => {
      const largeCdr = Buffer.alloc(180); // > 150 bytes
      await expect(customLimitedService.save('cmp_test', 'CDR', largeCdr)).rejects.toThrow(
        /exceeds maximum allowed limit of 150 bytes for type CDR/,
      );

      const smallCdr = Buffer.alloc(70); // < 150 bytes
      const saved = await customLimitedService.save('cmp_test', 'CDR', smallCdr);
      expect(saved.id).toBeDefined();
    });
  });

  describe('Atomic Write Failure Cleanup', () => {
    it('should clean up temporary files if atomicWrite fails', async () => {
      const companyDir = path.join(tempStorageDir, 'cmp_atomic_fail');
      await fs.mkdir(companyDir, { recursive: true });

      // Call atomicWrite directly with a target path that is an existing directory to force a rename error
      const targetDir = path.join(companyDir, 'existing_dir');
      await fs.mkdir(targetDir);

      await expect((service as any).atomicWrite(targetDir, Buffer.from('data'))).rejects.toThrow();

      // Verify that no orphaned .tmp files remain in the company directory
      const files = await fs.readdir(companyDir);
      const tmpFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tmpFiles.length).toBe(0);
    });

    it('should clean up the content file if writing metadata fails during save', async () => {
      const originalAtomicWrite = (service as any).atomicWrite.bind(service);
      let callCount = 0;

      jest.spyOn(service as any, 'atomicWrite').mockImplementation(async (...args: any[]) => {
        callCount++;
        if (callCount === 2) {
          // Simulate failure on writing the .meta.json file
          throw new Error('Metadata Disk I/O Error');
        }
        return originalAtomicWrite(args[0], args[1]);
      });

      await expect(service.save('cmp_cleanup_test', 'XML', '<doc/>')).rejects.toThrow(
        'Metadata Disk I/O Error',
      );

      // Verify that the content file was also cleaned up and no orphaned files remain
      const companyDir = path.join(tempStorageDir, 'cmp_cleanup_test');
      const files = await fs.readdir(companyDir);
      expect(files.length).toBe(0);
    });
  });

  describe('Multi-tenant Isolation and Integrity Verification', () => {
    it('should not allow Company B to access artifacts belonging to Company A', async () => {
      const docA = await service.save('cmp_tenant_A', 'XML', '<invoice-A/>');

      // Company A can access
      expect(await service.exists('cmp_tenant_A', docA.id)).toBe(true);

      // Company B cannot access
      expect(await service.exists('cmp_tenant_B', docA.id)).toBe(false);
      await expect(service.get('cmp_tenant_B', docA.id)).rejects.toThrow(NotFoundException);
    });

    it('should detect cryptographic corruption if file on disk was tampered with', async () => {
      const content = '<original-xml/>';
      const metadata = await service.save('cmp_tenant_A', 'XML', content);

      // Directly tamper with file content on disk
      const filePath = path.join(tempStorageDir, 'cmp_tenant_A', metadata.filename);
      await fs.writeFile(filePath, '<tampered-xml-content/>');

      // Attempting to get must detect SHA-256 mismatch
      await expect(service.get('cmp_tenant_A', metadata.id)).rejects.toThrow(
        'Cryptographic integrity mismatch',
      );
    });

    it('should properly handle file deletion and verify existence', async () => {
      const metadata = await service.save('cmp_tenant_A', 'XML', '<to-delete/>');

      expect(await service.exists('cmp_tenant_A', metadata.id)).toBe(true);

      const deleted = await service.delete('cmp_tenant_A', metadata.id);
      expect(deleted).toBe(true);

      expect(await service.exists('cmp_tenant_A', metadata.id)).toBe(false);
      await expect(service.get('cmp_tenant_A', metadata.id)).rejects.toThrow(NotFoundException);
    });
  });
});
