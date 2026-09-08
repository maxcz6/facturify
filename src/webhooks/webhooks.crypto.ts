import * as crypto from 'node:crypto';

export class WebhookCrypto {
  /**
   * Generates a secure random secret for webhooks with prefix whsec_
   */
  static generateSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString('hex')}`;
  }

  /**
   * Computes the HMAC-SHA256 signature for a given payload and timestamp
   */
  static signPayload(payloadString: string, secret: string, timestamp: number): string {
    const signaturePayload = `${timestamp}.${payloadString}`;
    return crypto
      .createHmac('sha256', secret)
      .update(signaturePayload, 'utf8')
      .digest('hex');
  }

  /**
   * Generates the header value, e.g. "t=1725740000,v1=abcdef123..."
   */
  static buildSignatureHeader(
    payloadString: string,
    secret: string,
    timestamp: number = Math.floor(Date.now() / 1000),
  ): string {
    const signature = this.signPayload(payloadString, secret, timestamp);
    return `t=${timestamp},v1=${signature}`;
  }

  /**
   * Validates an incoming webhook signature using timing-safe comparison and replay attack protection
   */
  static verifySignature(
    payloadString: string,
    header: string,
    secret: string,
    toleranceSeconds: number = 300,
  ): { valid: boolean; reason?: string } {
    if (!header) {
      return { valid: false, reason: 'Missing signature header.' };
    }

    const elements = header.split(',');
    let timestamp: number | null = null;
    let signature: string | null = null;

    for (const element of elements) {
      const [key, value] = element.split('=');
      if (key === 't') {
        timestamp = parseInt(value, 10);
      } else if (key === 'v1') {
        signature = value;
      }
    }

    if (!timestamp || isNaN(timestamp) || !signature) {
      return { valid: false, reason: 'Malformed signature header format. Expected t=...,v1=...' };
    }

    // Replay attack prevention: verify timestamp freshness
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTimestamp - timestamp) > toleranceSeconds) {
      return { valid: false, reason: 'Webhook signature timestamp outside tolerance window.' };
    }

    const expectedSignature = this.signPayload(payloadString, secret, timestamp);

    try {
      const match = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
      return match ? { valid: true } : { valid: false, reason: 'Signature mismatch.' };
    } catch {
      return { valid: false, reason: 'Invalid signature encoding.' };
    }
  }
}
