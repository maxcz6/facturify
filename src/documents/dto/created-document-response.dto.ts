import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Document, DocumentStatus, DocumentType, Prisma } from '@prisma/client';

export class CreatedDocumentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: DocumentType }) type!: DocumentType;
  @ApiProperty() series!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ enum: DocumentStatus }) status!: DocumentStatus;
  @ApiProperty() currency!: string;
  @ApiProperty() subtotal!: string;
  @ApiProperty() tax!: string;
  @ApiProperty() total!: string;
  @ApiPropertyOptional({ nullable: true }) issuedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

const money = (value: unknown): string => {
  try { return new Prisma.Decimal(value as Prisma.Decimal.Value).toFixed(2); }
  catch { return '0.00'; }
};

export function toCreatedDocumentResponse(document: Document): CreatedDocumentResponseDto {
  return {
    id: document.id,
    type: document.type,
    series: document.series,
    number: document.number,
    status: document.status,
    currency: document.currency,
    subtotal: money(document.subtotal),
    tax: money(document.tax),
    total: money(document.total),
    issuedAt: document.issuedAt,
    createdAt: document.createdAt,
  };
}
