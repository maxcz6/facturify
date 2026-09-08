import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';

export interface SunatDocumentName {
  ruc: string;
  documentTypeCode: '01' | '03' | '07' | '08';
  series: string;
  number: number;
}

export interface SunatZipArtifact {
  baseName: string;
  xmlFileName: string;
  zipFileName: string;
  content: Buffer;
  sha256: string;
}

@Injectable()
export class SunatZipService {
  packVoidXml(xml: string, ruc: string, communicationId: string): SunatZipArtifact {
    if (!/^\d{11}$/.test(ruc) || !/^RA-\d{8}-\d{1,5}$/.test(communicationId)) {
      throw new BadRequestException('Invalid SUNAT void communication name.');
    }
    if (!xml.includes('<ds:Signature')) throw new BadRequestException('Only signed XML can be packaged for SUNAT.');
    const baseName = `${ruc}-${communicationId}`;
    const xmlFileName = `${baseName}.xml`;
    const content = Buffer.from(zipSync({ [xmlFileName]: strToU8(xml) }, { level: 6 }));
    return { baseName, xmlFileName, zipFileName: `${baseName}.zip`, content, sha256: createHash('sha256').update(content).digest('hex') };
  }

  packSummaryXml(xml: string, ruc: string, summaryId: string): SunatZipArtifact {
    if (!/^\d{11}$/.test(ruc) || !/^RC-\d{8}-\d{1,5}$/.test(summaryId)) {
      throw new BadRequestException('Invalid SUNAT daily summary name.');
    }
    if (!xml.includes('<ds:Signature')) throw new BadRequestException('Only signed XML can be packaged for SUNAT.');
    const baseName = `${ruc}-${summaryId}`;
    const xmlFileName = `${baseName}.xml`;
    const content = Buffer.from(zipSync({ [xmlFileName]: strToU8(xml) }, { level: 6 }));
    return { baseName, xmlFileName, zipFileName: `${baseName}.zip`, content, sha256: createHash('sha256').update(content).digest('hex') };
  }

  packSignedXml(xml: string, name: SunatDocumentName): SunatZipArtifact {
    if (!/^\d{11}$/.test(name.ruc)) throw new BadRequestException('RUC must contain 11 digits.');
    if (!/^[FBR][A-Z0-9]{3}$/.test(name.series)) {
      throw new BadRequestException('Invalid SUNAT document series.');
    }
    if (!Number.isSafeInteger(name.number) || name.number < 1) {
      throw new BadRequestException('Document number must be a positive integer.');
    }
    if (!xml.includes('<ds:Signature')) {
      throw new BadRequestException('Only signed XML can be packaged for SUNAT.');
    }

    const baseName = `${name.ruc}-${name.documentTypeCode}-${name.series}-${name.number}`;
    const xmlFileName = `${baseName}.xml`;
    const content = Buffer.from(zipSync({ [xmlFileName]: strToU8(xml) }, { level: 6 }));
    return {
      baseName,
      xmlFileName,
      zipFileName: `${baseName}.zip`,
      content,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  }
}
