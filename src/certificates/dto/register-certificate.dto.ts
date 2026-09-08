import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterCertificateDto {
  @ApiProperty({
    description: 'ID of the company that owns this digital certificate',
    example: 'cmp_123456',
  })
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({
    description: 'Base64-encoded PKCS#12 (.pfx / .p12) certificate file contents',
    example: 'MIIJyQIBAzCCCUYGCSqGSIb3DQEHAaCCCV...',
  })
  @IsString()
  @IsNotEmpty()
  pfxBase64!: string;

  @ApiProperty({
    description: 'Passphrase for decrypting the PKCS#12 bundle',
    example: 'CertPass123!@#',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({
    description: 'Certificate serial number',
    example: '205123456789',
  })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional({
    description: 'Certificate subject common name / distinguished name',
    example: 'CN=EMPRESA DEMO S.A.C., O=EMPRESA DEMO S.A.C., C=PE',
  })
  @IsOptional()
  @IsString()
  subjectName?: string;

  @ApiProperty({
    description: 'Validity start timestamp (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  validFrom!: string;

  @ApiProperty({
    description: 'Validity end timestamp / expiration date (ISO 8601)',
    example: '2027-01-01T00:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  validUntil!: string;
}
