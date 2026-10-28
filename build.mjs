import { cp, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/background.ts'], outfile: 'dist/background.js', bundle: true, platform: 'browser', target: 'chrome120', format: 'iife' }),
  build({ entryPoints: ['src/content.ts'], outfile: 'dist/content.js', bundle: true, platform: 'browser', target: 'chrome120', format: 'iife' }),
  build({ entryPoints: ['src/popup.ts'], outfile: 'dist/popup.js', bundle: true, platform: 'browser', target: 'chrome120', format: 'iife' }),
]);
await cp('manifest.json', 'dist/manifest.json');
await cp('popup.html', 'dist/popup.html');
