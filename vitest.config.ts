import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@electron': path.resolve(__dirname, 'electron'),
      '@tests': path.resolve(__dirname, 'tests'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
      'tests/security/**/*.test.ts',
      'electron/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    exclude: [
      'node_modules',
      'dist',
      'dist-electron',
      'release',
      'tests/e2e/**',
      'tests/visual/**',
      'tests/packaged/**',
    ],
    setupFiles: ['tests/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules',
        'dist',
        'dist-electron',
        'release',
        'tests/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.d.ts',
        'electron/main.ts',
        'src/main.tsx',
        '**/vite-env.d.ts',
      ],
      // Pass 1 仅启用报告，不启用硬门槛
      // 原因：UI/业务层尚未在本 Pass 覆盖；M1.5 全部完成前会提升为 80%（见 AGENTS.md）
      reportOnFailure: true,
    },
    benchmark: {
      include: ['tests/bench/**/*.bench.ts'],
    },
    testTimeout: 15000,
  },
})
