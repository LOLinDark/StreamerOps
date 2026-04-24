import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const coreSourceDir = join(projectRoot, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const workerSourceDir = join(projectRoot, 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm');
const targetDir = join(projectRoot, 'public', 'vendor', 'ffmpeg');

if (!existsSync(coreSourceDir)) {
  throw new Error(`FFmpeg core source directory not found: ${coreSourceDir}`);
}

if (!existsSync(workerSourceDir)) {
  throw new Error(`FFmpeg worker source directory not found: ${workerSourceDir}`);
}

mkdirSync(targetDir, { recursive: true });

for (const fileName of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(join(coreSourceDir, fileName), join(targetDir, fileName));
}

for (const [sourceName, targetName] of [
  ['worker.js', 'ffmpeg-worker.js'],
  ['const.js', 'const.js'],
  ['errors.js', 'errors.js'],
]) {
  copyFileSync(join(workerSourceDir, sourceName), join(targetDir, targetName));
}

console.log('FFmpeg ESM core + worker assets synced to public/vendor/ffmpeg');