/**
 * PathGuard — 文件路径安全守卫
 *
 * 防御面：
 *   1. 符号链接越权（symlink attack）
 *   2. 路径遍历（../../etc/passwd）
 *   3. 非授权目录访问
 *
 * 用法：
 *   const guard = new PathGuard(['/Users/xxx/Pictures', tmpDir])
 *   const safe = await guard.validate(untrustedPath)   // 返回解析后的真实路径，失败抛 SecurityError
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'SecurityError'
  }
}

export class PathGuard {
  private allowedRealDirs: string[] = []
  private readonly allowedInputs: string[]

  constructor(allowed: string[]) {
    this.allowedInputs = allowed
  }

  /** 异步初始化：把授权目录解析为真实路径（处理 symlink） */
  async init(): Promise<void> {
    this.allowedRealDirs = []
    for (const d of this.allowedInputs) {
      try {
        const real = await fsp.realpath(d)
        this.allowedRealDirs.push(path.resolve(real))
      } catch {
        // 目录不存在就跳过
      }
    }
  }

  /** 同步添加授权目录（必须做 realpath 解析以处理 macOS /var → /private/var 等 symlink） */
  addAllowed(dir: string): void {
    let real: string
    try {
      real = path.resolve(fs.realpathSync(dir))
    } catch {
      real = path.resolve(dir)
    }
    if (!this.allowedRealDirs.includes(real)) {
      this.allowedRealDirs.push(real)
    }
  }

  /** 当前授权列表（测试用） */
  getAllowedDirs(): string[] {
    return [...this.allowedRealDirs]
  }

  /**
   * 校验路径是否在授权目录内
   * 步骤：
   *   1. path.resolve 规范化（消除 ..）
   *   2. realpath 解析符号链接
   *   3. 检查是否在任一授权目录 prefix 下（含分隔符，防止前缀欺骗）
   */
  async validate(untrusted: string): Promise<string> {
    if (typeof untrusted !== 'string' || untrusted.length === 0) {
      throw new SecurityError('Path is empty', 'EMPTY')
    }
    if (untrusted.length > 4096) {
      throw new SecurityError('Path too long', 'TOO_LONG')
    }
    if (untrusted.includes('\0')) {
      throw new SecurityError('Path contains NUL', 'NUL_BYTE')
    }

    const normalized = path.resolve(untrusted)
    let real: string
    try {
      real = await fsp.realpath(normalized)
    } catch {
      // 文件不存在时，退化为基于父目录的 realpath（常见于写路径场景）
      const parent = path.dirname(normalized)
      try {
        const parentReal = await fsp.realpath(parent)
        real = path.join(parentReal, path.basename(normalized))
      } catch {
        throw new SecurityError(`Cannot resolve: ${untrusted}`, 'RESOLVE_FAIL')
      }
    }

    const sep = path.sep
    const ok = this.allowedRealDirs.some((dir) => {
      if (real === dir) return true
      return real.startsWith(dir.endsWith(sep) ? dir : dir + sep)
    })

    if (!ok) {
      throw new SecurityError(`Path not in allowed dirs: ${real}`, 'NOT_ALLOWED')
    }
    return real
  }

  /** 同步批量校验 */
  async validateMany(
    paths: string[],
  ): Promise<{ safe: string[]; rejected: { path: string; reason: string }[] }> {
    const safe: string[] = []
    const rejected: { path: string; reason: string }[] = []
    for (const p of paths) {
      try {
        safe.push(await this.validate(p))
      } catch (e) {
        rejected.push({ path: p, reason: (e as Error).message })
      }
    }
    return { safe, rejected }
  }
}
