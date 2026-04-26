/**
 * 预览渲染（GPU-only 架构，2026-04-26）
 *
 * 职责：只负责取"基准原图"的 JPEG，交给渲染进程 WebGL 实时叠加所有滤镜/调整。
 * 不再承担 CPU 滤镜烘焙——CPU 兜底路径已从产品中移除（详见下面的「架构决策」）。
 *
 * RAW 支持：对 RAW 文件先走 resolvePreviewBuffer 抽取内嵌 JPEG。UI 完全透明。
 * Orientation 修正：统一用 sharp.rotate() 无参数模式（读 buffer 内的 EXIF 自动转正）。
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
import { resolvePreviewBuffer } from '../raw/index.js'
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

  const { buffer } = await resolvePreviewBuffer(photoPath, knownOrientation)

  // 用 sharp 完成旋转 + resize，输出 JPEG；不做任何滤镜（全部交 GPU）
  //
  // orientation 处理策略（2026-04-27 二次修复）：
  //   - RAW 的 sourceOrientation 来自 RAW 文件头 EXIF，描述的是**传感器数据**的方向
  //   - 但 extractEmbeddedJpeg 提取的内嵌 JPEG 通常已经被相机固件物理旋转过了（Sony ARW 尤甚）
  //   - 如果再对内嵌 JPEG 做 rotate(270) 就变成二次旋转 → 照片倒挂
  //   - 正确做法：**统一用 sharp.rotate() 无参数模式**，让 sharp 自己读 buffer 内的 EXIF
  //     - 如果内嵌 JPEG 带 EXIF orientation tag → sharp 读到并物理旋转 + 移除 tag
  //     - 如果内嵌 JPEG 已经是正向（orientation=1 或无 tag）→ sharp 不做任何旋转
  //   - 这种方式对 RAW 和非 RAW 都安全、统一
  const base = sharp(buffer, { failOn: 'none' }).rotate()
  const outBuffer = await base
    .resize({
      width: PREVIEW_MAX_DIM,
      height: PREVIEW_MAX_DIM,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .withMetadata({ orientation: 1 }) // 强制 EXIF orientation=1（正），防任何下游二次旋转
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
