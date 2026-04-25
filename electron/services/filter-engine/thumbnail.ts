import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { resolvePreviewBuffer } from '../raw/index.js'
import { getThumbsDir } from '../storage/init.js'

/**
 * 生成缩略图，返回本地绝对路径。
 *
 * 对 RAW 文件：先经 resolvePreviewBuffer 抽取内嵌 JPEG（带缓存），再交给 sharp 做缩放；
 * 对其它格式：直接读文件字节流喂 sharp（与旧行为等价）。
 * 魔数守卫已在 photoStore.importPhotos 上游做过。
 */
export async function makeThumbnail(filePath: string, size: number): Promise<string> {
  const hash = crypto.createHash('md5').update(`${filePath}:${size}`).digest('hex')
  const outPath = path.join(getThumbsDir(), `${hash}.jpg`)
  if (fs.existsSync(outPath)) return outPath

  const { buffer } = await resolvePreviewBuffer(filePath)

  await sharp(buffer, { failOn: 'none' })
    .rotate() // 按 EXIF 方向
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(outPath)

  return outPath
}
