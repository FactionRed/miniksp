/// <reference types="vitest" />
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

// Skip the Electron plugin when running tests — it alters module resolution in
// ways that break vitest's worker, and tests don't touch the main process anyway.
const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST;

export default defineConfig({
  plugins: isTest
    ? []
    : [
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
          // Don't spawn Electron when building the renderer alone.
          // renderer: undefined — the game uses zero renderer-side Electron
          // APIs, so we omit the key entirely. Passing `renderer: {}` is
          // truthy and triggers vite-plugin-electron-renderer, which crashes
          // the dev server on Windows (illegal '?' in cache filenames).
        }),
      ],
  server: { open: false }, // Electron opens its own window; avoid the browser tab too
  test: {
    globals: true,
    environment: 'node',
  },
});
