/**
 * Point-and-Shoot Stamp · 傻瓜相机日期戳 SVG 生成器(阶段 3 · 2026-05-01)
 *
 * 设计(artifact/design/frame-system-2026-05-01.md · 组 B4):
 *   - 图片**零边框**,只在右下角 overlay 一枚橙红色 8-bit 点阵日期戳
 *   - 致敬 80-90 年代傻瓜相机(Konica Big Mini / Olympus µ / Nikon AF)的
 *     LCD 日期压印功能
 *   - Courier Bold + 橙红 dateStampOrange + 发光描边(stroke)模拟 LCD 余晖
 *   - 大小 `minEdge * 0.03`(约 120px @ 4000 短边)
 *
 * 与 Hairline 的区别:
 *   - Hairline:四周线框 + 右下角小参数(画廊感)
 *   - Point-and-Shoot Stamp:完全无边框 + 大号橙红日期(80 年代低俗怀旧感)
 *   - Stamp 字号比 Hairline 大 2 倍(3% vs 1.4%),视觉冲击
 *
 * 实现:
 *   - slot.area='overlay',走 slotPlacement 通用渲染(复用)
 *   - 额外加 stroke="...50%透明橙" 做"发光"效果 —— SVG 原生支持 stroke+fill 同时绘制
 *   - 若 EXIF 无 dateTimeOriginal,退回"YYYY' DD" 格式的占位(老相机用户习惯)
 */
import { COLOR, scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameSvgGenerator } from '../composite.js'
import { escSvgText } from '../typography.js'

/** 无 EXIF 日期时的占位戳 —— "'98 11 24" 这种复古格式,取当前日期 */
function buildFallbackStamp(): string {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `'${yy} ${mm} ${dd}`
}

export const generatePointAndShootStamp: FrameSvgGenerator = ({ geometry, dateLine, style }) => {
  const { canvasW, canvasH, imgOffsetX, imgOffsetY, imgW, imgH, layout } = geometry
  const bgFill = escSvgText(layout.backgroundColor)

  const dateSlot = layout.slots.find((s) => s.id === 'date')
  // 本风格只用 date slot —— 如果 registry 里忘了定义会直接退化为"只有背景"(诊断靠 integrity 测试)
  if (!dateSlot) {
    // 不抛错,容忍降级 —— 给出"无日期"的空 canvas(带背景色)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} (no date slot) -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
</svg>`
  }

  // 日期文本:优先 EXIF dateTimeOriginal,空时用当前日期的复古占位
  // dateLine 来自 composite 的 `overrides.showFields.dateTime ? exif.dateTimeOriginal : ''`
  // 空字符串意味着用户显式关闭了日期 —— 应当尊重,不强制填占位(走"关闭 = 只有空 canvas"的退化路径)
  const showStamp = dateLine !== ''
  const stampText = dateLine || buildFallbackStamp()

  const fontPx = scaleByMinEdge(dateSlot.fontSize, imgW, imgH)
  // overlay 区:以原图为 anchor 框(走 slotPlacement overlay 分支的同样算法)
  const x = imgOffsetX + Math.round(dateSlot.anchor.x * imgW)
  const y = imgOffsetY + Math.round(dateSlot.anchor.y * imgH + fontPx * 0.35)
  const color = escSvgText(dateSlot.colorOverride ?? COLOR.dateStampOrange)
  // 发光:加一层半透明橙红 stroke,SVG 支持 stroke 在 text 上做外描边
  const glowColor = escSvgText(COLOR.dateStampOrange)
  const strokeWidth = Math.max(Math.round(fontPx * 0.04), 1)

  // overlay 文字:两遍叠 —— 先画"发光底"(stroke 粗 + 半透明),再画"实字"
  //   1) 底:stroke="橙" stroke-width=3px opacity=0.5 fill=none → 模拟 LCD 余晖
  //   2) 面:fill=橙 stroke=none → 实字本体
  // 注意:SVG 的 <text> 若同时设 stroke + fill 会同时绘 —— 但顺序上 stroke 先画容易变糊,
  //   所以用两个 <text> 叠加获得更干净的发光轮廓
  const glowText = `<text x="${x}" y="${y}" font-family="'Courier New', Courier, monospace" font-size="${fontPx}" fill="none" stroke="${glowColor}" stroke-width="${strokeWidth}" opacity="0.45" text-anchor="end" font-weight="bold">${escSvgText(stampText)}</text>`
  const coreText = `<text x="${x}" y="${y}" font-family="'Courier New', Courier, monospace" font-size="${fontPx}" fill="${color}" text-anchor="end" font-weight="bold">${escSvgText(stampText)}</text>`

  const dateParts = showStamp ? [glowText, coreText] : []

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} showStamp=${showStamp} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
  ${dateParts.join('\n  ')}
</svg>`
}
