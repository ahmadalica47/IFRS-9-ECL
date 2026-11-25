import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// Two builds:
//  - normal  -> dist/          the website (installable, works offline after the first visit)
//  - single  -> dist/offline/  one self-contained HTML file users can download and open with no internet
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile(), {
    // the single file must not point at anything outside itself (icons, manifest)
    name: 'strip-external-links',
    transformIndexHtml: (html: string) => html.replace(/\s*<link rel="(icon|manifest|apple-touch-icon)"[^>]*>/g, ''),
  }] : [])],
  // The app was written for the Instinct runtime; on the web, its few components come from web/shell.tsx.
  resolve: { alias: { '@instinct/files': fileURLToPath(new URL('./web/shell.tsx', import.meta.url)) } },
  publicDir: mode === 'single' ? false : 'public',
  build: mode === 'single'
    ? { outDir: 'dist/offline', emptyOutDir: false, chunkSizeWarningLimit: 2000 }
    : { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
}));
