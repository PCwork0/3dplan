import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Import the geometry engine directly from source — no build step needed
      '@engine': path.resolve(__dirname, '../engine/src'),
    },
  },
});
