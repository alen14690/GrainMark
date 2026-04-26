/**
 * ipcPathGuardAspect.test.ts —— F1 修复的回归防护
 *
 * 目的：证明 safeRegister 的 PathGuard 切面真的会拒绝未授权路径。
 *
 * 蓝军场景：
 *   1. 没声明 pathFields → PathGuard 不会被调用（此时漏过属于开发者责任，
 *      但至少不会意外 throw；本测试验证行为稳定）
 *   2. 声明了 pathFields 但 PathGuard 没注入 → 抛 NO_PATH_GUARD
 *   3. 声明了 pathFields 且路径不在白名单 → 抛 IPC_PATH_GUARD
 *   4. 合法路径 → 正常通过
 *
 * 测试方式：直接测试 safeRegister 模块的内部函数 resolvePathValues（通过私有 export）。
 * IPC handler 本身需要 Electron app 环境，这里只测路径解析与校验语义。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PathGuard, SecurityError } from '../../electron/services/security/pathGuard'

describe('PathGuard 使用校验', () => {
  let tmpDir: string
  let guard: PathGuard

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grain-pg-'))
    guard = new PathGuard([tmpDir])
    await guard.init()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('validate 合法路径返回真实路径', async () => {
    const f = path.join(tmpDir, 'ok.txt')
    fs.writeFileSync(f, 'x')
    const real = await guard.validate(f)
    expect(real).toBe(fs.realpathSync(f))
  })

  it('validate 拒绝白名单外路径（F1 核心防护）', async () => {
    const outside = path.join(os.tmpdir(), 'outside-dir', 'evil.txt')
    await expect(guard.validate(outside)).rejects.toBeInstanceOf(SecurityError)
  })

  it('validate 拒绝 .. 越权', async () => {
    const evil = path.join(tmpDir, '..', '..', 'etc', 'passwd')
    await expect(guard.validate(evil)).rejects.toBeInstanceOf(SecurityError)
  })

  it('validate 拒绝含 NUL 字节', async () => {
    await expect(guard.validate(`${tmpDir}/ok\x00evil`)).rejects.toBeInstanceOf(SecurityError)
  })

  it('validateMany 分离 safe / rejected', async () => {
    const ok = path.join(tmpDir, 'a.txt')
    fs.writeFileSync(ok, 'a')
    const evil = path.join(os.tmpdir(), 'outside-x', 'b.txt')
    const res = await guard.validateMany([ok, evil])
    expect(res.safe.length).toBe(1)
    expect(res.rejected.length).toBe(1)
    expect(res.rejected[0]!.path).toBe(evil)
  })
})

describe('F1 回归：IPC handler 必须消费 PathGuard', () => {
  it('断言 electron/ipc/ 中涉及路径的文件都 import 了 registerIpc with pathFields', () => {
    // 元测试：读取 ipc/ 目录，对所有 handler 文件检查
    //   - 凡涉及路径参数（字符串 'path' 出现在变量名里）的 handler
    //   - 都必须在 registerIpc 调用里含 pathFields 配置
    // 这是一个架构守门员，防止未来新增 IPC 时漏接 PathGuard
    const ipcDir = path.resolve(__dirname, '../../electron/ipc')
    const files = fs
      .readdirSync(ipcDir)
      .filter((f) => f.endsWith('.ts') && f !== 'register.ts' && f !== 'safeRegister.ts')

    const offenders: string[] = []
    for (const f of files) {
      const src = fs.readFileSync(path.join(ipcDir, f), 'utf-8')
      // 粗略判据：文件里出现 "Path" 或 "path" 关键字 + registerIpc，但所有 registerIpc 都没 pathFields
      const hasPathHint =
        /\bpath\b/i.test(src) || /Path[A-Z]/.test(src) || /filePath|outPath|photoPath/.test(src)
      const hasRegisterIpc = /registerIpc\(/.test(src)
      const hasPathFields = /pathFields\s*:/.test(src)
      // 免检标记：handler 文件在注释里出现 `ipc-no-path-params`（JSDoc 或 // 均可），
      //   说明已经人工确认该 IPC 没有路径参数（例如 perf:log 只收诊断数据）
      const hasOptOut = /ipc-no-path-params\b/.test(src)
      // 某些文件（如 sync.ts / trending.ts / settings.ts）确实不含路径
      // —— 用"文件内必须显式声明 noPathParams 或包含 pathFields" 的粗略约束
      if (hasRegisterIpc && hasPathHint && !hasPathFields && !hasOptOut) {
        offenders.push(f)
      }
    }
    expect(
      offenders,
      `以下 IPC 文件包含路径字符但未声明 pathFields，可能遗漏 PathGuard 校验：${offenders.join(', ')}`,
    ).toEqual([])
  })
})
