import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export { AdminRole };

export class BootstrapAdminDto {
  @ApiProperty({ example: 'superadmin@facturify.pe', description: 'Initial SuperAdmin email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Super Administrator', description: 'Full name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'SuperSecurePass123!', description: 'Password (min 8 chars)' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiProperty({
    example: 'bootstrap_secret_token_123',
    description: 'One-time bootstrap secret required to create the first admin',
  })
  @IsString()
  @IsNotEmpty()
  bootstrapToken!: string;
}

export class CreateAdminDto {
  @ApiProperty({ example: 'admin2@facturify.pe', description: 'Admin email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Segundo Administrador', description: 'Full name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'SecureAdminPass123!', description: 'Password (min 8 chars)' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    enum: AdminRole,
    default: AdminRole.ADMIN,
    description: 'Role to assign (only a SUPERADMIN can assign this)',
  })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole = AdminRole.ADMIN;
}

// Backward compatibility alias
export class RegisterAdminDto extends CreateAdminDto {}
