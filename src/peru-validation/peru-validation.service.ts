import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DOCUMENT_TYPE_NORMALIZATION,
  RUC_FACTORS,
  SUPPORTED_CURRENCIES,
  VALID_RUC_PREFIXES,
} from './peru-validation.constants';
import {
  IdentityDocumentType,
  ValidationResult,
} from './peru-validation.interface';
import {
  maskIdentityDocument,
  sanitizeSafeText,
} from './peru-sanitizer.util';

@Injectable()
export class PeruValidationService {
  /**
   * Validates Peruvian RUC (11 numeric digits with prefix check and modulo 11 check digit).
   * Masks document numbers in error responses.
   */
  validateRuc(ruc: unknown): ValidationResult {
    const raw = typeof ruc === 'string' || typeof ruc === 'number' ? String(ruc).trim() : '';
    const masked = maskIdentityDocument(raw);

    if (!/^\d{11}$/.test(raw)) {
      return {
        isValid: false,
        error: `El RUC '${masked}' no cumple con el formato requerido de 11 dígitos numéricos.`,
        field: 'customerDocumentNumber',
      };
    }

    const prefix = raw.slice(0, 2);
    if (!VALID_RUC_PREFIXES.includes(prefix as any)) {
      return {
        isValid: false,
        error: `El RUC '${masked}' no inicia con un prefijo válido de SUNAT (10, 15, 17, 20, 21).`,
        field: 'customerDocumentNumber',
      };
    }

    // Modulo 11 verification
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(raw[i], 10) * RUC_FACTORS[i];
    }

    const remainder = sum % 11;
    let expectedCheckDigit = 11 - remainder;
    if (expectedCheckDigit === 10) expectedCheckDigit = 0;
    if (expectedCheckDigit === 11) expectedCheckDigit = 1;

    const actualCheckDigit = parseInt(raw[10], 10);
    if (actualCheckDigit !== expectedCheckDigit) {
      return {
        isValid: false,
        error: `El RUC '${masked}' tiene un dígito verificador inválido.`,
        field: 'customerDocumentNumber',
      };
    }

    return { isValid: true };
  }

  /**
   * Validates Peruvian DNI (exactly 8 numeric digits, non-trivial).
   * Masks document numbers in error responses.
   */
  validateDni(dni: unknown): ValidationResult {
    const raw = typeof dni === 'string' || typeof dni === 'number' ? String(dni).trim() : '';
    const masked = maskIdentityDocument(raw);

    if (!/^\d{8}$/.test(raw)) {
      return {
        isValid: false,
        error: `El DNI '${masked}' debe contener exactamente 8 dígitos numéricos.`,
        field: 'customerDocumentNumber',
      };
    }

    // Reject trivial sequences like 00000000 or 11111111
    if (/^(\d)\1{7}$/.test(raw)) {
      return {
        isValid: false,
        error: `El DNI '${masked}' contiene una secuencia numérica no válida.`,
        field: 'customerDocumentNumber',
      };
    }

    return { isValid: true };
  }

  /**
   * Validates identity document type and number consistency according to SUNAT Catálogo 06.
   * Masks document numbers in error responses.
   */
  validateIdentityDocument(type: unknown, number: unknown): ValidationResult {
    const typeStr = String(type ?? '').trim();
    const numberStr = String(number ?? '').trim();
    const masked = maskIdentityDocument(numberStr);

    const validTypes = Object.values(IdentityDocumentType) as string[];
    if (!validTypes.includes(typeStr)) {
      return {
        isValid: false,
        error: `Tipo de documento de identidad '${sanitizeSafeText(typeStr)}' no es válido según Catálogo 06 de SUNAT.`,
        field: 'customerDocumentType',
      };
    }

    switch (typeStr as IdentityDocumentType) {
      case IdentityDocumentType.RUC:
        return this.validateRuc(numberStr);

      case IdentityDocumentType.DNI:
        return this.validateDni(numberStr);

      case IdentityDocumentType.CARNET_EXTRANJERIA:
        if (!/^[a-zA-Z0-9-]{4,12}$/.test(numberStr)) {
          return {
            isValid: false,
            error: `El Carnet de Extranjería '${masked}' debe tener entre 4 y 12 caracteres alfanuméricos.`,
            field: 'customerDocumentNumber',
          };
        }
        return { isValid: true };

      case IdentityDocumentType.PASAPORTE:
        if (!/^[a-zA-Z0-9-]{4,12}$/.test(numberStr)) {
          return {
            isValid: false,
            error: `El Pasaporte '${masked}' debe tener entre 4 y 12 caracteres alfanuméricos.`,
            field: 'customerDocumentNumber',
          };
        }
        return { isValid: true };

      case IdentityDocumentType.CEDULA_DIPLOMATICA:
        if (!/^[a-zA-Z0-9-]{4,15}$/.test(numberStr)) {
          return {
            isValid: false,
            error: `La Cédula Diplomática '${masked}' debe tener entre 4 y 15 caracteres alfanuméricos.`,
            field: 'customerDocumentNumber',
          };
        }
        return { isValid: true };

      case IdentityDocumentType.NO_DOMICILIADO:
      case IdentityDocumentType.DOC_IDENT_PAIS_RESIDENCIA:
        if (!numberStr || !/^[a-zA-Z0-9._-]{1,15}$/.test(numberStr)) {
          return {
            isValid: false,
            error: `El documento '${masked}' debe contener entre 1 y 15 caracteres válidos.`,
            field: 'customerDocumentNumber',
          };
        }
        return { isValid: true };

      default:
        return {
          isValid: false,
          error: `Tipo de documento de identidad '${sanitizeSafeText(typeStr)}' no reconocido.`,
          field: 'customerDocumentType',
        };
    }
  }

  /**
   * Validates SUNAT series according to document type:
   * - Invoices ('INVOICE' / '01'): starts with 'F' followed by 3 alphanumeric chars (e.g. F001, FA01).
   * - Receipts ('RECEIPT' / '03'): starts with 'B' followed by 3 alphanumeric chars (e.g. B001, BA01).
   * - Credit/Debit Notes: starts with 'F' or 'B'. If referenceType is given, must match reference type.
   */
  validateSeries(
    documentType: unknown,
    series: unknown,
    referenceDocumentType?: unknown,
  ): ValidationResult {
    const rawType = String(documentType ?? '').trim();
    const rawSeries = String(series ?? '').trim().toUpperCase();
    const safeSeries = sanitizeSafeText(rawSeries);

    const normalizedType = DOCUMENT_TYPE_NORMALIZATION[rawType];
    if (!normalizedType) {
      return {
        isValid: false,
        error: `Tipo de comprobante '${sanitizeSafeText(rawType)}' no reconocido para validación de serie.`,
        field: 'series',
      };
    }

    if (!/^[A-Z0-9]{4}$/.test(rawSeries)) {
      return {
        isValid: false,
        error: `La serie '${safeSeries}' debe tener exactamente 4 caracteres alfanuméricos en mayúsculas.`,
        field: 'series',
      };
    }

    switch (normalizedType) {
      case 'INVOICE':
        if (!/^F[A-Z0-9]{3}$/.test(rawSeries)) {
          return {
            isValid: false,
            error: `La serie '${safeSeries}' no corresponde a una Factura electrónica (debe iniciar con 'F').`,
            field: 'series',
          };
        }
        return { isValid: true };

      case 'RECEIPT':
        if (!/^B[A-Z0-9]{3}$/.test(rawSeries)) {
          return {
            isValid: false,
            error: `La serie '${safeSeries}' no corresponde a una Boleta de Venta electrónica (debe iniciar con 'B').`,
            field: 'series',
          };
        }
        return { isValid: true };

      case 'CREDIT_NOTE':
      case 'DEBIT_NOTE': {
        const noteName = normalizedType === 'CREDIT_NOTE' ? 'Nota de Crédito' : 'Nota de Débito';

        if (referenceDocumentType) {
          const rawRefType = String(referenceDocumentType).trim();
          const normalizedRef = DOCUMENT_TYPE_NORMALIZATION[rawRefType];

          if (normalizedRef === 'INVOICE' && !/^F[A-Z0-9]{3}$/.test(rawSeries)) {
            return {
              isValid: false,
              error: `La serie '${safeSeries}' de la ${noteName} debe iniciar con 'F' porque modifica una Factura.`,
              field: 'series',
            };
          }

          if (normalizedRef === 'RECEIPT' && !/^B[A-Z0-9]{3}$/.test(rawSeries)) {
            return {
              isValid: false,
              error: `La serie '${safeSeries}' de la ${noteName} debe iniciar con 'B' porque modifica una Boleta.`,
              field: 'series',
            };
          }
        }

        if (!/^[FB][A-Z0-9]{3}$/.test(rawSeries)) {
          return {
            isValid: false,
            error: `La serie '${safeSeries}' de la ${noteName} debe iniciar con 'F' (para Facturas) o 'B' (para Boletas).`,
            field: 'series',
          };
        }

        return { isValid: true };
      }
    }
  }

  /**
   * Validates ISO 4217 currency. Currently initially allows 'PEN' and 'USD'.
   */
  validateCurrency(currency: unknown): ValidationResult {
    const raw = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
    const safeCurrency = sanitizeSafeText(raw);

    if (!SUPPORTED_CURRENCIES.includes(raw as any)) {
      return {
        isValid: false,
        error: `Moneda '${safeCurrency}' no permitida. Monedas soportadas inicialmente: ${SUPPORTED_CURRENCIES.join(', ')}.`,
        field: 'currency',
      };
    }

    return { isValid: true };
  }

  // === ASSERTION HELPERS (Throw BadRequestException on failure) ===

  assertValidRuc(ruc: unknown): void {
    const res = this.validateRuc(ruc);
    if (!res.isValid) throw new BadRequestException(res.error);
  }

  assertValidDni(dni: unknown): void {
    const res = this.validateDni(dni);
    if (!res.isValid) throw new BadRequestException(res.error);
  }

  assertValidIdentityDocument(type: unknown, number: unknown): void {
    const res = this.validateIdentityDocument(type, number);
    if (!res.isValid) throw new BadRequestException(res.error);
  }

  assertValidSeries(
    documentType: unknown,
    series: unknown,
    referenceDocumentType?: unknown,
  ): void {
    const res = this.validateSeries(documentType, series, referenceDocumentType);
    if (!res.isValid) throw new BadRequestException(res.error);
  }

  assertValidCurrency(currency: unknown): void {
    const res = this.validateCurrency(currency);
    if (!res.isValid) throw new BadRequestException(res.error);
  }
}
