import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiKeyEnvironment } from '../interfaces/api-key.interface';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'cmp_123456789abc', description: 'Associated company ID' })
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ example: 'Production Web App', description: 'Friendly name for the API Key' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ enum: ['live', 'test'], default: 'live', description: 'Environment prefix (fact_live_ / fact_test_)' })
  @IsOptional()
  @IsEnum(['live', 'test'])
  environment?: ApiKeyEnvironment = 'live';
}
