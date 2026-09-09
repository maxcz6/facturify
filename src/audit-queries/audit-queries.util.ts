import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  AUDIT_ACTIONS,
  AUDIT_RESULTS,
  AUDIT_QUERY_PAGINATION,
  AuditAction,
  AuditResult,
} from './audit-queries.constants';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DecodedCursor {
  occurredAt: Date;
  id: string;
}

/**
 * Validates whether a value is a standard RFC 4122 UUID.
 */
export function isValidUuid(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

/**
 * Validates and normalizes limit within [1, 100], defaulting to 50.
 */
export function parsePaginationLimit(limitRaw?: unknown): number {
  if (limitRaw === undefined || limitRaw === null || limitRaw === '') {
    return AUDIT_QUERY_PAGINATION.DEFAULT_LIMIT;
  }
  const parsed = Number(limitRaw);
  if (!Number.isInteger(parsed)) {
    throw new BadRequestException('El limite de paginacion debe ser un numero entero.');
  }
  if (parsed < AUDIT_QUERY_PAGINATION.MIN_LIMIT || parsed > AUDIT_QUERY_PAGINATION.MAX_LIMIT) {
    throw new BadRequestException(
      'El limite debe estar entre ' +
        AUDIT_QUERY_PAGINATION.MIN_LIMIT +
        ' y ' +
        AUDIT_QUERY_PAGINATION.MAX_LIMIT +
        '.',
    );
  }
  return parsed;
}

/**
 * Encodes occurredAt and id into an opaque URL-safe base64 string.
 */
export function encodeCursor(occurredAt: Date, id: string, signingKey: Buffer): string {
  if (!isValidUuid(id) || !Buffer.isBuffer(signingKey) || signingKey.length < 32) {
    throw new BadRequestException('No se puede generar el cursor de paginacion.');
  }
  const payload = JSON.stringify({
    o: occurredAt.toISOString(),
    i: id,
  });
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = createHmac('sha256', signingKey).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Decodes and rigorously validates an opaque cursor string.
 * Throws BadRequestException on altered, corrupt, or invalid cursors.
 */
export function decodeCursor(cursorRaw: string, signingKey: Buffer): DecodedCursor {
  if (typeof cursorRaw !== 'string' || cursorRaw.trim().length === 0) {
    throw new BadRequestException('El cursor de paginacion es invalido.');
  }

  try {
    if (!Buffer.isBuffer(signingKey) || signingKey.length < 32) throw new Error('Invalid signing key');
    const parts = cursorRaw.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Invalid cursor envelope');
    const expected = createHmac('sha256', signingKey).update(parts[0]).digest();
    const received = Buffer.from(parts[1], 'base64url');
    if (
      parts[1] !== received.toString('base64url') ||
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new Error('Invalid cursor signature');
    }
    const jsonStr = Buffer.from(parts[0], 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Estructura de cursor invalida');
    }

    if (typeof parsed.o !== 'string' || typeof parsed.i !== 'string') {
      throw new Error('Propiedades de cursor invalidas');
    }

    const date = new Date(parsed.o);
    if (isNaN(date.getTime())) {
      throw new Error('Fecha de cursor invalida');
    }

    if (!isValidUuid(parsed.i)) {
      throw new Error('ID de cursor invalido');
    }

    return {
      occurredAt: date,
      id: parsed.i,
    };
  } catch {
    throw new BadRequestException('El cursor de paginacion proporcionado es invalido o corrupto.');
  }
}

/**
 * Validates optional ISO date string.
 */
export function parseFilterDate(dateStr?: unknown, paramName?: string): Date | undefined {
  if (dateStr === undefined || dateStr === null || dateStr === '') {
    return undefined;
  }
  if (typeof dateStr !== 'string') {
    throw new BadRequestException('El parametro ' + (paramName || 'fecha') + ' debe ser una cadena ISO valida.');
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new BadRequestException('Formato de fecha invalido para ' + (paramName || 'fecha') + '.');
  }
  return date;
}

/**
 * Validates optional action.
 */
export function validateAuditAction(actionRaw?: unknown): AuditAction | undefined {
  if (actionRaw === undefined || actionRaw === null || actionRaw === '') {
    return undefined;
  }
  if (typeof actionRaw !== 'string' || !(AUDIT_ACTIONS as readonly string[]).includes(actionRaw)) {
    throw new BadRequestException('Accion de auditoria no valida para filtro.');
  }
  return actionRaw as AuditAction;
}

/**
 * Validates optional result.
 */
export function validateAuditResult(resultRaw?: unknown): AuditResult | undefined {
  if (resultRaw === undefined || resultRaw === null || resultRaw === '') {
    return undefined;
  }
  if (typeof resultRaw !== 'string' || !(AUDIT_RESULTS as readonly string[]).includes(resultRaw)) {
    throw new BadRequestException('Resultado de auditoria no valido para filtro.');
  }
  return resultRaw as AuditResult;
}
