import { BadRequestException, Injectable } from '@nestjs/common';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync } from 'fflate';
import * as xpath from 'xpath';
import { ParsedCdr } from './cdr.types';

const MAX_CDR_ZIP_BYTES = 10 * 1024 * 1024;
const MAX_CDR_XML_BYTES = 20 * 1024 * 1024;

@Injectable()
export class CdrService {
  extractAndParse(cdrZip: Uint8Array): ParsedCdr {
    if (cdrZip.byteLength > MAX_CDR_ZIP_BYTES) {
      throw new BadRequestException('CDR ZIP exceeds the allowed size.');
    }

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(cdrZip);
    } catch {
      throw new BadRequestException('Invalid CDR ZIP file.');
    }

    const names = Object.keys(entries);
    if (names.length === 0 || names.length > 10) {
      throw new BadRequestException('CDR ZIP contains an invalid number of entries.');
    }

    const xmlName = names.find((name) => {
      const normalized = name.replaceAll('\\', '/');
      return !normalized.includes('../') && normalized.toLowerCase().endsWith('.xml');
    });
    if (!xmlName) throw new BadRequestException('CDR ZIP does not contain an XML response.');

    const xmlBytes = entries[xmlName];
    if (xmlBytes.byteLength > MAX_CDR_XML_BYTES) {
      throw new BadRequestException('Uncompressed CDR XML exceeds the allowed size.');
    }
    return this.parseXml(Buffer.from(xmlBytes).toString('utf8'));
  }

  parseXml(xml: string): ParsedCdr {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
      throw new BadRequestException('DTD and entity declarations are not allowed in CDR XML.');
    }

    const parserErrors: string[] = [];
    const document = new DOMParser({
      onError: (level, message) => {
        if (level === 'error' || level === 'fatalError') parserErrors.push(message);
      },
    }).parseFromString(xml, 'application/xml');
    if (parserErrors.length > 0) throw new BadRequestException('Malformed CDR XML.');

    const text = (expression: string): string => {
      const value = xpath.select1(
        `string(${expression})`,
        document as unknown as Node,
      );
      return typeof value === 'string' ? value.trim() : '';
    };
    const responseCode = text("//*[local-name()='ResponseCode'][1]");
    const description = text("//*[local-name()='Description'][1]");
    if (!responseCode || !description) {
      throw new BadRequestException('CDR XML is missing response code or description.');
    }

    const noteNodes = xpath.select(
      "//*[local-name()='Note']",
      document as unknown as Node,
    ) as Node[];
    const notes = noteNodes.map((node) => node.textContent?.trim() ?? '').filter(Boolean);
    return {
      responseCode,
      description,
      notes,
      status: responseCode === '0' ? (notes.length ? 'OBSERVED' : 'ACCEPTED') : 'REJECTED',
    };
  }
}
