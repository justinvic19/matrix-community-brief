import { expect, it } from 'vitest';
import { oauthClientMetadata } from './auth';

it('registers the deployed site as a public web client without room or credential parameters', () => {
  const metadata = oauthClientMetadata('https://justinvic19.github.io/matrix-community-brief/?roomId=!room&token=secret#activity-a');
  expect(metadata).toMatchObject({
    application_type: 'web',
    client_uri: 'https://justinvic19.github.io/matrix-community-brief/',
    redirect_uris: ['https://justinvic19.github.io/matrix-community-brief/'],
    token_endpoint_auth_method: 'none',
  });
  expect(JSON.stringify(metadata)).not.toMatch(/localhost|secret|roomId/);
});
it('supports local development and rejects insecure hosted sign-in', () => {
  expect(oauthClientMetadata('http://127.0.0.1:5173/')).toMatchObject({ application_type: 'native', redirect_uris: ['http://127.0.0.1:5173/'] });
  expect(() => oauthClientMetadata('http://example.org/')).toThrow(/HTTPS/);
});
