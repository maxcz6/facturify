import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsString, Length, Matches, ValidateNested } from 'class-validator';

export class VoidDocumentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  documentId!: string;

  @IsString()
  @Length(3, 100)
  reason!: string;
}

export class CreateVoidCommunicationDto {
  @IsDateString()
  referenceDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => VoidDocumentDto)
  documents!: VoidDocumentDto[];
}
