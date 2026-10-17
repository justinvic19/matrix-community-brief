import { mkdir, writeFile } from 'node:fs/promises';
import { parseBrief } from '../src/domain/brief.ts';

class PublishingError extends Error {}
export function publishingFailureMessage(error) {
  return error instanceof PublishingError ? error.message : 'Unexpected export failure. Check network access and publishing configuration.';
}

// Explicit allowlist: never serialize arbitrary Matrix state or unknown fields.
export function publicFields(raw) {
  const brief = parseBrief(raw);
  if (!brief) throw new Error('No brief exists');
  return {
    schemaVersion: 3, updatedAt: brief.updatedAt,
    activities: brief.activities.map(a => ({
      id: a.id, title: a.title, description: a.description, scheduledAt: a.scheduledAt,
      location: a.location, announcement: a.announcement, maxParticipants: a.maxParticipants,
      tasks: a.tasks.map(t => ({ id: t.id, text: t.text, completed: t.completed })),
    })),
  };
}

export async function publish(env = process.env, fetcher = fetch, output = 'dist') {
  const rooms = [];
  if (env.PUBLIC_BRIEF_ENABLED === 'true') {
    let server;
    try { server = new URL(env.PUBLIC_BRIEF_SERVER?.trim()); }
    catch { throw new PublishingError('PUBLIC_BRIEF_SERVER must be a valid HTTPS homeserver URL.'); }
    if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash) throw new PublishingError('PUBLIC_BRIEF_SERVER must be HTTPS without credentials, query or fragment.');
    const base = server.href.replace(/\/$/, '');
    const roomId = env.PUBLIC_BRIEF_ROOM_ID?.trim();
    const token = env.MATRIX_PUBLISH_TOKEN?.trim();
    if (!/^!\S+$/.test(roomId ?? '')) throw new PublishingError('PUBLIC_BRIEF_ROOM_ID must be the room ID beginning with !, not an alias or encoded URL.');
    if (!token) throw new PublishingError('MATRIX_PUBLISH_TOKEN is missing. Add it as a repository Actions secret, not a variable.');
    const response = await fetcher(`${base}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/com.example.community_brief/main`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const hint = { 401: 'The token is invalid, expired, or belongs to a different homeserver.', 403: 'The publishing account cannot read this room. Join it to the room and check access.', 404: 'Check the room ID and whether a brief has been saved in this room.' }[response.status] || 'Check homeserver availability and account access.';
      throw new PublishingError(`Cannot read publishing brief (HTTP ${response.status}). ${hint}`);
    }
    let brief;
    try { brief = publicFields(await response.json()); }
    catch { throw new PublishingError('The returned brief is missing or malformed. Open the organiser view and check the saved activity data.'); }
    rooms.push({ roomId, server: base, name: env.PUBLIC_BRIEF_NAME || 'Community activities', brief });
  }
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/public-briefs.json`, JSON.stringify({ version: 1, publishedAt: new Date().toISOString(), rooms }));
}

if (process.argv[1]?.endsWith('publish-brief.mjs')) {
  publish().catch(error => { console.error(`Public brief export failed: ${publishingFailureMessage(error)} No public snapshot was generated.`); process.exitCode = 1; });
}
