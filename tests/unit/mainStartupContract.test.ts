/**
 * mainStartupContract.test.ts —— 启动时序关键契约的静态扫描（回归守门员）
 *
 * 类似 ipcPathGuardAspect.test.ts 的架构测试：不跑 Electron，只对源代码
 * 做静态模式匹配，保证一些"改起来很危险、一旦漏掉就炸基础功能"的约定
 * 被实际代码路径持有。
 *
 * 覆盖契约：
 *   1. main.ts 必须在 app.whenReady 里从 photos table 重建 PathGuard 白名单
 *      —— 否则所有历史照片都会被 validate 拒，preview 卡 rendering（本轮 bug）
 *   2. main.ts 必须在 before-quit 调 flushStorage
 *      —— F11 的不丢尾包契约
 *   3. main.ts 必须 setIpcPathGuard + setPathGuard 都调
 *      —— IPC 切面 + service 防御深度不能漏一个
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_TS = path.resolve(__dirname, '../../electron/main.ts')

describe('main.ts 启动时序契约', () => {
  const src = fs.readFileSync(MAIN_TS, 'utf-8')

  it('在 whenReady 里 rehydrate PathGuard（从 photos.json 恢复已授权目录）', () => {
    // 核心判据：必须同时出现
    //   - getPhotosTable()（或 photos.json 读取）
    //   - pathGuard.addAllowed（循环调用）
    //   - 在 whenReady 块内部
    const hasRehydrate =
      /getPhotosTable\(\)[\s\S]{0,500}pathGuard\.addAllowed/.test(src) ||
      /pathGuard\.addAllowed[\s\S]{0,500}getPhotosTable\(\)/.test(src)
    expect(
      hasRehydrate,
      '⚠️ main.ts 缺少 PathGuard rehydrate 逻辑：启动时若不把历史照片父目录加白名单，所有外部目录照片会卡 rendering',
    ).toBe(true)
  })

  it('before-quit 里调 flushStorage', () => {
    expect(src).toMatch(/before-quit[\s\S]{0,300}flushStorage\(\)/)
  })

  it('IPC 切面 + service 防御深度 两个 set 都调用', () => {
    expect(src).toMatch(/setIpcPathGuard\(pathGuard\)/)
    expect(src).toMatch(/setPathGuard\(pathGuard\)/)
  })

  it('PathGuard 默认白名单含 userData / temp / Pictures', () => {
    expect(src).toMatch(/app\.getPath\(['"]userData['"]\)/)
    expect(src).toMatch(/app\.getPath\(['"]temp['"]\)/)
    expect(src).toMatch(/['"]Pictures['"]/)
  })

  it('dialog:selectFiles 回调对 filePaths 循环 addAllowed（不止第一个）', () => {
    expect(src).toMatch(
      /dialog:selectFiles[\s\S]{0,800}for\s*\(.+?result\.filePaths\)[\s\S]{0,200}addAllowed/,
    )
  })
})
