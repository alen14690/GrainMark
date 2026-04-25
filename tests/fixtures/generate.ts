/**
 * 测试 Fixture 生成器
 * - 标准色卡 (24 色 Macbeth)
 * - 渐变色测试图
 * - 肤色测试图
 * - 畸形/超大图（安全测试）
 * - 畸形 LUT
 *
 * 运行：npm run fixtures:generate
 */
import fs from 'node:fs'
import path from 'node:path'
import { exiftool } from 'exiftool-vendored'
import sharp from 'sharp'

const OUT_IMG = path.resolve('tests/fixtures/images')
const OUT_MAL = path.resolve('tests/fixtures/malicious')
const OUT_LUT = path.resolve('tests/fixtures/luts')

for (const d of [OUT_IMG, OUT_MAL, OUT_LUT]) {
  fs.mkdirSync(d, { recursive: true })
}

// ============ 标准色卡 24 色 (Macbeth) ============
// 来自公开的标准 ColorChecker sRGB 值
const MACBETH_24: Array<[number, number, number]> = [
  [115, 82, 68],
  [194, 150, 130],
  [98, 122, 157],
  [87, 108, 67],
  [133, 128, 177],
  [103, 189, 170],
  [214, 126, 44],
  [80, 91, 166],
  [193, 90, 99],
  [94, 60, 108],
  [157, 188, 64],
  [224, 163, 46],
  [56, 61, 150],
  [70, 148, 73],
  [175, 54, 60],
  [231, 199, 31],
  [187, 86, 149],
  [8, 133, 161],
  [243, 243, 242],
  [200, 200, 200],
  [160, 160, 160],
  [122, 122, 121],
  [85, 85, 85],
  [52, 52, 52],
]

async function genMacbeth24(): Promise<void> {
  const cellW = 80
  const cellH = 80
  const cols = 6
  const rows = 4
  const w = cellW * cols
  const h = cellH * rows
  const buffer = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = Math.floor(x / cellW)
      const row = Math.floor(y / cellH)
      const idx = row * cols + col
      const [r, g, b] = MACBETH_24[idx]!
      const off = (y * w + x) * 3
      buffer[off] = r!
      buffer[off + 1] = g!
      buffer[off + 2] = b!
    }
  }
  await sharp(buffer, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toFile(path.join(OUT_IMG, 'color-checker-24.png'))
}

// ============ RGB 渐变图 ============
async function genGradient(): Promise<void> {
  const w = 512
  const h = 512
  const buffer = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 3
      buffer[off] = Math.round((x / w) * 255)
      buffer[off + 1] = Math.round((y / h) * 255)
      buffer[off + 2] = Math.round(((x + y) / (w + h)) * 255)
    }
  }
  await sharp(buffer, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile(path.join(OUT_IMG, 'gradient-rgb.jpg'))
}

// ============ 肤色色块（人像场景） ============
async function genSkinTones(): Promise<void> {
  const skin = [
    [255, 219, 172],
    [241, 194, 125],
    [224, 172, 105],
    [198, 134, 66],
    [141, 85, 36],
  ]
  const cellW = 120
  const cellH = 300
  const w = cellW * skin.length
  const buffer = Buffer.alloc(w * cellH * 3)
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < w; x++) {
      const col = Math.floor(x / cellW)
      const [r, g, b] = skin[col]!
      const off = (y * w + x) * 3
      buffer[off] = r!
      buffer[off + 1] = g!
      buffer[off + 2] = b!
    }
  }
  await sharp(buffer, { raw: { width: w, height: cellH, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile(path.join(OUT_IMG, 'skin-tones-5.jpg'))
}

// ============ 含 GPS 的图（隐私测试） ============
async function genWithGps(): Promise<void> {
  const w = 200
  const h = 200
  const buffer = Buffer.alloc(w * h * 3, 128)
  const filepath = path.join(OUT_IMG, 'with-gps.jpg')
  await sharp(buffer, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 85 })
    .toFile(filepath)

  // 用 exiftool 写入 GPS（最可靠方式）
  await exiftool.write(
    filepath,
    {
      Make: 'Canon',
      Model: 'EOS R5',
      Artist: 'Test Photographer',
      GPSLatitude: 31.24327,
      GPSLongitude: 121.4735,
      GPSLatitudeRef: 'N',
      GPSLongitudeRef: 'E',
    },
    ['-overwrite_original'],
  )
}

// ============ 含完整 EXIF 的样本 ============
async function genWithFullExif(): Promise<void> {
  const w = 400
  const h = 300
  const buffer = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 3
      buffer[off] = 200 + Math.round((x / w) * 40)
      buffer[off + 1] = 120 + Math.round((x / w) * 60)
      buffer[off + 2] = 60 + Math.round((y / h) * 40)
    }
  }
  const filepath = path.join(OUT_IMG, 'full-exif.jpg')
  await sharp(buffer, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 90 })
    .toFile(filepath)

  // exiftool 精确写入（sharp 只能写 IFD0）
  await exiftool.write(
    filepath,
    {
      Make: 'Leica',
      Model: 'M11',
      Artist: 'GrainMark Test',
      Copyright: '(C) 2026 GrainMark Test',
      FNumber: 2.0,
      ExposureTime: '1/250',
      ISO: 400,
      FocalLength: 35,
      LensModel: 'Summilux-M 35mm f/1.4 ASPH',
      DateTimeOriginal: '2026:04:25 10:30:00',
    },
    ['-overwrite_original'],
  )
}

// ============ 恶意样本 ============
async function genMalicious(): Promise<void> {
  // 1. 超小「假」超大尺寸声明的 PNG（危险魔数场景占位）
  // Electron / Sharp 会正常读，只在 imageGuard 里被挡
  const oversized = Buffer.alloc(8 * 8 * 3, 255)
  await sharp(oversized, { raw: { width: 8, height: 8, channels: 3 } })
    .png()
    .toFile(path.join(OUT_MAL, 'tiny.png'))

  // 2. 扩展名欺骗：实际是纯文本但伪装成 .jpg（长度 > MIN_FILE_BYTES 才能测到 UNKNOWN_FORMAT）
  fs.writeFileSync(path.join(OUT_MAL, 'fake.jpg'), 'This is not an image at all! '.repeat(10))

  // 3. 0 字节文件
  fs.writeFileSync(path.join(OUT_MAL, 'empty.jpg'), Buffer.alloc(0))

  // 4. 畸形 JPEG 头
  fs.writeFileSync(path.join(OUT_MAL, 'malformed.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00]))
}

// ============ 畸形 LUT ============
function genMaliciousLut(): void {
  // 合法小 LUT（基线）
  const valid = [
    'TITLE "Test"',
    'LUT_3D_SIZE 2',
    'DOMAIN_MIN 0 0 0',
    'DOMAIN_MAX 1 1 1',
    '0 0 0',
    '1 0 0',
    '0 1 0',
    '1 1 0',
    '0 0 1',
    '1 0 1',
    '0 1 1',
    '1 1 1',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(OUT_LUT, 'valid.cube'), valid)

  // 畸形 - size 过大（应被拒）
  const oversized = ['LUT_3D_SIZE 256', ''].join('\n')
  fs.writeFileSync(path.join(OUT_LUT, 'oversized.cube'), oversized)

  // 畸形 - 缺 size
  fs.writeFileSync(path.join(OUT_LUT, 'no-size.cube'), '0 0 0\n')

  // 畸形 - 行数不匹配
  const mismatched = ['LUT_3D_SIZE 4', '0 0 0', ''].join('\n')
  fs.writeFileSync(path.join(OUT_LUT, 'mismatched.cube'), mismatched)
}

async function main(): Promise<void> {
  console.log('Generating fixtures...')
  await genMacbeth24()
  await genGradient()
  await genSkinTones()
  await genWithGps()
  await genWithFullExif()
  await genMalicious()
  genMaliciousLut()
  await exiftool.end()
  console.log('✓ Fixtures generated in tests/fixtures/')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
