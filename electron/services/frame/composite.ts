/**
 * composite — 边框 generator 共用的 Sharp 组合逻辑
 *
 * 职责(AGENTS.md 第 8 条 Single Source):
 *   - 读取原图 metadata + EXIF(所有 generator 共用的前置步骤)
 *   - 按 FrameGeometry 做"扩边 + 叠图 + 叠 SVG"的 Sharp pipeline 封装
 *   - 可选 Logo 叠加(PathGuard 已在 IPC 层验过)
 *   - 输出 base64 data URL(与 watermark:render 一致)
 *
 * 为什么要有这一层:
 *   - 老 `watermark/renderer.ts` 里 film-border / polaroid 两个模板的 composite 代码
 *     几乎完全一样,属于"散布阈值 ≥ 2" → 必须集中
 *   - 阶段 2 的 8 个风格如果每个各写一遍 Sharp composite 链,必然再次散布
 *
 * 设计决策:
 *   - generator 只负责"生成 SVG 字符串";composite 负责"把 SVG 叠到原图上"
 *   - 这样 generator 是纯函数,可单测 SVG 结构(不启动 Sharp,快)
 *   - composite 的 Sharp 端也只需要测一次("给定一段 SVG,能合成正确尺寸的 JPEG")
 */
import { promises as fsp } from 'node:fs'
import sharp from 'sharp'
import { buildFrameParamLine } from '../../../shared/frame-text.js'
import type { FrameStyle, FrameStyleOverrides, PhotoExif } from '../../../shared/types.js'
import { readExif } from '../exif/reader.js'
import { logger } from '../logger/logger.js'
import { type FrameGeometry, computeFrameGeometry } from './layoutEngine.js'

/** Generator 函数签名:纯函数,输入元信息 + 几何,输出完整 SVG 字符串(覆盖整个 canvas) */
export type FrameSvgGenerator = (ctx: FrameGeneratorContext) => string

export interface FrameGeneratorContext {
  geometry: FrameGeometry
  style: FrameStyle
  overrides: FrameStyleOverrides
  exif: PhotoExif
  /** 预处理好的参数行文本(调用方先 truncate 过宽度) */
  paramLine: string
  /** 机型行:"Make Model"(如 "Sony ILCE-7SM3");空字符串 = 不展示 */
  modelLine: string
  /** 日期行:EXIF dateTimeOriginal 原样,空字符串 = 不展示 */
  dateLine: string
  /** 作者行(来自 overrides.artistName || exif.artist,空字符串 = 不展示) */
  artistLine: string
}

/**
 * 通用渲染入口 —— 每个 generator 调用本函数即可完成 Sharp 组合 + 输出 data URL。
 *
 * @param photoPath 原图绝对路径(已过 PathGuard)
 * @param style    FrameStyle 完整数据
 * @param overrides 用户覆盖项(字段可见 / Logo / 颜色方案)
 * @param generateSvg 具体风格的 SVG 生成器(纯函数)
 * @returns base64 data URL
 */
export async function renderWithGenerator(
  photoPath: string,
  style: FrameStyle,
  overrides: FrameStyleOverrides,
  generateSvg: FrameSvgGenerator,
): Promise<string> {
  const t0 = Date.now()

  const [meta, exif] = await Promise.all([sharp(photoPath).metadata(), readExif(photoPath)])
  const imgW = meta.width ?? 0
  const imgH = meta.height ?? 0
  if (imgW <= 0 || imgH <= 0) {
    throw new Error(`[frame:render] sharp metadata 返回非法宽高:${imgW}×${imgH}`)
  }

  const geometry = computeFrameGeometry(imgW, imgH, style)

  // 构建文本行(调用方的 generator 不直接读 EXIF,避免散布)
  //
  // 去重策略(2026-05-01):
  //   layout.slots 里若有独立 'model' slot → 参数行跳过 make/model · 避免重复
  //   仅 minimal-bar 横图等"无 model slot"的风格保留 make/model 在参数行
  const hasModelSlot = geometry.layout.slots.some((s) => s.id === 'model')
  const paramLine = buildFrameParamLine(exif, overrides.showFields, {
    excludeModelMake: hasModelSlot,
  })
  const modelLine = [exif.make, exif.model].filter(Boolean).join(' ')
  const dateLine = overrides.showFields.dateTime ? (exif.dateTimeOriginal ?? '') : ''
  // artist 字段:overrides.artistName 优先(用户显式传入),兜底 exif.artist
  // 只在 showFields.artist=true 时真正返回值(否则空串,generator 自动跳过)
  const artistLine = overrides.showFields.artist ? (overrides.artistName ?? exif.artist ?? '') : ''

  const svg = generateSvg({
    geometry,
    style,
    overrides,
    exif,
    paramLine,
    modelLine,
    dateLine,
    artistLine,
  })

  // SVG 覆盖整个 canvas(canvasW × canvasH),原图叠在 (imgOffsetX, imgOffsetY)
  const svgBuffer = Buffer.from(svg)

  // 创建 canvas 底(带 style.layout.backgroundColor 纯色背景,SVG 叠上去)
  const layout = geometry.layout
  const canvas = sharp({
    create: {
      width: geometry.canvasW,
      height: geometry.canvasH,
      channels: 4,
      background: layout.backgroundColor,
    },
  })

  const overlays: sharp.OverlayOptions[] = [
    // 原图
    {
      input: await sharp(photoPath).resize(imgW, imgH, { fit: 'inside' }).toBuffer(),
      top: geometry.imgOffsetY,
      left: geometry.imgOffsetX,
    },
    // SVG 覆盖整 canvas
    {
      input: svgBuffer,
      top: 0,
      left: 0,
    },
  ]

  // 可选 Logo(PathGuard 已在 IPC 层 args.2.logoPath 验过)
  if (overrides.logoPath) {
    try {
      await fsp.access(overrides.logoPath)
      // Logo 尺寸按底边框高度的 60% 算(SX-70 等特殊风格可在 generator 自己处理)
      const logoMax = Math.max(geometry.borderBottomPx, geometry.borderTopPx, 1)
      const logoSize = Math.round(logoMax * 0.6)
      if (logoSize > 0) {
        const logoBuffer = await sharp(overrides.logoPath)
          .resize(logoSize, logoSize, { fit: 'inside', withoutEnlargement: true })
          .toBuffer()
        overlays.push({
          input: logoBuffer,
          top: geometry.imgOffsetY + geometry.imgH + Math.round((geometry.borderBottomPx - logoSize) / 2),
          left: Math.round(logoSize * 0.5),
        })
      }
    } catch (err) {
      logger.warn('frame.logo.missing', { logoPath: overrides.logoPath, err: (err as Error).message })
    }
  }

  const result = await canvas.composite(overlays).jpeg({ quality: 92 }).toBuffer()

  logger.info('frame.rendered', {
    styleId: style.id,
    orientation: geometry.orientation,
    canvasWH: `${geometry.canvasW}x${geometry.canvasH}`,
    durationMs: Date.now() - t0,
    outputSize: result.length,
  })

  return `data:image/jpeg;base64,${result.toString('base64')}`
}
