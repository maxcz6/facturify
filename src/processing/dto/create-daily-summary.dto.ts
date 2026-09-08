import { IsDateString } from 'class-validator';

export class CreateDailySummaryDto {
  @IsDateString()
  referenceDate!: string;
}
