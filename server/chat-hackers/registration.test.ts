// @vitest-environment node
import { expect, it } from 'vitest';
import { createRegistration } from './registration';

it('can register with only a tunnel URL and never exports Matrix credentials or mappings', () => {
  const env = { CH_MODULE_URL: 'https://example.ngrok-free.dev', CH_MATRIX_TOKEN: 'private', CH_SOURCE_ROOM_ID: '!source', CH_STORAGE_ROOM_ID: '!storage', CH_CONFIRMERS: '@private:example.org' };
  const registration = createRegistration(env);
  expect(Object.keys(registration).sort()).toEqual(['description', 'emoji', 'event_types', 'id', 'introduction', 'title', 'url', 'uuid']);
  expect(registration).toMatchObject({ id: 'living-community-brief', url: 'https://example.ngrok-free.dev/', event_types: ['m.room.message', 'm.reaction'] });
  expect(createRegistration(env).uuid).not.toBe(registration.uuid);
  expect(createRegistration({ CH_MODULE_URL: env.CH_MODULE_URL, CH_TOOL_SECRET: 'hub-secret' }).secret).toBe('hub-secret');
});

it.each(['http://example.org', 'https://example.org/path', 'https://example.org/?token=secret', 'https://user:password@example.org'])('rejects unsuitable registration URL %s', url => {
  expect(() => createRegistration({ CH_MODULE_URL: url })).toThrow();
});
