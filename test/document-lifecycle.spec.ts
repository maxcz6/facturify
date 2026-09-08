import { BadRequestException, ConflictException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import {
  ALLOWED_TRANSITIONS,
  TERMINAL_DOCUMENT_STATES,
  VOIDABLE_DOCUMENT_STATES,
} from '../src/document-lifecycle/document-lifecycle.constants';
import { InvalidStateTransitionException } from '../src/document-lifecycle/document-lifecycle.exception';
import { DocumentLifecycleModule } from '../src/document-lifecycle/document-lifecycle.module';
import { DocumentLifecycleService } from '../src/document-lifecycle/document-lifecycle.service';

describe('DocumentLifecycleService (Peruvian Invoicing State Machine)', () => {
  let service: DocumentLifecycleService;
  const allStatuses: DocumentStatus[] = Object.values(DocumentStatus);

  beforeEach(() => {
    service = new DocumentLifecycleService();
  });

  describe('Module and Instantiation', () => {
    it('should be instantiable directly and via module', () => {
      expect(service).toBeDefined();
      expect(new DocumentLifecycleModule()).toBeDefined();
    });

    it('should expose consistent constants', () => {
      expect(TERMINAL_DOCUMENT_STATES).toEqual([
        DocumentStatus.REJECTED,
        DocumentStatus.VOIDED,
      ]);
      expect(VOIDABLE_DOCUMENT_STATES).toEqual([
        DocumentStatus.ACCEPTED,
        DocumentStatus.OBSERVED,
      ]);
      expect(Object.keys(ALLOWED_TRANSITIONS)).toHaveLength(9);
    });
  });

  describe('isTerminal()', () => {
    it('should return true strictly for REJECTED and VOIDED', () => {
      expect(service.isTerminal(DocumentStatus.REJECTED)).toBe(true);
      expect(service.isTerminal(DocumentStatus.VOIDED)).toBe(true);
      expect(service.isTerminal('REJECTED')).toBe(true);
      expect(service.isTerminal('VOIDED')).toBe(true);
    });

    it('should return false for all non-terminal states', () => {
      const nonTerminalStates = [
        DocumentStatus.DRAFT,
        DocumentStatus.PENDING,
        DocumentStatus.PROCESSING,
        DocumentStatus.SENT,
        DocumentStatus.ACCEPTED,
        DocumentStatus.OBSERVED,
        DocumentStatus.ERROR,
      ];

      for (const status of nonTerminalStates) {
        expect(service.isTerminal(status)).toBe(false);
      }
    });

    it('should throw BadRequestException for invalid status values', () => {
      expect(() => service.isTerminal('INVALID_STATUS')).toThrow(BadRequestException);
      expect(() => service.isTerminal('')).toThrow(BadRequestException);
      expect(() => service.isTerminal(null as any)).toThrow(BadRequestException);
    });
  });

  describe('isVoidable()', () => {
    it('should return true strictly for ACCEPTED and OBSERVED', () => {
      expect(service.isVoidable(DocumentStatus.ACCEPTED)).toBe(true);
      expect(service.isVoidable(DocumentStatus.OBSERVED)).toBe(true);
    });

    it('should return false for other states', () => {
      const nonVoidable = [
        DocumentStatus.DRAFT,
        DocumentStatus.PENDING,
        DocumentStatus.PROCESSING,
        DocumentStatus.SENT,
        DocumentStatus.REJECTED,
        DocumentStatus.VOIDED,
        DocumentStatus.ERROR,
      ];

      for (const status of nonVoidable) {
        expect(service.isVoidable(status)).toBe(false);
      }
    });
  });

  describe('Valid Transitions (Reglas Mínimas)', () => {
    it('should allow DRAFT -> PENDING', () => {
      expect(service.canTransition(DocumentStatus.DRAFT, DocumentStatus.PENDING)).toBe(true);
      expect(() =>
        service.assertTransition(DocumentStatus.DRAFT, DocumentStatus.PENDING),
      ).not.toThrow();
    });

    it('should allow PENDING -> PROCESSING', () => {
      expect(service.canTransition(DocumentStatus.PENDING, DocumentStatus.PROCESSING)).toBe(true);
      expect(() =>
        service.assertTransition(DocumentStatus.PENDING, DocumentStatus.PROCESSING),
      ).not.toThrow();
    });

    it('should allow PROCESSING -> SENT and PROCESSING -> ERROR', () => {
      expect(service.canTransition(DocumentStatus.PROCESSING, DocumentStatus.SENT)).toBe(true);
      expect(service.canTransition(DocumentStatus.PROCESSING, DocumentStatus.ERROR)).toBe(true);

      expect(() =>
        service.assertTransition(DocumentStatus.PROCESSING, DocumentStatus.SENT),
      ).not.toThrow();
      expect(() =>
        service.assertTransition(DocumentStatus.PROCESSING, DocumentStatus.ERROR),
      ).not.toThrow();
    });

    it('should allow SENT -> ACCEPTED, OBSERVED, REJECTED, and ERROR', () => {
      const validTargets = [
        DocumentStatus.ACCEPTED,
        DocumentStatus.OBSERVED,
        DocumentStatus.REJECTED,
        DocumentStatus.ERROR,
      ];

      for (const target of validTargets) {
        expect(service.canTransition(DocumentStatus.SENT, target)).toBe(true);
        expect(() =>
          service.assertTransition(DocumentStatus.SENT, target),
        ).not.toThrow();
      }
    });

    it('should allow ERROR -> PROCESSING (Reintento de Envío)', () => {
      expect(service.canTransition(DocumentStatus.ERROR, DocumentStatus.PROCESSING)).toBe(true);
      expect(() =>
        service.assertTransition(DocumentStatus.ERROR, DocumentStatus.PROCESSING),
      ).not.toThrow();
    });
  });

  describe('Confirmación de Comunicación de Baja (ACCEPTED / OBSERVED -> VOIDED)', () => {
    it('should reject ACCEPTED -> VOIDED when void communication is NOT confirmed', () => {
      // Default (no options)
      expect(service.canTransition(DocumentStatus.ACCEPTED, DocumentStatus.VOIDED)).toBe(false);
      expect(() =>
        service.assertTransition(DocumentStatus.ACCEPTED, DocumentStatus.VOIDED),
      ).toThrow(InvalidStateTransitionException);

      // Explicit false
      expect(
        service.canTransition(DocumentStatus.ACCEPTED, DocumentStatus.VOIDED, {
          hasVoidConfirmation: false,
        }),
      ).toBe(false);
      expect(() =>
        service.assertTransition(DocumentStatus.ACCEPTED, DocumentStatus.VOIDED, {
          hasVoidConfirmation: false,
        }),
      ).toThrow(ConflictException);
    });

    it('should reject OBSERVED -> VOIDED when void communication is NOT confirmed', () => {
      expect(service.canTransition(DocumentStatus.OBSERVED, DocumentStatus.VOIDED)).toBe(false);
      expect(() =>
        service.assertTransition(DocumentStatus.OBSERVED, DocumentStatus.VOIDED),
      ).toThrow(InvalidStateTransitionException);
    });

    it('should allow ACCEPTED -> VOIDED when hasVoidConfirmation is true', () => {
      expect(
        service.canTransition(DocumentStatus.ACCEPTED, DocumentStatus.VOIDED, {
          hasVoidConfirmation: true,
        }),
      ).toBe(true);
      expect(() =>
        service.assertTransition(DocumentStatus.ACCEPTED, DocumentStatus.VOIDED, {
          hasVoidConfirmation: true,
        }),
      ).not.toThrow();

      // Alias voidConfirmed
      expect(
        service.canTransition(DocumentStatus.ACCEPTED, DocumentStatus.VOIDED, {
          voidConfirmed: true,
        }),
      ).toBe(true);
    });

    it('should allow OBSERVED -> VOIDED when hasVoidConfirmation is true', () => {
      expect(
        service.canTransition(DocumentStatus.OBSERVED, DocumentStatus.VOIDED, {
          hasVoidConfirmation: true,
        }),
      ).toBe(true);
      expect(() =>
        service.assertTransition(DocumentStatus.OBSERVED, DocumentStatus.VOIDED, {
          hasVoidConfirmation: true,
        }),
      ).not.toThrow();
    });

    it('should reject non-voidable states transitioning to VOIDED even with hasVoidConfirmation: true', () => {
      const nonVoidable = [
        DocumentStatus.DRAFT,
        DocumentStatus.PENDING,
        DocumentStatus.PROCESSING,
        DocumentStatus.SENT,
        DocumentStatus.ERROR,
        DocumentStatus.REJECTED,
      ];

      for (const origin of nonVoidable) {
        expect(
          service.canTransition(origin, DocumentStatus.VOIDED, {
            hasVoidConfirmation: true,
          }),
        ).toBe(false);
        expect(() =>
          service.assertTransition(origin, DocumentStatus.VOIDED, {
            hasVoidConfirmation: true,
          }),
        ).toThrow(InvalidStateTransitionException);
      }
    });
  });

  describe('Estados Terminales (REJECTED y VOIDED)', () => {
    it('should forbid any transition out of REJECTED to a different state', () => {
      for (const target of allStatuses) {
        if (target === DocumentStatus.REJECTED) continue;

        expect(service.canTransition(DocumentStatus.REJECTED, target)).toBe(false);
        expect(() =>
          service.assertTransition(DocumentStatus.REJECTED, target),
        ).toThrow(InvalidStateTransitionException);
      }
    });

    it('should forbid any transition out of VOIDED to a different state', () => {
      for (const target of allStatuses) {
        if (target === DocumentStatus.VOIDED) continue;

        expect(service.canTransition(DocumentStatus.VOIDED, target)).toBe(false);
        expect(() =>
          service.assertTransition(DocumentStatus.VOIDED, target),
        ).toThrow(InvalidStateTransitionException);
      }
    });
  });

  describe('Idempotencia (Transición al Mismo Estado)', () => {
    it('should reject self-transitions by default for all 9 states', () => {
      for (const status of allStatuses) {
        expect(service.canTransition(status, status)).toBe(false);
        expect(() => service.assertTransition(status, status)).toThrow(
          InvalidStateTransitionException,
        );
      }
    });

    it('should reject self-transitions when allowIdempotent is explicitly false', () => {
      for (const status of allStatuses) {
        expect(
          service.canTransition(status, status, { allowIdempotent: false }),
        ).toBe(false);
        expect(() =>
          service.assertTransition(status, status, { allowIdempotent: false }),
        ).toThrow(ConflictException);
      }
    });

    it('should allow self-transitions when allowIdempotent is explicitly true', () => {
      for (const status of allStatuses) {
        expect(
          service.canTransition(status, status, { allowIdempotent: true }),
        ).toBe(true);
        expect(() =>
          service.assertTransition(status, status, { allowIdempotent: true }),
        ).not.toThrow();

        // Shorthand boolean true
        expect(service.canTransition(status, status, true)).toBe(true);
        expect(() => service.assertTransition(status, status, true)).not.toThrow();
      }
    });
  });

  describe('Pruebas de Todas las 81 Combinaciones de Estados (Matriz Completa)', () => {
    // Defines valid non-self transitions
    const validPairs: Record<DocumentStatus, DocumentStatus[]> = {
      [DocumentStatus.DRAFT]: [DocumentStatus.PENDING],
      [DocumentStatus.PENDING]: [DocumentStatus.PROCESSING],
      [DocumentStatus.PROCESSING]: [DocumentStatus.SENT, DocumentStatus.ERROR],
      [DocumentStatus.SENT]: [
        DocumentStatus.ACCEPTED,
        DocumentStatus.OBSERVED,
        DocumentStatus.REJECTED,
        DocumentStatus.ERROR,
      ],
      [DocumentStatus.ERROR]: [DocumentStatus.PROCESSING],
      [DocumentStatus.ACCEPTED]: [DocumentStatus.VOIDED], // with void confirmation
      [DocumentStatus.OBSERVED]: [DocumentStatus.VOIDED], // with void confirmation
      [DocumentStatus.REJECTED]: [],
      [DocumentStatus.VOIDED]: [],
    };

    it('should accurately validate all 81 combinations without void confirmation', () => {
      let testedCombinations = 0;

      for (const from of allStatuses) {
        for (const to of allStatuses) {
          testedCombinations++;
          const allowed = service.canTransition(from, to);

          if (from === to) {
            // Self-transitions must be false without allowIdempotent
            expect(allowed).toBe(false);
          } else if (
            (from === DocumentStatus.ACCEPTED || from === DocumentStatus.OBSERVED) &&
            to === DocumentStatus.VOIDED
          ) {
            // Requires void confirmation
            expect(allowed).toBe(false);
          } else {
            const isExpected = validPairs[from].includes(to);
            expect(allowed).toBe(isExpected);
          }
        }
      }

      expect(testedCombinations).toBe(81);
    });

    it('should accurately validate all 81 combinations with void confirmation enabled', () => {
      let testedCombinations = 0;

      for (const from of allStatuses) {
        for (const to of allStatuses) {
          testedCombinations++;
          const allowed = service.canTransition(from, to, {
            hasVoidConfirmation: true,
          });

          if (from === to) {
            expect(allowed).toBe(false);
          } else {
            const isExpected = validPairs[from].includes(to);
            expect(allowed).toBe(isExpected);
          }
        }
      }

      expect(testedCombinations).toBe(81);
    });

    it('should accurately validate all 81 combinations with idempotency enabled', () => {
      let testedCombinations = 0;

      for (const from of allStatuses) {
        for (const to of allStatuses) {
          testedCombinations++;
          const allowed = service.canTransition(from, to, {
            allowIdempotent: true,
            hasVoidConfirmation: true,
          });

          if (from === to) {
            expect(allowed).toBe(true);
          } else {
            const isExpected = validPairs[from].includes(to);
            expect(allowed).toBe(isExpected);
          }
        }
      }

      expect(testedCombinations).toBe(81);
    });
  });

  describe('getAllowedNextStates()', () => {
    it('should return allowed next states for non-terminal statuses', () => {
      expect(service.getAllowedNextStates(DocumentStatus.DRAFT)).toEqual([
        DocumentStatus.PENDING,
      ]);
      expect(service.getAllowedNextStates(DocumentStatus.PENDING)).toEqual([
        DocumentStatus.PROCESSING,
      ]);
      expect(service.getAllowedNextStates(DocumentStatus.PROCESSING)).toEqual([
        DocumentStatus.SENT,
        DocumentStatus.ERROR,
      ]);
      expect(service.getAllowedNextStates(DocumentStatus.SENT)).toEqual([
        DocumentStatus.ACCEPTED,
        DocumentStatus.OBSERVED,
        DocumentStatus.REJECTED,
        DocumentStatus.ERROR,
      ]);
      expect(service.getAllowedNextStates(DocumentStatus.ERROR)).toEqual([
        DocumentStatus.PROCESSING,
      ]);
    });

    it('should return VOIDED only when void confirmation is provided', () => {
      expect(service.getAllowedNextStates(DocumentStatus.ACCEPTED)).toEqual([]);
      expect(
        service.getAllowedNextStates(DocumentStatus.ACCEPTED, {
          hasVoidConfirmation: true,
        }),
      ).toEqual([DocumentStatus.VOIDED]);

      expect(service.getAllowedNextStates(DocumentStatus.OBSERVED)).toEqual([]);
      expect(
        service.getAllowedNextStates(DocumentStatus.OBSERVED, {
          hasVoidConfirmation: true,
        }),
      ).toEqual([DocumentStatus.VOIDED]);
    });

    it('should return empty list for terminal states (REJECTED, VOIDED)', () => {
      expect(service.getAllowedNextStates(DocumentStatus.REJECTED)).toEqual([]);
      expect(service.getAllowedNextStates(DocumentStatus.VOIDED)).toEqual([]);
    });

    it('should include current state when allowIdempotent is true', () => {
      const nextFromDraft = service.getAllowedNextStates(DocumentStatus.DRAFT, {
        allowIdempotent: true,
      });
      expect(nextFromDraft).toContain(DocumentStatus.DRAFT);
      expect(nextFromDraft).toContain(DocumentStatus.PENDING);

      const nextFromTerminal = service.getAllowedNextStates(DocumentStatus.REJECTED, {
        allowIdempotent: true,
      });
      expect(nextFromTerminal).toEqual([DocumentStatus.REJECTED]);
    });
  });

  describe('Ausencia de Datos del Documento en Mensajes de Error (Seguridad y Privacidad)', () => {
    it('should provide safe public error messages without sensitive document fields', () => {
      try {
        service.assertTransition(DocumentStatus.DRAFT, DocumentStatus.ACCEPTED);
        fail('Should have thrown InvalidStateTransitionException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(InvalidStateTransitionException);
        expect(err).toBeInstanceOf(ConflictException);

        const msg = err.message;
        expect(msg).toContain('DRAFT');
        expect(msg).toContain('ACCEPTED');

        // Verify zero private document data leaked in error
        expect(msg).not.toMatch(/\bdocumentId\b/i);
        expect(msg).not.toMatch(/\bcompanyId\b/i);
        expect(msg).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i); // UUID
        expect(msg).not.toMatch(/\bseries\b/i);
        expect(msg).not.toMatch(/\bnumero\b/i);
        expect(msg).not.toMatch(/\bcustomer\b/i);
        expect(msg).not.toMatch(/\bruc\b/i);
      }
    });

    it('should provide clear reason when void confirmation is missing without leaking document data', () => {
      try {
        service.assertTransition(DocumentStatus.ACCEPTED, DocumentStatus.VOIDED);
        fail('Should have thrown InvalidStateTransitionException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(InvalidStateTransitionException);
        expect(err.message).toContain('comunicación de baja');
        expect(err.message).toContain('VOIDED');
      }
    });

    it('should provide clear reason for terminal states without leaking document data', () => {
      try {
        service.assertTransition(DocumentStatus.REJECTED, DocumentStatus.PROCESSING);
        fail('Should have thrown InvalidStateTransitionException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(InvalidStateTransitionException);
        expect(err.message).toContain('terminal');
      }
    });

    it('should expose fromStatus and toStatus properties on the exception', () => {
      try {
        service.assertTransition(DocumentStatus.PENDING, DocumentStatus.SENT);
      } catch (err: any) {
        expect(err.fromStatus).toBe(DocumentStatus.PENDING);
        expect(err.toStatus).toBe(DocumentStatus.SENT);
      }
    });
  });

  describe('Validación de Entradas (BadRequestException)', () => {
    it('should reject invalid or unrecognized status names', () => {
      expect(() => service.canTransition('UNKNOWN' as any, DocumentStatus.PENDING)).toThrow(
        BadRequestException,
      );
      expect(() => service.canTransition(DocumentStatus.DRAFT, 'INVALID' as any)).toThrow(
        BadRequestException,
      );
      expect(() => service.assertTransition('' as any, DocumentStatus.PENDING)).toThrow(
        BadRequestException,
      );
      expect(() => service.assertTransition(DocumentStatus.DRAFT, null as any)).toThrow(
        BadRequestException,
      );
      expect(() => service.getAllowedNextStates(undefined as any)).toThrow(
        BadRequestException,
      );
    });
  });
});
