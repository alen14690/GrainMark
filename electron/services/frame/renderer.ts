/**
 * renderer — 新 frame 系统的统一渲染入口(阶段 1:骨架)
 *
 * 阶段 1 职责:
 *   - 接收 photoPath + FrameStyleId + FrameStyleOverrides
 *   - 查 registry 确认 style 存在 → 若不存在,抛清晰错误
 *   - 调 computeFrameGeometry 算几何 → 阶段 1 直接抛 "not-implemented"(尚无 generator)
 *   - 阶段 2 起:按 style.id switch 分派到 generators/*.ts
 *
 * 为什么不在阶段 1 就实装一个 generator:
 *   - 用户 Q1 指定了 16 个候选,阶段 2 会把前 4 个核心风格一次性做好
 *   - 阶段 1 只保证"基础设施跑通 + 老 watermark 系统零退化"
 *   - 诚实暴露"尚未实装"错误好过造一个半成品 minimal-bar
 */
import type { FrameStyleId, FrameStyleOverrides } from '../../../shared/types.js'
import { getFrameStyle } from './registry.js'

/**
 * 渲染 frame 到图片 —— 阶段 1 尚未实装 generator,调用一定失败。
 *
 * @returns 阶段 2 起:base64 data URL(与 watermark:render 一致)
 * @throws  阶段 1:始终抛 NotImplementedError
 */
export async function renderFrame(
  photoPath: string,
  styleId: FrameStyleId,
  _overrides: FrameStyleOverrides,
): Promise<string> {
  const style = getFrameStyle(styleId)
  if (!style) {
    throw new Error(`[frame:render] FrameStyleId "${styleId}" 未注册 —— 阶段 1 仅有 minimal-bar 占位`)
  }
  throw new Error(
    `[frame:render] 尚未实装 —— 阶段 2 起才按 style.id 分派到 generator;收到 photoPath=${photoPath}, styleId=${styleId}`,
  )
}
