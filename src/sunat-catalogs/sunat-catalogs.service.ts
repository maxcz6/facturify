import { Injectable, BadRequestException } from '@nestjs/common';
import {
  SUNAT_DOCUMENT_TYPES,
  SUNAT_IDENTITY_TYPES,
  SUNAT_CREDIT_NOTE_REASONS,
  SUNAT_DEBIT_NOTE_REASONS,
  SUNAT_TAX_AFFECTATIONS,
  SUNAT_UNIT_MEASURES,
  SUNAT_CURRENCIES,
} from './sunat-catalogs.constants';
import { sanitizeCatalogCodeForError } from './sunat-catalogs.util';

@Injectable()
export class SunatCatalogsService {
  // Readonly immutable references exposed for consumers
  readonly documentTypes = SUNAT_DOCUMENT_TYPES;
  readonly identityTypes = SUNAT_IDENTITY_TYPES;
  readonly creditNoteReasons = SUNAT_CREDIT_NOTE_REASONS;
  readonly debitNoteReasons = SUNAT_DEBIT_NOTE_REASONS;
  readonly taxAffectations = SUNAT_TAX_AFFECTATIONS;
  readonly unitMeasures = SUNAT_UNIT_MEASURES;
  readonly currencies = SUNAT_CURRENCIES;

  // ==========================================
  // Catálogo 01 - Tipos de Comprobante (01, 03, 07, 08)
  // ==========================================
  isValidDocumentType(code: unknown): boolean {
    return typeof code === 'string' && SUNAT_DOCUMENT_TYPES.has(code);
  }

  assertValidDocumentType(code: unknown): asserts code is string {
    if (!this.isValidDocumentType(code)) {
      const sanitized = sanitizeCatalogCodeForError(code);
      throw new BadRequestException(
        "Código de tipo de comprobante no válido en Catálogo 01 de SUNAT: '" + sanitized + "'."
      );
    }
  }

  // ==========================================
  // Catálogo 06 - Tipos de Documento de Identidad (0, 1, 4, 6, 7, A, B)
  // ==========================================
  isValidIdentityType(code: unknown): boolean {
    return typeof code === 'string' && SUNAT_IDENTITY_TYPES.has(code);
  }

  assertValidIdentityType(code: unknown): asserts code is string {
    if (!this.isValidIdentityType(code)) {
      const sanitized = sanitizeCatalogCodeForError(code);
      throw new BadRequestException(
        "Código de tipo de documento de identidad no válido en Catálogo 06 de SUNAT: '" + sanitized + "'."
      );
    }
  }

  // ==========================================
  // Catálogo 09 - Motivos de Nota de Crédito
  // ==========================================
  isValidCreditNoteReason(code: unknown): boolean {
    return typeof code === 'string' && SUNAT_CREDIT_NOTE_REASONS.has(code);
  }

  assertValidCreditNoteReason(code: unknown): asserts code is string {
    if (!this.isValidCreditNoteReason(code)) {
      const sanitized = sanitizeCatalogCodeForError(code);
      throw new BadRequestException(
        "Código de motivo de nota de crédito no válido en Catálogo 09 de SUNAT: '" + sanitized + "'."
      );
    }
  }

  // ==========================================
  // Catálogo 10 - Motivos de Nota de Débito
  // ==========================================
  isValidDebitNoteReason(code: unknown): boolean {
    return typeof code === 'string' && SUNAT_DEBIT_NOTE_REASONS.has(code);
  }

  assertValidDebitNoteReason(code: unknown): asserts code is string {
    if (!this.isValidDebitNoteReason(code)) {
      const sanitized = sanitizeCatalogCodeForError(code);
      throw new BadRequestException(
        "Código de motivo de nota de débito no válido en Catálogo 10 de SUNAT: '" + sanitized + "'."
      );
    }
  }

  // ==========================================
  // Catálogo 07 - Tipo de Afectación al IGV
  // ==========================================
  isValidTaxAffectation(code: unknown): boolean {
    return typeof code === 'string' && SUNAT_TAX_AFFECTATIONS.has(code);
  }

  assertValidTaxAffectation(code: unknown): asserts code is string {
    if (!this.isValidTaxAffectation(code)) {
      const sanitized = sanitizeCatalogCodeForError(code);
      throw new BadRequestException(
        "Código de afectación al IGV no válido en Catálogo 07 de SUNAT: '" + sanitized + "'."
      );
    }
  }

  // ==========================================
  // Catálogo 03 - Unidades de Medida (NIU, ZZ, KGM, LTR)
  // ==========================================
  isValidUnitMeasure(code: unknown): boolean {
    return typeof code === 'string' && SUNAT_UNIT_MEASURES.has(code);
  }

  assertValidUnitMeasure(code: unknown): asserts code is string {
    if (!this.isValidUnitMeasure(code)) {
      const sanitized = sanitizeCatalogCodeForError(code);
      throw new BadRequestException(
        "Código de unidad de medida no válido en Catálogo 03 de SUNAT: '" + sanitized + "'."
      );
    }
  }

  // ==========================================
  // Catálogo 02 - Monedas (PEN, USD)
  // ==========================================
  isValidCurrency(code: unknown): boolean {
    return typeof code === 'string' && SUNAT_CURRENCIES.has(code);
  }

  assertValidCurrency(code: unknown): asserts code is string {
    if (!this.isValidCurrency(code)) {
      const sanitized = sanitizeCatalogCodeForError(code);
      throw new BadRequestException(
        "Código de moneda no válido en Catálogo 02 de SUNAT: '" + sanitized + "'."
      );
    }
  }
}
