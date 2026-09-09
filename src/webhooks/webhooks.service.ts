import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import {
  WebhookDeliveryStatus,
  WebhookStatus,
} from '@prisma/client';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsEncryptionService } from '../security/secrets-encryption.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import {
  DeliveryStatus,
  WebhookDeliveryLog,
} from './interfaces/webhook-delivery.interface';
import {
  RegisteredWebhookResponse,
  WebhookSubscription,
} from './interfaces/webhook.interface';
import { WebhookCrypto } from './webhooks.crypto';
import { WebhookValidator } from './webhooks.validator';
import { WebhookDnsSafetyService } from '../webhook-dns-safety/webhook-dns-safety.service';
import { SafeWebhookHttpClient } from '../safe-webhook-client/safe-webhook-client.service';
import { SafeWebhookClientException } from '../safe-webhook-client/safe-webhook-client.interface';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: SecretsEncryptionService,
    @Optional() private readonly dnsSafety?: WebhookDnsSafetyService,
    @Optional() private readonly safeClient?: SafeWebhookHttpClient,
  ) {}

  async register(
    companyId: string,
    dto: CreateWebhookDto,
  ): Promise<RegisteredWebhookResponse> {
    // Validate URL against SSRF and protocol rules
    WebhookValidator.validateUrl(dto.url);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with ID ${companyId} not found.`);
    }

    const rawSecret = WebhookCrypto.generateSecret();
    const enc = this.encryption.encrypt(rawSecret);

    const record = await this.prisma.webhook.create({
      data: {
        companyId,
        url: dto.url,
        events: dto.events,
        encryptedSecret: enc.encrypted,
        secretIv: enc.iv,
        secretAuthTag: enc.authTag,
        status: WebhookStatus.ACTIVE,
      },
    });

    // Return the secret ONLY once upon registration
    return {
      id: record.id,
      companyId: record.companyId,
      url: record.url,
      events: record.events,
      status: record.status as 'ACTIVE' | 'DISABLED',
      createdAt: record.createdAt,
      secret: rawSecret,
    };
  }

  async listByCompany(companyId: string): Promise<WebhookSubscription[]> {
    const records = await this.prisma.webhook.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      url: r.url,
      events: r.events,
      status: r.status as 'ACTIVE' | 'DISABLED',
      createdAt: r.createdAt,
    }));
  }

  async findById(companyId: string, id: string): Promise<WebhookSubscription> {
    const record = await this.prisma.webhook.findFirst({
      where: { id, companyId },
    });

    if (!record) {
      throw new NotFoundException(`Webhook with ID ${id} not found.`);
    }

    return {
      id: record.id,
      companyId: record.companyId,
      url: record.url,
      events: record.events,
      status: record.status as 'ACTIVE' | 'DISABLED',
      createdAt: record.createdAt,
    };
  }

  async delete(
    companyId: string,
    id: string,
  ): Promise<{ success: boolean; id: string }> {
    const record = await this.prisma.webhook.findFirst({
      where: { id, companyId },
    });

    if (!record) {
      throw new NotFoundException(`Webhook with ID ${id} not found.`);
    }

    await this.prisma.webhook.delete({
      where: { id },
    });

    return { success: true, id };
  }

  async getDeliveries(companyId: string): Promise<WebhookDeliveryLog[]> {
    const records = await this.prisma.webhookDelivery.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { webhook: { select: { url: true } } },
    });

    return records.map((r) => ({
      id: r.id,
      webhookId: r.webhookId,
      companyId: r.companyId,
      url: r.webhook?.url ?? '',
      event: r.event,
      payload: r.payload,
      signatureHeader: r.signatureHeader,
      attempt: r.attempt,
      maxAttempts: r.maxAttempts,
      status: r.status as DeliveryStatus,
      statusCode: r.statusCode ?? undefined,
      error: r.error ?? undefined,
      timestamp: Math.floor(r.createdAt.getTime() / 1000),
      durationMs: r.durationMs ?? undefined,
      deliveredAt: r.deliveredAt ?? undefined,
    }));
  }

  async dispatch(
    companyId: string,
    event: string,
    data: Record<string, any>,
    maxAttempts: number = 3,
  ): Promise<WebhookDeliveryLog[]> {
    const allHooks = await this.prisma.webhook.findMany({
      where: {
        companyId,
        status: WebhookStatus.ACTIVE,
      },
    });

    const matchingHooks = allHooks.filter(
      (hook) => hook.events.includes(event) || hook.events.includes('*'),
    );

    if (matchingHooks.length === 0) {
      return [];
    }

    const results: WebhookDeliveryLog[] = [];

    for (const hook of matchingHooks) {
      // Decrypt secret with AES-256-GCM
      const rawSecret = this.encryption.decrypt({
        encrypted: hook.encryptedSecret,
        iv: hook.secretIv,
        authTag: hook.secretAuthTag,
      });

      const eventEnvelope = typeof data.eventId === 'string' && data.apiVersion === 'v1'
        ? data
        : {
        id: `evt_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
        event,
        companyId,
        data,
        createdAt: new Date().toISOString(),
      };

      const payloadString = JSON.stringify(eventEnvelope);
      const timestamp = Math.floor(Date.now() / 1000);
      const signatureHeader = WebhookCrypto.buildSignatureHeader(
        payloadString,
        rawSecret,
        timestamp,
      );

      // Create initial delivery record in DB
      const deliveryRecord = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          companyId,
          event,
          payload: eventEnvelope,
          signatureHeader,
          attempt: 1,
          maxAttempts,
          status: WebhookDeliveryStatus.PENDING,
        },
      });

      const deliveryLog: WebhookDeliveryLog = {
        id: deliveryRecord.id,
        webhookId: hook.id,
        companyId,
        url: hook.url,
        event,
        payload: eventEnvelope,
        signatureHeader,
        attempt: 1,
        maxAttempts,
        status: 'PENDING',
        timestamp,
      };

      await this.executeDeliveryWithRetries(
        hook.url,
        payloadString,
        signatureHeader,
        deliveryLog,
      );

      // Update delivery record in DB
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryRecord.id },
        data: {
          attempt: deliveryLog.attempt,
          status:
            deliveryLog.status === 'SUCCESS'
              ? WebhookDeliveryStatus.SUCCESS
              : WebhookDeliveryStatus.FAILED,
          statusCode: deliveryLog.statusCode,
          error: deliveryLog.error,
          durationMs: deliveryLog.durationMs,
          deliveredAt: deliveryLog.deliveredAt,
        },
      });

      results.push(deliveryLog);
    }

    return results;
  }

  private async executeDeliveryWithRetries(
    url: string,
    payloadString: string,
    signatureHeader: string,
    deliveryLog: WebhookDeliveryLog,
  ): Promise<void> {
    const startTime = Date.now();

    for (let attempt = 1; attempt <= deliveryLog.maxAttempts; attempt++) {
      deliveryLog.attempt = attempt;
      try {
        const destination = await this.dnsSafety?.validateWebhookDestination(url);
        if (destination && this.safeClient) {
          const response = await this.safeClient.sendWebhook({
            url, validatedIps: destination.addresses, payload: payloadString,
            headers: {
              'Content-Type': 'application/json',
              'X-Facturify-Signature': signatureHeader,
              'User-Agent': 'Facturify-Webhooks/1.0',
            },
            timeoutMs: 5000,
          });
          deliveryLog.statusCode = response.statusCode;
          deliveryLog.retryAfter = response.retryAfter;
          deliveryLog.durationMs = Date.now() - startTime;
          if (response.ok) {
            deliveryLog.status = 'SUCCESS';
            deliveryLog.deliveredAt = new Date();
            return;
          }
          deliveryLog.error = `HTTP_${response.statusCode}`;
        } else {
          const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Facturify-Signature': signatureHeader,
            'User-Agent': 'Facturify-Webhooks/1.0',
          },
          body: payloadString,
          signal: AbortSignal.timeout(5000),
          });

          deliveryLog.statusCode = response.status;
          deliveryLog.durationMs = Date.now() - startTime;

          if (response.ok) {
            deliveryLog.status = 'SUCCESS';
            deliveryLog.deliveredAt = new Date();
            return;
          }
          deliveryLog.error = `HTTP_${response.status}`;
        }
      } catch (err: unknown) {
        if (err instanceof BadRequestException && this.dnsSafety) {
          deliveryLog.error = 'UNSAFE_DESTINATION';
          deliveryLog.durationMs = Date.now() - startTime;
          break;
        }
        if (err instanceof SafeWebhookClientException) {
          deliveryLog.error = err.code;
          deliveryLog.durationMs = Date.now() - startTime;
          if (err.code !== 'TIMEOUT' && err.code !== 'NETWORK_ERROR') break;
        } else {
          deliveryLog.error = this.safeDeliveryErrorCode(err);
          deliveryLog.durationMs = Date.now() - startTime;
        }
      }

      if (attempt < deliveryLog.maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }

    deliveryLog.status = 'FAILED';
  }

  private safeDeliveryErrorCode(error: unknown): 'TIMEOUT' | 'NETWORK_ERROR' {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return 'TIMEOUT';
    }
    return 'NETWORK_ERROR';
  }
}
