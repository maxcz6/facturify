import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '../dto/register-admin.dto';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (AdminRole | string)[]) => SetMetadata(ROLES_KEY, roles);
