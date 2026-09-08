import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateDocumentItemDto } from '../../documents/dto/create-document.dto';

export class CreateInvoiceDto {
  @ApiProperty({ example: 'F001', description: 'Invoice series (typically starts with F)' })
  @IsString()
  @Length(1, 10)
  series!: string;

  @ApiProperty({ example: 1, description: 'Correlative number' })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  number!: number;

  @ApiPropertyOptional({ example: '6', description: 'SUNAT Catalog 06: 6 for RUC' })
  @IsOptional()
  @IsString()
  customerDocumentType?: string;

  @ApiPropertyOptional({ example: '20123456789', description: 'Customer RUC' })
  @IsOptional()
  @IsString()
  customerDocumentNumber?: string;

  @ApiPropertyOptional({ example: 'Cliente Demo S.A.C.', description: 'Customer legal name' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ example: 'PEN', default: 'PEN' })
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
