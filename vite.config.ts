import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  define: {
    // The @google/generative-ai SDK references process.env internally.
    // Vite doesn't polyfill `process` in the browser, so we shim only the
    // keys the SDK actually needs. Values come from VITE_* env vars (safe).
    'process.env.API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY ?? ''),
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY ?? ''),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
