import { SunatErrorCategory } from './sunat-error-category.enum';

export interface ErrorDefinition {
  category: SunatErrorCategory;
  publicCode: string;
  publicMessage: string;
}

export const CATEGORY_RETRYABLE: Record<SunatErrorCategory, boolean> = {
  [SunatErrorCategory.AUTHENTICATION]: false,
  [SunatErrorCategory.VALIDATION]: false,
  [SunatErrorCategory.DUPLICATE]: false,
  [SunatErrorCategory.REJECTED]: false,
  [SunatErrorCategory.TEMPORARY]: true,
  [SunatErrorCategory.UNKNOWN]: false,
};

export const CATEGORY_DEFAULT_MESSAGES: Record<SunatErrorCategory, string> = {
  [SunatErrorCategory.AUTHENTICATION]:
    'Error de autenticación o credenciales con el servicio de SUNAT.',
  [SunatErrorCategory.VALIDATION]:
    'El comprobante no cumple con las reglas de validación de SUNAT.',
  [SunatErrorCategory.DUPLICATE]:
    'El comprobante o archivo ya fue registrado previamente en SUNAT.',
  [SunatErrorCategory.TEMPORARY]:
    'Fallo temporal o tiempo de espera agotado al conectar con SUNAT.',
  [SunatErrorCategory.REJECTED]:
    'Comprobante rechazado por la administración tributaria SUNAT.',
  [SunatErrorCategory.UNKNOWN]: 'Error no clasificado de SUNAT.',
};

export const EXPLICIT_ERROR_MAP: Record<string, ErrorDefinition> = {
  // === AUTHENTICATION ERRORS (SOL, User, Active status) ===
  '0100': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0100',
    publicMessage: 'Error de autenticación o autorización con el servicio web de SUNAT.',
  },
  '0101': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0101',
    publicMessage: 'Encabezado de seguridad SOAP o credenciales no válidas.',
  },
  '0102': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0102',
    publicMessage: 'Usuario o contraseña SOL incorrectos o sin permisos suficientes.',
  },
  '0103': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0103',
    publicMessage: 'El usuario SOL no se encuentra activo.',
  },
  '0104': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0104',
    publicMessage: 'Número de RUC del emisor no encontrado en el padrón de SUNAT.',
  },
  '0105': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0105',
    publicMessage: 'El RUC del emisor no se encuentra en estado ACTIVO.',
  },
  '0106': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0106',
    publicMessage: 'El RUC del emisor no tiene la condición de HABIDO.',
  },
  '0109': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0109',
    publicMessage: 'El contribuyente no está autorizado a emitir comprobantes electrónicos.',
  },
  '0110': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0110',
    publicMessage: 'El usuario SOL no tiene un número de RUC asociado.',
  },
  '0111': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0111',
    publicMessage: 'Usuario no autorizado a enviar comprobantes electrónicos.',
  },
  '0112': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0112',
    publicMessage: 'Usuario no autorizado a emitir este tipo de comprobante.',
  },
  '0113': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0113',
    publicMessage: 'El contribuyente no se encuentra incorporado como emisor electrónico.',
  },
  '0114': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0114',
    publicMessage: 'Usuario secundario SOL dado de baja o inactivo.',
  },
  '0115': {
    category: SunatErrorCategory.AUTHENTICATION,
    publicCode: '0115',
    publicMessage: 'Clave SOL bloqueada por superación de intentos fallidos.',
  },

  // === DUPLICATE ERRORS ===
  '1033': {
    category: SunatErrorCategory.DUPLICATE,
    publicCode: '1033',
    publicMessage: 'El comprobante ya fue registrado previamente en SUNAT.',
  },
  '0151': {
    category: SunatErrorCategory.DUPLICATE,
    publicCode: '0151',
    publicMessage: 'El nombre del archivo ZIP ya existe en los registros de SUNAT.',
  },
  '0152': {
    category: SunatErrorCategory.DUPLICATE,
    publicCode: '0152',
    publicMessage: 'El comprobante ya fue enviado y procesado anteriormente.',
  },
  '0153': {
    category: SunatErrorCategory.DUPLICATE,
    publicCode: '0153',
    publicMessage: 'El comprobante ya existe con estado de aceptado o anulado.',
  },
  '0154': {
    category: SunatErrorCategory.DUPLICATE,
    publicCode: '0154',
    publicMessage: 'El comprobante ya fue informado en una comunicación o resumen previo.',
  },
  '2300': {
    category: SunatErrorCategory.DUPLICATE,
    publicCode: '2300',
    publicMessage: 'El comprobante ya fue emitido y registrado anteriormente.',
  },
  '2301': {
    category: SunatErrorCategory.DUPLICATE,
    publicCode: '2301',
    publicMessage: 'El comprobante ya fue dado de baja o anulado previamente.',
  },
  '2302': {
    category: SunatErrorCategory.DUPLICATE,
    publicCode: '2302',
    publicMessage: 'Ya existe un comprobante registrado con la misma serie y número correlativo.',
  },

  // === TEMPORARY / TRANSPORT / NETWORK ERRORS (Retryable) ===
  '0159': {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: '0159',
    publicMessage: 'Problema temporal en la plataforma de SUNAT al recibir el comprobante.',
  },
  '0160': {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: '0160',
    publicMessage: 'Error temporal en la recepción de comprobantes de SUNAT. Reintentable.',
  },
  '0161': {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: '0161',
    publicMessage: 'Error temporal de conexión con el servicio web de SUNAT.',
  },
  '0162': {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: '0162',
    publicMessage: 'El servicio de SUNAT se encuentra temporalmente fuera de servicio.',
  },
  '0163': {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: '0163',
    publicMessage: 'Tiempo de espera de procesamiento excedido en los servidores de SUNAT.',
  },
  TIMEOUT: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'TIMEOUT',
    publicMessage: 'Tiempo de espera agotado al conectar con los servidores de SUNAT.',
  },
  ETIMEDOUT: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'ETIMEDOUT',
    publicMessage: 'Tiempo de espera de conexión agotado al conectar con SUNAT.',
  },
  ESOCKETTIMEDOUT: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'ESOCKETTIMEDOUT',
    publicMessage: 'Tiempo de espera de socket agotado en la comunicación con SUNAT.',
  },
  ECONNRESET: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'ECONNRESET',
    publicMessage: 'Conexión reiniciada inesperadamente por los servidores de SUNAT.',
  },
  ECONNREFUSED: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'ECONNREFUSED',
    publicMessage: 'Conexión rechazada por el servidor web de SUNAT.',
  },
  ENOTFOUND: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'ENOTFOUND',
    publicMessage: 'No se pudo resolver el nombre de dominio del servicio de SUNAT.',
  },
  EAI_AGAIN: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'EAI_AGAIN',
    publicMessage: 'Fallo temporal en la resolución DNS del servicio de SUNAT.',
  },
  ABORT_ERROR: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'ABORT_ERROR',
    publicMessage: 'La petición hacia SUNAT fue abortada por exceder el tiempo límite.',
  },
  HTTP_500: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'HTTP_500',
    publicMessage: 'Error interno temporal (HTTP 500) en el servidor de SUNAT.',
  },
  HTTP_502: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'HTTP_502',
    publicMessage: 'Puerta de enlace incorrecta (HTTP 502) al conectar con SUNAT.',
  },
  HTTP_503: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'HTTP_503',
    publicMessage: 'Servicio de SUNAT temporalmente no disponible (HTTP 503).',
  },
  HTTP_504: {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'HTTP_504',
    publicMessage: 'Tiempo de espera de la puerta de enlace agotado (HTTP 504) en SUNAT.',
  },
  '500': {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'HTTP_500',
    publicMessage: 'Error interno temporal (HTTP 500) en el servidor de SUNAT.',
  },
  '502': {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'HTTP_502',
    publicMessage: 'Puerta de enlace incorrecta (HTTP 502) al conectar con SUNAT.',
  },
  '503': {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'HTTP_503',
    publicMessage: 'Servicio de SUNAT temporalmente no disponible (HTTP 503).',
  },
  '504': {
    category: SunatErrorCategory.TEMPORARY,
    publicCode: 'HTTP_504',
    publicMessage: 'Tiempo de espera de la puerta de enlace agotado (HTTP 504) en SUNAT.',
  },

  // === VALIDATION ERRORS ===
  '1001': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '1001',
    publicMessage: 'El RUC del emisor no es válido.',
  },
  '1002': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '1002',
    publicMessage: 'El tipo de comprobante no corresponde al solicitado.',
  },
  '1003': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '1003',
    publicMessage: 'La serie no corresponde al tipo de comprobante electrónico.',
  },
  '1004': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '1004',
    publicMessage: 'El número correlativo del comprobante es incorrecto o inválido.',
  },
  '1005': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '1005',
    publicMessage: 'La fecha de emisión no cumple con los plazos permitidos por SUNAT.',
  },
  '2014': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '2014',
    publicMessage: 'El número de documento de identidad del receptor no es válido.',
  },
  '2015': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '2015',
    publicMessage: 'La razón social o nombres del receptor son obligatorios.',
  },
  '2020': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '2020',
    publicMessage: 'La fecha de emisión del comprobante no es válida o está fuera de rango.',
  },
  '2021': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '2021',
    publicMessage: 'El código de moneda especificado no es válido según catálogo SUNAT.',
  },
  '2022': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '2022',
    publicMessage: 'El tipo de cambio es inválido o no corresponde a la fecha.',
  },
  '2023': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '2023',
    publicMessage: 'El importe total del comprobante no coincide con la sumatoria de ítems.',
  },
  '2027': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '2027',
    publicMessage: 'El porcentaje o monto de IGV no coincide con la tasa legal vigente.',
  },
  '2034': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '2034',
    publicMessage: 'El código de tipo de operación no corresponde a la operación comercial.',
  },
  '2050': {
    category: SunatErrorCategory.VALIDATION,
    publicCode: '2050',
    publicMessage: 'La unidad de medida de uno o más ítems no es válida.',
  },

  // === REJECTED ERRORS ===
  '3000': {
    category: SunatErrorCategory.REJECTED,
    publicCode: '3000',
    publicMessage: 'Comprobante rechazado por SUNAT por inconsistencias insubsanables.',
  },
  '3001': {
    category: SunatErrorCategory.REJECTED,
    publicCode: '3001',
    publicMessage: 'Comprobante rechazado por no superar las validaciones estructurales.',
  },
  '3002': {
    category: SunatErrorCategory.REJECTED,
    publicCode: '3002',
    publicMessage: 'Comprobante rechazado por incumplimiento de la normativa tributaria.',
  },
  '3003': {
    category: SunatErrorCategory.REJECTED,
    publicCode: '3003',
    publicMessage: 'La firma digital del documento XML no es válida o está corrupta.',
  },
  '3004': {
    category: SunatErrorCategory.REJECTED,
    publicCode: '3004',
    publicMessage: 'El certificado digital está vencido, revocado o no es de confianza.',
  },
  '3005': {
    category: SunatErrorCategory.REJECTED,
    publicCode: '3005',
    publicMessage: 'El certificado digital no corresponde al RUC del emisor electrónico.',
  },
  '3006': {
    category: SunatErrorCategory.REJECTED,
    publicCode: '3006',
    publicMessage: 'El algoritmo o estándar de firma digital no es aceptado por SUNAT.',
  },
  '4000': {
    category: SunatErrorCategory.REJECTED,
    publicCode: '4000',
    publicMessage: 'Comprobante rechazado definitivamente por la administración tributaria.',
  },
};
