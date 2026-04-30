/**
 * grainInvoke — 渲染进程 page 内的类型化 IPC 调用 helper
 *
 * 背景：E2E spec 要绕开 dialog / 直接注入 photos 时，需要在 page.evaluate 里
 * 调 window.grain.invoke。手写多处会散布 `(window as any).grain` 转型，
 * 违反 AGENTS.md 第 8 条"禁止散布"。集中到这里：**整个 E2E 层只能通过本文件
 * 访问 window.grain**。
 *
 * 实现注意：
 *   - Playwright 的 page.evaluate 的参数必须可序列化（不能传闭包），
 *     所以 channel 和 args 都以普通 JSON 传入
 *   - 不对返回值做类型检查（unknown），调用方自己 as T
 */
import type { Page } from '@playwright/test'

/**
 * 在渲染进程里调用一次 grain IPC 并返回结果。
 *
 * @param page    Playwright Page（来自 launchApp）
 * @param channel 完整 IPC 通道名（如 'photo:import'、'batch:start'）
 * @param args    传给 handler 的位置参数，必须可 JSON 序列化
 * @returns       IPC 返回值（as T）
 */
export async function grainInvoke<T = unknown>(page: Page, channel: string, ...args: unknown[]): Promise<T> {
  return (await page.evaluate(
    async ({ ch, a }) => {
      type GrainApi = {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      }
      const grain = (window as unknown as { grain?: GrainApi }).grain
      if (!grain || typeof grain.invoke !== 'function') {
        throw new Error('[grainInvoke] window.grain.invoke 不可用')
      }
      return grain.invoke(ch, ...a)
    },
    { ch: channel, a: args },
  )) as T
}
