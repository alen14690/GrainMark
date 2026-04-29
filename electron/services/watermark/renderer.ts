/**
 * 水印渲染（M6 实装）
 *
 * 架构：
 *   1. readExif 读取 EXIF → 格式化参数文本
 *   2. 按 templateId 生成 SVG overlay（文字 + 可选 Logo）
 *   3. Sharp composite 把 SVG 叠到原图上
 *   4. 返回 base64 data URL 或 grain:// 路径
 *
 * 安全：
 *   - photoPath / logoPath 已由 IPC 层 PathGuard 校验
 *   - SVG 中文本内容做 XML 转义（防注入）
 *   - Logo 图片由 Sharp 读取（不执行脚本）
 */
import { promises as fsp } from 'node:fs'
import sharp from 'sharp'
import type { PhotoExif, WatermarkStyle, WatermarkTemplate, WatermarkTemplateId } from '../../../shared/types.js'
import { readExif } from '../exif/reader.js'
import { logger } from '../logger/logger.js'

// ============ 模板定义 ============

export function listWatermarkTemplates(): WatermarkTemplate[] {
  return [
    {
      id: 'minimal-bar',
      name: '极简底栏',
      description: '黑底白字，底部显示相机/镜头/参数',
      defaultStyle: createDefaultStyle('minimal-bar'),
    },
    {
      id: 'film-border',
      name: '经典胶片边框',
      description: '黑边 + 底部参数 + 日期',
      defaultStyle: createDefaultStyle('film-border'),
    },
    {
      id: 'polaroid',
      name: '宝丽来式',
      description: '白色厚边框 + 底部手写字体',
      defaultStyle: createDefaultStyle('polaroid'),
    },
    {
      id: 'gallery-line',
      name: '画廊细线',
      description: '细线框 + 右下小字',
      defaultStyle: createDefaultStyle('gallery-line'),
    },
    {
      id: 'logo-frame',
      name: 'Logo 版',
      description: '用户 Logo + 参数（需上传 Logo）',
      defaultStyle: createDefaultStyle('logo-frame'),
    },
    {
      id: 'film-timestamp',
      name: '胶片日期戳',
      description: '右下角橙色数字日期（傻瓜相机风）',
      defaultStyle: createDefaultStyle('film-timestamp'),
    },
    {
      id: 'two-line',
      name: '双行信息',
      description: '大字机型 + 小字参数',
      defaultStyle: createDefaultStyle('two-line'),
    },
  ]
}

function createDefaultStyle(templateId: WatermarkTemplateId): WatermarkStyle {
  return {
    templateId,
    position: 'bottom-center',
    opacity: 0.92,
    scale: 1,
    color: '#ffffff',
    bgColor: '#000000',
    fontFamily: 'Inter',
    showLogo: templateId === 'logo-frame',
    fields: {
      make: true,
      model: true,
      lens: true,
      aperture: true,
      shutter: true,
      iso: true,
      focalLength: true,
      dateTime: true,
      artist: false,
      location: false,
    },
    padding: 24,
  }
}

// ============ 工具函数 ============

/** XML 转义（防 SVG 注入） */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 从 EXIF 和 style.fields 构建参数文本行 */
function buildParamLine(exif: PhotoExif, fields: WatermarkStyle['fields']): string {
  const parts: string[] = []
  if (fields.make && exif.make) parts.push(exif.make)
  if (fields.model && exif.model) parts.push(exif.model)
  if (fields.lens && exif.lensModel) parts.push(exif.lensModel)
  if (fields.focalLength && exif.focalLength) parts.push(`${exif.focalLength}mm`)
  if (fields.aperture && exif.fNumber) parts.push(`f/${exif.fNumber}`)
  if (fields.shutter && exif.exposureTime) parts.push(`${exif.exposureTime}s`)
  if (fields.iso && exif.iso) parts.push(`ISO ${exif.iso}`)
  if (fields.dateTime && exif.dateTimeOriginal) parts.push(exif.dateTimeOriginal)
  if (fields.artist && exif.artist) parts.push(exif.artist)
  return parts.join('  ·  ')
}

/** 解析 hex color 为 r,g,b */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: Number.parseInt(h.slice(0, 2), 16) || 255,
    g: Number.parseInt(h.slice(2, 4), 16) || 255,
    b: Number.parseInt(h.slice(4, 6), 16) || 255,
  }
}

// ============ SVG 模板生成 ============

interface SvgContext {
  imgW: number
  imgH: number
  style: WatermarkStyle
  paramLine: string
  modelLine: string
  dateLine: string
}

function generateSvg(ctx: SvgContext): { svg: string; barH: number; borderW: number } {
  const { imgW, imgH, style, paramLine, modelLine, dateLine } = ctx
  const pad = Math.round(style.padding * style.scale)
  const fontSize = Math.round(14 * style.scale)
  const smallFont = Math.round(11 * style.scale)
  const color = esc(style.color)
  const bgColor = esc(style.bgColor ?? '#000000')
  const font = esc(style.fontFamily)

  switch (style.templateId) {
    case 'minimal-bar': {
      // 黑底白字底栏
      const barH = Math.round((fontSize + pad * 2) * 1.2)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${barH}">
        <rect width="100%" height="100%" fill="${bgColor}" opacity="${style.opacity}"/>
        <text x="${pad}" y="${barH / 2 + fontSize * 0.35}" font-family="${font}, sans-serif" font-size="${fontSize}" fill="${color}">${esc(paramLine)}</text>
      </svg>`
      return { svg, barH, borderW: 0 }
    }

    case 'film-border': {
      // 胶片黑边框 + 底部参数
      const borderW = Math.round(pad * 1.5)
      const barH = Math.round(fontSize * 2.5)
      const totalH = imgH + borderW * 2 + barH
      const totalW = imgW + borderW * 2
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        <text x="${borderW + pad}" y="${imgH + borderW * 2 + barH * 0.55}" font-family="${font}, sans-serif" font-size="${fontSize}" fill="${color}">${esc(paramLine)}</text>
        <text x="${totalW - pad - borderW}" y="${imgH + borderW * 2 + barH * 0.55}" font-family="${font}, sans-serif" font-size="${smallFont}" fill="${color}" text-anchor="end">${esc(dateLine)}</text>
      </svg>`
      return { svg, barH, borderW }
    }

    case 'polaroid': {
      // 宝丽来白边框，底部厚
      const borderW = Math.round(pad * 1.2)
      const bottomBorder = Math.round(pad * 4)
      const totalH = imgH + borderW + bottomBorder
      const totalW = imgW + borderW * 2
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="${totalW / 2}" y="${imgH + borderW + bottomBorder * 0.55}" font-family="'Georgia', serif" font-size="${fontSize}" fill="#333333" text-anchor="middle">${esc(paramLine)}</text>
      </svg>`
      return { svg, barH: bottomBorder, borderW }
    }

    case 'gallery-line': {
      // 细线框 + 右下小字
      const barH = Math.round(smallFont * 2.5)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${barH}">
        <line x1="0" y1="0" x2="${imgW}" y2="0" stroke="${color}" stroke-width="1" opacity="${style.opacity * 0.6}"/>
        <text x="${imgW - pad}" y="${barH * 0.6}" font-family="${font}, sans-serif" font-size="${smallFont}" fill="${color}" text-anchor="end" opacity="${style.opacity}">${esc(paramLine)}</text>
      </svg>`
      return { svg, barH, borderW: 0 }
    }

    case 'logo-frame': {
      // Logo + 参数（Logo 由 composite 层单独处理）
      const barH = Math.round((fontSize + pad * 2) * 1.5)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${barH}">
        <rect width="100%" height="100%" fill="${bgColor}" opacity="${style.opacity}"/>
        <text x="${Math.round(barH * 1.2)}" y="${barH / 2 + fontSize * 0.35}" font-family="${font}, sans-serif" font-size="${fontSize}" fill="${color}">${esc(paramLine)}</text>
      </svg>`
      return { svg, barH, borderW: 0 }
    }

    case 'film-timestamp': {
      // 右下角橙色日期戳（傻瓜相机风）
      const stampFont = Math.round(16 * style.scale)
      const barH = Math.round(stampFont * 2.5)
      const dateStr = dateLine || new Date().toLocaleDateString('zh-CN')
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${barH}">
        <text x="${imgW - pad}" y="${barH * 0.6}" font-family="'Courier New', monospace" font-size="${stampFont}" fill="#FF6B00" text-anchor="end" opacity="${style.opacity}" font-weight="bold">${esc(dateStr)}</text>
      </svg>`
      return { svg, barH, borderW: 0 }
    }

    case 'two-line': {
      // 大字机型 + 小字参数
      const bigFont = Math.round(18 * style.scale)
      const barH = Math.round((bigFont + smallFont + pad * 2) * 1.3)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${barH}">
        <rect width="100%" height="100%" fill="${bgColor}" opacity="${style.opacity}"/>
        <text x="${pad}" y="${pad + bigFont}" font-family="${font}, sans-serif" font-size="${bigFont}" fill="${color}" font-weight="600">${esc(modelLine)}</text>
        <text x="${pad}" y="${pad + bigFont + smallFont * 1.8}" font-family="${font}, sans-serif" font-size="${smallFont}" fill="${color}" opacity="0.7">${esc(paramLine)}</text>
      </svg>`
      return { svg, barH, borderW: 0 }
    }

    default: {
      // 兜底：简单底栏
      const barH = Math.round(fontSize * 2.5)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${barH}">
        <rect width="100%" height="100%" fill="${bgColor}" opacity="${style.opacity}"/>
        <text x="${pad}" y="${barH * 0.6}" font-family="${font}, sans-serif" font-size="${fontSize}" fill="${color}">${esc(paramLine)}</text>
      </svg>`
      return { svg, barH, borderW: 0 }
    }
  }
}

// ============ 主渲染入口 ============

/** 渲染水印到图片 — 返回 base64 data URL */
export async function renderWatermark(photoPath: string, style: WatermarkStyle): Promise<string> {
  const t0 = Date.now()

  // 1. 读取原图元信息 + EXIF
  const [meta, exif] = await Promise.all([
    sharp(photoPath).metadata(),
    readExif(photoPath),
  ])
  const imgW = meta.width ?? 1920
  const imgH = meta.height ?? 1080

  // 2. 构建文本
  const paramLine = buildParamLine(exif, style.fields)
  const modelLine = [exif.make, exif.model].filter(Boolean).join(' ')
  const dateLine = exif.dateTimeOriginal ?? ''

  // 3. 生成 SVG
  const { svg, barH, borderW } = generateSvg({
    imgW, imgH, style, paramLine, modelLine, dateLine,
  })
  const svgBuffer = Buffer.from(svg)

  // 4. 构建 composite 层
  const composites: sharp.OverlayOptions[] = []

  if (style.templateId === 'film-border' || style.templateId === 'polaroid') {
    // 带边框的模板：SVG 是完整背景，原图叠在中间
    const bgBuffer = await sharp(svgBuffer)
      .png()
      .toBuffer()

    const result = await sharp(bgBuffer)
      .composite([
        {
          input: await sharp(photoPath).resize(imgW, imgH, { fit: 'inside' }).toBuffer(),
          top: borderW,
          left: borderW,
        },
      ])
      .jpeg({ quality: 92 })
      .toBuffer()

    logger.info('watermark.rendered', {
      template: style.templateId,
      durationMs: Date.now() - t0,
      outputSize: result.length,
    })
    return `data:image/jpeg;base64,${result.toString('base64')}`
  }

  // 无边框模板：原图底部扩展 barH 像素，SVG 叠在扩展区域
  let pipeline = sharp(photoPath).resize(imgW, imgH, { fit: 'inside' })

  // 根据 position 决定 SVG 叠加位置
  const isBottom = style.position.startsWith('bottom') || style.position === 'full-border'
  const isTop = style.position.startsWith('top')

  if (isBottom) {
    // 底部扩展
    pipeline = pipeline.extend({
      top: 0,
      bottom: barH,
      left: 0,
      right: 0,
      background: hexToRgb(style.bgColor ?? '#000000'),
    })
    composites.push({
      input: svgBuffer,
      top: imgH,
      left: 0,
    })
  } else if (isTop) {
    pipeline = pipeline.extend({
      top: barH,
      bottom: 0,
      left: 0,
      right: 0,
      background: hexToRgb(style.bgColor ?? '#000000'),
    })
    composites.push({
      input: svgBuffer,
      top: 0,
      left: 0,
    })
  } else {
    // 默认叠在底部（不扩展，半透明覆盖）
    composites.push({
      input: svgBuffer,
      gravity: 'south',
    })
  }

  // Logo composite（仅 logo-frame 模板且有 logoPath）
  if (style.showLogo && style.logoPath) {
    try {
      await fsp.access(style.logoPath)
      const logoSize = Math.round(barH * 0.6)
      const logoBuffer = await sharp(style.logoPath)
        .resize(logoSize, logoSize, { fit: 'inside', withoutEnlargement: true })
        .toBuffer()
      const logoTop = isBottom ? imgH + Math.round((barH - logoSize) / 2) : Math.round((barH - logoSize) / 2)
      composites.push({
        input: logoBuffer,
        top: logoTop,
        left: Math.round(style.padding * style.scale),
      })
    } catch {
      logger.warn('watermark.logo.missing', { logoPath: style.logoPath })
    }
  }

  const result = await pipeline
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer()

  logger.info('watermark.rendered', {
    template: style.templateId,
    durationMs: Date.now() - t0,
    outputSize: result.length,
  })

  return `data:image/jpeg;base64,${result.toString('base64')}`
}
