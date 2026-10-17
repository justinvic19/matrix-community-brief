import { parseBrief } from '../../src/domain/brief';
import { BRIEF_EVENT, STATE_KEY } from '../../src/matrix/eventStore';
import type { Config } from './config';
import type { Matrix } from './module';

export function matrixAdapter(config: Config, request: typeof fetch = fetch): Matrix {
  const roomPath = (room: string) => `/rooms/${encodeURIComponent(room)}`;
  async function api(path: string, method = 'GET', content?: unknown, optional = false): Promise<any> {
    const response = await request(`${config.homeserver}/_matrix/client/v3${path}`, {
      method, headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      ...(content === undefined ? {} : { body: JSON.stringify(content) }), signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    const result = await response.json();
    if (optional && response.status === 404 && result.errcode === 'M_NOT_FOUND') return null;
    if (!response.ok) throw new Error(`Matrix request failed (${response.status}).`);
    return result;
  }
  const state = (room: string, type: string, key = '') => api(`${roomPath(room)}/state/${encodeURIComponent(type)}/${encodeURIComponent(key)}`, 'GET', undefined, true);
  return {
    event: (room, id) => api(`${roomPath(room)}/event/${encodeURIComponent(id)}`),
    brief: async () => parseBrief(await state(config.storageRoom, BRIEF_EVENT, STATE_KEY)),
    publish: (type, key, brief) => api(`${roomPath(config.storageRoom)}/state/${encodeURIComponent(type)}/${encodeURIComponent(key)}`, 'PUT', brief),
    async checkRooms(actor) {
      const identity = await api('/account/whoami');
      if (typeof identity.user_id !== 'string' || actor === identity.user_id) throw new Error('Invalid service identity or confirmation actor.');
      for (const room of config.eventSource === 'hub' ? [config.storageRoom] : [config.sourceRoom, config.storageRoom]) {
        if ((await state(room, 'm.room.member', identity.user_id))?.membership !== 'join') throw new Error('Service account must be joined to the required Matrix room.');
        if (await state(room, 'm.room.encryption')) throw new Error('Encrypted rooms are unsupported.');
      }
      if (config.eventSource !== 'hub' && (await state(config.sourceRoom, 'm.room.member', actor))?.membership !== 'join') throw new Error('Confirmation actor must still be joined to the source room.');
      const creation = await state(config.storageRoom, 'm.room.create');
      if (creation?.room_version === '12') {
        // The content-only state endpoint omits the sender. Version 12 derives
        // the create event ID from the room ID; fetch its authenticated envelope.
        const createEvent = await api(`${roomPath(config.storageRoom)}/event/${encodeURIComponent('$' + config.storageRoom.slice(1))}`);
        if (createEvent.type !== 'm.room.create' || createEvent.state_key !== '') throw new Error('Invalid room creation event.');
        const additional = createEvent.content?.additional_creators;
        if (createEvent.sender === identity.user_id || (Array.isArray(additional) && additional.includes(identity.user_id))) return;
      }
      const power = await state(config.storageRoom, 'm.room.power_levels');
      if (!power) throw new Error('Configure explicit storage room power levels.');
      const actual = power.users?.[identity.user_id] ?? power.users_default ?? 0;
      const required = power.events?.[BRIEF_EVENT] ?? power.state_default ?? 50;
      if (typeof actual !== 'number' || typeof required !== 'number' || actual < required) throw new Error('Service account cannot write brief state.');
    },
  };
}
