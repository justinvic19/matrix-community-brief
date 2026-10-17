import { mkdir, open, readFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Journal, Proposal } from './module';

export async function fileJournal(directory: string): Promise<Journal> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = (id: string) => {
    if (!/^ch-[a-f0-9]{64}$/.test(id)) throw new Error('Invalid proposal ID');
    return join(directory, `${id}.json`);
  };
  const get = async (id: string): Promise<Proposal | undefined> => {
    try { return JSON.parse(await readFile(path(id), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  };
  return {
    get,
    async find(code) {
      for (const file of await readdir(directory)) {
        if (!/^ch-[a-f0-9]{64}\.json$/.test(file)) continue;
        const proposal = await get(file.slice(0, -5));
        if (proposal?.code === code) return proposal;
      }
    },
    async put(proposal) {
      const target = path(proposal.id);
      const temporary = `${target}.tmp`;
      const file = await open(temporary, 'w', 0o600);
      try { await file.writeFile(JSON.stringify(proposal)); await file.sync(); } finally { await file.close(); }
      await rename(temporary, target);
    },
  };
}
