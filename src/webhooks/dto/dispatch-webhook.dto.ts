import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class DispatchWebhookDto {
  @ApiProperty({ example: 'cmp_123456789abc' })
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ example: 'invoice.accepted' })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({
    example: {
      invoiceId: 'inv_123',
      serie: 'F001',
      correlativo: 1024,
      status: 'ACCEPTED',
      sunatResponseCode: '0',
      description: 'La Factura numero F001-1024, ha sido aceptada',
    },
  })
  @IsObject()
  data!: Record<string, any>;
}
