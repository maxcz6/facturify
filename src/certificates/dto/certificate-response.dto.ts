import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CertificateResponseDto {
  @ApiProperty({
    description: 'Digital certificate internal UUID',
    example: 'cert_987654321',
  })
  id!: string;

  @ApiProperty({
    description: 'Associated company ID',
    example: 'cmp_123456',
  })
  companyId!: string;

  @ApiPropertyOptional({
    description: 'Certificate serial number',
    nullable: true,
    example: '205123456789',
  })
  serialNumber!: string | null;

  @ApiPropertyOptional({
    description: 'Subject distinguished name or business name',
    nullable: true,
    example: 'CN=EMPRESA DEMO S.A.C., O=EMPRESA DEMO S.A.C., C=PE',
  })
  subjectName!: string | null;

  @ApiPropertyOptional({
    description: 'Certificate validity start date',
    nullable: true,
    example: '2026-01-01T00:00:00.000Z',
  })
  validFrom!: Date | null;

  @ApiPropertyOptional({
    description: 'Certificate validity expiration date',
    nullable: true,
    example: '2027-01-01T00:00:00.000Z',
  })
  validUntil!: Date | null;

  @ApiProperty({
    description: 'Flag indicating whether this is currently the active signing certificate for the company',
    example: true,
  })
  active!: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-09-08T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-09-08T12:00:00.000Z',
  })
  updatedAt!: Date;
}
