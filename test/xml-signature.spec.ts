import { generateKeyPairSync } from 'node:crypto';
import { UblInvoiceService } from '../src/xml/ubl-invoice.service';
import { XmlSignatureService } from '../src/xml/xml-signature.service';

describe('XmlSignatureService', () => {
  const signer = new XmlSignatureService();
  const generator = new UblInvoiceService();
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();

  const unsignedXml = generator.generateUnsigned({
    documentId: 'F001-1',
    issueDate: '2026-09-07',
    invoiceTypeCode: '01',
    currency: 'PEN',
    supplier: { documentType: '6', documentNumber: '20123456789', legalName: 'Emisor S.A.C.' },
    customer: { documentType: '6', documentNumber: '20987654321', legalName: 'Cliente S.A.C.' },
    subtotal: '100.00',
    taxAmount: '18.00',
    total: '118.00',
    lines: [{
      id: 1,
      description: 'Servicio',
      quantity: '1.0000',
      unitValue: '100.00',
      lineExtensionAmount: '100.00',
      taxAmount: '18.00',
      totalAmount: '118.00',
    }],
  });

  it('places an enveloped RSA-SHA256 signature in ExtensionContent', () => {
    const signed = signer.sign(unsignedXml, {
      privateKeyPem,
      certificatePem: publicKeyPem,
      signatureId: 'signature-F001-1',
    });
    expect(signed).toContain('<ds:Signature Id="signature-F001-1"');
    expect(signed).toContain('rsa-sha256');
    expect(signer.verify(signed, publicKeyPem)).toBe(true);
  });

  it('detects XML modified after signing', () => {
    const signed = signer.sign(unsignedXml, {
      privateKeyPem,
      certificatePem: publicKeyPem,
      signatureId: 'signature-F001-1',
    });
    expect(signer.verify(signed.replace('118.00', '999.00'), publicKeyPem)).toBe(false);
  });

  it('rejects invalid signature identifiers', () => {
    expect(() => signer.sign(unsignedXml, {
      privateKeyPem,
      certificatePem: publicKeyPem,
      signatureId: 'invalid id with spaces',
    })).toThrow('Invalid XML signature identifier');
  });
});
