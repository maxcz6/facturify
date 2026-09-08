import { ApiProperty } from '@nestjs/swagger';

export class SunatCredentialsStatusResponseDto {
  @ApiProperty({
    description: 'Whether SUNAT credentials are configured for this company',
    example: true,
  })
  configured!: boolean;

  @ApiProperty({
    description: 'Masked SOL username (or null if not configured)',
    example: 'MO****OS',
    nullable: true,
  })
  usernameMasked!: string | null;

  @ApiProperty({
    description: 'Timestamp when credentials were created (or null if not configured)',
    example: '2026-09-08T12:00:00.000Z',
    nullable: true,
  })
  createdAt!: Date | null;

  @ApiProperty({
    description: 'Timestamp when credentials were last updated (or null if not configured)',
    example: '2026-09-08T12:00:00.000Z',
    nullable: true,
  })
  updatedAt!: Date | null;
}

export class DeleteSunatCredentialsResponseDto {
  @ApiProperty({
    description: 'Credentials configuration status after deletion',
    example: false,
  })
  configured!: false;
}
