import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './',
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: { port: 5173, host: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
