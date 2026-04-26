/**
 * renderPreview + dispatchGpuTask 级别的输出形态测试
 *
 * 验证 Bug 2 的修复：
 *   - 小 JPEG 输出（≤ 2MB）走 data URL（与旧行为兼容）
 *   - 大 JPEG 输出（> 2MB）走 grain://preview-tmp/... 文件路径
 *     （Chromium 渲染进程 fetch 大 data URL 偶发失败的规避）
 *
 * 设计：mock resolvePreviewBuffer 返回预构造的 sharp 可处理 buffer，
 *       renderPreview 内部会用 sharp.resize(PREVIEW_MAX_DIM) 压下来，
 *       因此我们通过控制"输入图像实际尺寸 + 内容"来逼出不同输出大小
 */
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-preview-'))

vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => tmpRoot,
    getName: () => 'GrainMark',
  },
}))

const hoisted = vi.hoisted(() => ({
  resolveSpy:
    vi.fn<(file: string) => Promise<{ buffer: Buffer; source: string; sourceOrientation?: number }>>(),
}))

vi.mock('../../electron/services/raw/index', async () => {
  const actual = await vi.importActual<typeof import('../../electron/services/raw/index')>(
    '../../electron/services/raw/index',
  )
  return {
    ...actual,
    resolvePreviewBuffer: hoisted.resolveSpy,
  }
})

// filterStore 读盘依赖 app.getPath()，mock 成空实现
vi.mock('../../electron/services/storage/filterStore', () => ({
  getFilter: vi.fn(() => null),
}))

// 构造「压到 1600 长边后 JPEG 输出 > 2MB」的高熵图。
// 关键：PREVIEW_MAX_DIM=1600 内部 resize，所以必须让输出的 1600×1200 本身
// 无法被 JPEG 高效压缩。真随机噪声 + 不相关三通道 → mozjpeg 无法利用相邻相关性，
// q=85 下通常能做到 ~200KB/万像素 → 1600×1200 ≈ 192 万像素 → 预期 ≈ 3-4MB
async function makeLargeInput(): Promise<Buffer> {
  const w = 1800 // 略大于 PREVIEW_MAX_DIM 避免被放大但也避免过大
  const h = 1400
  const pixels = new Uint8Array(w * h * 3)
  // 每通道独立随机，使像素间无空间 / 通道相关性
  for (let i = 0; i < pixels.length; i++) {
    // LCG 伪随机（不是加密级但足够非相关）
    pixels[i] = (Math.imul(i + 1, 2654435761) ^ Math.imul(i, 40503)) & 0xff
  }
  return await sharp(Buffer.from(pixels.buffer), { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer()
}

// 构造小输入（纯灰 400×400，压缩后 < 5KB）
async function makeSmallInput(): Promise<Buffer> {
  return await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 80, g: 80, b: 80 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer()
}

describe('renderPreview 输出形态', () => {
  beforeEach(() => {
    hoisted.resolveSpy.mockReset()
    // 调低阈值到 50KB，小的测试输入也能触发文件路径分支
    process.env.GRAINMARK_PREVIEW_DATAURL_MAX = String(50 * 1024)
  })
  afterEach(() => {
    process.env.GRAINMARK_PREVIEW_DATAURL_MAX = undefined
    // 清 preview-cache 目录避免单测互相污染
    const dir = path.join(tmpRoot, 'preview-cache')
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        try {
          fs.unlinkSync(path.join(dir, f))
        } catch {
          // ignore
        }
      }
    }
  })

  it('小图输出 → data URL（保持旧行为）', async () => {
    // 本用例：临时把阈值调回默认（2MB）确保小输入走 data URL
    process.env.GRAINMARK_PREVIEW_DATAURL_MAX = String(2 * 1024 * 1024)
    const small = await makeSmallInput()
    hoisted.resolveSpy.mockResolvedValue({ buffer: small, source: 'passthrough' })

    const { renderPreview } = await import('../../electron/services/filter-engine/preview')
    const url = await renderPreview('/fake/small.jpg', null)

    expect(url).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('大图输出 → grain://preview-tmp/<file>', async () => {
    // beforeEach 已把阈值调到 50KB，任何彩色图都会超过
    const large = await makeLargeInput()
    hoisted.resolveSpy.mockResolvedValue({ buffer: large, source: 'passthrough' })

    const { renderPreview } = await import('../../electron/services/filter-engine/preview')
    const url = await renderPreview('/fake/large.jpg', null)

    expect(url).toMatch(/^grain:\/\/preview-tmp\/[a-f0-9]+\.jpg$/)
    // 实际文件应落在 preview-cache 下
    const fileName = url.split('/').pop()!
    const filePath = path.join(tmpRoot, 'preview-cache', decodeURIComponent(fileName))
    expect(fs.existsSync(filePath)).toBe(true)
    // 且尺寸合理（非空）
    expect(fs.statSync(filePath).size).toBeGreaterThan(10 * 1024)
  })

  it('相同输入 → 相同 grain URL（哈希稳定）', async () => {
    const large = await makeLargeInput()
    hoisted.resolveSpy.mockResolvedValue({ buffer: large, source: 'passthrough' })

    const { renderPreview } = await import('../../electron/services/filter-engine/preview')
    const url1 = await renderPreview('/fake/same.jpg', null)
    const url2 = await renderPreview('/fake/same.jpg', null)

    expect(url1).toBe(url2)
    // 都必须是 grain 形式（因为阈值低）
    expect(url1).toMatch(/^grain:\/\/preview-tmp\//)
  })

  it('RAW 含 sourceOrientation=6 → 输出已旋正，高度方向正确', async () => {
    // 本用例：也调回默认阈值，确保小旋转图走 data URL 好解析
    process.env.GRAINMARK_PREVIEW_DATAURL_MAX = String(2 * 1024 * 1024)
    // 构造"传感器横着但 orientation=6"的小 RAW 缓冲：900×600 彩色渐变
    const hPixels = new Uint8Array(900 * 600 * 3)
    for (let i = 0; i < hPixels.length; i += 3) {
      hPixels[i] = (i / (900 * 600 * 3)) * 255
      hPixels[i + 1] = 100
      hPixels[i + 2] = 180
    }
    const rawLikeJpeg = await sharp(Buffer.from(hPixels.buffer), {
      raw: { width: 900, height: 600, channels: 3 },
    })
      .jpeg({ quality: 90 })
      .toBuffer()

    hoisted.resolveSpy.mockResolvedValue({
      buffer: rawLikeJpeg,
      source: 'raw-extracted',
      sourceOrientation: 6, // 需顺时针 90°
    })

    const { renderPreview } = await import('../../electron/services/filter-engine/preview')
    const url = await renderPreview('/fake/raw.nef', null)

    // 解析 URL → 读实际像素，校验已旋转（high > wide）
    let imgBuffer: Buffer
    if (url.startsWith('data:image/jpeg;base64,')) {
      imgBuffer = Buffer.from(url.slice('data:image/jpeg;base64,'.length), 'base64')
    } else {
      const fileName = decodeURIComponent(url.split('/').pop()!)
      imgBuffer = fs.readFileSync(path.join(tmpRoot, 'preview-cache', fileName))
    }
    const meta = await sharp(imgBuffer).metadata()
    // 原 900×600（横），旋转 90° 后应为 600×900（竖）
    // 经 PREVIEW_MAX_DIM=1600 resize/inside 不放大 → 仍应是 600×900
    expect(meta.width).toBe(600)
    expect(meta.height).toBe(900)
  })

  it('GPU-only 契约：pipelineOverride 被忽略（不再烘焙 CPU pipeline）', async () => {
    // 2026-04-26 架构决策：CPU 兜底路径已删除。preview:render 只负责取"基准原图"，
    // 所有滤镜 / 调整由渲染进程 WebGL 实时应用。为了向后兼容 IPC schema 中 pipelineOverride
    // 参数仍保留，但 renderPreview 内部会忽略它。
    //
    // 本契约测试：即使调用方传了 tone.exposure=+2 的 override，输出亮度也必须与 base 基本一致。
    // 若某日有人"复活"CPU 烘焙路径，本测试会立即红 —— 这是架构守门员。
    const gray = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer()
    hoisted.resolveSpy.mockResolvedValue({ buffer: gray, source: 'passthrough' })
    process.env.GRAINMARK_PREVIEW_DATAURL_MAX = String(10 * 1024 * 1024)

    const { renderPreview } = await import('../../electron/services/filter-engine/preview')

    const base = await renderPreview('/fake/gray.jpg', null)
    const baseMeta = await sharp(Buffer.from(base.slice(23), 'base64')).stats()

    // 带 exposure=+2 的 override：**不应该**影响输出（被忽略）
    const withOverride = await renderPreview('/fake/gray.jpg', null, {
      tone: {
        exposure: 2,
        contrast: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
      },
    })
    const overrideMeta = await sharp(Buffer.from(withOverride.slice(23), 'base64')).stats()

    // 两者差异应在 JPEG 重编码抖动范围内（< 5）
    expect(Math.abs(overrideMeta.channels[0].mean - baseMeta.channels[0].mean)).toBeLessThan(5)
  })

  it('GPU-only 契约：filterId 也被忽略（不再从 preset 烘焙）', async () => {
    const gray = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer()
    hoisted.resolveSpy.mockResolvedValue({ buffer: gray, source: 'passthrough' })
    process.env.GRAINMARK_PREVIEW_DATAURL_MAX = String(10 * 1024 * 1024)

    const { renderPreview } = await import('../../electron/services/filter-engine/preview')

    // 传 filterId（即便对应 preset 存在也不烘焙）
    const out = await renderPreview('/fake/gray.jpg', 'any-filter-id')
    const meta = await sharp(Buffer.from(out.slice(23), 'base64')).stats()
    // 灰色输入原地返回（128 ± JPEG 重编码）
    expect(meta.channels[0].mean).toBeGreaterThan(120)
    expect(meta.channels[0].mean).toBeLessThan(135)
  })
})
