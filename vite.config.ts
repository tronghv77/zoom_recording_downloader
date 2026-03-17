import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@db': path.resolve(__dirname, 'src/database'),
    },
  },
  root: '.',
  build: {
    outDir: 'dist/renderer',
  },
  server: {
    port: 5173,
  },
});
