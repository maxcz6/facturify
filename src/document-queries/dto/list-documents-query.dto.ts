import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by document processing status',
    enum: DocumentStatus,
  })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional({
    description: 'Filter by electronic document type',
    enum: DocumentType,
  })
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @ApiPropertyOptional({
    description: 'Filter by document series (e.g. F001, B001)',
    example: 'F001',
  })
  @IsOptional()
  @IsString()
  series?: string;

  @ApiPropertyOptional({
    description: 'Filter documents created on or after this timestamp (ISO 8601)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'Filter documents created on or before this timestamp (ISO 8601)',
    example: '2026-09-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  createdUntil?: string;

  @ApiPropertyOptional({
    description: 'Pagination limit (between 1 and 100, default: 20)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Cursor pointing to the document ID from which the next page starts',
    example: 'doc_123456789',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
