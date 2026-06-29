import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'web',
  build: {
    emptyOutDir: true,
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3100',
      '/__vendor/pdfjs': 'http://127.0.0.1:3100',
    },
  },
});
