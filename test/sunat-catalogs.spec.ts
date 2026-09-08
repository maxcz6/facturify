import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  SunatCatalogsService,
  SunatCatalogsModule,
  SUNAT_DOCUMENT_TYPES,
  SUNAT_IDENTITY_TYPES,
  SUNAT_CREDIT_NOTE_REASONS,
  SUNAT_DEBIT_NOTE_REASONS,
  SUNAT_TAX_AFFECTATIONS,
  SUNAT_UNIT_MEASURES,
  SUNAT_CURRENCIES,
  sanitizeCatalogCodeForError,
} from '../src/sunat-catalogs';

describe('SunatCatalogsService', () => {
  let service: SunatCatalogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [SunatCatalogsModule],
    }).compile();

    service = module.get<SunatCatalogsService>(SunatCatalogsService);
  });

  describe('Instanciación pura e inmutabilidad de catálogos', () => {
    it('debe poder instanciarse directamente como servicio puro sin contenedor NestJS', () => {
      const pureService = new SunatCatalogsService();
      expect(pureService).toBeInstanceOf(SunatCatalogsService);
    });

    it('los conjuntos de catálogos expuestos deben ser inmutables (Object.isFrozen)', () => {
      expect(Object.isFrozen(SUNAT_DOCUMENT_TYPES)).toBe(true);
      expect(Object.isFrozen(SUNAT_IDENTITY_TYPES)).toBe(true);
      expect(Object.isFrozen(SUNAT_CREDIT_NOTE_REASONS)).toBe(true);
      expect(Object.isFrozen(SUNAT_DEBIT_NOTE_REASONS)).toBe(true);
      expect(Object.isFrozen(SUNAT_TAX_AFFECTATIONS)).toBe(true);
      expect(Object.isFrozen(SUNAT_UNIT_MEASURES)).toBe(true);
      expect(Object.isFrozen(SUNAT_CURRENCIES)).toBe(true);
    });
  });

  describe('Catálogo 01 - Tipos de Comprobante (01, 03, 07, 08)', () => {
    const validCodes = ['01', '03', '07', '08'];
    const invalidCodes = ['00', '02', '09', '1', '3', '01 ', ' 01', '01\n', '01\r\n', 'factura', 'BOLETA'];

    it.each(validCodes)('debe validar exitosamente código de comprobante válido: %s', (code) => {
      expect(service.isValidDocumentType(code)).toBe(true);
      expect(() => service.assertValidDocumentType(code)).not.toThrow();
    });

    it.each(invalidCodes)('debe rechazar código inválido, con espacios, sufijos o formatos no canónicos: %s', (code) => {
      expect(service.isValidDocumentType(code)).toBe(false);
      expect(() => service.assertValidDocumentType(code)).toThrow(BadRequestException);
    });

    it('debe rechazar tipos no string (números, objetos, null, undefined)', () => {
      expect(service.isValidDocumentType(1)).toBe(false);
      expect(service.isValidDocumentType(null)).toBe(false);
      expect(service.isValidDocumentType(undefined)).toBe(false);
      expect(service.isValidDocumentType({})).toBe(false);
    });
  });

  describe('Catálogo 06 - Tipos de Documento de Identidad (0, 1, 4, 6, 7, A, B)', () => {
    const validCodes = ['0', '1', '4', '6', '7', 'A', 'B'];
    const invalidCodes = ['2', '3', '5', '8', '9', 'C', 'a', 'b', ' 1', '1 ', '1\n', '6 '];

    it.each(validCodes)('debe validar exitosamente código de identidad válido: %s', (code) => {
      expect(service.isValidIdentityType(code)).toBe(true);
      expect(() => service.assertValidIdentityType(code)).not.toThrow();
    });

    it.each(invalidCodes)('debe rechazar minúsculas, espacios, prefijos aproximados o códigos no autorizados: %s', (code) => {
      expect(service.isValidIdentityType(code)).toBe(false);
      expect(() => service.assertValidIdentityType(code)).toThrow(BadRequestException);
    });

    it('debe rechazar valores numéricos directos sin ser string', () => {
      expect(service.isValidIdentityType(6)).toBe(false);
      expect(service.isValidIdentityType(1)).toBe(false);
    });
  });

  describe('Catálogo 09 - Motivos de Nota de Crédito (01 al 13)', () => {
    const validCodes = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];
    const invalidCodes = ['00', '14', '99', '1', '2', ' 01', '01 ', '01\r', '01\n'];

    it.each(validCodes)('debe validar exitosamente motivo de nota de crédito: %s', (code) => {
      expect(service.isValidCreditNoteReason(code)).toBe(true);
      expect(() => service.assertValidCreditNoteReason(code)).not.toThrow();
    });

    it.each(invalidCodes)('debe rechazar motivos fuera del catálogo o sin padding de dos dígitos: %s', (code) => {
      expect(service.isValidCreditNoteReason(code)).toBe(false);
      expect(() => service.assertValidCreditNoteReason(code)).toThrow(BadRequestException);
    });
  });

  describe('Catálogo 10 - Motivos de Nota de Débito (01, 02, 03, 10, 11)', () => {
    const validCodes = ['01', '02', '03', '10', '11'];
    const invalidCodes = ['04', '05', '06', '07', '08', '09', '12', '1', ' 01', '01 '];

    it.each(validCodes)('debe validar exitosamente motivo de nota de débito: %s', (code) => {
      expect(service.isValidDebitNoteReason(code)).toBe(true);
      expect(() => service.assertValidDebitNoteReason(code)).not.toThrow();
    });

    it.each(invalidCodes)('debe rechazar motivos no asignados a notas de débito: %s', (code) => {
      expect(service.isValidDebitNoteReason(code)).toBe(false);
      expect(() => service.assertValidDebitNoteReason(code)).toThrow(BadRequestException);
    });
  });

  describe('Catálogo 07 - Códigos de Afectación al IGV más comunes', () => {
    const validCodes = [
      '10', '11', '12', '13', '14', '15', '16', '17',
      '20', '21',
      '30', '31', '32', '33', '34', '35', '36',
      '40'
    ];
    const invalidCodes = ['00', '18', '22', '37', '50', '99', ' 10', '10 '];

    it.each(validCodes)('debe validar exitosamente código de afectación al IGV: %s', (code) => {
      expect(service.isValidTaxAffectation(code)).toBe(true);
      expect(() => service.assertValidTaxAffectation(code)).not.toThrow();
    });

    it.each(invalidCodes)('debe rechazar códigos de afectación desconocidos o con espacios: %s', (code) => {
      expect(service.isValidTaxAffectation(code)).toBe(false);
      expect(() => service.assertValidTaxAffectation(code)).toThrow(BadRequestException);
    });
  });

  describe('Catálogo 03 - Unidades de Medida (NIU, ZZ, KGM, LTR)', () => {
    const validCodes = ['NIU', 'ZZ', 'KGM', 'LTR'];
    const invalidCodes = ['niu', 'zz', 'kgm', 'ltr', 'Niu', 'NIU ', ' ZZ', 'KG', 'UND', 'MTR'];

    it.each(validCodes)('debe validar exitosamente unidades de medida permitidas: %s', (code) => {
      expect(service.isValidUnitMeasure(code)).toBe(true);
      expect(() => service.assertValidUnitMeasure(code)).not.toThrow();
    });

    it.each(invalidCodes)('debe rechazar minúsculas, espacios u otras unidades no permitidas: %s', (code) => {
      expect(service.isValidUnitMeasure(code)).toBe(false);
      expect(() => service.assertValidUnitMeasure(code)).toThrow(BadRequestException);
    });
  });

  describe('Catálogo 02 - Monedas (PEN, USD)', () => {
    const validCodes = ['PEN', 'USD'];
    const invalidCodes = ['pen', 'usd', 'Pen', 'EUR', 'BRL', 'PEN ', ' USD', 'S/.', '$'];

    it.each(validCodes)('debe validar exitosamente monedas soportadas: %s', (code) => {
      expect(service.isValidCurrency(code)).toBe(true);
      expect(() => service.assertValidCurrency(code)).not.toThrow();
    });

    it.each(invalidCodes)('debe rechazar minúsculas, espacios u otras monedas: %s', (code) => {
      expect(service.isValidCurrency(code)).toBe(false);
      expect(() => service.assertValidCurrency(code)).toThrow(BadRequestException);
    });
  });

  describe('Mensajes de Error Públicos Sanitizados y Ausencia de Datos Sensibles', () => {
    it('los mensajes de error deben mencionar únicamente el catálogo y el código sanitizado', () => {
      try {
        service.assertValidDocumentType('99');
        fail('Debería haber lanzado BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.message).toBe("Código de tipo de comprobante no válido en Catálogo 01 de SUNAT: '99'.");
      }
    });

    it('debe limpiar caracteres de control, CRLF y colapsar espacios en el mensaje de error', () => {
      try {
        service.assertValidIdentityType("9\r\n\x00\x1F\tmalicious");
        fail('Debería haber lanzado BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.message).not.toContain('\r');
        expect(err.message).not.toContain('\n');
        expect(err.message).not.toContain('\x00');
        expect(err.message).toBe("Código de tipo de documento de identidad no válido en Catálogo 06 de SUNAT: '9 malicious'.");
      }
    });

    it('debe manejar valores nulos o vacíos mostrando (vacío) sin fallar', () => {
      try {
        service.assertValidCurrency('');
        fail('Debería haber lanzado BadRequestException');
      } catch (err: any) {
        expect(err.message).toBe("Código de moneda no válido en Catálogo 02 de SUNAT: '(vacío)'.");
      }

      try {
        service.assertValidUnitMeasure(null);
        fail('Debería haber lanzado BadRequestException');
      } catch (err: any) {
        expect(err.message).toBe("Código de unidad de medida no válido en Catálogo 03 de SUNAT: '(vacío)'.");
      }
    });

    it('debe truncar códigos excesivamente largos para prevenir denegación de servicio o desbordamiento de log', () => {
      const longInput = 'A'.repeat(100);
      try {
        service.assertValidDocumentType(longInput);
        fail('Debería haber lanzado BadRequestException');
      } catch (err: any) {
        expect(err.message).toContain("'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA...'.");
      }
    });

    it('nunca debe incluir referencias a RUC, cliente, documentos ni payloads en los errores', () => {
      const forbiddenTerms = ['ruc', 'cliente', 'customer', 'documento_cliente', 'payload', 'empresa', 'company'];
      try {
        service.assertValidTaxAffectation('999');
      } catch (err: any) {
        const lower = err.message.toLowerCase();
        for (const term of forbiddenTerms) {
          expect(lower).not.toContain(term);
        }
      }
    });
  });

  describe('Función pura sanitizeCatalogCodeForError', () => {
    it('debe retornar (vacío) para undefined, null o whitespace', () => {
      expect(sanitizeCatalogCodeForError(undefined)).toBe('(vacío)');
      expect(sanitizeCatalogCodeForError(null)).toBe('(vacío)');
      expect(sanitizeCatalogCodeForError('   ')).toBe('(vacío)');
    });

    it('debe conservar caracteres alfanuméricos y Unicode limpios', () => {
      expect(sanitizeCatalogCodeForError('KGM')).toBe('KGM');
      expect(sanitizeCatalogCodeForError('código-123')).toBe('código-123');
    });
  });
});
