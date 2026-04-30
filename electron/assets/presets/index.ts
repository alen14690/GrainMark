import type { FilterPipeline, FilterPreset } from '../../../shared/types.js'

const now = Date.now()

function p(
  id: string,
  name: string,
  category: FilterPreset['category'],
  popularity: number,
  pipeline: FilterPipeline,
  tags: string[] = [],
): FilterPreset {
  return {
    id,
    name,
    category,
    author: 'GrainMark',
    version: '1.0',
    popularity,
    source: 'builtin',
    tags,
    pipeline,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 30 款内置胶片滤镜（M2 将基于色彩科学论文和实测色卡进一步精调）
 * 当前参数基于公开胶片特性参数化而来，保留基本色调取向
 */
export const BUILTIN_PRESETS: FilterPreset[] = [
  // —— Kodak 家族 ——
  p(
    'kodak-portra-400',
    'Kodak Portra 400',
    'negative-color',
    98,
    {
      whiteBalance: { temp: 8, tint: 3 },
      tone: { exposure: 0, contrast: -5, highlights: -12, shadows: 8, whites: -3, blacks: 2 },
      colorGrading: {
        shadows: { h: 210, s: 10, l: -2 },
        midtones: { h: 35, s: 6, l: 0 },
        highlights: { h: 40, s: 8, l: 2 },
        blending: 60,
        balance: 0,
      },
      saturation: -8,
      grain: { amount: 20, size: 1.1, roughness: 0.55 },
      halation: { amount: 10, threshold: 220, radius: 6 },
    },
    ['portrait', 'warm', 'wedding'],
  ),

  p(
    'kodak-portra-160',
    'Kodak Portra 160',
    'negative-color',
    88,
    {
      whiteBalance: { temp: 5, tint: 2 },
      tone: { exposure: 0, contrast: -4, highlights: -8, shadows: 6, whites: -2, blacks: 1 },
      saturation: -10,
      grain: { amount: 12, size: 0.9, roughness: 0.45 },
    },
    ['portrait', 'soft'],
  ),

  p(
    'kodak-portra-800',
    'Kodak Portra 800',
    'negative-color',
    82,
    {
      whiteBalance: { temp: 12, tint: 5 },
      tone: { exposure: 0.1, contrast: -3, highlights: -10, shadows: 10, whites: -3, blacks: 3 },
      saturation: -5,
      grain: { amount: 35, size: 1.4, roughness: 0.7 },
      halation: { amount: 14, threshold: 215, radius: 8 },
    },
    ['portrait', 'low-light'],
  ),

  p(
    'kodak-gold-200',
    'Kodak Gold 200',
    'negative-color',
    92,
    {
      whiteBalance: { temp: 15, tint: -2 },
      tone: { exposure: 0, contrast: -2, highlights: -5, shadows: 5, whites: 0, blacks: 2 },
      saturation: 5,
      grain: { amount: 18, size: 1.0, roughness: 0.5 },
    },
    ['daily', 'warm', 'nostalgic'],
  ),

  p(
    'kodak-ektar-100',
    'Kodak Ektar 100',
    'negative-color',
    86,
    {
      whiteBalance: { temp: 0, tint: 0 },
      tone: { exposure: 0, contrast: 8, highlights: -3, shadows: -2, whites: 0, blacks: 0 },
      saturation: 15,
      vibrance: 10,
      grain: { amount: 6, size: 0.7, roughness: 0.3 },
    },
    ['landscape', 'vivid'],
  ),

  p(
    'kodak-ektachrome-e100',
    'Kodak Ektachrome E100',
    'slide',
    80,
    {
      whiteBalance: { temp: -3, tint: 0 },
      tone: { exposure: 0, contrast: 10, highlights: -5, shadows: -3, whites: 2, blacks: -2 },
      saturation: 12,
      grain: { amount: 10, size: 0.8, roughness: 0.4 },
    },
    ['slide', 'vivid', 'landscape'],
  ),

  p(
    'kodak-tri-x-400',
    'Kodak Tri-X 400',
    'negative-bw',
    85,
    {
      tone: { exposure: 0, contrast: 15, highlights: -10, shadows: 5, whites: 3, blacks: -5 },
      saturation: -100,
      grain: { amount: 40, size: 1.3, roughness: 0.8 },
    },
    ['bw', 'street', 'classic'],
  ),

  p(
    'kodak-tmax-3200',
    'Kodak T-MAX 3200',
    'negative-bw',
    72,
    {
      tone: { exposure: 0.2, contrast: 12, highlights: -15, shadows: 8, whites: 2, blacks: -3 },
      saturation: -100,
      grain: { amount: 65, size: 1.8, roughness: 0.9 },
    },
    ['bw', 'night', 'high-iso'],
  ),

  // —— Fuji 家族 ——
  p(
    'fuji-400h',
    'Fuji Pro 400H',
    'negative-color',
    95,
    {
      whiteBalance: { temp: -2, tint: 2 },
      tone: { exposure: 0.1, contrast: -8, highlights: -15, shadows: 12, whites: -5, blacks: 3 },
      colorGrading: {
        shadows: { h: 180, s: 12, l: 0 },
        midtones: { h: 150, s: 8, l: 0 },
        highlights: { h: 140, s: 10, l: 3 },
        blending: 55,
        balance: 5,
      },
      saturation: -12,
      grain: { amount: 18, size: 1.0, roughness: 0.5 },
    },
    ['pastel', 'wedding', 'airy'],
  ),

  p(
    'fuji-superia-400',
    'Fuji Superia 400',
    'negative-color',
    78,
    {
      whiteBalance: { temp: -3, tint: 3 },
      tone: { exposure: 0, contrast: -2, highlights: -5, shadows: 5, whites: 0, blacks: 2 },
      saturation: 5,
      grain: { amount: 25, size: 1.2, roughness: 0.6 },
    },
    ['daily', 'green-shift'],
  ),

  p(
    'fuji-velvia-50',
    'Fuji Velvia 50',
    'slide',
    84,
    {
      whiteBalance: { temp: -2, tint: 0 },
      tone: { exposure: 0, contrast: 15, highlights: -5, shadows: -2, whites: 3, blacks: -3 },
      saturation: 25,
      vibrance: 15,
      grain: { amount: 8, size: 0.8, roughness: 0.35 },
    },
    ['landscape', 'saturated', 'vivid'],
  ),

  p(
    'fuji-provia-100f',
    'Fuji Provia 100F',
    'slide',
    76,
    {
      whiteBalance: { temp: 0, tint: 0 },
      tone: { exposure: 0, contrast: 10, highlights: -3, shadows: 0, whites: 2, blacks: -2 },
      saturation: 8,
      grain: { amount: 9, size: 0.8, roughness: 0.35 },
    },
    ['slide', 'neutral'],
  ),

  p(
    'fuji-classic-chrome',
    'Fuji Classic Chrome',
    'digital',
    90,
    {
      whiteBalance: { temp: -4, tint: -3 },
      tone: { exposure: 0, contrast: 6, highlights: -8, shadows: 4, whites: -2, blacks: -2 },
      colorGrading: {
        shadows: { h: 200, s: 8, l: -3 },
        midtones: { h: 40, s: 4, l: 0 },
        highlights: { h: 45, s: 6, l: 0 },
        blending: 60,
        balance: -5,
      },
      saturation: -15,
      grain: { amount: 12, size: 0.9, roughness: 0.45 },
    },
    ['documentary', 'muted', 'fujifilm'],
  ),

  p(
    'fuji-classic-neg',
    'Fuji Classic Negative',
    'digital',
    94,
    {
      whiteBalance: { temp: -2, tint: 5 },
      tone: { exposure: 0, contrast: 4, highlights: -10, shadows: 8, whites: -3, blacks: 0 },
      colorGrading: {
        shadows: { h: 210, s: 15, l: -2 },
        midtones: { h: 30, s: 10, l: 0 },
        highlights: { h: 45, s: 8, l: 2 },
        blending: 65,
        balance: 0,
      },
      saturation: -5,
      grain: { amount: 22, size: 1.1, roughness: 0.55 },
    },
    ['fujifilm', 'street', 'warm-shadows'],
  ),

  p(
    'fuji-acros',
    'Fuji Acros',
    'negative-bw',
    74,
    {
      tone: { exposure: 0, contrast: 10, highlights: -8, shadows: 5, whites: 2, blacks: -3 },
      saturation: -100,
      grain: { amount: 15, size: 0.9, roughness: 0.4 },
    },
    ['bw', 'smooth'],
  ),

  // —— Cinestill ——
  p(
    'cinestill-800t',
    'Cinestill 800T',
    'cinema',
    96,
    {
      whiteBalance: { temp: -25, tint: 5 },
      tone: { exposure: 0.1, contrast: 5, highlights: -15, shadows: 10, whites: -5, blacks: 3 },
      colorGrading: {
        shadows: { h: 210, s: 20, l: -2 },
        midtones: { h: 200, s: 8, l: 0 },
        highlights: { h: 20, s: 15, l: 3 },
        blending: 55,
        balance: 0,
      },
      saturation: -8,
      grain: { amount: 30, size: 1.3, roughness: 0.65 },
      halation: { amount: 40, threshold: 200, radius: 12 },
    },
    ['night', 'tungsten', 'halation', 'cinema'],
  ),

  p(
    'cinestill-50d',
    'Cinestill 50D',
    'cinema',
    82,
    {
      whiteBalance: { temp: 3, tint: 0 },
      tone: { exposure: 0, contrast: 3, highlights: -5, shadows: 3, whites: -2, blacks: 0 },
      saturation: -2,
      grain: { amount: 10, size: 0.8, roughness: 0.4 },
      halation: { amount: 20, threshold: 210, radius: 8 },
    },
    ['daylight', 'cinema', 'halation'],
  ),

  // —— Agfa / Ilford / Others ——
  p(
    'agfa-vista-200',
    'Agfa Vista 200',
    'negative-color',
    78,
    {
      whiteBalance: { temp: 10, tint: -3 },
      tone: { exposure: 0, contrast: 2, highlights: -5, shadows: 5, whites: 0, blacks: 3 },
      saturation: 8,
      grain: { amount: 20, size: 1.1, roughness: 0.55 },
    },
    ['retro', 'warm'],
  ),

  p(
    'agfa-apx-400',
    'Agfa APX 400',
    'negative-bw',
    68,
    {
      tone: { exposure: 0, contrast: 12, highlights: -8, shadows: 3, whites: 3, blacks: -3 },
      saturation: -100,
      grain: { amount: 30, size: 1.2, roughness: 0.7 },
    },
    ['bw', 'gritty'],
  ),

  p(
    'ilford-hp5-plus',
    'Ilford HP5 Plus',
    'negative-bw',
    88,
    {
      tone: { exposure: 0, contrast: 10, highlights: -8, shadows: 5, whites: 2, blacks: -3 },
      saturation: -100,
      grain: { amount: 28, size: 1.2, roughness: 0.65 },
    },
    ['bw', 'classic', 'street'],
  ),

  p(
    'ilford-delta-3200',
    'Ilford Delta 3200',
    'negative-bw',
    70,
    {
      tone: { exposure: 0.2, contrast: 14, highlights: -12, shadows: 8, whites: 3, blacks: -5 },
      saturation: -100,
      grain: { amount: 55, size: 1.7, roughness: 0.85 },
    },
    ['bw', 'high-iso', 'night'],
  ),

  p(
    'ilford-pan-f',
    'Ilford Pan F Plus 50',
    'negative-bw',
    65,
    {
      tone: { exposure: 0, contrast: 14, highlights: -5, shadows: 2, whites: 3, blacks: -2 },
      saturation: -100,
      grain: { amount: 5, size: 0.7, roughness: 0.3 },
    },
    ['bw', 'smooth', 'fine-grain'],
  ),

  // —— 电影胶片 ——
  p(
    'kodak-vision3-500t',
    'Kodak Vision3 500T',
    'cinema',
    88,
    {
      whiteBalance: { temp: -20, tint: 3 },
      tone: { exposure: 0, contrast: 4, highlights: -12, shadows: 10, whites: -3, blacks: 2 },
      colorGrading: {
        shadows: { h: 210, s: 15, l: -2 },
        midtones: { h: 30, s: 8, l: 0 },
        highlights: { h: 35, s: 10, l: 2 },
        blending: 55,
        balance: 0,
      },
      saturation: -5,
      grain: { amount: 25, size: 1.2, roughness: 0.6 },
    },
    ['cinema', 'film', 'tungsten'],
  ),

  p(
    'kodak-vision3-250d',
    'Kodak Vision3 250D',
    'cinema',
    85,
    {
      whiteBalance: { temp: 2, tint: 0 },
      tone: { exposure: 0, contrast: 4, highlights: -8, shadows: 6, whites: -2, blacks: 1 },
      saturation: -3,
      grain: { amount: 20, size: 1.1, roughness: 0.55 },
    },
    ['cinema', 'daylight'],
  ),

  p(
    'fuji-eterna-250d',
    'Fuji Eterna 250D',
    'cinema',
    78,
    {
      whiteBalance: { temp: -2, tint: 0 },
      tone: { exposure: 0, contrast: 2, highlights: -10, shadows: 8, whites: -3, blacks: 2 },
      saturation: -10,
      grain: { amount: 18, size: 1.0, roughness: 0.5 },
    },
    ['cinema', 'low-contrast', 'muted'],
  ),

  // —— 拍立得 ——
  p(
    'polaroid-600',
    'Polaroid 600',
    'instant',
    82,
    {
      whiteBalance: { temp: 8, tint: 6 },
      tone: { exposure: -0.1, contrast: -10, highlights: -15, shadows: 15, whites: -8, blacks: 10 },
      saturation: -15,
      grain: { amount: 25, size: 1.3, roughness: 0.6 },
      vignette: { amount: -20, midpoint: 40, roundness: 10, feather: 50 },
    },
    ['instant', 'retro', 'faded'],
  ),

  p(
    'fuji-instax',
    'Fuji Instax Mini',
    'instant',
    80,
    {
      whiteBalance: { temp: 5, tint: 2 },
      tone: { exposure: 0, contrast: -5, highlights: -8, shadows: 8, whites: -3, blacks: 3 },
      saturation: -5,
      grain: { amount: 15, size: 1.0, roughness: 0.5 },
    },
    ['instant', 'pastel'],
  ),

  // —— 数码 / 创意 ——
  p(
    'teal-orange',
    'Teal & Orange',
    'digital',
    92,
    {
      tone: { exposure: 0, contrast: 8, highlights: -5, shadows: 5, whites: 0, blacks: -2 },
      colorGrading: {
        shadows: { h: 190, s: 30, l: -3 },
        midtones: { h: 25, s: 10, l: 0 },
        highlights: { h: 30, s: 25, l: 3 },
        blending: 60,
        balance: 0,
      },
      saturation: 5,
    },
    ['cinematic', 'blockbuster'],
  ),

  p(
    'wong-kar-wai',
    '王家卫风',
    'digital',
    85,
    {
      whiteBalance: { temp: 15, tint: 8 },
      tone: { exposure: -0.1, contrast: 6, highlights: -15, shadows: 8, whites: -5, blacks: 5 },
      colorGrading: {
        shadows: { h: 15, s: 15, l: -3 },
        midtones: { h: 25, s: 10, l: 0 },
        highlights: { h: 30, s: 18, l: 2 },
        blending: 70,
        balance: 5,
      },
      saturation: -8,
      grain: { amount: 28, size: 1.3, roughness: 0.65 },
      vignette: { amount: -15, midpoint: 45, roundness: 0, feather: 50 },
    },
    ['cinematic', 'moody', 'warm'],
  ),

  p(
    'japan-soft',
    '日系清新',
    'digital',
    90,
    {
      whiteBalance: { temp: -3, tint: -2 },
      tone: { exposure: 0.2, contrast: -8, highlights: -10, shadows: 15, whites: -3, blacks: 5 },
      colorGrading: {
        shadows: { h: 200, s: 8, l: 2 },
        midtones: { h: 150, s: 5, l: 3 },
        highlights: { h: 60, s: 8, l: 5 },
        blending: 50,
        balance: 10,
      },
      saturation: -10,
      grain: { amount: 10, size: 0.9, roughness: 0.4 },
    },
    ['bright', 'airy', 'japanese'],
  ),

  // —— 油画质感系列 ——
  p(
    'oil-painting-classic',
    '古典油画',
    'oil-painting',
    88,
    {
      tone: { exposure: 0, contrast: -15, highlights: -20, shadows: 12, whites: -10, blacks: 8 },
      curves: {
        rgb: [
          { x: 0, y: 20 }, { x: 64, y: 72 }, { x: 128, y: 135 }, { x: 192, y: 200 }, { x: 255, y: 235 },
        ],
        r: [{ x: 0, y: 8 }, { x: 128, y: 132 }, { x: 255, y: 248 }],
      },
      hsl: {
        orange: { h: 5, s: -8, l: 3 },
        yellow: { h: 8, s: -12, l: 0 },
        green: { h: 10, s: -20, l: -5 },
        blue: { h: 0, s: -25, l: -3 },
      },
      colorGrading: {
        shadows: { h: 35, s: 12, l: -3 },
        midtones: { h: 38, s: 5, l: 0 },
        highlights: { h: 45, s: 6, l: 2 },
        blending: 45,
        balance: 0,
      },
      clarity: -12,
      saturation: -18,
      vibrance: 8,
      grain: { amount: 12, size: 2.0, roughness: 0.3 },
      halation: { amount: 8, threshold: 210, radius: 10 },
      vignette: { amount: -18, midpoint: 55, roundness: 0, feather: 65 },
    },
    ['oil-painting', 'classic', 'warm', 'portrait'],
  ),

  p(
    'oil-painting-rembrandt',
    '伦勃朗光影',
    'oil-painting',
    82,
    {
      tone: { exposure: -0.3, contrast: -10, highlights: -25, shadows: 8, whites: -15, blacks: 12 },
      curves: {
        rgb: [
          { x: 0, y: 25 }, { x: 80, y: 65 }, { x: 128, y: 120 }, { x: 200, y: 190 }, { x: 255, y: 225 },
        ],
      },
      hsl: {
        orange: { h: 3, s: -5, l: 5 },
        yellow: { h: 5, s: -15, l: -3 },
        blue: { h: 0, s: -30, l: -8 },
      },
      colorGrading: {
        shadows: { h: 30, s: 18, l: -5 },
        midtones: { h: 35, s: 8, l: -2 },
        highlights: { h: 40, s: 10, l: 3 },
        blending: 50,
        balance: -10,
      },
      clarity: -15,
      saturation: -22,
      vibrance: 5,
      grain: { amount: 10, size: 2.2, roughness: 0.25 },
      vignette: { amount: -35, midpoint: 40, roundness: -10, feather: 55 },
    },
    ['oil-painting', 'dark', 'dramatic', 'portrait'],
  ),

  p(
    'oil-painting-impressionist',
    '印象派光彩',
    'oil-painting',
    85,
    {
      tone: { exposure: 0.2, contrast: -12, highlights: -15, shadows: 15, whites: -8, blacks: 5 },
      curves: {
        rgb: [
          { x: 0, y: 15 }, { x: 64, y: 75 }, { x: 128, y: 138 }, { x: 192, y: 205 }, { x: 255, y: 240 },
        ],
      },
      hsl: {
        orange: { h: 5, s: -5, l: 3 },
        yellow: { h: 5, s: -8, l: 5 },
        green: { h: 8, s: -15, l: 3 },
        blue: { h: -5, s: -10, l: 5 },
        purple: { h: -5, s: -8, l: 3 },
      },
      colorGrading: {
        shadows: { h: 220, s: 8, l: 2 },
        midtones: { h: 140, s: 5, l: 2 },
        highlights: { h: 55, s: 10, l: 5 },
        blending: 40,
        balance: 5,
      },
      clarity: -10,
      saturation: -12,
      vibrance: 12,
      grain: { amount: 8, size: 1.8, roughness: 0.35 },
      halation: { amount: 10, threshold: 200, radius: 12 },
    },
    ['oil-painting', 'bright', 'pastel', 'landscape'],
  ),
]
