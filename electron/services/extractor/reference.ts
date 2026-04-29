import { nanoid } from 'nanoid'
/**
 * 参考图提取滤镜 — L2 骨架
 * M5 会实现完整的：
 *   1. LAB 色彩统计迁移（Reinhard）
 *   2. 高光/阴影分区色偏提取 → colorGrading
 *   3. 反推 3D LUT（.cube）
 *   4. 颗粒频谱估计
 */
import sharp from 'sharp'
import type { FilterPreset } from '../../../shared/types.js'
import { saveFilter } from '../storage/filterStore.js'

export async function extractFilterFromReference(
  refPath: string,
  _targetSamplePath?: string,
): Promise<FilterPreset> {
  // 占位：读取参考图简单统计均值 → 生成 preset（M5 完整实现）
  const { data, info } = await sharp(refPath, { failOn: 'none' })
    .resize(256, 256, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let r = 0
  let g = 0
  let b = 0
  const px = info.width * info.height
  for (let i = 0; i < data.length; i += 3) {
    r += data[i]!
    g += data[i + 1]!
    b += data[i + 2]!
  }
  r /= px
  g /= px
  b /= px

  // 非常粗略地映射到白平衡：偏暖(r>b) → temp+
  const temp = Math.round(((r - b) / 255) * 100)
  const tint = Math.round(((g - (r + b) / 2) / 255) * 100)

  const id = `extracted-${nanoid(8)}`
  const preset: FilterPreset = {
    id,
    name: `Extracted ${new Date().toLocaleString('zh-CN')}`,
    category: 'extracted',
    author: 'User',
    version: '1.0',
    popularity: 0,
    source: 'extracted',
    description: 'M5 将实装完整的 LAB 色彩迁移 + 3D LUT 反推算法',
    tags: ['extracted'],
    pipeline: {
      whiteBalance: { temp, tint },
      tone: {
        exposure: 0,
        contrast: 5,
        highlights: -10,
        shadows: 10,
        whites: 0,
        blacks: 0,
      },
      saturation: 0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  await saveFilter(preset)
  return preset
}
