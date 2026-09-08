import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SUNAT_MESSAGE_MAX_LENGTH } from './document-events.constants';

/**
 * Converts a monetary total (Decimal, number, string) into a standard 2-decimal string.
 * Example: Decimal(100) -> "100.00", 123.4 -> "123.40".
 */
export function formatMonetaryTotal(val: unknown): string {
  if (val === null || val === undefined) {
    throw new BadRequestException('El total del documento es requerido.');
  }

  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(val as any);
  } catch {
    throw new BadRequestException('El total del documento no es un valor numérico válido.');
  }

  if (!decimal.isFinite() || decimal.isNaN()) {
    throw new BadRequestException('El total del documento debe ser un número finito válido.');
  }

  return decimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * Sanitizes SUNAT response messages:
 * - Strips control characters (CRLF, tabs, null bytes, escape sequences)
 * - Collapses repeated whitespace
 * - Truncates to a maximum of 500 characters
 * - Returns null if message is empty or not provided
 */
export function sanitizeSunatMessage(raw: unknown): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const str = String(raw);
  if (str.trim() === '') {
    return null;
  }

  // Remove ASCII control characters (\x00-\x1F, \x7F-\x9F)
  const cleaned = str.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').replace(/\s+/g, ' ').trim();

  if (cleaned.length === 0) {
    return null;
  }

  return cleaned.slice(0, SUNAT_MESSAGE_MAX_LENGTH);
}

/**
 * Recursively freezes an object and its nested properties to ensure true immutability.
 */
export function deepFreeze<T>(object: T): Readonly<T> {
  if (object === null || typeof object !== 'object') {
    return object;
  }

  Object.freeze(object);

  for (const key of Object.keys(object)) {
    const value = (object as any)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }

  return object;
}
