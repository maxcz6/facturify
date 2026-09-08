import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator';
import { CreateDocumentItemDto } from '../../documents/dto/create-document.dto';

export class CreateAdjustmentNoteDto {
  @ApiProperty({ example: '5f15da94-4e0c-42d7-947e-9ad304a31710' })
  @IsString()
  referenceDocumentId!: string;

  @ApiProperty({ example: 'FC01' })
  @IsString()
  @Length(1, 10)
  series!: string;

  @ApiProperty({ example: 1 })
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  number!: number;

  @ApiProperty({ example: '01' })
  @IsString()
  @Length(2, 4)
  reasonCode!: string;

  @ApiProperty({ example: 'Anulación de la operación' })
  @IsString()
  reason!: string;

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
