import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Optional: plan-extractor API endpoints (dev only, zero prod footprint)
// AI mode  → requires ANTHROPIC_API_KEY in environment
// CV mode  → requires Python 3 + OpenCV + pytesseract (no API key)
import { planExtractorPlugin }   from '../tools/vite-plan-extractor.mjs';
import { planExtractorCvPlugin } from '../tools/vite-plan-extractor-cv.mjs';

export default defineConfig({
  plugins: [
    react(),
    planExtractorPlugin(),     // POST /api/extract-plan    (Claude Vision)
    planExtractorCvPlugin(),   // POST /api/extract-plan-cv (OpenCV + Tesseract)
  ],
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, '../engine/src'),
    },
  },
  // Use a fresh cache location outside the default `node_modules/.vite`
  // so a stale/locked dep cache never blocks `npm run dev`. If the deps
  // ever look corrupted, just delete this folder and restart.
  cacheDir: path.resolve(__dirname, 'node_modules/.vite-cache'),
  optimizeDeps: {
    // Always re-optimize deps on dev start. Slightly slower first paint,
    // but immune to "EPERM unlink" errors from a half-written cache.
    force: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    open: true, // auto-open the browser
  },
});
