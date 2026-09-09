import { Injectable, BadRequestException } from '@nestjs/common';
import {
  DEFAULT_TICKET_MAX_ATTEMPTS,
  ABSOLUTE_MAX_TICKET_ATTEMPTS,
  DEFAULT_TICKET_MAX_TOTAL_MS,
  ABSOLUTE_MAX_TICKET_TOTAL_MS,
  SUNAT_STATUS_IN_PROCESS,
  SUNAT_STATUS_TERMINAL_WITH_CDR,
} from './sunat-ticket-policy.constants';
import {
  TicketPollingContext,
  TicketPollingDecision,
} from './sunat-ticket-policy.interface';
import {
  calculateTicketBackoffDelay,
  sanitizeRetryAfterMs,
} from './sunat-ticket-policy.util';

@Injectable()
export class SunatTicketPollingPolicyService {
  /**
   * Evaluates a SUNAT ticket status check and determines the next action.
   *
   * Rules:
   * 1. Terminal statuses with CDR available ('0', '00', '99'):
   *    outcome='PROCESS_CDR', retryable=false, nextDelayMs=null.
   * 2. Status '98' (In process):
   *    - If attempt >= maxAttempts or elapsedMs >= maxTotalMs:
   *      outcome='EXHAUSTED', retryable=false, nextDelayMs=null.
   *    - Otherwise:
   *      outcome='PENDING', retryable=true, nextDelayMs calculated with exponential backoff & jitter.
   * 3. Unknown or unhandled status codes:
   *    Conservative approach to prevent infinite loops:
   *    outcome='TERMINAL_FAILURE', retryable=false, nextDelayMs=null.
   * 4. Exclusively returns { outcome, retryable, nextDelayMs, attempt, maxAttempts }.
   */
  evaluate(context: TicketPollingContext): TicketPollingDecision {
    this.validateContext(context);

    const attempt = Math.floor(Number(context.attempt));

    // Cap maxAttempts at ABSOLUTE_MAX_TICKET_ATTEMPTS (20)
    let configuredMaxAttempts = DEFAULT_TICKET_MAX_ATTEMPTS;
    if (context.maxAttempts !== undefined && context.maxAttempts !== null) {
      const parsedMax = Number(context.maxAttempts);
      configuredMaxAttempts = Math.min(Math.floor(parsedMax), ABSOLUTE_MAX_TICKET_ATTEMPTS);
    }
    const maxAttempts = configuredMaxAttempts;

    // Cap maxTotalMs at ABSOLUTE_MAX_TICKET_TOTAL_MS (30 minutes)
    let configuredMaxTotalMs = DEFAULT_TICKET_MAX_TOTAL_MS;
    if (context.maxTotalMs !== undefined && context.maxTotalMs !== null) {
      const parsedTotal = Number(context.maxTotalMs);
      configuredMaxTotalMs = Math.min(parsedTotal, ABSOLUTE_MAX_TICKET_TOTAL_MS);
    }
    const maxTotalMs = configuredMaxTotalMs;

    const elapsedMs = Number(context.elapsedMs);
    const normalizedStatus = String(context.sunatStatusCode).trim();

    // 1. Terminal with CDR available ('0', '00', '99')
    if (SUNAT_STATUS_TERMINAL_WITH_CDR.has(normalizedStatus)) {
      return Object.freeze({
        outcome: 'PROCESS_CDR',
        retryable: false,
        nextDelayMs: null,
        attempt,
        maxAttempts,
      });
    }

    // 2. Status 98: Processing continues
    if (normalizedStatus === SUNAT_STATUS_IN_PROCESS) {
      // Check exhaustion limits (attempts or time)
      if (attempt >= maxAttempts || elapsedMs >= maxTotalMs) {
        return Object.freeze({
          outcome: 'EXHAUSTED',
          retryable: false,
          nextDelayMs: null,
          attempt,
          maxAttempts,
        });
      }

      // Calculate next delay
      const boundedRetryAfter = sanitizeRetryAfterMs(context.retryAfterMs);
      const nextDelayMs =
        boundedRetryAfter !== null
          ? boundedRetryAfter
          : calculateTicketBackoffDelay(attempt, context.jitter ?? 0);

      return Object.freeze({
        outcome: 'PENDING',
        retryable: true,
        nextDelayMs,
        attempt,
        maxAttempts,
      });
    }

    // 3. Unknown or unhandled statuses: conservative terminal failure
    return Object.freeze({
      outcome: 'TERMINAL_FAILURE',
      retryable: false,
      nextDelayMs: null,
      attempt,
      maxAttempts,
    });
  }

  private validateContext(context: TicketPollingContext): void {
    if (!context || typeof context !== 'object') {
      throw new BadRequestException('El contexto de consulta de ticket SUNAT es requerido.');
    }

    const attempt = Number(context.attempt);
    if (!Number.isInteger(attempt) || attempt < 1) {
      throw new BadRequestException('El número de intento debe ser un entero positivo mayor o igual a 1.');
    }

    if (context.maxAttempts !== undefined && context.maxAttempts !== null) {
      const maxAtt = Number(context.maxAttempts);
      if (!Number.isInteger(maxAtt) || maxAtt < 1) {
        throw new BadRequestException('El número máximo de intentos debe ser un entero positivo.');
      }
    }

    const elapsed = Number(context.elapsedMs);
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new BadRequestException('El tiempo transcurrido (elapsedMs) debe ser un número no negativo.');
    }

    if (context.maxTotalMs !== undefined && context.maxTotalMs !== null) {
      const maxTot = Number(context.maxTotalMs);
      if (!Number.isFinite(maxTot) || maxTot <= 0) {
        throw new BadRequestException('El tiempo máximo total (maxTotalMs) debe ser un número positivo.');
      }
    }

    if (context.jitter !== undefined && context.jitter !== null) {
      const jitter = Number(context.jitter);
      if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1) {
        throw new BadRequestException('El factor de jitter debe ser un número entre 0 y 1 inclusive.');
      }
    }

    if (
      context.sunatStatusCode === null ||
      context.sunatStatusCode === undefined ||
      String(context.sunatStatusCode).trim() === ''
    ) {
      throw new BadRequestException('El código de estado SUNAT es requerido.');
    }
  }
}
