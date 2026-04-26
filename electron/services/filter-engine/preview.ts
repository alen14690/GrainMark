/**
 * 预览渲染（GPU-only 架构，2026-04-26）
 *
 * 职责：只负责取"基准原图"的 JPEG，交给渲染进程 WebGL 实时叠加所有滤镜/调整。
 * 不再承担 CPU 滤镜烘焙——CPU 兜底路径已从产品中移除（详见下面的「架构决策」）。
 *
 * RAW 支持：对 RAW 文件先走 resolvePreviewBuffer 抽取内嵌 JPEG。UI 完全透明。
 * Orientation 修正：RAW 用 sourceOrientation 显式 rotate；非 RAW 走 .rotate() 自动。
 *
 * 返回形式：
 *   - 小图（≤ 阈值）→ `data:image/jpeg;base64,...`
 *   - 大图 → 写到 `userData/preview-cache/<hash>.jpg`，返回 `grain://preview-tmp/<file>` URL
 *
 * 架构决策（2026-04-26）：
 *   旧版本的 `filterId` / `pipelineOverride` 参数用于 CPU 兜底时主进程烘焙滤镜，
 *   但 CPU 路径单帧 1-2s，用户拖滑块时体感卡死；且任何 GPU 异常都有"真正的修复
 *   方案"（context restore / LUT skip / 提示不兼容），不需要"更慢的备胎"。
 *
 *   因此 `filterId` 保留为向后兼容的"可选参数"（ipc-schemas 未改；旧调用仍可工作
 *   但 filterId/pipelineOverride 被忽略），renderer 端的 Editor.tsx 永远传 null。
 *   下一版 ipc-schemas 升级时会彻底移除这两个参数。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { FilterPipeline } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'
import { orientationToRotationDegrees, resolvePreviewBuffer } from '../raw/index.js'
import { getPhotosTable, getPreviewCacheDir } from '../storage/init.js'

const PREVIEW_MAX_DIM = 1600
/**
 * 大于此阈值的 JPEG 走临时文件路径（避免大 data URL 在渲染进程 fetch 失败）。
 * 可通过环境变量 GRAINMARK_PREVIEW_DATAURL_MAX 注入（字节数），测试下调小用。
 */
const DEFAULT_DATA_URL_THRESHOLD = 2 * 1024 * 1024
function getDataUrlThreshold(): number {
  const env = process.env.GRAINMARK_PREVIEW_DATAURL_MAX
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_DATA_URL_THRESHOLD
}

export async function renderPreview(
  photoPath: string,
  // 兼容占位：filterId / pipelineOverride 仅为 API 向后兼容保留，内部忽略。
  //   架构决策见文件头注释。
  _filterId?: string | null,
  _pipelineOverride?: FilterPipeline,
): Promise<string> {
  // 从 photo 记录拿预先读好的 orientation，省掉 readExif 30-80ms
  // 防御：storage 未初始化（测试环境或早期启动）时 try/catch 静默降级
  let knownOrientation: number | undefined
  try {
    knownOrientation = getPhotosTable()
      .all()
      .find((p) => p.path === photoPath)?.exif?.orientation
  } catch {
    // storage 未初始化 — 走旧路径让 resolvePreviewBuffer 自己 readExif
  }

  const { buffer, sourceOrientation } = await resolvePreviewBuffer(photoPath, knownOrientation)
  const rotationDeg = sourceOrientation !== undefined ? orientationToRotationDegrees(sourceOrientation) : null

  // 用 sharp 完成旋转 + resize，输出 JPEG；不做任何滤镜（全部交 GPU）
  // 关键：rotate(deg) 显式模式不会移除 EXIF orientation tag，
  //   而渲染端 createImageBitmap 若用 'from-image' 会二次旋转导致倒挂。
  //   解法双保险：(1) 渲染端用 'none'；(2) 这里 withMetadata({ orientation: 1 }) 强制置正。
  let base = sharp(buffer, { failOn: 'none' })
  if (rotationDeg !== null && rotationDeg !== 0) {
    base = base.rotate(rotationDeg)
  } else {
    base = base.rotate() // 非 RAW：读 buffer 自带 EXIF 自动转正
  }
  const outBuffer = await base
    .resize({
      width: PREVIEW_MAX_DIM,
      height: PREVIEW_MAX_DIM,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .withMetadata({ orientation: 1 }) // 强制 EXIF orientation=1（正），防二次旋转
    .jpeg({ quality: 85 })
    .toBuffer()

  // 小图走 data URL（零 IO 开销）；大图写临时文件 + grain 协议
  if (outBuffer.length <= getDataUrlThreshold()) {
    return `data:image/jpeg;base64,${outBuffer.toString('base64')}`
  }

  // 缓存 key：源路径 + 输出字节数（GPU-only 下 filterId 与输出无关）
  const hash = crypto.createHash('md5').update(`${photoPath}:${outBuffer.length}`).digest('hex')
  const fileName = `${hash}.jpg`
  const outPath = path.join(getPreviewCacheDir(), fileName)
  try {
    fs.writeFileSync(outPath, outBuffer)
  } catch (err) {
    logger.warn('preview.cache.write.failed', {
      path: outPath,
      err: (err as Error).message,
    })
    // 写失败回退到 data URL（再大也比完全失败好）
    return `data:image/jpeg;base64,${outBuffer.toString('base64')}`
  }
  return `grain://preview-tmp/${encodeURIComponent(fileName)}`
}
