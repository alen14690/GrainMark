import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { getThumbsDir } from '../storage/init.js'

/** 生成缩略图，返回本地绝对路径 */
export async function makeThumbnail(filePath: string, size: number): Promise<string> {
  const hash = crypto.createHash('md5').update(`${filePath}:${size}`).digest('hex')
  const outPath = path.join(getThumbsDir(), `${hash}.jpg`)
  if (fs.existsSync(outPath)) return outPath

  await sharp(filePath, { failOn: 'none' })
    .rotate() // 按 EXIF 方向
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(outPath)

  return outPath
}
