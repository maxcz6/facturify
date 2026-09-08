/**
 * Catálogo 01 - Códigos de Tipo de Documento / Comprobante
 * Facturify soporta:
 * 01: Factura
 * 03: Boleta de Venta
 * 07: Nota de Crédito
 * 08: Nota de Débito
 */
export const SUNAT_DOCUMENT_TYPES: ReadonlySet<string> = Object.freeze(
  new Set(['01', '03', '07', '08'])
);

/**
 * Catálogo 06 - Tipos de Documento de Identidad
 * 0: Doc. Trib. No Domiciliado sin RUC
 * 1: DNI (Documento Nacional de Identidad)
 * 4: Carnet de Extranjería
 * 6: RUC (Registro Único de Contribuyentes)
 * 7: Pasaporte
 * A: Cédula Diplomática de Identidad
 * B: Doc. Ident. País Residencia
 */
export const SUNAT_IDENTITY_TYPES: ReadonlySet<string> = Object.freeze(
  new Set(['0', '1', '4', '6', '7', 'A', 'B'])
);

/**
 * Catálogo 09 - Códigos de Tipo de Nota de Crédito Electrónica
 * 01: Anulación de la operación
 * 02: Anulación por error en el RUC
 * 03: Corrección por error en la descripción
 * 04: Descuento global
 * 05: Descuento por ítem
 * 06: Devolución total
 * 07: Devolución por ítem
 * 08: Bonificación
 * 09: Disminución en el valor
 * 10: Otros conceptos
 * 11: Ajustes de operaciones de exportación
 * 12: Ajustes afectos al IVAP
 * 13: Corrección del monto neto pendiente de pago
 */
export const SUNAT_CREDIT_NOTE_REASONS: ReadonlySet<string> = Object.freeze(
  new Set([
    '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'
  ])
);

/**
 * Catálogo 10 - Códigos de Tipo de Nota de Débito Electrónica
 * 01: Intereses por mora
 * 02: Aumento en el valor
 * 03: Penalidades / otros conceptos
 * 10: Ajustes de operaciones de exportación
 * 11: Ajustes afectos al IVAP
 */
export const SUNAT_DEBIT_NOTE_REASONS: ReadonlySet<string> = Object.freeze(
  new Set(['01', '02', '03', '10', '11'])
);

/**
 * Catálogo 07 - Códigos de Tipo de Afectación al IGV más comunes
 * Gravado:
 * 10: Gravado - Operación Onerosa
 * 11: Gravado - Retiro por premio
 * 12: Gravado - Retiro por donación
 * 13: Gravado - Retiro
 * 14: Gravado - Retiro por publicidad
 * 15: Gravado - Bonificaciones
 * 16: Gravado - Retiro por entrega a trabajadores
 * 17: Gravado - IVAP
 * Exonerado:
 * 20: Exonerado - Operación Onerosa
 * 21: Exonerado - Transferencia gratuita
 * Inafecto:
 * 30: Inafecto - Operación Onerosa
 * 31: Inafecto - Retiro por bonificación
 * 32: Inafecto - Retiro
 * 33: Inafecto - Retiro por muestras médicas
 * 34: Inafecto - Retiro por convenio colectivo
 * 35: Inafecto - Retiro por premio
 * 36: Inafecto - Retiro por publicidad
 * Exportación:
 * 40: Exportación de bienes o servicios
 */
export const SUNAT_TAX_AFFECTATIONS: ReadonlySet<string> = Object.freeze(
  new Set([
    '10', '11', '12', '13', '14', '15', '16', '17',
    '20', '21',
    '30', '31', '32', '33', '34', '35', '36',
    '40'
  ])
);

/**
 * Catálogo 03 - Unidades de Medida comerciales permitidas inicialmente
 * NIU: Unidad (Bienes)
 * ZZ: Servicio (Mutuo acuerdo / Servicios)
 * KGM: Kilogramos
 * LTR: Litros
 */
export const SUNAT_UNIT_MEASURES: ReadonlySet<string> = Object.freeze(
  new Set(['NIU', 'ZZ', 'KGM', 'LTR'])
);

/**
 * Catálogo 02 - Códigos de Tipo de Moneda permitidas inicialmente
 * PEN: Soles
 * USD: Dólares Americanos
 */
export const SUNAT_CURRENCIES: ReadonlySet<string> = Object.freeze(
  new Set(['PEN', 'USD'])
);
