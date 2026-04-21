/**
 * vitest.config.mjs — plain ES module so Vite doesn't need esbuild to parse it.
 *
 * Uses Node 22's built-in stripTypeScriptTypes (node:module) as the TypeScript
 * transformer instead of esbuild, which is unavailable on linux-arm64 in this
 * environment (node_modules were installed on darwin-arm64).
 */
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Vite plugin: strip TS types with Node 22's built-in transformer. */
const nodeTsPlugin = {
  name: 'node-strip-ts',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;
    const stripped = stripTypeScriptTypes(code, { mode: 'strip' });
    return { code: stripped, map: null };
  },
};

/** @type {import('vitest/config').UserConfig} */
export default {
  plugins: [nodeTsPlugin],

  // Disable esbuild — our plugin handles .ts transformation.
  esbuild: false,

  // Disable dep optimisation so Vite never tries to launch the esbuild binary.
  optimizeDeps: { noDiscovery: true, holdUntilCrawlEnd: false },

  resolve: {
    // Allow bare .ts extension imports used in source files.
    extensions: ['.ts', '.js', '.mjs'],
    alias: { '@': path.resolve(__dirname, 'src') },
  },

  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
};
