import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://mysystem.com/api/webhooks/facturify', description: 'Client webhook receiver URL' })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({
    example: ['invoice.accepted', 'invoice.rejected', 'summary.processed'],
    description: 'Subscribed event types or ["*"] for all events',
  })
  @IsArray()
  @ArrayNotEmpty()
  events!: string[];
}
