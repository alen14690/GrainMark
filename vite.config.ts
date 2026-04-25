import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  // file:// 加载时必须使用相对路径
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // worker entry 作为独立 chunk，运行时由 WorkerPool 用 new Worker(new URL('./worker.mjs', ...)) 加载
              input: {
                main: 'electron/main.ts',
                'batch-worker': 'electron/services/batch/worker.ts',
              },
              output: {
                entryFileNames: '[name].js',
              },
              external: ['better-sqlite3', 'sharp', 'exiftool-vendored'],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      renderer: {},
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
  },
})
