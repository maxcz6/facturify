import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import {
  ALLOWED_TRANSITIONS,
  TERMINAL_DOCUMENT_STATES,
  VOIDABLE_DOCUMENT_STATES,
} from './document-lifecycle.constants';
import { InvalidStateTransitionException } from './document-lifecycle.exception';
import {
  TransitionContextOrOptions,
  TransitionOptions,
  TransitionValidationResult,
} from './document-lifecycle.interface';

@Injectable()
export class DocumentLifecycleService {
  /**
   * Checks whether the given status is a terminal state.
   * REJECTED and VOIDED are terminal states.
   */
  isTerminal(status: DocumentStatus | string): boolean {
    const validStatus = this.parseStatus(status, 'status');
    return TERMINAL_DOCUMENT_STATES.includes(validStatus);
  }

  /**
   * Checks whether the given status allows transitioning to VOIDED
   * upon confirmed SUNAT void communication (comunicación de baja).
   * ACCEPTED and OBSERVED are voidable.
   */
  isVoidable(status: DocumentStatus | string): boolean {
    const validStatus = this.parseStatus(status, 'status');
    return VOIDABLE_DOCUMENT_STATES.includes(validStatus);
  }

  /**
   * Evaluates if a transition from `from` to `to` is valid according to business rules.
   *
   * Rules:
   * - DRAFT → PENDING
   * - PENDING → PROCESSING
   * - PROCESSING → SENT | ERROR
   * - SENT → ACCEPTED | OBSERVED | REJECTED | ERROR
   * - ERROR → PROCESSING
   * - ACCEPTED | OBSERVED → VOIDED (only when void confirmation exists)
   * - REJECTED and VOIDED are terminal (no transitions allowed)
   * - Self-transitions (X → X) are allowed ONLY if explicitly configured as idempotent
   */
  evaluateTransition(
    from: DocumentStatus | string,
    to: DocumentStatus | string,
    options?: TransitionContextOrOptions,
  ): TransitionValidationResult {
    const fromStatus = this.parseStatus(from, 'from');
    const toStatus = this.parseStatus(to, 'to');
    const opts = this.normalizeOptions(options);

    // Self-transition / Idempotency check
    if (fromStatus === toStatus) {
      if (opts.allowIdempotent) {
        return {
          allowed: true,
          from: fromStatus,
          to: toStatus,
        };
      }
      return {
        allowed: false,
        reason: 'la transición al mismo estado no está permitida sin autorización explícita de idempotencia',
        from: fromStatus,
        to: toStatus,
      };
    }

    // Terminal state check: terminal states cannot transition to any different state
    if (this.isTerminal(fromStatus)) {
      return {
        allowed: false,
        reason: `el estado de origen '${fromStatus}' es terminal y no permite transiciones a otros estados`,
        from: fromStatus,
        to: toStatus,
      };
    }

    // VOIDED target transition rules: only ACCEPTED and OBSERVED can transition to VOIDED,
    // and only with confirmed void communication from SUNAT.
    if (toStatus === DocumentStatus.VOIDED) {
      if (!this.isVoidable(fromStatus)) {
        return {
          allowed: false,
          reason: `únicamente documentos en estado ACCEPTED u OBSERVED pueden ser dados de baja`,
          from: fromStatus,
          to: toStatus,
        };
      }

      if (!opts.hasVoidConfirmation) {
        return {
          allowed: false,
          reason: `el paso a estado VOIDED requiere confirmación explícita de la comunicación de baja ante SUNAT`,
          from: fromStatus,
          to: toStatus,
        };
      }

      return {
        allowed: true,
        from: fromStatus,
        to: toStatus,
      };
    }

    // General transitions based on ALLOWED_TRANSITIONS table
    const allowedTargets = ALLOWED_TRANSITIONS[fromStatus] ?? [];
    if (allowedTargets.includes(toStatus)) {
      return {
        allowed: true,
        from: fromStatus,
        to: toStatus,
      };
    }

    return {
      allowed: false,
      reason: `la transición directa desde '${fromStatus}' hacia '${toStatus}' no está permitida en el flujo de facturación`,
      from: fromStatus,
      to: toStatus,
    };
  }

  /**
   * Determines whether transitioning from `from` to `to` is allowed.
   */
  canTransition(
    from: DocumentStatus | string,
    to: DocumentStatus | string,
    options?: TransitionContextOrOptions,
  ): boolean {
    return this.evaluateTransition(from, to, options).allowed;
  }

  /**
   * Asserts that a transition from `from` to `to` is allowed.
   * Throws InvalidStateTransitionException (HTTP 409 Conflict) if the transition is invalid.
   * Error messages are strictly public and never reveal private document data.
   */
  assertTransition(
    from: DocumentStatus | string,
    to: DocumentStatus | string,
    options?: TransitionContextOrOptions,
  ): void {
    const result = this.evaluateTransition(from, to, options);
    if (!result.allowed) {
      throw new InvalidStateTransitionException(
        result.from,
        result.to,
        result.reason,
      );
    }
  }

  /**
   * Returns all allowed next states from the given status.
   */
  getAllowedNextStates(
    from: DocumentStatus | string,
    options?: TransitionContextOrOptions,
  ): DocumentStatus[] {
    const fromStatus = this.parseStatus(from, 'from');
    const opts = this.normalizeOptions(options);

    const candidates = Object.values(DocumentStatus);
    const validNextStates = candidates.filter((target) => {
      // Exclude self-transition from general list unless allowIdempotent is true
      if (target === fromStatus) {
        return Boolean(opts.allowIdempotent);
      }
      return this.canTransition(fromStatus, target, opts);
    });

    return validNextStates;
  }

  /**
   * Normalizes options argument which can be a boolean (allowIdempotent shorthand) or TransitionOptions.
   */
  private normalizeOptions(options?: TransitionContextOrOptions): TransitionOptions {
    if (typeof options === 'boolean') {
      return { allowIdempotent: options };
    }
    if (options && typeof options === 'object') {
      return {
        allowIdempotent: Boolean(options.allowIdempotent),
        hasVoidConfirmation: Boolean(
          options.hasVoidConfirmation || options.voidConfirmed,
        ),
      };
    }
    return {};
  }

  /**
   * Validates and parses a status string against DocumentStatus enum.
   */
  private parseStatus(status: unknown, fieldName: string): DocumentStatus {
    if (typeof status !== 'string' || status.trim() === '') {
      throw new BadRequestException(
        `El campo '${fieldName}' debe ser un estado de documento válido.`,
      );
    }

    const trimmed = status.trim().toUpperCase() as DocumentStatus;
    const allStatuses = Object.values(DocumentStatus);
    if (!allStatuses.includes(trimmed)) {
      throw new BadRequestException(
        `El valor '${status}' no es un estado de documento reconocido.`,
      );
    }

    return trimmed;
  }
}
