/**
 * 水印渲染（M6 完整实装）
 */
import type { WatermarkStyle, WatermarkTemplate } from '../../../shared/types.js'

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

function createDefaultStyle(templateId: WatermarkStyle['templateId']): WatermarkStyle {
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

/** 渲染水印到图片 — M6 完整实装（Sharp + SVG composite） */
export async function renderWatermark(photoPath: string, _style: WatermarkStyle): Promise<string> {
  // TODO M6: 实装 — 使用 Sharp + 动态 SVG composite
  return `data:text/plain;base64,${Buffer.from(`watermark placeholder for ${photoPath}`).toString('base64')}`
}
