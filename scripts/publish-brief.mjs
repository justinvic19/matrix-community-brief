import { mkdir, writeFile } from 'node:fs/promises';
import { parseBrief } from '../src/domain/brief.ts';

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
    const server = new URL(env.PUBLIC_BRIEF_SERVER);
    if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash) throw new Error('Invalid publishing server');
    const base = server.href.replace(/\/$/, '');
    const roomId = env.PUBLIC_BRIEF_ROOM_ID;
    if (!/^!\S+$/.test(roomId ?? '') || !env.MATRIX_PUBLISH_TOKEN) throw new Error('Publishing room/token missing');
    const response = await fetcher(`${base}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/com.example.community_brief/main`, {
      headers: { Authorization: `Bearer ${env.MATRIX_PUBLISH_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Cannot read publishing brief (HTTP ${response.status})`);
    rooms.push({ roomId, server: base, name: env.PUBLIC_BRIEF_NAME || 'Community activities', brief: publicFields(await response.json()) });
  }
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/public-briefs.json`, JSON.stringify({ version: 1, publishedAt: new Date().toISOString(), rooms }));
}

if (process.argv[1]?.endsWith('publish-brief.mjs')) {
  publish().catch(() => { console.error('Public brief export failed. Check publishing configuration and account access. No new deployment was published.'); process.exitCode = 1; });
}
