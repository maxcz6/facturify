import { IdentityDocumentType, SupportedCurrency } from './peru-validation.interface';

export const VALID_RUC_PREFIXES = ['10', '15', '17', '20', '21'] as const;

export const RUC_FACTORS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] = ['PEN', 'USD'] as const;

export const IDENTITY_DOCUMENT_NAMES: Record<IdentityDocumentType, string> = {
  [IdentityDocumentType.NO_DOMICILIADO]: 'Doc. Trib. No Domiciliado sin RUC',
  [IdentityDocumentType.DNI]: 'DNI (Documento Nacional de Identidad)',
  [IdentityDocumentType.CARNET_EXTRANJERIA]: 'Carnet de Extranjería',
  [IdentityDocumentType.RUC]: 'RUC (Registro Único de Contribuyentes)',
  [IdentityDocumentType.PASAPORTE]: 'Pasaporte',
  [IdentityDocumentType.CEDULA_DIPLOMATICA]: 'Cédula Diplomática de Identidad',
  [IdentityDocumentType.DOC_IDENT_PAIS_RESIDENCIA]: 'Doc. Ident. País Residencia',
};

export const DOCUMENT_TYPE_NORMALIZATION: Record<string, 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE' | 'DEBIT_NOTE'> = {
  INVOICE: 'INVOICE',
  '01': 'INVOICE',
  RECEIPT: 'RECEIPT',
  '03': 'RECEIPT',
  CREDIT_NOTE: 'CREDIT_NOTE',
  '07': 'CREDIT_NOTE',
  DEBIT_NOTE: 'DEBIT_NOTE',
  '08': 'DEBIT_NOTE',
};
