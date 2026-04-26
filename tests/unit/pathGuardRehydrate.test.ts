/**
 * pathGuardRehydrate.test.ts —— PathGuard 启动期重建白名单的回归防护
 *
 * 背景（Hotfix）：F1 加入 IPC PathGuard 切面后，若 photos.json 里已存在
 *   的照片其父目录不在默认白名单（~/Pictures / ~/Downloads / ~/Desktop /
 *   userData / temp），下次启动打开 Editor 调 preview:render 会被拒，
 *   UI 卡在 "rendering..."。
 *
 * 回归保护：
 *   - 启动期逻辑（main.ts:whenReady）对 photos.json 遍历后 addAllowed(dirname)
 *   - 本测试直接针对 PathGuard.addAllowed + validate 的契约，
 *     模拟 main 启动时的 rehydrate 步骤，断言 rehydrate 后那些
 *     原本被拒的路径能通过 validate。
 *
 * 本测试 + tests/unit/ipcPathGuardAspect.test.ts 共同构成 F1 的
 * 正反向双向守护：
 *   - ipcPathGuardAspect：断言 IPC handler 都声明了 pathFields（防漏接）
 *   - pathGuardRehydrate：断言启动期把历史信任目录加回（防误杀）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PathGuard, SecurityError } from '../../electron/services/security/pathGuard'

describe('PathGuard rehydrate（启动期恢复历史授权目录）', () => {
  let tmpRoot: string
  let defaultDir: string
  let externalDir: string

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grain-pgh-'))
    defaultDir = path.join(tmpRoot, 'default-pictures')
    externalDir = path.join(tmpRoot, 'external-drive', 'photos')
    fs.mkdirSync(defaultDir, { recursive: true })
    fs.mkdirSync(externalDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('未 rehydrate 时，外部目录照片会被 validate 拒绝（正向复现 bug）', async () => {
    const guard = new PathGuard([defaultDir])
    await guard.init()
    const photo = path.join(externalDir, 'DSC02147.ARW')
    fs.writeFileSync(photo, 'fake-raw')
    await expect(guard.validate(photo)).rejects.toBeInstanceOf(SecurityError)
  })

  it('rehydrate 后外部目录照片 validate 通过（bug 修复断言）', async () => {
    const guard = new PathGuard([defaultDir])
    await guard.init()
    const photo = path.join(externalDir, 'DSC02147.ARW')
    fs.writeFileSync(photo, 'fake-raw')

    // 模拟 main.ts whenReady 的 rehydrate 步骤：
    // 从 photos.json 读所有记录 → 对每张照片调 addAllowed(dirname)
    const photosFromJson = [
      { id: 'p1', path: photo },
      { id: 'p2', path: path.join(externalDir, 'DSC02148.ARW') },
      { id: 'p3', path: path.join(defaultDir, 'default.jpg') }, // 默认目录里的也算
    ]
    const seen = new Set<string>()
    for (const p of photosFromJson) {
      const parent = path.dirname(p.path)
      if (!seen.has(parent)) {
        seen.add(parent)
        guard.addAllowed(parent)
      }
    }

    // 现在原本被拒的外部照片应该通过
    const real = await guard.validate(photo)
    expect(real).toBe(fs.realpathSync(photo))
  })

  it('rehydrate 去重：同目录下多张照片只 addAllowed 一次（不报错即通过）', async () => {
    const guard = new PathGuard([defaultDir])
    await guard.init()
    const seen = new Set<string>()
    const paths = [
      path.join(externalDir, 'a.ARW'),
      path.join(externalDir, 'b.ARW'),
      path.join(externalDir, 'c.ARW'),
    ]
    for (const p of paths) fs.writeFileSync(p, 'x')
    for (const p of paths) {
      const parent = path.dirname(p)
      if (!seen.has(parent)) {
        seen.add(parent)
        guard.addAllowed(parent)
      }
    }
    expect(seen.size).toBe(1) // 只 add 了一次
    // 三张都能 validate
    for (const p of paths) {
      await expect(guard.validate(p)).resolves.toBe(fs.realpathSync(p))
    }
  })

  it('photos.json 为空时 rehydrate 不崩（边界）', async () => {
    const guard = new PathGuard([defaultDir])
    await guard.init()
    const photos: Array<{ path: string }> = []
    // 模拟空数据的 rehydrate 循环
    for (const p of photos) {
      guard.addAllowed(path.dirname(p.path))
    }
    expect(guard.getAllowedDirs().length).toBeGreaterThan(0) // 默认目录还在
  })

  it('photo.path 指向不存在的文件时 rehydrate 不崩（父目录可能也不存在）', async () => {
    const guard = new PathGuard([defaultDir])
    await guard.init()
    const ghost = path.join(tmpRoot, 'deleted-dir', 'ghost.ARW')
    // 父目录不存在，addAllowed 应静默降级，不抛
    expect(() => guard.addAllowed(path.dirname(ghost))).not.toThrow()
  })
})
