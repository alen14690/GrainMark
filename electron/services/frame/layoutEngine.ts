import { classifyOrientation, scaleByMinEdge } from '../../../shared/frame-tokens.js'
/**
 * layoutEngine — 边框渲染的几何层核心
 *
 * 职责(AGENTS.md 第 8 条 Single Source):
 *   - 根据原图宽高 + FrameStyle → 选出 landscape/portrait 布局
 *   - 计算每个 slot 的绝对像素坐标(基于 `scaleByMinEdge` 单位)
 *   - 计算最终"带边框图像"的总 canvas 尺寸(原图 + 边框)
 *
 * 关键:所有"横竖判定 / 短边换算"调用方必须走本模块,**不允许**在 generator 里散布
 * `Math.min(w, h) * 0.22` 或 `if (imgW > imgH)` —— 这是历史 orientation 反模式的根源
 * (见 AGENTS.md 第 8 条踩坑总结)。
 */
import type { FrameLayout, FrameStyle } from '../../../shared/types.js'

export interface FrameGeometry {
  /** 原图尺寸 */
  imgW: number
  imgH: number
  /** 朝向分类(square 走 landscape 布局) */
  orientation: 'landscape' | 'portrait' | 'square'
  /** 被选中的布局(landscape 或 portrait) */
  layout: FrameLayout
  /** 四边边框像素值 */
  borderTopPx: number
  borderBottomPx: number
  borderLeftPx: number
  borderRightPx: number
  /** 最终输出 canvas 尺寸(= 原图 + 四边边框) */
  canvasW: number
  canvasH: number
  /** 原图在 canvas 中的左上角偏移 */
  imgOffsetX: number
  imgOffsetY: number
}

/**
 * 根据图片尺寸 + FrameStyle 计算出完整几何信息。
 *
 * 纯函数 —— 易于单测和 snapshot。generator 只消费这个结构,不重复算。
 */
export function computeFrameGeometry(imgW: number, imgH: number, style: FrameStyle): FrameGeometry {
  const orientation = classifyOrientation(imgW, imgH)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const borderTopPx = scaleByMinEdge(layout.borderTop, imgW, imgH)
  const borderBottomPx = scaleByMinEdge(layout.borderBottom, imgW, imgH)
  const borderLeftPx = scaleByMinEdge(layout.borderLeft, imgW, imgH)
  const borderRightPx = scaleByMinEdge(layout.borderRight, imgW, imgH)

  return {
    imgW,
    imgH,
    orientation,
    layout,
    borderTopPx,
    borderBottomPx,
    borderLeftPx,
    borderRightPx,
    canvasW: imgW + borderLeftPx + borderRightPx,
    canvasH: imgH + borderTopPx + borderBottomPx,
    imgOffsetX: borderLeftPx,
    imgOffsetY: borderTopPx,
  }
}

/**
 * Slot 绝对像素坐标(在 canvas 坐标系里)
 *
 * 每个 slot 的 `anchor` 是归一化坐标(相对于该 slot 所在"区域"):
 *   - area=bottom:区域 = canvas 底部边框条(y 从 `imgOffsetY+imgH` 到 `canvasH`)
 *   - area=top:   区域 = canvas 顶部边框条
 *   - area=left:  区域 = canvas 左边框条
 *   - area=right: 区域 = canvas 右边框条
 *   - area=overlay: 区域 = 原图本身(不扩边,叠加在图上)
 *
 * anchor.x=0.5, y=0.5 意味着在该区域正中;fontSize 仍走 scaleByMinEdge。
 */
export interface SlotPixelPlacement {
  /** 画布坐标系中的锚点绝对像素 */
  x: number
  y: number
  /** 字号(像素整数) */
  fontSizePx: number
}

export function placeSlot(
  slot: FrameStyle['landscape']['slots'][number],
  g: FrameGeometry,
): SlotPixelPlacement {
  const fontSizePx = scaleByMinEdge(slot.fontSize, g.imgW, g.imgH)

  let areaX0 = 0
  let areaY0 = 0
  let areaW = 0
  let areaH = 0

  switch (slot.area) {
    case 'top':
      areaX0 = 0
      areaY0 = 0
      areaW = g.canvasW
      areaH = g.borderTopPx
      break
    case 'bottom':
      areaX0 = 0
      areaY0 = g.imgOffsetY + g.imgH
      areaW = g.canvasW
      areaH = g.borderBottomPx
      break
    case 'left':
      areaX0 = 0
      areaY0 = 0
      areaW = g.borderLeftPx
      areaH = g.canvasH
      break
    case 'right':
      areaX0 = g.imgOffsetX + g.imgW
      areaY0 = 0
      areaW = g.borderRightPx
      areaH = g.canvasH
      break
    case 'overlay':
      // 叠加在原图上(用于无边框风格的 datestamp 等)
      areaX0 = g.imgOffsetX
      areaY0 = g.imgOffsetY
      areaW = g.imgW
      areaH = g.imgH
      break
  }

  return {
    x: Math.round(areaX0 + slot.anchor.x * areaW),
    y: Math.round(areaY0 + slot.anchor.y * areaH),
    fontSizePx,
  }
}
