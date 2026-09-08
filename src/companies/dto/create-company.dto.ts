import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';

export enum SunatEnvironment {
  BETA = 'BETA',
  PRODUCTION = 'PRODUCTION',
}

export class CreateCompanyDto {
  @ApiProperty({ example: '20123456789' })
  @IsString()
  @Length(11, 11)
  ruc!: string;

  @ApiProperty({ example: 'Empresa Demo S.A.C.' })
  @IsString()
  businessName!: string;

  @ApiProperty({ enum: SunatEnvironment, example: SunatEnvironment.BETA })
  @IsEnum(SunatEnvironment)
  environment!: SunatEnvironment;
}
