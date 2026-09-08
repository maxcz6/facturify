import { SunatErrorCategory } from '../src/sunat-errors/sunat-error-category.enum';
import { SunatErrorClassifierService } from '../src/sunat-errors/sunat-error-classifier.service';
import { SunatErrorsModule } from '../src/sunat-errors/sunat-errors.module';

describe('SunatErrorClassifierService', () => {
  let classifier: SunatErrorClassifierService;

  beforeEach(() => {
    classifier = new SunatErrorClassifierService();
  });

  describe('Known Codes Classification & Non-Retryability', () => {
    it('should classify authentication errors as AUTHENTICATION with retryable: false', () => {
      const authCodes = ['0100', '0101', '0102', '0103', '0105', '0109', '0112', '0114', '0115'];

      for (const code of authCodes) {
        const result = classifier.classify(code);
        expect(result.category).toBe(SunatErrorCategory.AUTHENTICATION);
        expect(result.retryable).toBe(false);
        expect(result.publicCode).toBe(code);
        expect(result.publicMessage).toBeDefined();
        expect(result.publicMessage.length).toBeGreaterThan(5);
      }
    });

    it('should classify duplicate errors as DUPLICATE with retryable: false', () => {
      const duplicateCodes = ['1033', '0151', '0152', '0153', '0154', '2300', '2301', '2302'];

      for (const code of duplicateCodes) {
        const result = classifier.classify(code);
        expect(result.category).toBe(SunatErrorCategory.DUPLICATE);
        expect(result.retryable).toBe(false);
        expect(result.publicCode).toBe(code);
        expect(result.publicMessage).toBeDefined();
      }
    });

    it('should classify validation errors as VALIDATION with retryable: false', () => {
      const validationCodes = ['1001', '1002', '1003', '1004', '2014', '2015', '2020', '2023', '2027'];

      for (const code of validationCodes) {
        const result = classifier.classify(code);
        expect(result.category).toBe(SunatErrorCategory.VALIDATION);
        expect(result.retryable).toBe(false);
        expect(result.publicCode).toBe(code);
        expect(result.publicMessage).toBeDefined();
      }
    });

    it('should classify 2000-series unmapped validation codes as VALIDATION via range heuristic', () => {
      // 2099 is not in the explicit dictionary, but within the 2000-2999 range
      const result = classifier.classify('2099');
      expect(result.category).toBe(SunatErrorCategory.VALIDATION);
      expect(result.retryable).toBe(false);
      expect(result.publicCode).toBe('2099');
    });

    it('should classify rejection errors as REJECTED with retryable: false', () => {
      const rejectionCodes = ['3000', '3001', '3002', '3003', '3004', '3005', '3006', '4000'];

      for (const code of rejectionCodes) {
        const result = classifier.classify(code);
        expect(result.category).toBe(SunatErrorCategory.REJECTED);
        expect(result.retryable).toBe(false);
        expect(result.publicCode).toBe(code);
        expect(result.publicMessage).toBeDefined();
      }
    });

    it('should classify 3000-4999 unmapped rejection codes as REJECTED via range heuristic', () => {
      const result = classifier.classify('3125');
      expect(result.category).toBe(SunatErrorCategory.REJECTED);
      expect(result.retryable).toBe(false);
      expect(result.publicCode).toBe('3125');
    });
  });

  describe('Timeouts & Temporary Failures (Retryable: true)', () => {
    it('should classify network timeouts as TEMPORARY with retryable: true', () => {
      const timeoutInputs = [
        'TIMEOUT',
        'ETIMEDOUT',
        'ESOCKETTIMEDOUT',
        'SUNAT request timed out.',
        'Request timed out after 30000ms',
        new Error('connect ETIMEDOUT 190.108.99.1:443'),
      ];

      for (const input of timeoutInputs) {
        const result = classifier.classify(input);
        expect(result.category).toBe(SunatErrorCategory.TEMPORARY);
        expect(result.retryable).toBe(true);
        expect(result.publicMessage).toContain('Tiempo de espera');
      }
    });

    it('should classify connection resets and refused connections as TEMPORARY with retryable: true', () => {
      expect(classifier.classify('ECONNRESET')).toEqual({
        category: SunatErrorCategory.TEMPORARY,
        retryable: true,
        publicCode: 'ECONNRESET',
        publicMessage: expect.any(String),
      });

      expect(classifier.classify('system error: connection reset by peer')).toEqual({
        category: SunatErrorCategory.TEMPORARY,
        retryable: true,
        publicCode: 'ECONNRESET',
        publicMessage: expect.any(String),
      });

      expect(classifier.classify('network failure: econnrefused 10.0.0.1')).toEqual({
        category: SunatErrorCategory.TEMPORARY,
        retryable: true,
        publicCode: 'ECONNREFUSED',
        publicMessage: expect.any(String),
      });

      expect(classifier.classify('socket error: esockettimedout')).toEqual({
        category: SunatErrorCategory.TEMPORARY,
        retryable: true,
        publicCode: 'ESOCKETTIMEDOUT',
        publicMessage: expect.any(String),
      });

      expect(classifier.classify('dns error: enotfound sunat.gob.pe')).toEqual({
        category: SunatErrorCategory.TEMPORARY,
        retryable: true,
        publicCode: 'ENOTFOUND',
        publicMessage: expect.any(String),
      });

      expect(classifier.classify('dns lookup error: eai_again')).toEqual({
        category: SunatErrorCategory.TEMPORARY,
        retryable: true,
        publicCode: 'EAI_AGAIN',
        publicMessage: expect.any(String),
      });

      expect(classifier.classify('client error: request aborted by client')).toEqual({
        category: SunatErrorCategory.TEMPORARY,
        retryable: true,
        publicCode: 'ABORT_ERROR',
        publicMessage: expect.any(String),
      });
    });

    it('should classify HTTP 502, 503, 504 and 500 as TEMPORARY with retryable: true', () => {
      const httpErrors = [
        'HTTP_502',
        'HTTP_503',
        'HTTP_504',
        'HTTP_500',
        '502',
        '503',
        '504',
        '500',
        'SUNAT returned HTTP 502.',
        'SUNAT returned HTTP 503.',
        'SUNAT returned HTTP 504.',
      ];

      for (const err of httpErrors) {
        const result = classifier.classify(err);
        expect(result.category).toBe(SunatErrorCategory.TEMPORARY);
        expect(result.retryable).toBe(true);
      }
    });

    it('should classify SUNAT temporary fault codes (0159-0163) as TEMPORARY with retryable: true', () => {
      for (const code of ['0159', '0160', '0161', '0162', '0163']) {
        const result = classifier.classify(code);
        expect(result.category).toBe(SunatErrorCategory.TEMPORARY);
        expect(result.retryable).toBe(true);
      }
    });
  });

  describe('Unknown Codes Classification', () => {
    it('should classify unknown numeric codes as UNKNOWN with retryable: false', () => {
      const result = classifier.classify('99999');
      expect(result).toEqual({
        category: SunatErrorCategory.UNKNOWN,
        retryable: false,
        publicCode: '99999',
        publicMessage: 'Error no clasificado de SUNAT.',
      });
    });

    it('should classify unrecognized strings as UNKNOWN with retryable: false', () => {
      const result = classifier.classify('STRANGE_UNRECOGNIZED_CODE');
      expect(result.category).toBe(SunatErrorCategory.UNKNOWN);
      expect(result.retryable).toBe(false);
      expect(result.publicMessage).toBe('Error no clasificado de SUNAT.');
    });

    it('should safely handle null, undefined and empty inputs as UNKNOWN with retryable: false', () => {
      expect(classifier.classify(null)).toEqual({
        category: SunatErrorCategory.UNKNOWN,
        retryable: false,
        publicCode: 'UNKNOWN',
        publicMessage: 'Error no clasificado de SUNAT.',
      });

      expect(classifier.classify(undefined)).toEqual({
        category: SunatErrorCategory.UNKNOWN,
        retryable: false,
        publicCode: 'UNKNOWN',
        publicMessage: 'Error no clasificado de SUNAT.',
      });

      expect(classifier.classify('')).toEqual({
        category: SunatErrorCategory.UNKNOWN,
        retryable: false,
        publicCode: 'UNKNOWN',
        publicMessage: 'Error no clasificado de SUNAT.',
      });
    });
  });

  describe('Sanitización y Ausencia Estricta de Secretos', () => {
    it('should never expose SOL credentials, passwords or users from SOAP fault messages', () => {
      const leakAttempt =
        'soap-env:Client.0102: User MODDATOS with pass "SuperSecretSOL123!" not authorized for RUC 20123456789';

      const result = classifier.classify(leakAttempt);

      expect(result.category).toBe(SunatErrorCategory.AUTHENTICATION);
      expect(result.retryable).toBe(false);
      expect(result.publicCode).toBe('0102');
      // Public message must be curated and clean
      expect(result.publicMessage).toBe(
        'Usuario o contraseña SOL incorrectos o sin permisos suficientes.',
      );

      // Verify that no secret or credential is leaked
      expect(JSON.stringify(result)).not.toContain('MODDATOS');
      expect(JSON.stringify(result)).not.toContain('SuperSecretSOL123!');
      expect(JSON.stringify(result)).not.toContain('20123456789');
    });

    it('should never expose raw XML or ZIP/CDR payloads from inputs', () => {
      const xmlLeakAttempt =
        '<soap:Fault><faultcode>Client.1033</faultcode><faultstring>1033 <Invoice><cac:AccountingSupplierParty><cbc:CustomerAssignedAccountID>20100000001</cbc:CustomerAssignedAccountID></cac:AccountingSupplierParty></Invoice> C:\\storage\\20100000001-01-F001-1.zip</faultstring></soap:Fault>';

      const result = classifier.classify(xmlLeakAttempt);

      expect(result.category).toBe(SunatErrorCategory.DUPLICATE);
      expect(result.retryable).toBe(false);
      expect(result.publicCode).toBe('1033');
      expect(result.publicMessage).toBe(
        'El comprobante ya fue registrado previamente en SUNAT.',
      );

      expect(JSON.stringify(result)).not.toContain('Invoice');
      expect(JSON.stringify(result)).not.toContain('AccountingSupplierParty');
      expect(JSON.stringify(result)).not.toContain('C:\\storage');
    });

    it('should never expose stack traces or raw internal messages', () => {
      const errorWithStack = new Error('Internal driver error connecting to oracle backend at /var/sunat/drivers/oracle.so');
      errorWithStack.stack = 'Error: Internal driver error\n  at OracleDriver.connect (/var/sunat/drivers/oracle.so:123)';

      const result = classifier.classify(errorWithStack);

      expect(result.category).toBe(SunatErrorCategory.UNKNOWN);
      expect(result.retryable).toBe(false);
      expect(JSON.stringify(result)).not.toContain('oracle.so');
      expect(JSON.stringify(result)).not.toContain('var/sunat');
      expect(JSON.stringify(result)).not.toContain('OracleDriver');
    });

    it('should return exclusively the 4 expected contract keys: category, retryable, publicCode, publicMessage', () => {
      const inputs = [
        '0102',
        '1033',
        'ETIMEDOUT',
        '3001',
        'UNKNOWN_XYZ',
        { code: '0102', message: 'Secret inside' },
      ];

      for (const input of inputs) {
        const result = classifier.classify(input);
        const keys = Object.keys(result).sort();
        expect(keys).toEqual(['category', 'publicCode', 'publicMessage', 'retryable']);
      }
    });
  });

  describe('Dedicated Helper Methods', () => {
    it('classifyCdrCode should classify CDR response code', () => {
      const result = classifier.classifyCdrCode('1033');
      expect(result.category).toBe(SunatErrorCategory.DUPLICATE);
      expect(result.retryable).toBe(false);
      expect(result.publicCode).toBe('1033');
    });

    it('classifySoapFault should classify SOAP fault string', () => {
      const result = classifier.classifySoapFault('Client.0102 User not found');
      expect(result.category).toBe(SunatErrorCategory.AUTHENTICATION);
      expect(result.retryable).toBe(false);
      expect(result.publicCode).toBe('0102');
    });

    it('classifyTransportError should classify transport errors', () => {
      const result = classifier.classifyTransportError('ETIMEDOUT');
      expect(result.category).toBe(SunatErrorCategory.TEMPORARY);
      expect(result.retryable).toBe(true);
      expect(result.publicCode).toBe('ETIMEDOUT');
    });
  });

  describe('SunatErrorsModule', () => {
    it('should instantiate cleanly as a Nest module', () => {
      const module = new SunatErrorsModule();
      expect(module).toBeDefined();
    });
  });
});
