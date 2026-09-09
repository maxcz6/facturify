import * as crypto from 'crypto';
import { AuthAction, AUTH_ACTIONS } from './auth-throttle.constants';

/**
 * Normalizes an identifier by trimming leading/trailing whitespace and converting to lowercase.
 * Ensures case-insensitivity and whitespace resilience.
 */
export function normalizeIdentifier(rawIdentifier: string): string {
  if (typeof rawIdentifier !== 'string') {
    throw new TypeError('El identificador debe ser una cadena de texto');
  }
  const trimmed = rawIdentifier.trim().toLowerCase();
  if (trimmed.length === 0) {
    throw new Error('El identificador no puede estar vacio');
  }
  return trimmed;
}

/**
 * Validates that an action is an allowed AuthAction.
 */
export function validateAuthAction(action: AuthAction): void {
  if (action !== AUTH_ACTIONS.LOGIN && action !== AUTH_ACTIONS.BOOTSTRAP) {
    throw new Error('Accion de autenticacion no valida: ' + String(action));
  }
}

/**
 * Generates an internal cryptographic key for tracking failed attempts without
 * storing the raw identifier, email, IP, or bootstrap token.
 * Uses HMAC-SHA256 with the action namespace to ensure strict partition isolation.
 */
export function generateThrottleKey(action: AuthAction, identifier: string, hmacSecret: string): string {
  validateAuthAction(action);
  if (!hmacSecret || typeof hmacSecret !== 'string' || hmacSecret.length < 16) {
    throw new Error('hmacSecret debe ser una cadena valida de al menos 16 caracteres');
  }
  const normalized = normalizeIdentifier(identifier);
  return crypto
    .createHmac('sha256', hmacSecret)
    .update(action + ':' + normalized, 'utf8')
    .digest('hex');
}
