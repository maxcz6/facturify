import { DocumentStatus } from '@prisma/client';

/**
 * Options to customize transition checks.
 */
export interface TransitionOptions {
  /**
   * If true, transition from state X to state X is permitted (idempotency).
   * Defaults to false.
   */
  allowIdempotent?: boolean;

  /**
   * Indicates whether an official SUNAT void communication (comunicación de baja)
   * has been confirmed for the document.
   * Required to transition ACCEPTED or OBSERVED documents to VOIDED.
   */
  hasVoidConfirmation?: boolean;

  /**
   * Alias for hasVoidConfirmation.
   */
  voidConfirmed?: boolean;
}

/**
 * Context or options parameter supported across lifecycle methods.
 * Accepts either boolean (for allowIdempotent shorthand) or a TransitionOptions object.
 */
export type TransitionContextOrOptions = boolean | TransitionOptions;

/**
 * Result of evaluating a state transition.
 */
export interface TransitionValidationResult {
  allowed: boolean;
  reason?: string;
  from: DocumentStatus;
  to: DocumentStatus;
}
