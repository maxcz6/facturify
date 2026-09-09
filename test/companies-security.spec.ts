import { AdminRole } from '@prisma/client';
import { CompaniesController } from '../src/companies/companies.controller';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';

describe('CompaniesController security', () => {
  it('requires JWT and an administrative role for every company endpoint', () => {
    const guards = Reflect.getMetadata('__guards__', CompaniesController);
    const roles = Reflect.getMetadata('roles', CompaniesController);

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    expect(roles).toEqual(expect.arrayContaining([AdminRole.ADMIN, AdminRole.SUPERADMIN]));
  });
});
