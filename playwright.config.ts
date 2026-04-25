import path from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * Playwright 配置
 * 四个 project：
 *   visual      — 视觉回归（渲染进程纯前端截图）
 *   integration — Electron 主进程 IPC 集成
 *   e2e         — 真 Electron 启动端到端
 *   packaged    — 打包产物冒烟（仅 release 分支）
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Electron 需要串行
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'visual',
      testDir: 'tests/visual',
      testMatch: /.*\.spec\.ts/,
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'integration',
      testDir: 'tests/integration-e2e',
      testMatch: /.*\.spec\.ts/,
      timeout: 60000,
    },
    {
      name: 'e2e',
      testDir: 'tests/e2e',
      testMatch: /.*\.spec\.ts/,
      timeout: 120000,
    },
    {
      name: 'packaged',
      testDir: 'tests/packaged',
      testMatch: /.*\.spec\.ts/,
      timeout: 180000,
    },
  ],
  outputDir: path.resolve('./test-results'),
  snapshotDir: path.resolve('./tests/baselines'),
})
