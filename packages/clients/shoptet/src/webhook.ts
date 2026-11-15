import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

/**
 * Shoptet signs each webhook with HMAC-SHA1 of the raw body, keyed by the
 * signature key from POST /api/webhooks/renew-signature-key, and sends it in
 * the Shoptet-Webhook-Signature header (hex).
 *
 * Pass the raw request body: re-serialised JSON will not match.
 */
export const SHOPTET_SIGNATURE_HEADER = 'shoptet-webhook-signature';

export function signShoptetWebhook(rawBody: string | Buffer, signatureKey: string): string {
  return createHmac('sha1', signatureKey).update(rawBody).digest('hex');
}

export function verifyShoptetWebhook(
  rawBody: string | Buffer,
  signature: string | undefined | null,
  signatureKey: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signShoptetWebhook(rawBody, signatureKey), 'utf8');
  const given = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const webhookEvent = z.looseObject({
  eshopId: z.number(),
  event: z.string(),
  eventCreated: z.string(),
  eventInstance: z.string(),
});
export type ShoptetWebhookEvent = z.infer<typeof webhookEvent>;
