import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator';

export class CreateDocumentItemDto {
  @ApiProperty({ example: 'Servicio de desarrollo' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 1 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ example: 1000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class CreateDocumentDto {
  @ApiProperty({ example: '5f15da94-4e0c-42d7-947e-9ad304a31710' })
  @IsString()
  companyId!: string;

  @ApiProperty({ enum: DocumentType, example: DocumentType.INVOICE })
  @IsEnum(DocumentType)
  type!: DocumentType;

  @ApiProperty({ example: 'F001' })
  @IsString()
  @Length(1, 10)
  series!: string;

  @ApiProperty({ example: 1 })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  number!: number;

  @ApiProperty({ example: '6', required: false })
  @IsOptional()
  @IsString()
  customerDocumentType?: string;

  @ApiProperty({ example: '20123456789', required: false })
  @IsOptional()
  @IsString()
  customerDocumentNumber?: string;

  @ApiProperty({ example: 'Cliente Demo S.A.C.', required: false })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiProperty({ example: 'PEN', default: 'PEN' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({ type: [CreateDocumentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentItemDto)
  items!: CreateDocumentItemDto[];
}
