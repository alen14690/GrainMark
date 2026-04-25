/**
 * namingTemplate —— 批处理输出文件命名模板解析
 *
 * 支持变量：
 *   {name}     原文件名（不含扩展名）
 *   {filter}   滤镜 id / 名称
 *   {date}     YYYYMMDD
 *   {time}     HHmmss
 *   {datetime} YYYYMMDDHHmmss
 *   {model}    相机型号（若 EXIF 无则 "unknown"）
 *   {iso}      ISO 值（若 EXIF 无则 "0"）
 *   {ext}      目标扩展名（如 jpg）
 *   {index}    批处理内序号（4 位零填充，从 1 开始）
 *
 * 安全约束：
 * - 清除 / \ : * ? " < > | 等非法路径字符，统一替换为 "-"
 * - 避免连续分隔符
 * - 限制最大文件名长度 200（给路径余量，多数 FS 限 255）
 * - 不允许 ".." 出现（防路径穿越）
 */

export interface NamingContext {
  /** 原文件 basename（无扩展名） */
  name: string
  /** 滤镜 id / 名称；无滤镜传 "original" */
  filter: string
  /** 批处理开始时的时间戳（所有 item 共享同一 date/time） */
  timestamp: number
  /** EXIF 相机型号 */
  model?: string
  /** EXIF ISO */
  iso?: number
  /** 目标扩展名（不带点） */
  ext: string
  /** 批处理内序号（从 1 开始） */
  index: number
}

/** 路径非法字符替换表（Windows + macOS + Linux 交集） */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 有意匹配控制字符以清除它们
const ILLEGAL_CHARS = /[\\/:*?"<>|\x00-\x1f]/g

/**
 * 清洗文件名：
 * - 去除非法字符
 * - 合并连续 "-"
 * - 去掉首尾 "-" / "."（防 hidden file）
 * - 移除所有 ".." 防穿越
 */
export function sanitizeFilename(raw: string): string {
  const stripped = raw
    .replace(/\.\./g, '-')
    .replace(ILLEGAL_CHARS, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return stripped.length === 0 ? 'unnamed' : stripped
}

/** 格式化时间戳 → YYYYMMDD / HHmmss */
function fmtDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}
function fmtTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}${m}${s}`
}

/**
 * 模板渲染：`{name}_{filter}` → `DSC1234_portra` → 加扩展名
 * 最终长度超过 200 会从后向前截断 name 字段
 */
export function renderNamingTemplate(template: string, ctx: NamingContext): string {
  const vars: Record<string, string> = {
    name: ctx.name,
    filter: ctx.filter,
    date: fmtDate(ctx.timestamp),
    time: fmtTime(ctx.timestamp),
    datetime: fmtDate(ctx.timestamp) + fmtTime(ctx.timestamp),
    model: ctx.model ?? 'unknown',
    iso: String(ctx.iso ?? 0),
    index: String(ctx.index).padStart(4, '0'),
    ext: ctx.ext,
  }

  let body = template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`)
  body = sanitizeFilename(body)
  // 扩展名加在最后（若模板里没 {ext}）
  if (!template.includes('{ext}')) {
    body = `${body}.${ctx.ext}`
  }
  // 长度限制
  const MAX = 200
  if (body.length > MAX) {
    const extPart = `.${ctx.ext}`
    const headBudget = MAX - extPart.length
    body = body.slice(0, headBudget) + extPart
  }
  return body
}

/**
 * 冲突解决：若输出目录下同名已存在，追加 _1 / _2 / ...
 * `exists` 由调用方注入（允许测试替换为内存 mock）
 */
export function resolveConflict(
  filename: string,
  exists: (name: string) => boolean,
  maxSuffix = 9999,
): string {
  if (!exists(filename)) return filename
  const dotIdx = filename.lastIndexOf('.')
  const stem = dotIdx > 0 ? filename.slice(0, dotIdx) : filename
  const ext = dotIdx > 0 ? filename.slice(dotIdx) : ''
  for (let i = 1; i <= maxSuffix; i++) {
    const candidate = `${stem}_${i}${ext}`
    if (!exists(candidate)) return candidate
  }
  // 极端情况：全部被占 → 加时间戳
  return `${stem}_${Date.now()}${ext}`
}
