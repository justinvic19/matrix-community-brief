// @vitest-environment node
import { expect, it } from 'vitest';
import { checkSetup } from './config';

it('rejects example configuration without disclosing credentials', () => {
  const env = { CH_MATRIX_SERVER: 'https://matrix.example.org', CH_MATRIX_TOKEN: 'private-sensitive-token', CH_SOURCE_ROOM_ID: '!source-room', CH_STORAGE_ROOM_ID: '!different-storage-room', CH_CONFIRMERS: '@organiser:example.org' };
  expect(() => checkSetup(env)).toThrow('Setup incomplete');
  try { checkSetup(env); } catch (error) { expect(String(error)).not.toContain(env.CH_MATRIX_TOKEN); }
});
it('accepts filled configuration for subsequent syntax and Matrix checks', () => {
  expect(() => checkSetup({ CH_MATRIX_SERVER: 'https://matrix.org', CH_MATRIX_TOKEN: 'private-token', CH_SOURCE_ROOM_ID: '!source', CH_STORAGE_ROOM_ID: '!storage', CH_CONFIRMERS: '@organiser:matrix.org' })).not.toThrow();
});
