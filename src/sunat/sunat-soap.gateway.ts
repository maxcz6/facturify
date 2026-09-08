import { BadGatewayException, GatewayTimeoutException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { GetStatusRequest, GetStatusResult, SendBillRequest, SendBillResult, SendSummaryRequest, SendSummaryResult, SunatGateway } from './sunat-gateway';

const ENDPOINTS = {
  BETA: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  PRODUCTION: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
} as const;
const MAX_SOAP_RESPONSE_BYTES = 30 * 1024 * 1024;

@Injectable()
export class SunatSoapGateway implements SunatGateway {
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const configured = Number(config.get('SUNAT_TIMEOUT_MS') ?? 30_000);
    this.timeoutMs = Number.isFinite(configured) && configured >= 1_000 && configured <= 120_000
      ? configured
      : 30_000;
  }

  async sendBill(request: SendBillRequest): Promise<SendBillResult> {
    this.assertFileName(request.fileName);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(ENDPOINTS[request.environment], {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'urn:sendBill',
          Accept: 'text/xml',
        },
        body: this.envelope(request),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException('SUNAT request timed out.');
      }
      throw new BadGatewayException('SUNAT connection failed.');
    } finally {
      clearTimeout(timer);
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_SOAP_RESPONSE_BYTES) {
      throw new BadGatewayException('SUNAT response exceeds the allowed size.');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_SOAP_RESPONSE_BYTES) {
      throw new BadGatewayException('SUNAT response exceeds the allowed size.');
    }
    const xml = bytes.toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new BadGatewayException('Unsafe SUNAT response.');

    const fault = this.elementText(xml, 'faultstring');
    if (!response.ok || fault) {
      throw new BadGatewayException(fault || `SUNAT returned HTTP ${response.status}.`);
    }
    const encodedCdr = this.elementText(xml, 'applicationResponse');
    if (!encodedCdr || !/^[A-Za-z0-9+/\s]+={0,2}$/.test(encodedCdr)) {
      throw new BadGatewayException('SUNAT response does not contain a valid CDR.');
    }
    const cdrZip = Buffer.from(encodedCdr.replace(/\s/g, ''), 'base64');
    if (cdrZip.length === 0) throw new BadGatewayException('SUNAT returned an empty CDR.');
    return { cdrZip, requestId: response.headers.get('x-request-id') ?? randomUUID() };
  }

  async sendSummary(request: SendSummaryRequest): Promise<SendSummaryResult> {
    this.assertFileName(request.fileName);
    const result = await this.post(
      request.environment,
      'urn:sendSummary',
      this.envelopeFor('sendSummary', request.credentials, `<fileName>${this.escape(request.fileName)}</fileName><contentFile>${request.zipContent.toString('base64')}</contentFile>`),
    );
    const ticket = this.elementText(result.xml, 'ticket');
    if (!ticket || !/^[A-Za-z0-9_-]{1,100}$/.test(ticket)) {
      throw new BadGatewayException('SUNAT response does not contain a valid ticket.');
    }
    return { ticket, requestId: result.requestId };
  }

  async getStatus(request: GetStatusRequest): Promise<GetStatusResult> {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(request.ticket)) {
      throw new BadGatewayException('Invalid SUNAT ticket.');
    }
    const result = await this.post(
      request.environment,
      'urn:getStatus',
      this.envelopeFor('getStatus', request.credentials, `<ticket>${this.escape(request.ticket)}</ticket>`),
    );
    const statusCode = this.elementText(result.xml, 'statusCode');
    if (!statusCode) throw new BadGatewayException('SUNAT response does not contain a status code.');
    const content = this.elementText(result.xml, 'content');
    return {
      statusCode,
      cdrZip: content ? Buffer.from(content.replace(/\s/g, ''), 'base64') : undefined,
      requestId: result.requestId,
    };
  }

  private envelope(request: SendBillRequest): string {
    const username = this.escape(`${request.credentials.ruc}${request.credentials.solUsername}`);
    const password = this.escape(request.credentials.solPassword);
    const fileName = this.escape(request.fileName);
    const content = request.zipContent.toString('base64');
    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://schemas.xmlsoap.org/ws/2002/12/secext">` +
      `<soapenv:Header><wsse:Security><wsse:UsernameToken><wsse:Username>${username}</wsse:Username><wsse:Password>${password}</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header>` +
      `<soapenv:Body><ser:sendBill><fileName>${fileName}</fileName><contentFile>${content}</contentFile></ser:sendBill></soapenv:Body>` +
      `</soapenv:Envelope>`;
  }

  private envelopeFor(operation: string, credentials: SendBillRequest['credentials'], body: string): string {
    const username = this.escape(`${credentials.ruc}${credentials.solUsername}`);
    const password = this.escape(credentials.solPassword);
    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://schemas.xmlsoap.org/ws/2002/12/secext">` +
      `<soapenv:Header><wsse:Security><wsse:UsernameToken><wsse:Username>${username}</wsse:Username><wsse:Password>${password}</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header>` +
      `<soapenv:Body><ser:${operation}>${body}</ser:${operation}></soapenv:Body></soapenv:Envelope>`;
  }

  private async post(environment: 'BETA' | 'PRODUCTION', soapAction: string, body: string): Promise<{ xml: string; requestId: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(ENDPOINTS[environment], {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: soapAction, Accept: 'text/xml' },
        body,
        signal: controller.signal,
      });
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > MAX_SOAP_RESPONSE_BYTES) throw new BadGatewayException('SUNAT response exceeds the allowed size.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_SOAP_RESPONSE_BYTES) throw new BadGatewayException('SUNAT response exceeds the allowed size.');
      const xml = bytes.toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new BadGatewayException('Unsafe SUNAT response.');
      const fault = this.elementText(xml, 'faultstring');
      if (!response.ok || fault) throw new BadGatewayException(fault || `SUNAT returned HTTP ${response.status}.`);
      return { xml, requestId: response.headers.get('x-request-id') ?? randomUUID() };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new GatewayTimeoutException('SUNAT request timed out.');
      throw new BadGatewayException('SUNAT connection failed.');
    } finally {
      clearTimeout(timer);
    }
  }

  private elementText(xml: string, localName: string): string | undefined {
    const match = xml.match(new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${localName}>`, 'i'));
    return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  }

  private escape(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  }

  private assertFileName(fileName: string): void {
    if (!/^\d{11}-(01|03|07|08)-[A-Z0-9]{1,10}-\d+\.zip$/.test(fileName)) {
      throw new BadGatewayException('Invalid SUNAT ZIP filename.');
    }
  }
}
