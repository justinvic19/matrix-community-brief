import { timingSafeEqual } from 'node:crypto';

export function authenticateWebhook(header: string | string[] | undefined, secret: string | undefined): boolean {
  if (!secret || typeof header !== 'string') return false;
  const received = Buffer.from(header);
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
