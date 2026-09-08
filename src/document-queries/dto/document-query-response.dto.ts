import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentStatus, DocumentType } from '@prisma/client';

export class DocumentItemResponseDto {
  @ApiProperty({ example: 'item_123456789' })
  id!: string;

  @ApiProperty({ example: 'Consulting Services' })
  description!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiProperty({ example: 100.0 })
  unitPrice!: number;

  @ApiProperty({ example: 100.0 })
  subtotal!: number;

  @ApiProperty({ example: 18.0 })
  tax!: number;

  @ApiProperty({ example: 118.0 })
  total!: number;
}

export class DocumentQueryResponseDto {
  @ApiProperty({ example: 'doc_123456789' })
  id!: string;

  @ApiProperty({ example: 'cmp_123456' })
  companyId!: string;

  @ApiProperty({ enum: DocumentType, example: DocumentType.INVOICE })
  type!: DocumentType;

  @ApiProperty({ example: 'F001' })
  series!: string;

  @ApiProperty({ example: 1001 })
  number!: number;

  @ApiProperty({ enum: DocumentStatus, example: DocumentStatus.ACCEPTED })
  status!: DocumentStatus;

  @ApiPropertyOptional({ example: '6', nullable: true })
  customerDocumentType!: string | null;

  @ApiPropertyOptional({ example: '20123456789', nullable: true })
  customerDocumentNumber!: string | null;

  @ApiPropertyOptional({ example: 'Cliente S.A.C.', nullable: true })
  customerName!: string | null;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ example: 100.0 })
  subtotal!: number;

  @ApiProperty({ example: 18.0 })
  tax!: number;

  @ApiProperty({ example: 118.0 })
  total!: number;

  @ApiPropertyOptional({ example: '0', nullable: true })
  sunatCode!: string | null;

  @ApiPropertyOptional({ example: 'La Factura F001-1001 ha sido aceptada', nullable: true })
  sunatMessage!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  referenceDocumentId!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  adjustmentReasonCode!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  adjustmentReason!: string | null;

  @ApiPropertyOptional({ example: '2026-09-08T12:00:00.000Z', nullable: true })
  issuedAt!: Date | null;

  @ApiProperty({ example: '2026-09-08T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-08T12:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({ description: 'True if official signed XML artifact is available for download' })
  xmlAvailable!: boolean;

  @ApiProperty({ description: 'True if generated ZIP package artifact is available for download' })
  zipAvailable!: boolean;

  @ApiProperty({ description: 'True if SUNAT CDR receipt artifact is available for download' })
  cdrAvailable!: boolean;

  @ApiProperty({ type: [DocumentItemResponseDto] })
  items!: DocumentItemResponseDto[];
}

export class PaginatedDocumentsResponseDto {
  @ApiProperty({ type: [DocumentQueryResponseDto] })
  items!: DocumentQueryResponseDto[];

  @ApiPropertyOptional({
    description: 'Next cursor for pagination, or null if no further pages exist',
    example: 'doc_987654321',
    nullable: true,
  })
  nextCursor!: string | null;

  @ApiProperty({ description: 'Indicates whether there are additional documents to fetch' })
  hasMore!: boolean;

  @ApiProperty({ description: 'Page limit applied to the query' })
  limit!: number;
}
