/**
 * PathGuard 全局注册表
 *
 * 目的：让任意 service 层（cubeIO / preview / watermark / ...）能在不 import main.ts
 * 的前提下拿到当前进程的 PathGuard 单例，做防御深度校验。
 *
 * main.ts 在 app.whenReady 完成时调 `setPathGuard`；service 层调 `getPathGuardOrNull`，
 * 拿不到时降级（例如测试环境 / 启动早期），但不 crash。
 *
 * 这个模块与 ipc/safeRegister 的 setIpcPathGuard 互补：
 *   - setIpcPathGuard：IPC 切面，强制校验声明的 pathFields
 *   - getPathGuardOrNull：service 内部二次防线，防御"IPC 没声明"的疏漏
 */
import type { PathGuard } from './pathGuard.js'

let guardRef: PathGuard | null = null

export function setPathGuard(guard: PathGuard): void {
  guardRef = guard
}

export function getPathGuardOrNull(): PathGuard | null {
  return guardRef
}

/** 测试用 */
export function _resetPathGuardForTest(): void {
  guardRef = null
}
