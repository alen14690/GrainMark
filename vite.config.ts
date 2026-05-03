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
              // main 作为 ESM 入口；worker 作为独立 .mjs chunk（扩展名告诉 Node 按 ESM 加载）
              input: {
                main: 'electron/main.ts',
                'batch-worker': 'electron/services/batch/worker.ts',
              },
              output: {
                entryFileNames: (info) => (info.name === 'batch-worker' ? 'batch-worker.mjs' : '[name].js'),
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
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'batch-gpu': path.resolve(__dirname, 'batch-gpu.html'),
        'frame-export': path.resolve(__dirname, 'frame-export.html'),
      },
    },
  },
})
