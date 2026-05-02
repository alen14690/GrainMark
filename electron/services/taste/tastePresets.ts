/**
 * tastePresets — 预置参考图数据
 *
 * 来源：Unsplash（免费授权，允许商用）
 * 数据说明：
 *   - 每张图的 palette 和 scheme 在构建时预计算好（离线）
 *   - 运行时直接读取，不需要网络请求
 *   - thumbUrl 使用 Unsplash CDN 加速（&w=400 缩略图）
 *
 * 分类：8 个品类，每类约 10-12 张，共 ~100 张
 */
import type { TasteCategory, TasteReference } from '../../../shared/types.js'

/**
 * 预置参考图列表
 *
 * 注意：实际部署前需要通过 Unsplash API 拉取真实数据并预计算 palette
 * 这里先放占位数据结构，后续通过构建脚本填充
 */
export const TASTE_PRESETS: TasteReference[] = [
  // ── 风光 (landscape) ──
  {
    id: 'land-01',
    unsplashId: 'photo-1506744038136-46273834b3fb',
    thumbUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&q=80',
    regularUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1080&q=80',
    photographer: 'Bailey Zindel',
    category: 'landscape',
    palette: { dominant: '#2C5F7C', secondary: ['#E8A94D', '#F2D6A0', '#1A3A4C'], accent: '#E8A94D', temperature: 5200, saturation: 45, brightness: 42, contrast: 55 },
    scheme: { id: 'scheme-land-01', name: '湖光暮色', sourceRefId: 'land-01', palette: { dominant: '#2C5F7C', secondary: ['#E8A94D', '#F2D6A0', '#1A3A4C'], accent: '#E8A94D', temperature: 5200, saturation: 45, brightness: 42, contrast: 55 }, hslShifts: [{ hueRange: [0, 60], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [60, 120], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [120, 180], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [180, 240], hShift: 0, sShift: 5, lShift: 0 }, { hueRange: [240, 300], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [300, 360], hShift: 0, sShift: -3, lShift: 0 }], temperatureShift: 390, saturationMul: 0.96, brightnessShift: -1.6, splitToning: { highlights: '#E8A94D', shadows: '#F2D6A0', balance: 50 } },
  },
  {
    id: 'land-02',
    unsplashId: 'photo-1470071459604-3b5ec3a7fe05',
    thumbUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&q=80',
    regularUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1080&q=80',
    photographer: 'Foggy Forest',
    category: 'landscape',
    palette: { dominant: '#4A6741', secondary: ['#8FA886', '#C4D4B8', '#2A3D25'], accent: '#D4E0C8', temperature: 5800, saturation: 32, brightness: 48, contrast: 38 },
    scheme: { id: 'scheme-land-02', name: '森林晨雾', sourceRefId: 'land-02', palette: { dominant: '#4A6741', secondary: ['#8FA886', '#C4D4B8', '#2A3D25'], accent: '#D4E0C8', temperature: 5800, saturation: 32, brightness: 48, contrast: 38 }, hslShifts: [{ hueRange: [0, 60], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [60, 120], hShift: 0, sShift: 5, lShift: 0 }, { hueRange: [120, 180], hShift: 0, sShift: 5, lShift: 0 }, { hueRange: [180, 240], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [240, 300], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [300, 360], hShift: 0, sShift: -3, lShift: 0 }], temperatureShift: 210, saturationMul: 0.86, brightnessShift: -0.4, splitToning: { highlights: '#8FA886', shadows: '#C4D4B8', balance: 50 } },
  },
  {
    id: 'land-03',
    unsplashId: 'photo-1519681393784-d120267933ba',
    thumbUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&q=80',
    regularUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1080&q=80',
    photographer: 'Benjamin Voros',
    category: 'landscape',
    palette: { dominant: '#1A2030', secondary: ['#4A6080', '#8AAEC0', '#0A1018'], accent: '#C0D8E8', temperature: 7200, saturation: 28, brightness: 30, contrast: 62 },
    scheme: { id: 'scheme-land-03', name: '星空雪山', sourceRefId: 'land-03', palette: { dominant: '#1A2030', secondary: ['#4A6080', '#8AAEC0', '#0A1018'], accent: '#C0D8E8', temperature: 7200, saturation: 28, brightness: 30, contrast: 62 }, hslShifts: [{ hueRange: [0, 60], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [60, 120], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [120, 180], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [180, 240], hShift: 0, sShift: 5, lShift: 0 }, { hueRange: [240, 300], hShift: 0, sShift: 5, lShift: 0 }, { hueRange: [300, 360], hShift: 0, sShift: -3, lShift: 0 }], temperatureShift: -210, saturationMul: 0.82, brightnessShift: -4, splitToning: { highlights: '#4A6080', shadows: '#8AAEC0', balance: 50 } },
  },

  // ── 暗调 (dark-moody) ──
  {
    id: 'dark-01',
    unsplashId: 'photo-1469474968028-56623f02e42e',
    thumbUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&q=80',
    regularUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1080&q=80',
    photographer: 'Dave Hoefler',
    category: 'dark-moody',
    palette: { dominant: '#1A2818', secondary: ['#3A5830', '#6B8A50', '#0D1A0C'], accent: '#A0C870', temperature: 5400, saturation: 35, brightness: 28, contrast: 48 },
    scheme: { id: 'scheme-dark-01', name: '暗林深处', sourceRefId: 'dark-01', palette: { dominant: '#1A2818', secondary: ['#3A5830', '#6B8A50', '#0D1A0C'], accent: '#A0C870', temperature: 5400, saturation: 35, brightness: 28, contrast: 48 }, hslShifts: [{ hueRange: [0, 60], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [60, 120], hShift: 0, sShift: 5, lShift: -2 }, { hueRange: [120, 180], hShift: 0, sShift: 5, lShift: -2 }, { hueRange: [180, 240], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [240, 300], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [300, 360], hShift: 0, sShift: -3, lShift: 0 }], temperatureShift: 330, saturationMul: 0.88, brightnessShift: -4.4, splitToning: { highlights: '#3A5830', shadows: '#6B8A50', balance: 50 } },
  },

  // ── 胶片 (film) ──
  {
    id: 'film-01',
    unsplashId: 'photo-1501785888041-af3ef285b470',
    thumbUrl: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&q=80',
    regularUrl: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1080&q=80',
    photographer: 'Pietro De Grandi',
    category: 'film',
    palette: { dominant: '#8B6B3A', secondary: ['#C4A060', '#4A7080', '#2A1A10'], accent: '#E0C080', temperature: 4800, saturation: 42, brightness: 45, contrast: 52 },
    scheme: { id: 'scheme-film-01', name: '暖金夕照', sourceRefId: 'film-01', palette: { dominant: '#8B6B3A', secondary: ['#C4A060', '#4A7080', '#2A1A10'], accent: '#E0C080', temperature: 4800, saturation: 42, brightness: 45, contrast: 52 }, hslShifts: [{ hueRange: [0, 60], hShift: 0, sShift: 5, lShift: 0 }, { hueRange: [60, 120], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [120, 180], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [180, 240], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [240, 300], hShift: 0, sShift: -3, lShift: 0 }, { hueRange: [300, 360], hShift: 0, sShift: -3, lShift: 0 }], temperatureShift: 510, saturationMul: 0.94, brightnessShift: -1, splitToning: { highlights: '#C4A060', shadows: '#4A7080', balance: 50 } },
  },

  // ── 极简 (minimal) ──
  {
    id: 'min-01',
    unsplashId: 'photo-1477346611705-65d1883cee1e',
    thumbUrl: 'https://images.unsplash.com/photo-1477346611705-65d1883cee1e?w=400&q=80',
    regularUrl: 'https://images.unsplash.com/photo-1477346611705-65d1883cee1e?w=1080&q=80',
    photographer: 'Kalen Emsley',
    category: 'minimal',
    palette: { dominant: '#D0D8E0', secondary: ['#8090A0', '#F0F4F8', '#4A5A6A'], accent: '#F8FAFA', temperature: 6800, saturation: 15, brightness: 72, contrast: 35 },
    scheme: { id: 'scheme-min-01', name: '雾中极简', sourceRefId: 'min-01', palette: { dominant: '#D0D8E0', secondary: ['#8090A0', '#F0F4F8', '#4A5A6A'], accent: '#F8FAFA', temperature: 6800, saturation: 15, brightness: 72, contrast: 35 }, hslShifts: [{ hueRange: [0, 60], hShift: 0, sShift: -5, lShift: 2 }, { hueRange: [60, 120], hShift: 0, sShift: -5, lShift: 2 }, { hueRange: [120, 180], hShift: 0, sShift: -5, lShift: 2 }, { hueRange: [180, 240], hShift: 0, sShift: -3, lShift: 2 }, { hueRange: [240, 300], hShift: 0, sShift: -5, lShift: 2 }, { hueRange: [300, 360], hShift: 0, sShift: -5, lShift: 2 }], temperatureShift: -90, saturationMul: 0.72, brightnessShift: 4.4, splitToning: { highlights: '#8090A0', shadows: '#F0F4F8', balance: 50 } },
  },
]

/** 获取所有分类 */
export function getTasteCategories(): TasteCategory[] {
  return ['landscape', 'portrait', 'street', 'architecture', 'food', 'dark-moody', 'film', 'minimal']
}

/** 按分类筛选 */
export function getPresetsByCategory(category: TasteCategory): TasteReference[] {
  return TASTE_PRESETS.filter((r) => r.category === category)
}

/** 分类中文名 */
export const TASTE_CATEGORY_LABELS: Record<TasteCategory, string> = {
  landscape: '风光',
  portrait: '人像',
  street: '街拍',
  architecture: '建筑',
  food: '美食',
  'dark-moody': '暗调',
  film: '胶片',
  minimal: '极简',
}
