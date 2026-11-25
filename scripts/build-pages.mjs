import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = join(root, 'output/pages');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(join(root, 'dist'), target, { recursive: true, filter: source => {
  const name = source.split('/').at(-1);
  return !name.startsWith('.') && name !== 'server';
} });
await writeFile(join(target, '.nojekyll'), '');
const html = await readFile(join(target, 'index.html'), 'utf8');
if (!html.includes('./atlas.js')) throw new Error('Pages entrypoint must use relative asset URLs.');
if ((await readdir(target)).some(name => ['server','.openai','.env'].includes(name))) throw new Error('Non-public files in Pages artifact.');
console.log('GitHub Pages artifact built at output/pages (relative assets, no server or credentials).');
