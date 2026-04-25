import { exiftool } from 'exiftool-vendored'
import type { PhotoExif } from '../../../shared/types.js'

const MAX_STR_LEN = 1024

function clampStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v)
  return s.length > MAX_STR_LEN ? s.slice(0, MAX_STR_LEN) : s
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') {
    const m = v.match(/-?\d+(?:\.\d+)?/)
    if (!m) return undefined
    const n = Number(m[0])
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function formatShutter(exposure: unknown): string | undefined {
  if (exposure === null || exposure === undefined) return undefined
  // exiftool-vendored 可能返回字符串形式的分数 "1/250"，也可能返回数值秒
  if (typeof exposure === 'string') {
    // 已是分数形式或带单位的字符串
    const fracMatch = exposure.match(/^(\d+)\s*\/\s*(\d+)$/)
    if (fracMatch) {
      const num = Number(fracMatch[1])
      const den = Number(fracMatch[2])
      if (den > 0 && num > 0) {
        return num === 1 ? `1/${den}` : `${num}/${den}`
      }
    }
    const asNum = Number(exposure)
    if (Number.isFinite(asNum)) return formatShutterNumeric(asNum)
    return undefined
  }
  if (typeof exposure === 'number') return formatShutterNumeric(exposure)
  return undefined
}

function formatShutterNumeric(e: number): string | undefined {
  if (!Number.isFinite(e) || e <= 0) return undefined
  if (e >= 1) return `${e}s`
  const denom = Math.round(1 / e)
  return `1/${denom}`
}

/**
 * 读取 EXIF
 * 安全加固：
 *   - 字符串字段长度 ≤ 1KB
 *   - 单文件读取超时 5s
 */
export async function readExif(filePath: string): Promise<PhotoExif> {
  try {
    const tags = await Promise.race([
      exiftool.read(filePath),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('EXIF read timeout')), 5000)),
    ])

    return {
      make: clampStr(tags.Make),
      model: clampStr(tags.Model),
      lensModel: clampStr(tags.LensModel ?? tags.Lens ?? tags.LensID),
      fNumber: toNum(tags.FNumber),
      exposureTime: formatShutter(tags.ExposureTime),
      iso: toNum(tags.ISO),
      focalLength: toNum(tags.FocalLength),
      dateTimeOriginal: clampStr(tags.DateTimeOriginal),
      gpsLatitude: toNum(tags.GPSLatitude),
      gpsLongitude: toNum(tags.GPSLongitude),
      artist: clampStr(tags.Artist),
      copyright: clampStr(tags.Copyright),
      width: toNum(tags.ImageWidth ?? tags.ExifImageWidth),
      height: toNum(tags.ImageHeight ?? tags.ExifImageHeight),
      orientation: toNum(tags.Orientation),
    }
  } catch (err) {
    console.error('[exif] read failed:', (err as Error).message)
    return {}
  }
}

export async function shutdownExiftool(): Promise<void> {
  await exiftool.end()
}
