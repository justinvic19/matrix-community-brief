import { createServer } from 'node:http';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSetup, readConfig } from './config';
import { fileJournal } from './journal';
import { matrixAdapter } from './matrix';
import { createModule, InputError } from './module';
import { createRegistration, generateRegistrationFile } from './registration';
import { authenticateWebhook } from './webhook';

checkSetup(process.env);
const config = readConfig(process.env);
if (config.eventSource === 'hub' && config.allowUnauthenticatedHub) console.warn('DEMO MODE: Hub callbacks are unauthenticated; sender identities can be forged.');
createRegistration(process.env); // Validate registration before creating the process lock.
await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
const mappingPath = join(config.dataDir, 'mapping.json');
const mapping = JSON.stringify([config.homeserver, config.sourceRoom, config.storageRoom]);
try { await writeFile(mappingPath, mapping, { flag: 'wx', mode: 0o600 }); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  if (await readFile(mappingPath, 'utf8') !== mapping) throw new Error('Journal belongs to a different mapping; use a separate data directory.');
}
// Fail closed rather than allow two processes to race the whole-document state PUT.
const lockPath = join(config.dataDir, 'service.lock');
const lock = await open(lockPath, 'wx', 0o600);
await lock.writeFile(String(process.pid));
const handler = createModule(config, matrixAdapter(config), await fileJournal(config.dataDir));
const registrationFile = await generateRegistrationFile(process.env, process.cwd());
console.log(`Registration written to ${registrationFile}`);
let active = 0;
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.url !== '/') { res.writeHead(404).end('{}'); return; }
  if (req.method === 'GET') { res.end(JSON.stringify({ service: 'Living Community Brief module', status: 'running', eventSource: config.eventSource, hubAuthentication: config.eventSource === 'hub' ? (config.allowUnauthenticatedHub ? 'disabled-demo' : 'required') : 'not-applicable' })); return; }
  if (req.method !== 'POST') { res.writeHead(405).end('{}'); return; }
  const authenticated = authenticateWebhook(req.headers['x-community-brief-secret'], config.webhookSecret);
  if (config.eventSource === 'hub' && !config.allowUnauthenticatedHub && !authenticated) {
    console.warn('Rejected unauthenticated Hub callback. Configure the Hub secret header.');
    res.writeHead(401).end(JSON.stringify({ success: false })); return;
  }
  if (active >= 16) { res.writeHead(503).end('{}'); return; }
  active++;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) { res.writeHead(413).end('{}'); return; }
      chunks.push(Buffer.from(chunk));
    }
    let payload: unknown;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400).end('{}'); return; }
    console.log('Received module callback.');
    const response = await handler(payload, authenticated);
    res.end(JSON.stringify({ success: true, ...(response ? { response } : {}) }));
  } catch (error) {
    if (error instanceof InputError) res.end(JSON.stringify({ success: true, response: error.message }));
    else {
      // No raw server response, event, token or proposal data in logs or HTTP errors.
      console.error('Module request failed; check Matrix access and journal availability.');
      res.writeHead(503).end(JSON.stringify({ success: false, response: 'Could not complete the request. Check service access, then retry the same reaction or confirmation; do not create a second proposal.' }));
    }
  } finally { active--; }
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.listen(config.port, '127.0.0.1', () => console.log(`Community brief module listening on localhost:${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  server.close(() => { void lock.close().then(() => unlink(lockPath)).then(() => process.exit(0)); });
});
