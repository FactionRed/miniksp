/// <reference types="vitest" />
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  plugins: [
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      // Don't spawn Electron when running tests or building the renderer alone.
      renderer: {},
    }),
  ],
  server: { open: false }, // Electron opens its own window; avoid the browser tab too
  test: {
    globals: true,
    environment: 'node',
  },
});
