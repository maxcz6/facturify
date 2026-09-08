import { BadGatewayException } from '@nestjs/common';
import { SunatSoapGateway } from '../src/sunat/sunat-soap.gateway';

describe('SunatSoapGateway', () => {
  const request = {
    fileName: '20123456789-01-F001-1.zip',
    zipContent: Buffer.from('zip'),
    credentials: { ruc: '20123456789', solUsername: 'MODDATOS', solPassword: 'secret<&' },
    environment: 'BETA' as const,
  };
  const originalFetch = global.fetch;

  afterEach(() => { global.fetch = originalFetch; });

  it('sends WS-Security credentials and decodes the CDR', async () => {
    const cdr = Buffer.from('cdr-zip');
    global.fetch = jest.fn().mockResolvedValue(new Response(
      `<soap:Envelope><soap:Body><applicationResponse>${cdr.toString('base64')}</applicationResponse></soap:Body></soap:Envelope>`,
      { status: 200, headers: { 'x-request-id': 'sunat-1' } },
    ));
    const gateway = new SunatSoapGateway({ get: jest.fn().mockReturnValue(5000) } as any);

    await expect(gateway.sendBill(request)).resolves.toEqual({ cdrZip: cdr, requestId: 'sunat-1' });
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.body).toContain('<wsse:Username>20123456789MODDATOS</wsse:Username>');
    expect(options.body).toContain('<wsse:Password>secret&lt;&amp;</wsse:Password>');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('e-beta.sunat.gob.pe');
  });

  it('uses only the fixed production endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('<faultstring>Rejected</faultstring>', { status: 500 }));
    const gateway = new SunatSoapGateway({ get: jest.fn() } as any);
    await expect(gateway.sendBill({ ...request, environment: 'PRODUCTION' })).rejects.toBeInstanceOf(BadGatewayException);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('e-factura.sunat.gob.pe');
  });

  it('rejects SOAP faults without exposing credentials', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('<soap:Fault><faultstring>Client.1234</faultstring></soap:Fault>', { status: 500 }));
    const gateway = new SunatSoapGateway({ get: jest.fn() } as any);
    await expect(gateway.sendBill(request)).rejects.toThrow('Client.1234');
  });

  it('rejects invalid filenames before making a request', async () => {
    global.fetch = jest.fn();
    const gateway = new SunatSoapGateway({ get: jest.fn() } as any);
    await expect(gateway.sendBill({ ...request, fileName: '../evil.zip' })).rejects.toBeInstanceOf(BadGatewayException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('submits a daily summary and returns its ticket', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('<ticket>ticket_123</ticket>', { status: 200 }));
    const gateway = new SunatSoapGateway({ get: jest.fn() } as any);
    await expect(gateway.sendSummary(request)).resolves.toMatchObject({ ticket: 'ticket_123' });
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.SOAPAction).toBe('urn:sendSummary');
  });

  it('queries a summary ticket and decodes its CDR', async () => {
    const cdr = Buffer.from('summary-cdr');
    global.fetch = jest.fn().mockResolvedValue(new Response(
      `<status><statusCode>0</statusCode><content>${cdr.toString('base64')}</content></status>`,
      { status: 200 },
    ));
    const gateway = new SunatSoapGateway({ get: jest.fn() } as any);
    await expect(gateway.getStatus({
      ticket: 'ticket_123', credentials: request.credentials, environment: 'BETA',
    })).resolves.toMatchObject({ statusCode: '0', cdrZip: cdr });
  });
});
