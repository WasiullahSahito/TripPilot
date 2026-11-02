/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000' } },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // Pre-bundle everything once at startup. Without this Vite discovers lazy-loaded pages' dependencies one by one
  // and re-optimizes repeatedly, which on Windows can hit EBUSY when antivirus/indexing locks node_modules/.vite.
  optimizeDeps: {
    include: [
      'react', 'react-dom/client', 'react/jsx-dev-runtime', 'react-router', 'framer-motion', 'lucide-react',
      'react-hook-form', '@hookform/resolvers/zod', 'zod', '@radix-ui/react-slot', '@radix-ui/react-accordion',
      'class-variance-authority', 'clsx', 'tailwind-merge', 'pdf-lib', 'leaflet',
      'i18next', 'react-i18next',
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    // Playwright specs run with `npm run test:e2e`, and the built extension is generated output.
    exclude: ['**/node_modules/**', 'tests/e2e/**', 'extension/dist/**'],
  },
})
