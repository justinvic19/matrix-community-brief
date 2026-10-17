import { generateRegistrationFile } from './registration';

const filename = await generateRegistrationFile(process.env, process.cwd());
console.log(`Registration written to ${filename}`);
console.log('Give this file privately to the Tool Hub organiser. This command does not start the server or connect to Matrix.');
