import { parseBrief, validateDraft, type Brief } from '../domain/brief';
import type { DiscussionStore } from './discussions';
export const BRIEF_EVENT = 'com.example.community_brief';
export const SIGNUP_CONTENT_KEY = 'com.example.community_brief.signup';
export const STATE_KEY = 'main';
export interface SignupAction { activityId: string; signedUp: boolean }
export function parseSignupAction(value: unknown): SignupAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const action = value as Record<string, unknown>;
  return typeof action.activityId === 'string' && action.activityId.length > 0 && typeof action.signedUp === 'boolean'
    ? { activityId: action.activityId, signedUp: action.signedUp }
    : null;
}
export interface Snapshot { brief: Brief | null; canEdit: boolean; canSignup?: boolean; signupsReady?: boolean; signups?: Record<string, string[]>; status: 'loading' | 'live' | 'offline'; roomName?: string; roomCreatorUserId?: string; roomCreatorServer?: string; error?: string }
export interface BriefStore { readonly discussions?: DiscussionStore; readonly identity: { readonly userId: string; readonly homeserver: string }; subscribe(listener: (snapshot: Snapshot) => void): () => void; reconnect(): boolean; save(brief: Brief): Promise<void | { warning: string }>; setSignup(activityId: string, signedUp: boolean): Promise<void>; close(): void }
export interface StateAdapter { canEdit(): boolean; publish(type: typeof BRIEF_EVENT, key: typeof STATE_KEY, content: Brief): Promise<unknown> }
export async function publishBrief(adapter: StateAdapter, brief: Brief): Promise<void> {
  if (!adapter.canEdit()) throw new Error('Your room permissions do not allow editing this brief.');
  validateDraft(brief);
  const content = parseBrief({ ...brief, updatedAt: new Date().toISOString() })!;
  await adapter.publish(BRIEF_EVENT, STATE_KEY, content);
}
export function matrixError(error: unknown): string {
  const code = (error as { errcode?: string })?.errcode;
  if (code === 'M_FORBIDDEN') return 'The homeserver denied access. Check room membership and the power level required to edit the brief.';
  if (code === 'M_UNKNOWN_TOKEN' || code === 'M_MISSING_TOKEN') return 'The access token is invalid or expired. Disconnect and reconnect with a valid token.';
  if (code === 'M_LIMIT_EXCEEDED') return 'The homeserver is rate limiting requests. Wait briefly before trying again.';
  return 'Could not complete the Matrix request. Check the homeserver URL, network, room membership and browser CORS support.';
}
