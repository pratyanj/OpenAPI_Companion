import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Separate from vite.config so the CRXJS plugin does not run during tests.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/index.ts',
        'src/tests/**',
        'src/**/*.d.ts',
      ],
      // Thresholds per DD-034 (services/utils >=80, stores/hooks >=70,
      // components >=60). Enable/ratchet these as real modules land so the
      // bootstrap (near-empty repo) doesn't fail CI. See planning/13_TEST_PLAN.md.
      // thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
})
