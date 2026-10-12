import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'hi3d-ios', 'hi3d-GameAssets');
await mkdir(assets, { recursive: true });

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(command, [
  'exec', '--yes', '--package=esbuild@0.25.12', '--', 'esbuild',
  'hi3d-web/hi3d-game.js', '--bundle', '--format=iife', '--target=safari16',
  '--alias:three=./hi3d-web/vendor/three.module.min.js',
  '--outfile=hi3d-ios/hi3d-GameAssets/hi3d-bundle.js',
], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, npm_config_cache: path.join(root, '.hi3d', 'npm-cache') },
});
if (result.status !== 0) throw new Error(`Web bundle failed: ${result.status ?? result.error}`);

const entry = await readFile(path.join(root, 'hi3d-web', 'hi3d-index.html'), 'utf8');
const originalScript = '<script id="boot-script" type="module" src="./hi3d-game.js"></script>';
if (!entry.includes(originalScript)) throw new Error('HTML boot script changed; update the iOS bundle adapter');
const localEntry = entry
  .replace(/  <script type="importmap">.*?<\/script>\n/, '')
  .replace(originalScript, '<script id="boot-script" defer src="./hi3d-bundle.js"></script>');
await writeFile(path.join(assets, 'hi3d-index.html'), localEntry);
await cp(path.join(root, 'hi3d-web', 'hi3d-style.css'), path.join(assets, 'hi3d-style.css'));
console.log('Built self-contained iOS web resources.');
