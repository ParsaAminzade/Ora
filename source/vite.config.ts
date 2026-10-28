import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// `vite build` makes the Chrome extension (dist); `vite build --mode web` makes the phone/web app (dist-web).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(mode === 'web' ? pkg.version : 'dev') },
  publicDir: mode === 'web' ? 'public-web' : 'public',
  build: {
    outDir: mode === 'web' ? 'dist-web' : 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    assetsInlineLimit: 0,
  },
}));
