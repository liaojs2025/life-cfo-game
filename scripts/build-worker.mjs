import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const assets = {};
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.avif':'image/avif', '.jpeg':'image/jpeg' };
async function collect(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name === 'server') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else {
      const type = mime[extname(path)];
      if (!type) throw new Error(`Unsupported public asset: ${entry.name}`);
      const publicPath = '/' + relative(resolve(root, 'dist'), path).replaceAll('\\', '/');
      // The companion and the Pages edition share the same published photo archive.
      const onPages = /^\/assets\/(?:press|history)\//.test(publicPath) && type.startsWith('image/');
      assets[publicPath] = [type, onPages ? null : (await readFile(path)).toString('base64')];
    }
  }
}
await collect(resolve(root, 'dist'));
if (!assets['/index.html'] || !assets['/ai.js']) throw new Error('Missing game assets.');
// Public GitHub checkouts build a portable Worker; the hosted checkout supplies
// its existing project identity in the Sites manifest.
let manifest = { d1:'DB' };
try { manifest = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (manifest.static || manifest.d1!=='DB') throw new Error('Statistics require the Worker DB binding.');
const bundle = await build({
  entryPoints: [resolve(root, 'worker/handler.js')],
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  banner: { js: 'const ASSET_MAP = '+JSON.stringify(assets)+';' },
});
const source = bundle.outputFiles[0].text;
const compressed = gzipSync(source).byteLength;
if (compressed > 9.5 * 1024 * 1024) throw new Error('Worker exceeds artifact size budget.');
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await writeFile(resolve(root, 'dist/server/index.js'), source);
await writeFile(resolve(root, 'dist/.openai/hosting.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Worker built: ${Object.keys(assets).length} assets, ${(compressed / 1024 / 1024).toFixed(2)} MiB compressed. No API credentials included.`);
