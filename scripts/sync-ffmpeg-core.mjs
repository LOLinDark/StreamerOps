import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const sourceDir = join(projectRoot, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const targetDir = join(projectRoot, 'public', 'vendor', 'ffmpeg');

if (!existsSync(sourceDir)) {
  throw new Error(`FFmpeg core source directory not found: ${sourceDir}`);
}

mkdirSync(targetDir, { recursive: true });

for (const fileName of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(join(sourceDir, fileName), join(targetDir, fileName));
}

console.log('FFmpeg core assets synced to public/vendor/ffmpeg');