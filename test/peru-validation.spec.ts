import { BadRequestException } from '@nestjs/common';
import { maskIdentityDocument, sanitizeSafeText } from '../src/peru-validation/peru-sanitizer.util';
import { PeruValidationModule } from '../src/peru-validation/peru-validation.module';
import { PeruValidationService } from '../src/peru-validation/peru-validation.service';

describe('PeruValidationService (RUC, DNI, Series, Currencies & Masking)', () => {
  let service: PeruValidationService;

  beforeEach(() => {
    service = new PeruValidationService();
  });

  describe('Validación de RUC Peruano (Dígito Verificador & Prefijos)', () => {
    it('should validate official Peruvian RUCs with correct check digits', () => {
      // Known official Peruvian RUCs
      const validRucs = [
        '20131312955', // SUNAT
        '20100047218', // Banco de Crédito del Perú
        '20100130204', // BBVA Perú
        '20100017491', // Telefónica del Perú
        '20467534026', // América Móvil Perú (Claro)
      ];

      for (const ruc of validRucs) {
        const result = service.validateRuc(ruc);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(() => service.assertValidRuc(ruc)).not.toThrow();
      }
    });

    it('should reject RUCs with incorrect check digits and return masked error', () => {
      // Check digit tampered
      const tamperedRuc = '20131312954'; // valid is 5
      const result = service.validateRuc(tamperedRuc);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('dígito verificador inválido');
      // Must NOT reveal full RUC in error message
      expect(result.error).not.toContain(tamperedRuc);
      expect(result.error).toContain('20*****2954');

      expect(() => service.assertValidRuc(tamperedRuc)).toThrow(BadRequestException);
    });

    it('should reject RUCs with invalid length (not 11 digits)', () => {
      const shortRuc = '2013131295';
      const resultShort = service.validateRuc(shortRuc);
      expect(resultShort.isValid).toBe(false);
      expect(resultShort.error).toContain('11 dígitos');
      expect(resultShort.error).not.toContain(shortRuc);

      const longRuc = '201313129550';
      const resultLong = service.validateRuc(longRuc);
      expect(resultLong.isValid).toBe(false);
      expect(resultLong.error).toContain('11 dígitos');
      expect(resultLong.error).not.toContain(longRuc);
    });

    it('should reject RUCs with non-numeric characters', () => {
      const nonNumeric = '2013131295A';
      const result = service.validateRuc(nonNumeric);
      expect(result.isValid).toBe(false);
      expect(result.error).not.toContain(nonNumeric);
    });

    it('should reject RUCs with invalid SUNAT prefixes (not 10, 15, 17, 20, 21)', () => {
      const invalidPrefixRuc = '30123456789';
      const result = service.validateRuc(invalidPrefixRuc);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('prefijo válido de SUNAT');
      expect(result.error).not.toContain(invalidPrefixRuc);
      expect(result.error).toContain('30*****6789');
    });
  });

  describe('Validación de DNI (8 dígitos numéricos)', () => {
    it('should validate 8-digit numeric DNIs', () => {
      const validDnis = ['45678901', '01234567', '72345678', '80123456'];

      for (const dni of validDnis) {
        const result = service.validateDni(dni);
        expect(result.isValid).toBe(true);
        expect(() => service.assertValidDni(dni)).not.toThrow();
      }
    });

    it('should reject DNI with invalid length and mask in error', () => {
      const shortDni = '4567890';
      const result = service.validateDni(shortDni);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exactamente 8 dígitos');
      expect(result.error).not.toContain(shortDni);

      const longDni = '456789012';
      expect(service.validateDni(longDni).isValid).toBe(false);
    });

    it('should reject DNI with non-numeric characters', () => {
      const alphaDni = '4567890A';
      const result = service.validateDni(alphaDni);
      expect(result.isValid).toBe(false);
      expect(result.error).not.toContain(alphaDni);
    });

    it('should reject repetitive sequences like 00000000 or 11111111', () => {
      expect(service.validateDni('00000000').isValid).toBe(false);
      expect(service.validateDni('11111111').isValid).toBe(false);
      expect(service.validateDni('99999999').isValid).toBe(false);
    });
  });

  describe('Catálogo 06 y Coherencia Tipo/Número de Documento', () => {
    it('should validate type 6 (RUC) consistency', () => {
      const valid = service.validateIdentityDocument('6', '20131312955');
      expect(valid.isValid).toBe(true);

      const invalid = service.validateIdentityDocument('6', '20131312954');
      expect(invalid.isValid).toBe(false);
      expect(invalid.error).not.toContain('20131312954');
    });

    it('should validate type 1 (DNI) consistency', () => {
      const valid = service.validateIdentityDocument('1', '45678901');
      expect(valid.isValid).toBe(true);

      const invalid = service.validateIdentityDocument('1', '4567890');
      expect(invalid.isValid).toBe(false);
      expect(invalid.error).not.toContain('4567890');
    });

    it('should validate type 4 (Carnet de Extranjería) format', () => {
      expect(service.validateIdentityDocument('4', '001234567').isValid).toBe(true);
      expect(service.validateIdentityDocument('4', 'CE-123456').isValid).toBe(true);

      const tooShort = service.validateIdentityDocument('4', '12');
      expect(tooShort.isValid).toBe(false);
      expect(tooShort.error).toContain('entre 4 y 12 caracteres');

      const tooLong = service.validateIdentityDocument('4', '12345678901234');
      expect(tooLong.isValid).toBe(false);
    });

    it('should validate type 7 (Pasaporte) format', () => {
      expect(service.validateIdentityDocument('7', 'PE123456').isValid).toBe(true);

      const invalid = service.validateIdentityDocument('7', '12');
      expect(invalid.isValid).toBe(false);
      expect(invalid.error).toContain('Pasaporte');
    });

    it('should validate type A (Cédula Diplomática) format', () => {
      expect(service.validateIdentityDocument('A', 'CD-98765432').isValid).toBe(true);
      expect(service.validateIdentityDocument('A', '12').isValid).toBe(false);
    });

    it('should validate type 0 (No Domiciliado sin RUC)', () => {
      expect(service.validateIdentityDocument('0', 'NON-DOM-001').isValid).toBe(true);
      expect(service.validateIdentityDocument('0', '').isValid).toBe(false);
    });

    it('should reject invalid document type codes not in Catálogo 06', () => {
      const result = service.validateIdentityDocument('9', '12345678');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Catálogo 06');

      expect(() => service.assertValidIdentityDocument('Z', '12345678')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('Series SUNAT según Tipo de Comprobante', () => {
    it('should validate Factura series starting with F', () => {
      const validSeries = ['F001', 'F999', 'FA01', 'FC12', 'F123'];

      for (const s of validSeries) {
        expect(service.validateSeries('INVOICE', s).isValid).toBe(true);
        expect(service.validateSeries('01', s).isValid).toBe(true);
        expect(() => service.assertValidSeries('INVOICE', s)).not.toThrow();
      }
    });

    it('should reject Factura series that do not start with F', () => {
      const invalid = service.validateSeries('INVOICE', 'B001');
      expect(invalid.isValid).toBe(false);
      expect(invalid.error).toContain("debe iniciar con 'F'");

      expect(() => service.assertValidSeries('INVOICE', 'B001')).toThrow(
        BadRequestException,
      );
    });

    it('should validate Boleta series starting with B', () => {
      const validSeries = ['B001', 'B999', 'BA01', 'BC12'];

      for (const s of validSeries) {
        expect(service.validateSeries('RECEIPT', s).isValid).toBe(true);
        expect(service.validateSeries('03', s).isValid).toBe(true);
      }
    });

    it('should reject Boleta series that do not start with B', () => {
      const invalid = service.validateSeries('RECEIPT', 'F001');
      expect(invalid.isValid).toBe(false);
      expect(invalid.error).toContain("debe iniciar con 'B'");
    });

    it('should reject series with invalid length or illegal characters', () => {
      expect(service.validateSeries('INVOICE', 'F01').isValid).toBe(false); // 3 chars
      expect(service.validateSeries('INVOICE', 'F0001').isValid).toBe(false); // 5 chars
      expect(service.validateSeries('INVOICE', 'F00!').isValid).toBe(false); // special char
      expect(service.validateSeries('INVOICE', 'F 01').isValid).toBe(false); // space
    });

    it('should validate Credit/Debit Note series matching reference document type', () => {
      // Modifying an Invoice -> must start with F
      expect(service.validateSeries('CREDIT_NOTE', 'FC01', 'INVOICE').isValid).toBe(true);
      expect(service.validateSeries('DEBIT_NOTE', 'FD01', '01').isValid).toBe(true);

      const invalidInvNote = service.validateSeries('CREDIT_NOTE', 'BC01', 'INVOICE');
      expect(invalidInvNote.isValid).toBe(false);
      expect(invalidInvNote.error).toContain("debe iniciar con 'F'");

      // Modifying a Receipt -> must start with B
      expect(service.validateSeries('CREDIT_NOTE', 'BC01', 'RECEIPT').isValid).toBe(true);
      expect(service.validateSeries('DEBIT_NOTE', 'BD01', '03').isValid).toBe(true);

      const invalidRecNote = service.validateSeries('CREDIT_NOTE', 'FC01', 'RECEIPT');
      expect(invalidRecNote.isValid).toBe(false);
      expect(invalidRecNote.error).toContain("debe iniciar con 'B'");
    });

    it('should validate standalone Credit/Debit Note series starting with F or B', () => {
      expect(service.validateSeries('CREDIT_NOTE', 'FC01').isValid).toBe(true);
      expect(service.validateSeries('CREDIT_NOTE', 'BC01').isValid).toBe(true);

      const invalidNote = service.validateSeries('CREDIT_NOTE', 'EC01');
      expect(invalidNote.isValid).toBe(false);
      expect(invalidNote.error).toContain("debe iniciar con 'F'");
      expect(invalidNote.error).toContain("o 'B'");
    });

    it('should reject unknown document type in series validation', () => {
      expect(service.validateSeries('UNKNOWN_TYPE', 'F001').isValid).toBe(false);
    });
  });

  describe('Monedas ISO Permitidas Inicialmente (PEN y USD)', () => {
    it('should accept PEN and USD (case-insensitive)', () => {
      expect(service.validateCurrency('PEN').isValid).toBe(true);
      expect(service.validateCurrency('USD').isValid).toBe(true);
      expect(service.validateCurrency('pen').isValid).toBe(true);
      expect(service.validateCurrency('usd').isValid).toBe(true);

      expect(() => service.assertValidCurrency('PEN')).not.toThrow();
      expect(() => service.assertValidCurrency('USD')).not.toThrow();
    });

    it('should reject unsupported currencies with informative error', () => {
      const unsupported = ['EUR', 'GBP', 'BRL', 'SOL', 'SOLES', 'dolar', ''];

      for (const cur of unsupported) {
        const result = service.validateCurrency(cur);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Monedas soportadas inicialmente: PEN, USD');
        expect(() => service.assertValidCurrency(cur)).toThrow(BadRequestException);
      }
    });
  });

  describe('Seguridad: Caracteres Maliciosos & Ausencia de Datos Personales en Errores', () => {
    it('should never expose full RUC numbers in public validation error messages', () => {
      const testRuc = '20123456789';
      const result = service.validateRuc(testRuc);

      expect(result.isValid).toBe(false);
      expect(result.error).not.toContain(testRuc);
      expect(result.error).toContain('20*****6789');
    });

    it('should never expose full DNI numbers in public validation error messages', () => {
      const testDni = '4567890X';
      const result = service.validateDni(testDni);

      expect(result.isValid).toBe(false);
      expect(result.error).not.toContain(testDni);
      expect(result.error).toContain('45****0X');
    });

    it('should strip XSS script tags and control characters from error output', () => {
      const xssInput = "<script>alert('xss')</script>20131312955";
      const masked = maskIdentityDocument(xssInput);

      expect(masked).not.toContain('<script>');
      expect(masked).not.toContain('</script>');

      const sanitizedText = sanitizeSafeText("<script>alert('xss')</script>USD");
      expect(sanitizedText).not.toContain('<script>');
    });

    it('should neutralize CRLF injection attempts', () => {
      const crlfInput = '20131312955\r\nInjected: true';
      const masked = maskIdentityDocument(crlfInput);

      expect(masked).not.toContain('\r');
      expect(masked).not.toContain('\n');
    });
  });

  describe('PeruValidationModule', () => {
    it('should instantiate cleanly as a NestJS module', () => {
      const module = new PeruValidationModule();
      expect(module).toBeDefined();
    });
  });
});
