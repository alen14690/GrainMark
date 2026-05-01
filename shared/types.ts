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
  | 'oil-painting' // 油画质感
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

export interface HSLAdjustment {
  h: number // -100..+100
  s: number // -100..+100
  l: number // -100..+100
}

/** HSL 参数——每个通道只允许 HSLChannel 枚举的 key，杜绝手误 typo 不报错 */
export type HSLParams = Partial<Record<HSLChannel, HSLAdjustment>>

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

/** 几何变换参数 */
export interface TransformParams {
  rotation: 0 | 90 | 180 | 270
  flipH: boolean
  flipV: boolean
}

/** 裁切参数（比例值 0-1，相对原图尺寸） */
export interface CropParams {
  x: number // 裁切起点 x（0-1）
  y: number // 裁切起点 y（0-1）
  width: number // 裁切宽度（0-1）
  height: number // 裁切高度（0-1）
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
  /** 裁切（比例值 0-1） */
  crop?: CropParams
  /** 几何变换（旋转/翻转） */
  transform?: TransformParams
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

// ============ 边框系统(M-Frame · 2026-05-01 新增) ============
//
// 设计方案:artifact/design/frame-system-2026-05-01.md
//
// 与旧 `WatermarkStyle` 的区别:
//   1. 所有尺寸用 `u = minEdge / 1000` 归一化,不用像素常数(解决高分辨率图字号偏小)
//   2. 横竖朝向维护独立 `FrameLayout`(解决竖图硬套横布局的视觉灾难)
//   3. `FrameStyleId` 走字符串注册表,不用紧耦合的 union(解决新风格难扩展)
//
// 兼容策略:
//   - 老 `WatermarkStyle` / `WatermarkTemplate` / `WatermarkTemplateId` 全部保留,
//     `watermark:render` / Batch `watermarkTemplateId` / Editor `exportWatermark` 不改
//   - 新系统用 `frame:*` IPC 通道与旧系统并行,直到阶段 4 再做迁移清理

/** EXIF 字段白名单(相机/镜头/参数/日期/作者/地点) */
export type FrameExifField =
  | 'make'
  | 'model'
  | 'lens'
  | 'aperture'
  | 'shutter'
  | 'iso'
  | 'focalLength'
  | 'dateTime'
  | 'artist'
  | 'location'

/** 字体栈语义名(具体字体由主进程按平台 fallback 解析) */
export type FrameFontFamily =
  | 'inter' // 现代无衬线(UI / 机型)
  | 'mono' // 等宽(参数 / 数字)
  | 'georgia' // 衬线(宝丽来手写感 / 画册)
  | 'courier' // 老打字机 / 日期戳
  | 'typewriter' // 手敲抖动(Typewriter Strip 风格专用)

/** 内容槽:一个 FrameLayout 可以有多个 slot(机型 / 参数 / 日期 / Logo / 作者) */
export interface FrameContentSlot {
  id: 'params' | 'model' | 'date' | 'logo' | 'artist'
  /** slot 所在边框区域 */
  area: 'top' | 'bottom' | 'left' | 'right' | 'overlay'
  /** 归一化坐标(0..1 相对于整个 slot 所在区域的外接矩形),无量纲 */
  anchor: { x: number; y: number }
  /** 字号比例(乘 minEdge),典型 0.018~0.035。logo slot 无意义但保留给类型统一 */
  fontSize: number
  /** 水平对齐 */
  align: 'left' | 'center' | 'right'
  /** 字体族(仅文本 slot 用) */
  fontFamily: FrameFontFamily
  /** 可选:该 slot 的独立颜色覆盖;不传则走 FrameLayout.textColor */
  colorOverride?: string
}

/**
 * 横向/纵向独立布局描述 —— 纯数据,不含 JSX,可序列化,可做 snapshot
 *
 * 所有几何量都是"比例值",渲染时乘 `u = min(imgW, imgH) / 1000` 得到像素。
 * 例如 `borderBottom = 0.22` 在 4000px 短边的图上等于 880px。
 */
export interface FrameLayout {
  /** 四周边框比例(单位:minEdge / 1000) */
  borderTop: number
  borderBottom: number
  borderLeft: number
  borderRight: number
  /** 边框背景色(hex) */
  backgroundColor: string
  /** 默认文字颜色 */
  textColor: string
  /** 可选强调色(日期戳 / 胶片红字) */
  accentColor?: string
  /** 内容 slot 列表(机型 / 参数 / 日期 / Logo / 作者) */
  slots: FrameContentSlot[]
}

/**
 * 边框风格定义 —— 横竖双布局
 *
 * 每个 FrameStyleId 对应一个 FrameStyle,由 registry 分派到对应的 SVG 生成器和
 * React 预览组件。SDK 使用方通过 `overrides` 修改默认文本字段/Logo/颜色方案,
 * 不能修改 layout 本身(保持设计一致性)。
 */
export interface FrameStyle {
  id: FrameStyleId
  /** 用户可见名(中文) */
  name: string
  /** 一句话描述 */
  description: string
  /**
   * 质感分组(2026-05-01 新增):用于 UI 按组展示风格列表 · 给用户更清晰的选择层次
   *
   * 8 大簇(源自 artifact/ui-mockups/frame-premium-moodboard.html 调研):
   *   - classic: 经典必保(minimal/polaroid/gallery/editorial/spine/hairline 等老成员)
   *   - glass:   玻璃拟态(frosted glass 磨砂 · ios dynamic island)
   *   - oil:     油画 / 水彩(serif italic · 纸质 noise)
   *   - ambient: 氛围模糊(照片自身 blur · apple music 歌词卡)
   *   - cinema:  电影 / 霓虹(黑条幕 · 霓虹辉光边)
   *   - editorial: 印刷 / 杂志(swiss grid · contact sheet)
   *   - metal:   金属 / 徽章(拉丝铜铭牌 · 金色奖章)
   *   - floating: 浮动徽章(外接浮卡 · 角章印戳)
   */
  group: FrameStyleGroup
  /** 横图布局(aspectRatio > 1.05 用) */
  landscape: FrameLayout
  /** 竖图布局(aspectRatio < 0.95 用);方形走 landscape */
  portrait: FrameLayout
  /** 可覆盖项:字段可见性 / 作者名 / Logo 路径 / 颜色方案 */
  defaultOverrides: FrameStyleOverrides
}

/**
 * 质感分组 enum(2026-05-01)
 *
 * 分组用途:
 *   1. Watermark 路由的风格列表按组 section 展示
 *   2. 便于用户认知 12+ 种风格的质感差异
 *   3. registry 可提供 getStylesByGroup() 便捷 API
 *
 * 顺序即 UI 展示顺序(classic 作为入门默认组放首位):
 */
export type FrameStyleGroup =
  | 'classic' // 经典必保 —— 老成员(minimal / polaroid / gallery 等) · UI 不展示
  | 'glass' // 玻璃拟态 —— frosted backdrop-filter
  | 'oil' // 油画 / 水彩 —— serif italic + 纸质 noise
  | 'ambient' // 氛围模糊 —— 照片自身 blur 作底
  | 'cinema' // 电影 / 霓虹 —— 黑条幕 · 霓虹辉光
  | 'editorial' // 印刷 / 杂志 —— swiss grid · contact sheet
  | 'floating' // 浮动徽章 —— 外接浮卡 · 角章印戳

/** 每个 style 实例可被用户调整的部分 */
export interface FrameStyleOverrides {
  /** EXIF 字段可见性(老 WatermarkStyle.fields 的等价物) */
  showFields: Record<FrameExifField, boolean>
  /** 覆盖摄影师名(默认走 app 全局 settings) */
  artistName?: string
  /** 用户上传 Logo 路径(仅部分风格支持) */
  logoPath?: string
  /** 颜色方案:部分风格支持 light/dark 反转(如 Gallery Black / White) */
  colorScheme?: 'default' | 'light' | 'dark'
}

/**
 * 全部内置风格 ID
 *
 * 分组(与 FrameStyleGroup 对应):
 *   classic(8):  minimal-bar / hairline / film-full-border / polaroid-classic /
 *                gallery-black / gallery-white / editorial-caption / spine-edition /
 *                sx70-square / negative-strip / point-and-shoot-stamp / contax-label
 *                (M-Frame 必保 8 + 可选 4,阶段 2/3 已实装)
 *   glass(2):    frosted-glass / glass-chip (阶段 5 · A1/A2)
 *   oil(2):      oil-texture / watercolor-caption (阶段 5 · B1/B2)
 *   ambient(2):  ambient-glow / bokeh-pillar (阶段 5 · C1/C2)
 *   cinema(2):   cinema-scope / neon-edge (阶段 5 · D1/D2)
 *   editorial(2):swiss-grid / contact-sheet (阶段 5 · E1/E2)
 *   metal(2):    brushed-metal / medal-plate (阶段 5 · F1/F2)
 *   floating(2): floating-caption / stamp-corner (阶段 5 · H1/H2)
 *
 * 注意:阶段 5 的 14 个风格以组合 generator + layout 复用为主;
 *       数据层差异化表达质感,generator 只在必要时做装饰层(glass bar / neon edge)。
 */
export type FrameStyleId =
  // classic(12) · M-Frame 阶段 2/3(UI 不展示 · 保留兼容)
  | 'minimal-bar'
  | 'hairline'
  | 'film-full-border'
  | 'polaroid-classic'
  | 'gallery-black'
  | 'gallery-white'
  | 'editorial-caption'
  | 'spine-edition'
  | 'sx70-square'
  | 'negative-strip'
  | 'point-and-shoot-stamp'
  | 'contax-label'
  // glass(4) · 玻璃拟态
  | 'frosted-glass'
  | 'glass-chip'
  | 'glass-gradient'
  | 'glass-minimal'
  // oil(3) · 油画 / 水彩
  | 'oil-texture'
  | 'watercolor-caption'
  | 'oil-classic'
  // ambient(7) · 氛围模糊
  | 'ambient-glow'
  | 'bokeh-pillar'
  | 'ambient-vinyl'
  | 'ambient-aura'
  | 'ambient-soft'
  | 'ambient-dark'
  | 'ambient-gradient'
  // cinema(4) · 电影 / 霓虹
  | 'cinema-scope'
  | 'neon-edge'
  | 'cinema-letterbox'
  | 'cinema-timestamp'
  // editorial(3) · 印刷 / 杂志
  | 'swiss-grid'
  | 'contact-sheet'
  | 'editorial-minimal'
  // floating(2) · 浮动徽章
  | 'floating-caption'
  | 'stamp-corner'

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
    /**
     * 未来云端预留。
     * ⚠️ 安全约束：apiKey 等凭证**绝不可**存入此对象——必须走 SecureVault（系统 Keychain）。
     * 此处仅保存不敏感的 endpoint 配置（URL + 启用状态）。
     */
    cloudEndpoints: Record<string, { url: string; enabled: boolean }>
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

  /** 单图导出：原图 + pipeline CPU 渲染 → 弹出保存对话框 → 写文件 */
  'photo:exportSingle': (
    photoPath: string,
    pipeline: FilterPipeline | null,
    options: {
      longEdge: number | null
      quality: number
      rotation?: number
      flipH?: boolean
      flipV?: boolean
      watermark?: WatermarkStyle | null
    },
  ) => Promise<string | null>

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

  // 边框系统(M-Frame · 2026-05-01 新增,与 watermark 并存;详见 shared/types.ts 内块注释)
  /** 列出全部内置 FrameStyle(阶段 1 仅含已实装的 id) */
  'frame:templates': () => Promise<FrameStyle[]>
  /**
   * 渲染边框到图片。
   * @returns base64 data URL(与 watermark:render 一致,方便预览弹窗沿用)
   */
  'frame:render': (
    photoPath: string,
    styleId: FrameStyleId,
    overrides: FrameStyleOverrides,
  ) => Promise<string>

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

  // LLM 云 AI 顾问（M5-LLM-A · 可选能力，需用户主动配置 apiKey）
  'llm:getConfig': () => Promise<LLMConfigPublic>
  'llm:setConfig': (patch: LLMConfigInput) => Promise<LLMConfigPublic>
  'llm:clearConfig': () => Promise<LLMConfigPublic>
  'llm:testConnection': () => Promise<LLMTestResult>
  'llm:listModels': () => Promise<LLMModelCatalog>

  /**
   * M5-LLM-B · 让 LLM 看一张照片，输出「主体识别 + 光影建议 + 可应用的 pipeline 参数」
   *
   * 流程：主进程读原图 → sharp 降采样到 768px JPEG base64 → 发给 OpenRouter →
   *      LLM 按 system prompt 返回 structured JSON → Zod 严校验 + clamp → 返回给 Editor
   *
   * 失败策略：任一环节失败返回 AIAnalysisResult.ok=false + 错误分类；UI 展示友好文案。
   */
  'llm:analyzePhoto': (
    photoPath: string,
    activeFilterName: string | null,
    activeFilterCategory: string | null,
  ) => Promise<AIAnalysisResult>
}

// ============ LLM 配置（M5-LLM-A） ============

/**
 * 支持的 LLM 提供商。
 * 当前仅支持 OpenRouter（一家代理覆盖 GPT-4o / Gemini / Claude / Llama 等）。
 * 添加新提供商 = 扩充此 enum + 新增 adapter，UI 自动驱动。
 */
export type LLMProvider = 'openrouter'

/** 公开视图：绝不含 apiKey 明文，仅 hasApiKey 布尔 + masked 预览 */
export interface LLMConfigPublic {
  provider: LLMProvider | null
  model: string | null // 例如 'openai/gpt-4o-mini' / 'google/gemini-2.0-flash-exp'
  hasApiKey: boolean
  apiKeyMasked: string | null // 例如 'sk-or-...abcd'（仅后 4 位明文）
  optInUploadImages: boolean // 用户是否明确同意上传图片给该提供商
  updatedAt: number | null
}

/** 写入视图：可选字段——只传要改的。apiKey 为空串 = 保留原值，null = 清空 */
export interface LLMConfigInput {
  provider?: LLMProvider
  model?: string
  apiKey?: string | null
  optInUploadImages?: boolean
}

/** 连通性测试结果 */
export interface LLMTestResult {
  ok: boolean
  latencyMs: number
  /** 成功时：返回可用模型数量或示例；失败时：失败原因（已脱敏） */
  message: string
  /** 失败分类：用于 UI 显示友好文案 */
  errorKind?: 'no-config' | 'invalid-key' | 'network' | 'rate-limit' | 'unknown'
}

/**
 * 单个 LLM 模型条目（从 OpenRouter /models 精简而来）
 *
 * 我们只保留做"vision 能力筛选 + 价格排序 + UI 展示"必需的字段，
 * 舍弃 description / top_provider / per_request_limits 等体积大且当前用不到的字段。
 */
export interface LLMModelEntry {
  id: string
  name: string
  contextLength: number
  /** 输入百万 token 的美元价格（把 OpenRouter 返回的每 token 美元价 ×1e6 做展示） */
  pricePromptPerMTok: number
  /** 输出百万 token 的美元价格 */
  priceCompletionPerMTok: number
  /** 是否支持图片输入（input_modalities 包含 'image'） */
  supportsVision: boolean
  /** 是否为免费模型（promptPrice === 0 && completionPrice === 0） */
  isFree: boolean
  /** 发布时间（unix 秒），可能缺失 */
  createdAt: number | null
}

/** 模型目录 + 智能推荐列表 */
export interface LLMModelCatalog {
  /** API 拉取时间戳（ms）；null 表示用的是兜底默认值 */
  fetchedAt: number | null
  /** 全部支持图片输入的模型，按 createdAt 降序（最新在前） */
  models: LLMModelEntry[]
  /**
   * 智能推荐：按"质量/价格"场景挑选的 3~5 条。
   * - 'flagship'：旗舰最强（贵）
   * - 'balanced'：质量/价格平衡
   * - 'cheap'：最便宜的可用 vision 模型
   */
  recommended: Array<{
    tier: 'flagship' | 'balanced' | 'cheap'
    model: LLMModelEntry
    reason: string // 例如 "2026 最新旗舰，10 亿 token 上下文"
  }>
  /** 失败分类（API 拉不通时前端要知道，用于展示"当前是兜底列表"的提示） */
  fallback?: 'no-config' | 'invalid-key' | 'network' | 'rate-limit' | 'unknown'
}

// ============ AI 照片分析（M5-LLM-B） ============

/**
 * LLM 返回的「场景/主体识别」——只用于展示给用户，不驱动任何自动处理
 *
 * 字段命名中性不做技术判断（"strong/soft/none"），由 UI 决定如何可视化。
 */
export interface AISceneAnalysis {
  /** 一句话概括这张照片「是什么」+ 摄影意图推测；用户可视的解释 */
  summary: string
  /** 主体描述（"站在窗前的人像" / "雪山日落前景小树") */
  subject: string
  /** 次要环境描述（"逆光柔雾背景" / "杂乱绿植"），用于说明什么该被弱化 */
  environment: string
  /**
   * 这张照片当前「缺什么」的诊断清单（2~6 条）——每条是可读中文，用户能看懂
   * 例：["主体面部偏暗，建议提亮阴影"、"背景过亮抢戏，建议压暗高光"]
   */
  diagnosis: string[]
}

/**
 * LLM 建议的参数调整——所有字段可选（AI 判断无需调就不返回）
 *
 * **硬约束**（在主进程 clamp，不信任 LLM 输出）：
 *   - tone.*：±40 上限
 *   - whiteBalance.*：±30 上限
 *   - clarity / saturation / vibrance：±40 上限
 *   - colorGrading.hue：0~360，s/l：±40
 *   - curves.*：控制点 {x,y} ∈ [0,255]，每通道最多 8 个点
 *   - hsl.*：h/s/l ∈ ±40
 *   - grain.amount：[0,50]，size：[0.5,3]，roughness：[0,1]
 *   - halation.amount：[0,40]，threshold：[150,255]，radius：[1,20]
 *   - vignette.amount：[-60,+30]，midpoint/feather：[20,80]，roundness：[-50,+50]
 *
 * M5-LLM-C：扩展为 5 维分析（光影/色彩/质感/主体/氛围），覆盖全部 10 个 shader 通道。
 */
export interface AISuggestedAdjustments {
  tone?: {
    exposure?: number
    contrast?: number
    highlights?: number
    shadows?: number
    whites?: number
    blacks?: number
  }
  whiteBalance?: {
    temp?: number
    tint?: number
  }
  clarity?: number
  saturation?: number
  vibrance?: number
  /** 调色分离（shadows/highlights 色相） */
  colorGrading?: {
    shadows?: { h?: number; s?: number; l?: number }
    highlights?: { h?: number; s?: number; l?: number }
    blending?: number
  }
  /** M5-LLM-C：RGB + 通道曲线建议（2~8 控制点/通道） */
  curves?: {
    rgb?: Array<{ x: number; y: number }>
    r?: Array<{ x: number; y: number }>
    g?: Array<{ x: number; y: number }>
    b?: Array<{ x: number; y: number }>
  }
  /** M5-LLM-C：HSL 8 通道独立建议（只包含需要调整的通道） */
  hsl?: Partial<Record<HSLChannel, { h?: number; s?: number; l?: number }>>
  /** M5-LLM-C：胶片颗粒 */
  grain?: { amount?: number; size?: number; roughness?: number }
  /** M5-LLM-C：高光溢光 */
  halation?: { amount?: number; threshold?: number; radius?: number }
  /** M5-LLM-C：暗角 / 视觉引导 */
  vignette?: { amount?: number; midpoint?: number; roundness?: number; feather?: number }
  /** LLM 对每项调整的一句话理由（用于 UI 展示「为什么这么改」），key 与上面字段对应 */
  reasons?: Record<string, string>
}

/** 分析结果 · 成功 */
export interface AIAnalysisSuccess {
  ok: true
  analysis: AISceneAnalysis
  adjustments: AISuggestedAdjustments
  /** 诊断元数据（可展示给用户）：用了哪个模型 + 总耗时 + token 估算 */
  meta: {
    model: string
    latencyMs: number
    /** LLM 返回的用量（若有），单位 token */
    promptTokens?: number
    completionTokens?: number
  }
}

/** 分析结果 · 失败 */
export interface AIAnalysisFailure {
  ok: false
  errorKind:
    | 'no-config' // 没配 apiKey
    | 'not-opted-in' // 没勾选 opt-in 上传同意
    | 'image-prep-failed' // 原图读取/压缩失败
    | 'invalid-key' // apiKey 被拒
    | 'rate-limit' // 速率限制
    | 'network' // 网络错误
    | 'timeout' // 超时（30s）
    | 'invalid-response' // LLM 返回非法 JSON / schema 不通过
    | 'unknown'
  message: string
}

export type AIAnalysisResult = AIAnalysisSuccess | AIAnalysisFailure

export type IpcChannel = keyof IpcApi
