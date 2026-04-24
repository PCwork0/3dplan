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
});
