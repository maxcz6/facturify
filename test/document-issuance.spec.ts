import { DocumentIssuanceService } from '../src/processing/document-issuance.service';

describe('DocumentIssuanceService', () => {
  it('loads tenant certificate, extracts it, prepares and submits in order', async () => {
    const calls: string[] = [];
    const certificates = { getActiveSigningMaterial: jest.fn(async () => { calls.push('certificate'); return { pfx: Buffer.from('pfx'), password: 'secret' }; }) };
    const extractor = { extract: jest.fn(async () => { calls.push('extract'); return { privateKeyPem: 'key', certificatePem: 'cert' }; }) };
    const preparation = { prepare: jest.fn(async () => { calls.push('prepare'); return {}; }) };
    const submission = { submit: jest.fn(async () => { calls.push('submit'); return { status: 'ACCEPTED' }; }) };
    const service = new DocumentIssuanceService(certificates as any, extractor as any, preparation as any, submission as any);

    await expect(service.issue('company-a', 'doc-1')).resolves.toEqual({ status: 'ACCEPTED' });
    expect(calls).toEqual(['certificate', 'extract', 'prepare', 'submit']);
    expect(preparation.prepare).toHaveBeenCalledWith('company-a', 'doc-1', expect.objectContaining({ signatureId: 'Signature-doc-1' }));
  });

  it('does not submit when preparation fails', async () => {
    const submission = { submit: jest.fn() };
    const service = new DocumentIssuanceService(
      { getActiveSigningMaterial: jest.fn().mockResolvedValue({ pfx: Buffer.from('pfx'), password: 'secret' }) } as any,
      { extract: jest.fn().mockResolvedValue({ privateKeyPem: 'key', certificatePem: 'cert' }) } as any,
      { prepare: jest.fn().mockRejectedValue(new Error('invalid XML')) } as any,
      submission as any,
    );
    await expect(service.issue('company-a', 'doc-1')).rejects.toThrow('invalid XML');
    expect(submission.submit).not.toHaveBeenCalled();
  });
});
