/**
 * frame-brands — 边框系统支持的相机品牌定义(两端共享)
 *
 * 用途:
 *   - Logo 上传/管理按品牌分组
 *   - 渲染时按 EXIF make 自动匹配品牌 → 查找对应 Logo
 *   - UI 按 BRAND_LIST 顺序展示品牌 Logo 上传位
 *
 * 排序:用户指定 Leica 第一 · 其余按高端→专业→消费级排列
 */

export interface CameraBrand {
  /** 内部标识(文件名/key) */
  id: string
  /** 显示名 */
  name: string
  /**
   * EXIF make 匹配关键词(不区分大小写)
   * 一个品牌可能有多种 make 写法(如 FUJIFILM / FUJI PHOTO FILM)
   */
  makePatterns: string[]
}

/**
 * 支持的相机品牌列表(按展示顺序)
 *
 * Leica 第一(用户指定) · 其余按高端→专业→消费级排列
 */
export const CAMERA_BRANDS: readonly CameraBrand[] = [
  { id: 'leica', name: 'Leica', makePatterns: ['leica'] },
  { id: 'hasselblad', name: 'Hasselblad', makePatterns: ['hasselblad'] },
  { id: 'sony', name: 'Sony', makePatterns: ['sony'] },
  { id: 'canon', name: 'Canon', makePatterns: ['canon'] },
  { id: 'nikon', name: 'Nikon', makePatterns: ['nikon', 'nikon corporation'] },
  { id: 'fujifilm', name: 'Fujifilm', makePatterns: ['fujifilm', 'fuji photo film', 'fuji'] },
  { id: 'panasonic', name: 'Panasonic', makePatterns: ['panasonic'] },
  {
    id: 'olympus',
    name: 'Olympus / OM System',
    makePatterns: ['olympus', 'om digital solutions', 'om system'],
  },
  { id: 'ricoh', name: 'Ricoh / GR', makePatterns: ['ricoh', 'pentax', 'ricoh imaging'] },
  { id: 'sigma', name: 'Sigma', makePatterns: ['sigma'] },
  { id: 'dji', name: 'DJI', makePatterns: ['dji'] },
  { id: 'apple', name: 'Apple', makePatterns: ['apple'] },
] as const

/**
 * 根据 EXIF make 字段匹配品牌 ID
 *
 * @returns 匹配到的 brandId · 未匹配返回 null
 */
export function matchBrandByMake(make: string | undefined | null): string | null {
  if (!make) return null
  const lower = make.toLowerCase().trim()
  for (const brand of CAMERA_BRANDS) {
    if (brand.makePatterns.some((p) => lower.includes(p))) {
      return brand.id
    }
  }
  return null
}
