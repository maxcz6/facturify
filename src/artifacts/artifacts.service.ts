import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStorageService } from '../storage/document-storage.service';

export interface ArtifactDownloadResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

const DOCUMENT_TYPE_CODES: Record<DocumentType, string> = {
  INVOICE: '01',
  RECEIPT: '03',
  CREDIT_NOTE: '07',
  DEBIT_NOTE: '08',
};

@Injectable()
export class ArtifactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
  ) {}

  async getXml(
    companyId: string,
    documentId: string,
  ): Promise<ArtifactDownloadResult> {
    this.assertValidId(documentId, 'documentId');

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        companyId,
      },
      include: {
        company: {
          select: { ruc: true },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Document '${documentId}' not found.`);
    }

    if (!document.xmlArtifactId) {
      throw new NotFoundException(
        `XML artifact is not yet available for document '${documentId}'.`,
      );
    }

    // Retrieve exclusively using the internally stored artifact ID
    const artifact = await this.storage.get(companyId, document.xmlArtifactId);

    const typeCode = DOCUMENT_TYPE_CODES[document.type] ?? '00';
    const ruc = document.company?.ruc ?? 'CPE';
    const filename = this.sanitizeFilename(
      `${ruc}-${typeCode}-${document.series}-${document.number}.xml`,
    );

    return {
      buffer: artifact.content,
      filename,
      mimeType: 'application/xml',
      sizeBytes: artifact.metadata.sizeBytes,
      sha256: artifact.metadata.sha256,
    };
  }

  async getCdr(
    companyId: string,
    documentId: string,
  ): Promise<ArtifactDownloadResult> {
    this.assertValidId(documentId, 'documentId');

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        companyId,
      },
      include: {
        company: {
          select: { ruc: true },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Document '${documentId}' not found.`);
    }

    if (!document.cdrArtifactId) {
      throw new NotFoundException(
        `CDR artifact is not yet available for document '${documentId}'.`,
      );
    }

    // Retrieve exclusively using the internally stored artifact ID
    const artifact = await this.storage.get(companyId, document.cdrArtifactId);

    const typeCode = DOCUMENT_TYPE_CODES[document.type] ?? '00';
    const ruc = document.company?.ruc ?? 'CPE';
    const filename = this.sanitizeFilename(
      `R-${ruc}-${typeCode}-${document.series}-${document.number}.zip`,
    );

    return {
      buffer: artifact.content,
      filename,
      mimeType: 'application/zip',
      sizeBytes: artifact.metadata.sizeBytes,
      sha256: artifact.metadata.sha256,
    };
  }

  private assertValidId(id: string, name: string): void {
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new BadRequestException(`Invalid ${name} format.`);
    }
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}
