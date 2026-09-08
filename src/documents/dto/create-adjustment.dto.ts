import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsIn, IsString, Length } from 'class-validator';
import { CreateDocumentDto } from './create-document.dto';

export class CreateAdjustmentDocumentDto extends CreateDocumentDto {
  @ApiProperty({ example: '5f15da94-4e0c-42d7-947e-9ad304a31710' })
  @IsString()
  referenceDocumentId!: string;

  @ApiProperty({ example: '01', description: 'Código de motivo según el catálogo SUNAT aplicable.' })
  @IsString()
  @Length(2, 4)
  adjustmentReasonCode!: string;

  @ApiProperty({ example: 'Anulación de la operación' })
  @IsString()
  adjustmentReason!: string;
}

export class CreateCreditNoteDocumentDto extends CreateAdjustmentDocumentDto {
  @IsIn([DocumentType.CREDIT_NOTE])
  declare type: Extract<DocumentType, 'CREDIT_NOTE'>;
}

export class CreateDebitNoteDocumentDto extends CreateAdjustmentDocumentDto {
  @IsIn([DocumentType.DEBIT_NOTE])
  declare type: Extract<DocumentType, 'DEBIT_NOTE'>;
}
