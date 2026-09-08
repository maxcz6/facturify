import { unzipSync } from 'fflate';
import { SunatZipService } from '../src/xml/sunat-zip.service';

describe('SunatZipService', () => {
  const service = new SunatZipService();
  const signedXml = '<?xml version="1.0"?><Invoice><ds:Signature>signed</ds:Signature></Invoice>';

  it('creates a ZIP containing exactly the correctly named XML', () => {
    const artifact = service.packSignedXml(signedXml, {
      ruc: '20123456789', documentTypeCode: '01', series: 'F001', number: 42,
    });
    expect(artifact.zipFileName).toBe('20123456789-01-F001-42.zip');
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    const entries = unzipSync(artifact.content);
    expect(Object.keys(entries)).toEqual(['20123456789-01-F001-42.xml']);
  });

  it('rejects unsigned XML', () => {
    expect(() => service.packSignedXml('<Invoice/>', {
      ruc: '20123456789', documentTypeCode: '01', series: 'F001', number: 1,
    })).toThrow('Only signed XML');
  });
});
