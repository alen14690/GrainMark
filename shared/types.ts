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
  'llm:analyzePhoto': (photoPath: string) => Promise<AIAnalysisResult>
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
 *
 * 这是「全局参数」版本，不含局部 mask（M5-LLM-C 再加）。
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
  /** 可选：调色分离（shadows/highlights 色相） */
  colorGrading?: {
    shadows?: { h?: number; s?: number; l?: number }
    highlights?: { h?: number; s?: number; l?: number }
    blending?: number
  }
  /** LLM 对每项调整的一句话理由（用于 UI 展示「为什么这么改」），key 与上面字段对应 */
  reasons?: Partial<{
    exposure: string
    contrast: string
    highlights: string
    shadows: string
    whites: string
    blacks: string
    temp: string
    tint: string
    clarity: string
    saturation: string
    vibrance: string
    colorGrading: string
  }>
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
