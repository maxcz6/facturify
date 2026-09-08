export interface ValidationResult {
  isValid: boolean;
  error?: string;
  field?: string;
}

export type SupportedCurrency = 'PEN' | 'USD';

export enum IdentityDocumentType {
  NO_DOMICILIADO = '0',
  DNI = '1',
  CARNET_EXTRANJERIA = '4',
  RUC = '6',
  PASAPORTE = '7',
  CEDULA_DIPLOMATICA = 'A',
  DOC_IDENT_PAIS_RESIDENCIA = 'B',
}
