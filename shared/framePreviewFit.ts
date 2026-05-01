/**
 * framePreviewFit — 计算"带边框照片"在预览容器里的 fit 矩形
 *
 * 用户反馈(2026-05-01 下午):
 *   "竖图边框应当只在竖图照片自己的宽度范围内出现,不要填满预览容器"
 *
 * 问题根源:
 *   老版 FramePreviewHost 直接把预览容器的 width/height 传给 layout 组件,
 *   layout 按照容器尺寸绘制边框 → 竖图居中在 4:3 容器里,底栏横跨整个容器
 *   → 底栏宽度远大于照片宽度 → 视觉很丑
 *
 * 本模块核心:
 *   - 纯函数(无 DOM / 无 React) · 可单测 · 前后端共享
 *   - 输入:容器尺寸 + 照片尺寸 + FrameStyle
 *   - 输出:"带边框照片盒子"的 CSS 像素尺寸 + 居中偏移
 *
 * 算法:
 *   1. 按 classifyOrientation(photoW, photoH) 选 landscape/portrait layout
 *   2. 以 "minEdge = min(photoW, photoH)" 的 border 比例算出每边像素扩展
 *   3. "带边框照片"的 virtual 尺寸 = photoW+borderL+borderR × photoH+borderT+borderB
 *   4. 取此 virtual 尺寸的 aspect · 在 container 内做 contain-fit
 *   5. 返回盒子 CSS 尺寸 + 居中偏移
 *
 * 为什么不直接复用 electron/services/frame/layoutEngine.ts:
 *   - layoutEngine 是 electron 侧 · 前端不能跨目录 import(AGENTS.md 目录约定)
 *   - 它返回的是"原图像素尺寸 + 边框像素尺寸",单位是图像真实像素
 *   - 本模块返回的是"CSS 像素尺寸",单位是预览显示像素
 *   - 两者语义不同,但共享"边框比例 + classifyOrientation"这条真值链(走 shared/frame-tokens)
 */
import { classifyOrientation } from './frame-tokens'
import type { FrameLayout, FrameStyle } from './types'

export interface FramePreviewFitResult {
  /** 容器内"带边框照片盒子"的 CSS 宽(layout 组件应当按此值做 scaleByMinEdge) */
  boxW: number
  /** 容器内"带边框照片盒子"的 CSS 高 */
  boxH: number
  /** 盒子在容器里的居中偏移(left) */
  offsetX: number
  /** 盒子在容器里的居中偏移(top) */
  offsetY: number
  /** 盒子实际使用的 layout(landscape / portrait) · 调用方若要再用可省一次分派 */
  layout: FrameLayout
  /** 朝向分类 · 外部要打 data-attribute 时用 */
  orientation: 'landscape' | 'portrait' | 'square'
}

/**
 * 退化值(container/photo 任一维度为 0 或非法时的兜底)。
 * 不抛错,避免预览组件崩溃影响整个 UI · 改走 placeholder 空盒子。
 */
const EMPTY_RESULT: Omit<FramePreviewFitResult, 'layout' | 'orientation'> = {
  boxW: 0,
  boxH: 0,
  offsetX: 0,
  offsetY: 0,
}

/**
 * 计算"带边框照片"在预览容器内的 fit 矩形。
 *
 * @param containerW   预览容器的 CSS 宽(>= 0)
 * @param containerH   预览容器的 CSS 高(>= 0)
 * @param photoW       照片真实像素宽(>= 1)
 * @param photoH       照片真实像素高(>= 1)
 * @param style        FrameStyle · 本函数只读 style.landscape / style.portrait
 * @returns            fit 结果 · 盒子 width/height 0 代表退化
 */
export function computeFramePreviewFit(
  containerW: number,
  containerH: number,
  photoW: number,
  photoH: number,
  style: FrameStyle,
): FramePreviewFitResult {
  const orientation = classifyOrientation(photoW, photoH)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  // 退化:容器/照片任一维度非法 · 返回 0 盒子让 UI 走占位
  if (containerW <= 0 || containerH <= 0 || photoW <= 0 || photoH <= 0) {
    return { ...EMPTY_RESULT, layout, orientation }
  }

  // 以照片像素为单位计算"带边框"的 virtual 尺寸。
  // 边框比例是相对于 minEdge(photoW, photoH),与后端 layoutEngine 口径一致。
  const minEdge = Math.min(photoW, photoH)
  const borderTopPx = layout.borderTop * minEdge
  const borderBottomPx = layout.borderBottom * minEdge
  const borderLeftPx = layout.borderLeft * minEdge
  const borderRightPx = layout.borderRight * minEdge

  const virtualW = photoW + borderLeftPx + borderRightPx
  const virtualH = photoH + borderTopPx + borderBottomPx
  const virtualAspect = virtualW / virtualH

  // 在容器里做 contain-fit:保持 virtual aspect · 不裁剪 · 最大内接
  const containerAspect = containerW / containerH
  let boxW: number
  let boxH: number
  if (virtualAspect >= containerAspect) {
    // virtual 更宽 · 以容器宽为准
    boxW = containerW
    boxH = containerW / virtualAspect
  } else {
    // virtual 更高 · 以容器高为准
    boxH = containerH
    boxW = containerH * virtualAspect
  }

  const offsetX = Math.round((containerW - boxW) / 2)
  const offsetY = Math.round((containerH - boxH) / 2)

  return {
    boxW: Math.round(boxW),
    boxH: Math.round(boxH),
    offsetX,
    offsetY,
    layout,
    orientation,
  }
}
