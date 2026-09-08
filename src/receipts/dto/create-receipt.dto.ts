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

export class CreateReceiptDto {
  @ApiProperty({ example: 'B001', description: 'Receipt series (typically starts with B)' })
  @IsString()
  @Length(1, 10)
  series!: string;

  @ApiProperty({ example: 1, description: 'Correlative number' })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  number!: number;

  @ApiPropertyOptional({ example: '1', description: 'SUNAT Catalog 06: 1 for DNI, 4 for Carnet de Extranjería, etc.' })
  @IsOptional()
  @IsString()
  customerDocumentType?: string;

  @ApiPropertyOptional({ example: '71234567', description: 'Customer identification number (e.g. DNI)' })
  @IsOptional()
  @IsString()
  customerDocumentNumber?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Customer full name' })
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
