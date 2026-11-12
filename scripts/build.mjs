import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'js'), { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ['js/main.js'],
  bundle: true,
  format: 'esm',
  outfile: path.join(dist, 'js/main.js'),
  minify: true,
  target: 'es2022',
  legalComments: 'none',
});

await cp(path.join(root, 'css'), path.join(dist, 'css'), { recursive: true });
await cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });

const html = await readFile(path.join(root, 'index.html'), 'utf8');
const published = html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '');
await writeFile(path.join(dist, 'index.html'), published);

console.log('Built dist/ for Vercel.');
