import { createClient, OAuth2, OAuthGrantType } from 'matrix-js-sdk';
import { normalizeHomeserver } from './client';

export interface DeviceAuthorizationPrompt {
  verificationUri: string;
  verificationUriComplete?: string;
  userCode: string;
}

export interface OAuthSession {
  homeserver: string;
  accessToken: string;
  refreshToken: string;
  oauthClientId: string;
  deviceId: string;
  userId: string;
}

function randomString(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Sign-in cancelled.', 'AbortError')); return; }
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    function abort() {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Sign-in cancelled.', 'AbortError'));
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function registerOAuthClient(
  endpoint: string,
  clientMetadata: Record<string, unknown>,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(clientMetadata),
    });
  } catch {
    throw new Error('The browser could not reach the homeserver registration endpoint. Check the homeserver URL and whether it allows browser sign-in requests (CORS).');
  }

  const payload: unknown = await response.json().catch(() => null);
  const result = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (!response.ok) {
    const detail = typeof result.error_description === 'string'
      ? result.error_description
      : typeof result.error === 'string'
        ? result.error
        : typeof result.error_msg === 'string'
          ? result.error_msg
          : '';
    throw new Error(`The homeserver rejected app registration (HTTP ${response.status})${detail ? `: ${detail}` : '. Its OAuth policy may not allow a local development app.'}`);
  }
  if (typeof result.client_id !== 'string' || !result.client_id) {
    throw new Error('The homeserver accepted registration but did not return an OAuth client ID.');
  }
  return result.client_id;
}

export async function signInWithMatrix(
  homeserverInput: string,
  onPrompt: (prompt: DeviceAuthorizationPrompt) => void,
  signal: AbortSignal,
): Promise<OAuthSession> {
  const homeserver = normalizeHomeserver(homeserverInput);
  const discoveryClient = createClient({ baseUrl: homeserver });
  let metadata;
  try { metadata = await discoveryClient.getAuthMetadata(); }
  catch (error) {
    throw new Error(`Could not discover Matrix sign-in for this homeserver. ${error instanceof Error ? error.message : ''}`.trim());
  }
  if (signal.aborted) throw new DOMException('Sign-in cancelled.', 'AbortError');
  if (!metadata.device_authorization_endpoint || !metadata.grant_types_supported.includes(OAuthGrantType.DeviceAuthorization)) {
    throw new Error('This homeserver does not advertise Matrix device sign-in. Use the access-token option for this homeserver.');
  }

  const deviceId = randomString(10);
  let clientId: string;
  try {
    clientId = await registerOAuthClient(metadata.registration_endpoint, {
      application_type: 'native',
      client_name: 'Living Community Brief',
      client_uri: 'https://localhost/',
      redirect_uris: ['http://localhost/callback'],
      grant_types: [OAuthGrantType.AuthorizationCode, OAuthGrantType.RefreshToken, OAuthGrantType.DeviceAuthorization],
    });
  } catch (error) {
    throw new Error(`Could not register this app with the homeserver. ${error instanceof Error ? error.message : 'Unexpected registration error.'}`.trim());
  }
  if (signal.aborted) throw new DOMException('Sign-in cancelled.', 'AbortError');

  const oauth = new OAuth2(metadata, { clientId, deviceId });
  const deviceSession = await oauth.startDeviceAuthorizationGrant();
  onPrompt({
    verificationUri: deviceSession.verification_uri,
    verificationUriComplete: deviceSession.verification_uri_complete,
    userCode: deviceSession.user_code,
  });

  let interval = (deviceSession.interval ?? 5) * 1000;
  const expiresAt = Date.now() + deviceSession.expires_in * 1000;
  let tokens: Record<string, unknown> | undefined;
  while (Date.now() < expiresAt) {
    await delay(interval, signal);
    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: OAuthGrantType.DeviceAuthorization,
        device_code: deviceSession.device_code,
        client_id: clientId,
      }),
      signal,
    });
    const payload: unknown = await response.json().catch(() => ({}));
    const result = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    if (response.ok) { tokens = result; break; }
    if (result.error === 'authorization_pending') continue;
    if (result.error === 'slow_down') { interval += 5000; continue; }
    if (result.error === 'access_denied') throw new Error('Sign-in was declined in the homeserver window.');
    if (result.error === 'expired_token') throw new Error('The sign-in code expired. Start Matrix sign-in again.');
    throw new Error(typeof result.error_description === 'string' ? result.error_description : 'The homeserver could not complete Matrix sign-in.');
  }

  if (!tokens) throw new Error('The sign-in code expired. Start Matrix sign-in again.');
  if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') {
    throw new Error('The homeserver did not return a refresh token, so this session could not be kept alive.');
  }
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  const identityClient = createClient({ baseUrl: homeserver, accessToken, refreshToken, oauthClientId: clientId, deviceId });
  let userId: string;
  try { userId = (await identityClient.whoami()).user_id; }
  catch (error) { throw new Error(`Sign-in succeeded, but the account could not be confirmed. ${error instanceof Error ? error.message : ''}`.trim()); }
  finally { identityClient.setAccessToken(''); }

  return { homeserver, accessToken, refreshToken, oauthClientId: clientId, deviceId, userId };
}
