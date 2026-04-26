/**
 * Zod IPC Schema — 所有 IPC 参数的运行时校验
 *
 * 规则：每个 IPC handler 接收的参数必须先过这里 .parse()；
 * 违反者直接抛 ZodError，由统一 error handler 转为友好错误返回给渲染进程。
 */
import { z } from 'zod'

// ============ 公用 ============
const PathSchema = z.string().min(1).max(4096)

/**
 * LUT 文件名 schema（F7 修复）—— 仅允许安全字符 + `.cube` 后缀。
 *
 * 背景：FilterPipeline.lut 原本是 `z.string().max(256)`，攻击者可构造
 *   `pipeline.lut = "../../../../etc/shadow"` 让 cubeIO 的
 *   `path.join(getLUTDir(), lut)` 回到 LUT 目录之外读取任意文件。
 *
 * 约束：
 *   - 只允许字母 / 数字 / 下划线 / 短横线 / 点（用于 `.cube`）
 *   - 禁用 `/` / `\\` / 空字符 / 绝对路径前缀
 *   - 必须以 `.cube` 结尾（大小写不敏感）
 *   - 长度上限 128（nanoid(12) + ".cube" + 冗余）
 */
export const LutFileNameSchema = z
  .string()
  .min(5) // 至少 "a.cube"
  .max(128)
  .regex(/^[a-zA-Z0-9_\-]+(\.[cC][uU][bB][eE])$/, 'LUT filename must be <name>.cube with no path separators')

// ============ 滤镜 ============
export const FilterIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_\-:.]+$/)

export const FilterCategorySchema = z.enum([
  'negative-color',
  'negative-bw',
  'slide',
  'cinema',
  'instant',
  'digital',
  'custom',
  'extracted',
])

const WhiteBalanceSchema = z.object({
  temp: z.number().min(-100).max(100),
  tint: z.number().min(-100).max(100),
})

const ToneSchema = z.object({
  exposure: z.number().min(-5).max(5),
  contrast: z.number().min(-100).max(100),
  highlights: z.number().min(-100).max(100),
  shadows: z.number().min(-100).max(100),
  whites: z.number().min(-100).max(100),
  blacks: z.number().min(-100).max(100),
})

const CurvePointSchema = z.object({ x: z.number().min(0).max(255), y: z.number().min(0).max(255) })

const ColorGradingZoneSchema = z.object({
  h: z.number().min(0).max(360),
  s: z.number().min(0).max(100),
  l: z.number().min(-100).max(100),
})

export const FilterPipelineSchema = z.object({
  whiteBalance: WhiteBalanceSchema.optional(),
  tone: ToneSchema.optional(),
  hsl: z
    .record(
      z.string(),
      z.object({
        h: z.number().min(-100).max(100),
        s: z.number().min(-100).max(100),
        l: z.number().min(-100).max(100),
      }),
    )
    .optional(),
  colorGrading: z
    .object({
      shadows: ColorGradingZoneSchema,
      midtones: ColorGradingZoneSchema,
      highlights: ColorGradingZoneSchema,
      blending: z.number().min(0).max(100),
      balance: z.number().min(-100).max(100),
    })
    .optional(),
  curves: z
    .object({
      rgb: z.array(CurvePointSchema).max(32).optional(),
      r: z.array(CurvePointSchema).max(32).optional(),
      g: z.array(CurvePointSchema).max(32).optional(),
      b: z.array(CurvePointSchema).max(32).optional(),
    })
    .optional(),
  grain: z
    .object({
      amount: z.number().min(0).max(100),
      size: z.number().min(0.1).max(4),
      roughness: z.number().min(0).max(1),
    })
    .optional(),
  halation: z
    .object({
      amount: z.number().min(0).max(100),
      threshold: z.number().min(0).max(255),
      radius: z.number().min(1).max(30),
    })
    .optional(),
  vignette: z
    .object({
      amount: z.number().min(-100).max(100),
      midpoint: z.number().min(0).max(100),
      roundness: z.number().min(-100).max(100),
      feather: z.number().min(0).max(100),
    })
    .optional(),
  clarity: z.number().min(-100).max(100).optional(),
  saturation: z.number().min(-100).max(100).optional(),
  vibrance: z.number().min(-100).max(100).optional(),
  // F7：LUT 名只接受受控文件名，拒绝路径遍历
  lut: LutFileNameSchema.nullable().optional(),
  lutIntensity: z.number().min(0).max(100).optional(),
})

export const FilterPresetSchema = z.object({
  id: FilterIdSchema,
  name: z.string().min(1).max(128),
  category: FilterCategorySchema,
  author: z.string().max(128),
  version: z.string().max(32),
  popularity: z.number().min(0).max(100),
  source: z.enum(['builtin', 'extracted', 'imported', 'community']),
  description: z.string().max(1024).optional(),
  tags: z.array(z.string().max(64)).max(32).optional(),
  referenceThumb: z.string().max(4096).optional(),
  previewThumb: z.string().max(4096).optional(),
  pipeline: FilterPipelineSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

// ============ 照片 ============
export const PhotoImportSchema = z.object({
  paths: z.array(PathSchema).min(1).max(10_000),
})

/** 仅删 photos.json 的导入记录（以及孤儿缩略图），不会触及硬盘原文件 */
export const PhotoRemoveSchema = z.array(z.string().min(1).max(64)).min(1).max(1000)

// ============ 预览 ============
export const PreviewRenderSchema = z.object({
  photoPath: PathSchema,
  filterId: FilterIdSchema.nullable(),
  pipelineOverride: FilterPipelineSchema.optional(),
})

// ============ 批处理 ============
export const BatchJobConfigSchema = z.object({
  filterId: FilterIdSchema.nullable(),
  watermarkTemplateId: z.string().max(64).nullable(),
  outputDir: PathSchema,
  format: z.enum(['jpg', 'png', 'tiff', 'webp', 'avif']),
  quality: z.number().int().min(1).max(100),
  keepExif: z.boolean(),
  colorSpace: z.enum(['srgb', 'display-p3', 'adobe-rgb']),
  resize: z
    .object({
      mode: z.enum(['none', 'long-edge', 'short-edge', 'width', 'height', 'percentage']),
      value: z.number(),
    })
    .optional(),
  namingTemplate: z.string().min(1).max(256),
  concurrency: z.number().int().min(1).max(32),
})

export const BatchStartSchema = z.object({
  config: BatchJobConfigSchema,
  photoPaths: z.array(PathSchema).min(1).max(10_000),
})

// ============ 提取 ============
export const ExtractSchema = z.object({
  refPath: PathSchema,
  targetSamplePath: PathSchema.optional(),
})

// ============ 水印 ============
export const WatermarkStyleSchema = z.object({
  templateId: z.string().max(64),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'bottom-center', 'full-border']),
  opacity: z.number().min(0).max(1),
  scale: z.number().min(0.1).max(3),
  color: z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
  bgColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6,8}$/)
    .optional(),
  fontFamily: z.string().max(64),
  showLogo: z.boolean(),
  logoPath: PathSchema.optional(),
  fields: z.record(z.string(), z.boolean()),
  padding: z.number().min(0).max(512),
})

export const WatermarkRenderSchema = z.object({
  photoPath: PathSchema,
  style: WatermarkStyleSchema,
})

// ============ AI ============
export const AICapabilitySchema = z.enum([
  'denoise',
  'super-resolution',
  'sky-replace',
  'inpaint',
  'recommend',
  'auto-wb',
  'portrait',
])

export const AIRunSchema = z.object({
  capability: AICapabilitySchema,
  photoPath: PathSchema,
  params: z.record(z.string(), z.unknown()).optional(),
})

// ============ 云同步 ============
export const CloudProviderSchema = z.enum([
  'icloud',
  'onedrive',
  'google-drive',
  'dropbox',
  'aliyun-drive',
  'baidu-pan',
  'tencent-cos',
  'webdav',
  's3',
])

// ============ 设置 ============
export const SettingsPatchSchema = z
  .record(z.string(), z.unknown()) // 结构多变，顶层 key 做白名单即可
  .refine(
    (obj) => {
      const allowed = [
        'general',
        'import',
        'export',
        'filter',
        'watermark',
        'ai',
        'sync',
        'shortcuts',
        'privacy',
      ]
      return Object.keys(obj).every((k) => allowed.includes(k))
    },
    { message: 'Unknown settings key' },
  )

// ============ LLM 配置（M5-LLM-A） ============

/** 提供商白名单。新增提供商必须同步更新 shared/types.ts 的 LLMProvider + adapter 实现 */
export const LLMProviderSchema = z.enum(['openrouter'])

/**
 * OpenRouter 的 model id 允许 `vendor/model[-suffix][:tag]`，
 * 例：openai/gpt-4o-mini、google/gemini-2.0-flash-exp、anthropic/claude-3.5-sonnet:beta。
 * 约束：只允许字母数字、斜杠、短横线、下划线、点、冒号；长度 ≤ 128（防 DoS）。
 */
export const LLMModelIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9._:\-/]*[a-zA-Z0-9])?$/, 'Invalid model id')

/**
 * apiKey schema：OpenRouter 实际以 `sk-or-v1-` 前缀开头，但考虑到未来提供商差异
 * 以及用户 token 形式（`sk-...` / 纯字母数字），此处只做最小防御：
 *   - 长度 16..256（防空键与超长注入）
 *   - 只允许可打印 ASCII（拒绝 CRLF 注入 HTTP 头）
 *   - 不含前后空白（前端要 trim）
 */
export const LLMApiKeySchema = z
  .string()
  .min(16)
  .max(256)
  .regex(/^[\x21-\x7E]+$/, 'apiKey contains illegal characters')
  .refine((s) => s === s.trim(), 'apiKey must be trimmed')

export const LLMConfigInputSchema = z
  .object({
    provider: LLMProviderSchema.optional(),
    model: LLMModelIdSchema.optional(),
    // null → 清空凭证；undefined → 保留原值；string → 新值（必过 LLMApiKeySchema）
    apiKey: z.union([LLMApiKeySchema, z.null()]).optional(),
    optInUploadImages: z.boolean().optional(),
  })
  .strict() // 禁止多余字段，防未来 schema 变更时前端偷偷塞进去

// ============ 对话框 ============
export const DialogSelectFilesSchema = z
  .object({
    filters: z
      .array(
        z.object({
          name: z.string().max(64),
          extensions: z.array(z.string().max(16)).max(32),
        }),
      )
      .max(8)
      .optional(),
    multi: z.boolean().optional(),
  })
  .optional()

// ============ 通道 → Schema 映射 ============
export const IPC_SCHEMAS = {
  'filter:list': null,
  'filter:get': FilterIdSchema,
  'filter:save': FilterPresetSchema,
  'filter:delete': FilterIdSchema,
  'filter:importCube': PathSchema,
  'filter:exportCube': z.tuple([FilterIdSchema, PathSchema]),

  'photo:import': z.array(PathSchema).min(1).max(10_000),
  'photo:list': null,
  'photo:readExif': PathSchema,
  'photo:thumb': z.tuple([PathSchema, z.number().int().min(64).max(4096)]),
  'photo:remove': PhotoRemoveSchema,

  'preview:render': z.tuple([PathSchema, FilterIdSchema.nullable(), FilterPipelineSchema.optional()]),

  'batch:start': z.tuple([BatchJobConfigSchema, z.array(PathSchema).min(1).max(10_000)]),
  'batch:cancel': z.string().min(1).max(64),
  'batch:status': z.string().min(1).max(64),

  'extract:fromReference': z.tuple([PathSchema, PathSchema.optional()]),

  'watermark:templates': null,
  'watermark:render': z.tuple([PathSchema, WatermarkStyleSchema]),

  'ai:listModels': null,
  'ai:downloadModel': z.string().min(1).max(128),
  'ai:run': z.tuple([AICapabilitySchema, PathSchema, z.record(z.string(), z.unknown()).optional()]),
  'ai:recommend': PathSchema,

  'trending:fetch': null,

  'sync:listAccounts': null,
  'sync:connect': CloudProviderSchema,
  'sync:now': null,

  'settings:get': null,
  'settings:update': SettingsPatchSchema,

  'llm:getConfig': null,
  'llm:setConfig': LLMConfigInputSchema,
  'llm:clearConfig': null,
  'llm:testConnection': null,

  'dialog:selectFiles': DialogSelectFilesSchema,
  'dialog:selectDir': null,
} as const

export type IpcChannelName = keyof typeof IPC_SCHEMAS
