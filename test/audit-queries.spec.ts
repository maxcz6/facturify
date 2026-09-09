import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  AuditQueriesController,
  AuditQueriesService,
  AUDIT_EVENTS_API_VERSION,
  PROHIBITED_AUDIT_OUTPUT_FIELDS,
  encodeCursor,
  decodeCursor,
  parsePaginationLimit,
  parseFilterDate,
  validateAuditAction,
  validateAuditResult,
} from '../src/audit-queries';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import { AdminTokenPolicyService } from '../src/admin-token-policy/admin-token-policy.service';

describe('AuditQueriesModule', () => {
  let controller: AuditQueriesController;
  let service: AuditQueriesService;
  const cursorKey = Buffer.alloc(32, 7);

  const mockAuditLogs = [
    {
      id: 'd1111111-1111-4111-8111-111111111111',
      eventId: 'a1111111-1111-4111-8111-111111111111',
      event: 'company.created',
      occurredAt: new Date('2026-09-08T15:00:00.000Z'),
      actorType: 'ADMIN',
      actorId: 'b2222222-2222-4222-8222-222222222222',
      companyId: 'c3333333-3333-4333-8333-333333333333',
      result: 'SUCCESS',
      publicCode: 'COMP_OK',
      requestId: 'req-003',
      internalId: 1003,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'd2222222-2222-4222-8222-222222222222',
      eventId: 'a2222222-2222-4222-8222-222222222222',
      event: 'admin.login_succeeded',
      occurredAt: new Date('2026-09-08T14:30:00.000Z'),
      actorType: 'ADMIN',
      actorId: 'b2222222-2222-4222-8222-222222222222',
      companyId: null,
      result: 'SUCCESS',
      publicCode: null,
      requestId: 'req-002',
      internalId: 1002,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'd3333333-3333-4333-8333-333333333333',
      eventId: 'a3333333-3333-4333-8333-333333333333',
      event: 'admin.login_failed',
      occurredAt: new Date('2026-09-08T14:00:00.000Z'),
      actorType: 'ANONYMOUS',
      actorId: null,
      companyId: null,
      result: 'FAILURE',
      publicCode: 'AUTH_FAILED',
      requestId: 'req-001',
      internalId: 1001,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockPrismaService = {
    auditLog: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditQueriesController],
      providers: [
        AuditQueriesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-jwt-secret-with-at-least-32-characters') },
        },
        AdminTokenPolicyService,
      ],
    }).compile();

    controller = module.get<AuditQueriesController>(AuditQueriesController);
    service = module.get<AuditQueriesService>(AuditQueriesService);
  });

  describe('Authorization & Roles Protection', () => {
    it('is protected by JwtAuthGuard and RolesGuard', () => {
      const guards = Reflect.getMetadata('__guards__', AuditQueriesController);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });

    it('requires ADMIN and SUPERADMIN roles', () => {
      const reflector = new Reflector();
      const roles = reflector.get<string[]>(ROLES_KEY, AuditQueriesController);
      expect(roles).toBeDefined();
      expect(roles).toEqual([AdminRole.ADMIN, AdminRole.SUPERADMIN]);
    });
  });

  describe('Controller & Service Query Execution', () => {
    it('returns sanitized items and nextCursor when more results exist', async () => {
      // Return 3 items when limit is 2 -> nextCursor should be computed
      mockPrismaService.auditLog.findMany.mockResolvedValueOnce([
        mockAuditLogs[0],
        mockAuditLogs[1],
        mockAuditLogs[2],
      ]);

      const response = await controller.listAuditEvents({ limit: 2 });

      expect(response.items).toHaveLength(2);
      expect(response.nextCursor).toBeDefined();
      expect(typeof response.nextCursor).toBe('string');

      // Verify item format and absence of internal fields
      const firstItem = response.items[0];
      expect(firstItem.eventId).toBe(mockAuditLogs[0].eventId);
      expect(firstItem.event).toBe('company.created');
      expect(firstItem.apiVersion).toBe(AUDIT_EVENTS_API_VERSION);
      expect(firstItem.actorType).toBe('ADMIN');
      expect(firstItem.actorId).toBe(mockAuditLogs[0].actorId);
      expect(firstItem.companyId).toBe(mockAuditLogs[0].companyId);
      expect(firstItem.result).toBe('SUCCESS');
      expect(firstItem.publicCode).toBe('COMP_OK');
      expect(firstItem.requestId).toBe('req-003');

      // Check strictly prohibited fields
      for (const prohibited of PROHIBITED_AUDIT_OUTPUT_FIELDS) {
        expect((firstItem as unknown as Record<string, unknown>)[prohibited]).toBeUndefined();
      }

      // Verify prisma call args: ordered by occurredAt DESC, id DESC
      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 3,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('returns null nextCursor when there are no more items', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValueOnce([
        mockAuditLogs[0],
      ]);

      const response = await service.listAuditEvents({ limit: 10 });
      expect(response.items).toHaveLength(1);
      expect(response.nextCursor).toBeNull();
    });
  });

  describe('Cursor Pagination & Stability', () => {
    it('encodes and decodes opaque cursor accurately', () => {
      const date = new Date('2026-09-08T15:00:00.000Z');
      const id = 'd4444444-4444-4444-8444-444444444444';
      const cursor = encodeCursor(date, id, cursorKey);

      expect(typeof cursor).toBe('string');
      expect(cursor).not.toContain('2026'); // Must be opaque base64url

      const decoded = decodeCursor(cursor, cursorKey);
      expect(decoded.occurredAt.toISOString()).toBe(date.toISOString());
      expect(decoded.id).toBe(id);
    });

    it('applies decoded cursor in Prisma WHERE condition (occurredAt + id DESC)', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValueOnce([mockAuditLogs[0], mockAuditLogs[1]]);

      const serviceCursor = await service.listAuditEvents({ limit: 1 });
      mockPrismaService.auditLog.findMany.mockClear();
      mockPrismaService.auditLog.findMany.mockResolvedValueOnce([mockAuditLogs[2]]);
      await service.listAuditEvents({ cursor: serviceCursor.nextCursor! });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                OR: [
                  { occurredAt: { lt: new Date('2026-09-08T15:00:00.000Z') } },
                  {
                    occurredAt: new Date('2026-09-08T15:00:00.000Z'),
                    id: { lt: mockAuditLogs[0].id },
                  },
                ],
              },
            ],
          }),
        }),
      );
    });

    it('rejects tampered or corrupt cursor strings with BadRequestException', () => {
      expect(() => decodeCursor('not-base-64-json-invalid', cursorKey)).toThrow(BadRequestException);
      expect(() => decodeCursor('', cursorKey)).toThrow(BadRequestException);
      expect(() => decodeCursor('   ', cursorKey)).toThrow(BadRequestException);

      // JSON with missing fields
      const badJson1 = Buffer.from(JSON.stringify({ o: '2026-01-01' }), 'utf8').toString('base64url');
      expect(() => decodeCursor(badJson1, cursorKey)).toThrow(BadRequestException);

      // JSON with invalid date
      const badJson2 = Buffer.from(JSON.stringify({ o: 'invalid-date', i: '123' }), 'utf8').toString('base64url');
      expect(() => decodeCursor(badJson2, cursorKey)).toThrow(BadRequestException);

      const valid = encodeCursor(new Date(), 'd5555555-5555-4555-8555-555555555555', cursorKey);
      const altered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
      expect(() => decodeCursor(altered, cursorKey)).toThrow(BadRequestException);
    });
  });

  describe('Filters & Input Validation', () => {
    it('applies valid filters for companyId, actorId, event, result, from, to', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValueOnce([]);

      const validCompany = 'c3333333-3333-4333-8333-333333333333';
      const validActor = 'b2222222-2222-4222-8222-222222222222';

      await service.listAuditEvents({
        companyId: validCompany,
        actorId: validActor,
        event: 'company.created',
        result: 'SUCCESS',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-08T23:59:59.999Z',
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: validCompany,
            actorId: validActor,
            event: 'company.created',
            result: 'SUCCESS',
            occurredAt: {
              gte: new Date('2026-09-01T00:00:00.000Z'),
              lte: new Date('2026-09-08T23:59:59.999Z'),
            },
          }),
        }),
      );
    });

    it('rejects invalid companyId UUID', async () => {
      await expect(service.listAuditEvents({ companyId: 'not-a-uuid' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid actorId UUID', async () => {
      await expect(service.listAuditEvents({ actorId: 'not-a-uuid' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects disallowed event name in filter', async () => {
      await expect(service.listAuditEvents({ event: 'unauthorized.action' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid result in filter', async () => {
      await expect(service.listAuditEvents({ result: 'UNKNOWN' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid date formats in from and to', async () => {
      await expect(service.listAuditEvents({ from: 'invalid-date' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.listAuditEvents({ to: 'invalid-date' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects from date if later than to date', async () => {
      await expect(
        service.listAuditEvents({
          from: '2026-09-10T00:00:00.000Z',
          to: '2026-09-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Pagination Limits (Default 50, Min 1, Max 100)', () => {
    it('uses default limit of 50 when omitted', () => {
      expect(parsePaginationLimit()).toBe(50);
      expect(parsePaginationLimit(undefined)).toBe(50);
      expect(parsePaginationLimit('')).toBe(50);
    });

    it('accepts valid limits between 1 and 100', () => {
      expect(parsePaginationLimit(1)).toBe(1);
      expect(parsePaginationLimit(50)).toBe(50);
      expect(parsePaginationLimit(100)).toBe(100);
      expect(parsePaginationLimit('25')).toBe(25);
    });

    it('rejects limits outside range or non-integer', () => {
      expect(() => parsePaginationLimit(0)).toThrow(BadRequestException);
      expect(() => parsePaginationLimit(-5)).toThrow(BadRequestException);
      expect(() => parsePaginationLimit(101)).toThrow(BadRequestException);
      expect(() => parsePaginationLimit('abc')).toThrow(BadRequestException);
      expect(() => parsePaginationLimit(12.5)).toThrow(BadRequestException);
    });
  });

  describe('Utility Edge Cases', () => {
    it('handles parseFilterDate edge cases', () => {
      expect(parseFilterDate()).toBeUndefined();
      expect(parseFilterDate(null)).toBeUndefined();
      expect(parseFilterDate('')).toBeUndefined();
      expect(() => parseFilterDate(12345 as unknown as string)).toThrow(BadRequestException);
    });

    it('handles validateAuditAction and validateAuditResult empty values', () => {
      expect(validateAuditAction()).toBeUndefined();
      expect(validateAuditAction(null)).toBeUndefined();
      expect(validateAuditResult()).toBeUndefined();
      expect(validateAuditResult(null)).toBeUndefined();
    });
  });
});
