import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SaveSunatCredentialsDto {
  @ApiProperty({
    description: 'SOL secondary username (alphanumeric, 1 to 20 characters)',
    example: 'MODDATOS',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9]{1,20}$/, {
    message: 'Username must be alphanumeric and between 1 and 20 characters.',
  })
  username!: string;

  @ApiProperty({
    description: 'SOL secondary user password',
    example: 'moddatos',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password!: string;
}
