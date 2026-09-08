import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompanyId } from '../api-keys/decorators/current-company-id.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { DispatchWebhookDto } from './dto/dispatch-webhook.dto';
import { WebhookCrypto } from './webhooks.crypto';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks')
@Controller('webhooks')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @ApiOperation({
    summary: 'Register a client webhook endpoint for the authenticated company',
    description: 'The company is strictly inferred from the Bearer API Key. Returns the secret (whsec_...) used to verify HMAC-SHA256 signatures.',
  })
  @ApiCreatedResponse({ description: 'Webhook subscription created.' })
  async register(
    @Body() dto: CreateWebhookDto,
    @CurrentCompanyId() companyId: string,
  ) {
    return this.webhooksService.register(companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all webhooks registered for the authenticated company' })
  @ApiOkResponse({ description: 'List of webhook subscriptions.' })
  async list(@CurrentCompanyId() companyId: string) {
    return this.webhooksService.listByCompany(companyId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a webhook subscription owned by the authenticated company' })
  async delete(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: string,
  ) {
    return this.webhooksService.delete(companyId, id);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'List recent webhook delivery logs for the authenticated company' })
  async getDeliveries(@CurrentCompanyId() companyId: string) {
    return this.webhooksService.getDeliveries(companyId);
  }

  @Post('test-dispatch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test dispatching a webhook event with HMAC-SHA256 signature (Development only)',
  })
  async testDispatch(
    @Body() dto: Omit<DispatchWebhookDto, 'companyId'>,
    @CurrentCompanyId() companyId: string,
  ) {
    this.assertDevelopmentEnvironment();
    return this.webhooksService.dispatch(companyId, dto.event, dto.data);
  }

  @Post('verify-signature')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Helper tool for developers to test their signature verification logic (Development only)',
  })
  verifySignature(
    @Body()
    body: {
      payload: any;
      header: string;
      secret: string;
      toleranceSeconds?: number;
    },
  ) {
    this.assertDevelopmentEnvironment();
    const payloadString =
      typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload);
    return WebhookCrypto.verifySignature(
      payloadString,
      body.header,
      body.secret,
      body.toleranceSeconds,
    );
  }

  private assertDevelopmentEnvironment(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Testing tools and diagnostic endpoints are disabled in production environments.',
      );
    }
  }
}
