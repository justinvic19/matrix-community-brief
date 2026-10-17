import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function createRegistration(env: Record<string, string | undefined>) {
  if (!env.CH_MODULE_URL) throw new Error('Set CH_MODULE_URL to your ngrok HTTPS URL.');
  const url = new URL(env.CH_MODULE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('CH_MODULE_URL must be the HTTPS root URL forwarded to this service.');
  // Replies use the Hub response contract, so /api/send credentials are optional.
  return {
    id: 'living-community-brief', uuid: randomUUID(), url: url.href, emoji: '📅',
    introduction: env.CH_REQUIRE_CONFIRMATION === 'false'
      ? 'React 📅 to a message with Title:, When: and Where: lines to save it immediately to the community brief website. No confirmation command needed.'
      : 'React 📅 to a message with Title:, When: and Where: lines. An authorised organiser must confirm before it appears on the website.',
    title: 'Living Community Brief', description: 'Propose activities for a separate community brief room.',
    ...(env.CH_TOOL_SECRET ? { secret: env.CH_TOOL_SECRET } : {}),
    event_types: ['m.room.message', 'm.reaction'],
  };
}

export async function generateRegistrationFile(env: Record<string, string | undefined>, directory: string) {
  const moduleRegistration = createRegistration(env);
  const filename = join(directory, `${moduleRegistration.id}.json`);
  await writeFile(filename, JSON.stringify(moduleRegistration, null, 2) + '\n', { mode: 0o600 });
  return filename;
}
