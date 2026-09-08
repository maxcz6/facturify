import { strToU8, zipSync } from 'fflate';
import { CdrService } from '../src/cdr/cdr.service';

describe('CdrService', () => {
  const service = new CdrService();
  const cdrXml = `<?xml version="1.0" encoding="UTF-8"?>
    <ApplicationResponse xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
      <cbc:ResponseCode>0</cbc:ResponseCode>
      <cbc:Description>La factura ha sido aceptada</cbc:Description>
    </ApplicationResponse>`;

  it('extracts and interprets an accepted CDR', () => {
    const zip = zipSync({ 'R-20123456789-01-F001-1.xml': strToU8(cdrXml) });
    expect(service.extractAndParse(zip)).toEqual({
      responseCode: '0', description: 'La factura ha sido aceptada', notes: [], status: 'ACCEPTED',
    });
  });

  it('maps CDR notes to OBSERVED', () => {
    const observed = cdrXml.replace('</ApplicationResponse>', '<cbc:Note>Observación de prueba</cbc:Note></ApplicationResponse>');
    expect(service.parseXml(observed).status).toBe('OBSERVED');
  });

  it('rejects entity declarations', () => {
    expect(() => service.parseXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'))
      .toThrow('DTD and entity declarations');
  });
});
