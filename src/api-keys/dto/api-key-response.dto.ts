import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({ example: 'key_9876543210ab' })
  id!: string;

  @ApiProperty({ example: 'cmp_123456789abc' })
  companyId!: string;

  @ApiProperty({ example: 'Production Web App' })
  name!: string;

  @ApiPropertyOptional({
    example: 'fact_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456',
    description: 'The raw secret API key. ONLY revealed once upon creation or rotation.',
  })
  apiKey?: string;

  @ApiProperty({ example: 'fact_live_' })
  prefix!: string;

  @ApiProperty({ example: '3456' })
  lastFour!: string;

  @ApiProperty({ example: 'live' })
  environment!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional()
  lastUsedAt?: Date;

  @ApiPropertyOptional()
  revokedAt?: Date;
}
