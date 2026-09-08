import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@facturify.pe', description: 'Admin user email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SuperSecret123!', description: 'Admin password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  password!: string;
}
