/**
 * GrainMark 共享类型定义
 * 主进程与渲染进程共用
 */

// ============ 滤镜参数化 Schema ============

export type FilterCategory =
  | 'negative-color' // 彩色负片
  | 'negative-bw' // 黑白负片
  | 'slide' // 反转片
  | 'cinema' // 电影胶片
  | 'instant' // 拍立得
  | 'digital' // 数码模拟
  | 'custom' // 用户自定义
  | 'extracted' // 从参考图提取

export interface WhiteBalanceParams {
  temp: number // -100..+100 (色温)
  tint: number // -100..+100 (色调)
}

export interface ToneParams {
  exposure: number // -5..+5 EV
  contrast: number // -100..+100
  highlights: number // -100..+100
  shadows: number // -100..+100
  whites: number // -100..+100
  blacks: number // -100..+100
}

export type HSLChannel = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta'

export interface HSLParams {
  [K: string]: { h: number; s: number; l: number } // -100..+100
}

export interface ColorGradingZone {
  h: number // 0..360
  s: number // 0..100
  l: number // -100..+100
}

export interface ColorGradingParams {
  shadows: ColorGradingZone
  midtones: ColorGradingZone
  highlights: ColorGradingZone
  blending: number // 0..100 混合
  balance: number // -100..+100 明暗偏移
}

export interface CurvePoint {
  x: number // 0..255 输入
  y: number // 0..255 输出
}

export interface CurvesParams {
  rgb?: CurvePoint[]
  r?: CurvePoint[]
  g?: CurvePoint[]
  b?: CurvePoint[]
}

export interface GrainParams {
  amount: number // 0..100
  size: number // 0.5..4 像素
  roughness: number // 0..1
}

export interface HalationParams {
  amount: number // 0..100 光晕强度
  threshold: number // 0..255 触发亮度
  radius: number // 1..30 扩散半径
}

export interface VignetteParams {
  amount: number // -100..+100
  midpoint: number // 0..100
  roundness: number // -100..+100
  feather: number // 0..100
}

/** 滤镜完整 Pipeline */
export interface FilterPipeline {
  whiteBalance?: WhiteBalanceParams
  tone?: ToneParams
  hsl?: HSLParams
  colorGrading?: ColorGradingParams
  curves?: CurvesParams
  grain?: GrainParams
  halation?: HalationParams
  vignette?: VignetteParams
  clarity?: number // -100..+100
  saturation?: number // -100..+100
  vibrance?: number // -100..+100
  /** 3D LUT 文件相对路径（.cube） */
  lut?: string | null
  /** LUT 强度 0..100 */
  lutIntensity?: number
}

/** 滤镜对象（内置/用户/提取统一结构） */
export interface FilterPreset {
  id: string
  name: string
  category: FilterCategory
  author: string
  version: string
  /** 热度 0..100，来自社区榜或用户使用 */
  popularity: number
  /** 来源：内置 / 提取 / 导入 / 社区 */
  source: 'builtin' | 'extracted' | 'imported' | 'community'
  description?: string
  tags?: string[]
  /** 参考照片缩略图 base64 或文件路径 */
  referenceThumb?: string
  /** 预览（处理后的效果图） */
  previewThumb?: string
  pipeline: FilterPipeline
  createdAt: number
  updatedAt: number
}

// ============ 照片 / 素材 ============

export interface PhotoExif {
  make?: string // 相机品牌
  model?: string // 机型
  lensModel?: string // 镜头
  fNumber?: number // 光圈
  exposureTime?: string // 快门 "1/250"
  iso?: number // ISO
  focalLength?: number // 焦距 mm
  dateTimeOriginal?: string
  gpsLatitude?: number
  gpsLongitude?: number
  artist?: string // 摄影师
  copyright?: string
  width?: number
  height?: number
  orientation?: number
}

export interface Photo {
  id: string
  path: string // 绝对路径
  name: string
  format: string // jpg/png/heic/raw...
  sizeBytes: number
  width: number
  height: number
  thumbPath?: string
  exif: PhotoExif
  starred: boolean
  rating: 0 | 1 | 2 | 3 | 4 | 5
  tags: string[]
  importedAt: number
  /**
   * 尺寸方向校对使用的算法版本号（迁移字段）。
   * 每次 RAW 方向 / thumb 生成算法升级就 bump，老记录（字段值偏小 or 缺失）
   * 会在 listPhotos 懒补阶段重新走一遍尺寸校对 + thumb 升级。
   *
   * 为保持向后兼容：boolean true 视作 v1（老版本的 dimsVerified=true 记录）。
   */
  dimsVerified?: number | boolean
}

// ============ 批量任务 ============

export type BatchJobStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'

export interface BatchJobItem {
  id: string
  photoPath: string
  photoName: string
  status: BatchJobStatus
  progress: number // 0..100
  error?: string
  outputPath?: string
}

export interface BatchJobConfig {
  filterId: string | null
  watermarkTemplateId: string | null
  outputDir: string
  format: 'jpg' | 'png' | 'tiff' | 'webp' | 'avif'
  quality: number // 1..100
  keepExif: boolean
  colorSpace: 'srgb' | 'display-p3' | 'adobe-rgb'
  resize?: {
    mode: 'none' | 'long-edge' | 'short-edge' | 'width' | 'height' | 'percentage'
    value: number
  }
  namingTemplate: string // e.g. "{name}_{filter}_{date}"
  concurrency: number // 并行数
}

export interface BatchJob {
  id: string
  createdAt: number
  config: BatchJobConfig
  items: BatchJobItem[]
  status: BatchJobStatus
}

// ============ 水印 ============

export type WatermarkTemplateId =
  | 'minimal-bar'
  | 'film-border'
  | 'polaroid'
  | 'gallery-line'
  | 'logo-frame'
  | 'film-timestamp'
  | 'two-line'

export interface WatermarkStyle {
  templateId: WatermarkTemplateId
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom-center' | 'full-border'
  opacity: number // 0..1
  scale: number // 0.5..2
  color: string // hex
  bgColor?: string // 背景色 hex
  fontFamily: string
  showLogo: boolean
  logoPath?: string // 用户上传的 Logo
  /** 参数字段可见性 */
  fields: {
    make: boolean
    model: boolean
    lens: boolean
    aperture: boolean
    shutter: boolean
    iso: boolean
    focalLength: boolean
    dateTime: boolean
    artist: boolean
    location: boolean
  }
  padding: number
}

export interface WatermarkTemplate {
  id: WatermarkTemplateId
  name: string
  description: string
  previewUrl?: string
  defaultStyle: WatermarkStyle
}

// ============ AI 能力 ============

export type AICapability =
  | 'denoise'
  | 'super-resolution'
  | 'sky-replace'
  | 'inpaint' // 瑕疵消除
  | 'recommend' // 推荐滤镜
  | 'auto-wb'
  | 'portrait'

export interface AIModel {
  id: string
  capability: AICapability
  name: string
  version: string
  sizeBytes: number
  downloadUrl?: string
  localPath?: string
  installed: boolean
  device: 'cpu' | 'cuda' | 'coreml' | 'directml'
}

// ============ 云同步 ============

export type CloudProvider =
  | 'icloud'
  | 'onedrive'
  | 'google-drive'
  | 'dropbox'
  | 'aliyun-drive'
  | 'baidu-pan'
  | 'tencent-cos'
  | 'webdav'
  | 's3'

export interface CloudAccount {
  id: string
  provider: CloudProvider
  name: string
  /** OAuth token 或 S3 凭证，存于系统 Keychain */
  credentials: Record<string, string>
  connected: boolean
  lastSyncAt?: number
}

export interface SyncConfig {
  enabled: boolean
  accountId: string | null
  syncFilters: boolean
  syncWatermarks: boolean
  syncSettings: boolean
  syncOriginals: boolean // 默认 false
  conflictStrategy: 'local-wins' | 'remote-wins' | 'newer-wins' | 'ask'
}

// ============ 应用设置 ============

export interface AppSettings {
  general: {
    language: 'zh-CN' | 'en-US' | 'ja-JP'
    theme: 'dark' | 'light' | 'system' | 'film'
    hardwareAcceleration: boolean
  }
  import: {
    defaultImportDir: string
    watchedDirs: string[]
    rawColorProfile: 'camera' | 'adobe-standard' | 'neutral'
    thumbnailCacheMB: number
  }
  export: {
    defaultOutputDir: string
    namingTemplate: string
    defaultFormat: 'jpg' | 'png' | 'tiff' | 'webp'
    defaultQuality: number
    keepExif: boolean
    concurrency: number
  }
  filter: {
    libraryDir: string
    trendingUpdateHours: number
    autoRecommend: boolean
  }
  watermark: {
    artistName: string
    copyright: string
    defaultLogoPath: string | null
    defaultTemplateId: WatermarkTemplateId
    enabledByDefault: boolean
  }
  ai: {
    gpuEnabled: boolean
    device: 'auto' | 'cpu' | 'cuda' | 'coreml' | 'directml'
    /** 未来云端预留 */
    cloudEndpoints: Record<string, { url: string; apiKey: string; enabled: boolean }>
  }
  sync: SyncConfig
  shortcuts: Record<string, string>
  privacy: {
    anonymousStats: boolean
  }
}

// ============ IPC 通道定义 ============

export interface IpcApi {
  // 滤镜
  'filter:list': () => Promise<FilterPreset[]>
  'filter:get': (id: string) => Promise<FilterPreset | null>
  'filter:save': (preset: FilterPreset) => Promise<void>
  'filter:delete': (id: string) => Promise<void>
  'filter:importCube': (path: string) => Promise<FilterPreset>
  'filter:exportCube': (id: string, outPath: string) => Promise<void>

  // 照片
  'photo:import': (paths: string[]) => Promise<Photo[]>
  'photo:list': () => Promise<Photo[]>
  'photo:readExif': (path: string) => Promise<PhotoExif>
  'photo:thumb': (path: string, size: number) => Promise<string>
  /**
   * 仅移除导入记录（`photos.json` + 孤儿 thumb 文件），**不会删除硬盘上的原图**。
   * @returns { removed: 实际被删的记录数; orphanedThumbs: 顺带清理的缩略图数 }
   */
  'photo:remove': (ids: string[]) => Promise<{ removed: number; orphanedThumbs: number }>

  // 预览
  'preview:render': (
    photoPath: string,
    filterId: string | null,
    pipelineOverride?: FilterPipeline,
  ) => Promise<string>

  // 批处理
  'batch:start': (config: BatchJobConfig, photoPaths: string[]) => Promise<string>
  'batch:cancel': (jobId: string) => Promise<void>
  'batch:status': (jobId: string) => Promise<BatchJob | null>

  // 提取
  'extract:fromReference': (refPath: string, targetSamplePath?: string) => Promise<FilterPreset>

  // 水印
  'watermark:templates': () => Promise<WatermarkTemplate[]>
  'watermark:render': (photoPath: string, style: WatermarkStyle) => Promise<string>

  // AI
  'ai:listModels': () => Promise<AIModel[]>
  'ai:downloadModel': (modelId: string) => Promise<void>
  'ai:run': (capability: AICapability, photoPath: string, params?: Record<string, unknown>) => Promise<string>
  'ai:recommend': (photoPath: string) => Promise<{ filterId: string; score: number }[]>

  // 热度榜
  'trending:fetch': () => Promise<{ name: string; score: number; source: string; tags: string[] }[]>

  // 云同步
  'sync:listAccounts': () => Promise<CloudAccount[]>
  'sync:connect': (provider: CloudProvider) => Promise<CloudAccount>
  'sync:now': () => Promise<void>

  // 设置
  'settings:get': () => Promise<AppSettings>
  'settings:update': (patch: Partial<AppSettings>) => Promise<AppSettings>

  // 对话框
  'dialog:selectFiles': (options?: {
    filters?: { name: string; extensions: string[] }[]
    multi?: boolean
  }) => Promise<string[]>
  'dialog:selectDir': () => Promise<string | null>
}

export type IpcChannel = keyof IpcApi
