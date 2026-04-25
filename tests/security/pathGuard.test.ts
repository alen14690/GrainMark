import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
/**
 * PathGuard 安全单元测试
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PathGuard, SecurityError } from '../../electron/services/security/pathGuard'

/** 辅助：执行异步 fn 并捕获 SecurityError code */
async function expectCode(fn: () => Promise<unknown>, code: string) {
  try {
    await fn()
    throw new Error(`Expected throw with code=${code}, but resolved`)
  } catch (e) {
    if (!(e instanceof SecurityError)) {
      throw new Error(`Expected SecurityError, got ${(e as Error).constructor.name}: ${(e as Error).message}`)
    }
    expect(e.code).toBe(code)
  }
}

describe('PathGuard', () => {
  let tmpDir: string
  let allowedDir: string
  let forbiddenDir: string
  let guard: PathGuard

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grain-pg-'))
    allowedDir = path.join(tmpDir, 'allowed')
    forbiddenDir = path.join(tmpDir, 'forbidden')
    fs.mkdirSync(allowedDir)
    fs.mkdirSync(forbiddenDir)
    fs.writeFileSync(path.join(allowedDir, 'ok.txt'), 'hello')
    fs.writeFileSync(path.join(forbiddenDir, 'bad.txt'), 'secret')

    guard = new PathGuard([allowedDir])
    await guard.init()
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('allows files in whitelisted directory', async () => {
    const safe = await guard.validate(path.join(allowedDir, 'ok.txt'))
    expect(safe).toContain('ok.txt')
  })

  it('rejects files outside whitelist', async () => {
    await expectCode(() => guard.validate(path.join(forbiddenDir, 'bad.txt')), 'NOT_ALLOWED')
  })

  it('rejects path traversal attack (..)', async () => {
    const traversal = path.join(allowedDir, '..', 'forbidden', 'bad.txt')
    await expectCode(() => guard.validate(traversal), 'NOT_ALLOWED')
  })

  it('rejects symlink pointing outside allowed dir', async () => {
    const linkInAllowed = path.join(allowedDir, 'sneaky-link')
    try {
      fs.unlinkSync(linkInAllowed)
    } catch {
      /* noop */
    }
    fs.symlinkSync(path.join(forbiddenDir, 'bad.txt'), linkInAllowed)
    await expectCode(() => guard.validate(linkInAllowed), 'NOT_ALLOWED')
  })

  it('rejects NUL byte injection', async () => {
    await expectCode(() => guard.validate(`${allowedDir}/ok.txt\0.png`), 'NUL_BYTE')
  })

  it('rejects empty path', async () => {
    await expectCode(() => guard.validate(''), 'EMPTY')
  })

  it('rejects excessively long path', async () => {
    const tooLong = `${allowedDir}/${'a'.repeat(5000)}`
    await expectCode(() => guard.validate(tooLong), 'TOO_LONG')
  })

  it('rejects directory-prefix spoofing', async () => {
    const evil = `${allowedDir}Evil`
    fs.mkdirSync(evil)
    fs.writeFileSync(path.join(evil, 'f.txt'), 'x')
    await expectCode(() => guard.validate(path.join(evil, 'f.txt')), 'NOT_ALLOWED')
    fs.rmSync(evil, { recursive: true })
  })

  it('addAllowed 动态添加目录生效', async () => {
    // 用 init 阶段没授权的新路径
    const newDir = path.join(tmpDir, 'added-later')
    fs.mkdirSync(newDir)
    fs.writeFileSync(path.join(newDir, 'f.txt'), 'data')
    await expectCode(() => guard.validate(path.join(newDir, 'f.txt')), 'NOT_ALLOWED')
    guard.addAllowed(newDir)
    const safe = await guard.validate(path.join(newDir, 'f.txt'))
    expect(safe).toContain('f.txt')
  })

  it('validateMany 分离合法与非法', async () => {
    const { safe, rejected } = await guard.validateMany([path.join(allowedDir, 'ok.txt'), '/etc/passwd'])
    expect(safe.length).toBe(1)
    expect(rejected.length).toBe(1)
    expect(rejected[0]!.path).toBe('/etc/passwd')
  })
})
