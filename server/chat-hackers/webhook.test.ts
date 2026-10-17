// @vitest-environment node
import { expect, it } from 'vitest';
import { authenticateWebhook } from './webhook';
import { readConfig } from './config';

it('rejects missing, wrong, duplicate headers and missing server secrets', () => {
  const secret = 'a'.repeat(64);
  for (const header of [undefined, '', 'b'.repeat(64), [secret, secret]]) expect(authenticateWebhook(header, secret)).toBe(false);
  expect(authenticateWebhook(secret, undefined)).toBe(false);
  expect(authenticateWebhook(secret, secret)).toBe(true);
});
it('fails closed for Hub mode with no valid secret', () => {
  expect(() => readConfig({ CH_EVENT_SOURCE: 'hub' })).toThrow('CH_WEBHOOK_SECRET');
  expect(() => readConfig({ CH_EVENT_SOURCE: 'hub', CH_WEBHOOK_SECRET: 'replace-me' })).toThrow('CH_WEBHOOK_SECRET');
});
it('requires the exact explicit demo opt-in to run without a secret', () => {
  const env = { CH_EVENT_SOURCE: 'hub', CH_MATRIX_SERVER: 'https://matrix.org', CH_MATRIX_TOKEN: 'token', CH_SOURCE_ROOM_ID: '!source', CH_STORAGE_ROOM_ID: '!storage', CH_CONFIRMERS: '@john:matrix.org' };
  expect(readConfig({ ...env, CH_ALLOW_UNAUTHENTICATED_HUB: 'true' }).allowUnauthenticatedHub).toBe(true);
  for (const flag of ['false', '1', 'yes', '']) expect(() => readConfig({ ...env, CH_ALLOW_UNAUTHENTICATED_HUB: flag })).toThrow('CH_WEBHOOK_SECRET');
});
