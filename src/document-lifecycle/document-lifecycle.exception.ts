import { ConflictException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';

/**
 * Exception thrown when an invalid document state transition is attempted.
 * Extends ConflictException (HTTP 409).
 * Contains only public, safe information (states and reason), never private document data.
 */
export class InvalidStateTransitionException extends ConflictException {
  readonly fromStatus: DocumentStatus;
  readonly toStatus: DocumentStatus;

  constructor(from: DocumentStatus, to: DocumentStatus, reason?: string) {
    const detail = reason ? `: ${reason}` : '.';
    super(
      `Transición de estado no permitida: no se puede cambiar de '${from}' a '${to}'${detail}`,
    );
    this.name = 'InvalidStateTransitionException';
    this.fromStatus = from;
    this.toStatus = to;
  }
}
