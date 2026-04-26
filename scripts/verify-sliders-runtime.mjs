#!/usr/bin/env node
/**
 * verify-sliders-runtime.mjs
 *
 * 诊断脚本：按用户反馈"除了亮度外其他滑块不生效"，从 GPU shader 源码 1:1 翻译数学，
 * 跑在 Node 里，针对典型输入像素，输出每个滑块在常用档位（+50 / +100）下的可见变化。
 *
 * 说明：这不是正式测试——是诊断用脚本。目的是**用数据说话**，判断到底是
 *   (a) 滑块响应太弱以致用户感觉不到变化；还是
 *   (b) 某条链路真的断了。
 */

// ============ tone shader 1:1 翻译 ============
const LUMA = [0.2126, 0.7152, 0.0722]
const luma = (c) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
// 保留此辅助（老 shader 曾使用的非线性响应）以便做对照实验。
// 当前 shader 已改为线性响应；如需重跑旧版对比，把 applyTone 内的计算套上 _curve 即可。
const _curve = (x) => Math.sign(x) * Math.abs(x) ** 1.6

function applyTone(rgb, params) {
  // normalizeToneParams: UI 值 exposure 直接传（-5..5 EV），其他 /100
  const u_exposure = Math.max(-5, Math.min(5, params.exposure ?? 0))
  const u_contrast = Math.max(-1, Math.min(1, (params.contrast ?? 0) / 100))
  const u_highlights = Math.max(-1, Math.min(1, (params.highlights ?? 0) / 100))
  const u_shadows = Math.max(-1, Math.min(1, (params.shadows ?? 0) / 100))
  const u_whites = Math.max(-1, Math.min(1, (params.whites ?? 0) / 100))
  const u_blacks = Math.max(-1, Math.min(1, (params.blacks ?? 0) / 100))

  let c = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]

  // exposure
  const expMul = 2 ** u_exposure
  c = c.map((x) => x * expMul)

  // contrast（基于 luma，保持色相）—— 线性响应（M4.5 前置整改移除 curve）
  const L0 = luma(c)
  const lumaAdj = clamp01((L0 - 0.5) * (1 + u_contrast) + 0.5)
  const scale = lumaAdj / Math.max(L0, 1e-4)
  c = c.map((x) => x * scale)

  // highlights: smoothstep(0.35, 0.85, luma)，系数 0.55
  const L1 = luma(c)
  const hlMask = smoothstep(0.35, 0.85, L1)
  const hlFactor = 1 + u_highlights * 0.55 * hlMask
  c = c.map((x) => x * hlFactor)

  // shadows: 1 - smoothstep(0.15, 0.65, luma)，系数 0.65
  const shMask = 1 - smoothstep(0.15, 0.65, luma(c))
  const shFactor = 1 + u_shadows * 0.65 * shMask
  c = c.map((x) => x * shFactor)

  // whites: smoothstep(0.60, 0.98, luma)，系数 0.55
  const L2 = luma(c)
  const whiteMask = smoothstep(0.6, 0.98, L2)
  const whiteFactor = 1 + u_whites * 0.55
  c = c.map((x) => x * (1 - whiteMask) + x * whiteFactor * whiteMask)

  // blacks: 1 - smoothstep(0.02, 0.40, luma)，系数 0.65
  const blackMask = 1 - smoothstep(0.02, 0.4, luma(c))
  const blackFactor = 1 + u_blacks * 0.65
  c = c.map((x) => x * (1 - blackMask) + x * blackFactor * blackMask)

  return c.map((x) => Math.round(clamp01(x) * 255))
}

// ============ whiteBalance shader 1:1 翻译（M4.5 移除 curve）============
function applyWB(rgb, params) {
  const t = Math.max(-1, Math.min(1, (params.temp ?? 0) / 100))
  const n = Math.max(-1, Math.min(1, (params.tint ?? 0) / 100))
  const c = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
  c[0] *= 1 + t * 0.3
  c[2] *= 1 - t * 0.3
  c[1] *= 1 - n * 0.3
  c[0] *= 1 + n * 0.1
  c[2] *= 1 + n * 0.1
  return c.map((x) => Math.round(clamp01(x) * 255))
}

// ============ adjustments shader 1:1 翻译（clarity/saturation/vibrance） ============
function applyAdjustments(rgb, params) {
  const u_saturation = Math.max(-1, Math.min(1, (params.saturation ?? 0) / 100))
  const u_vibrance = Math.max(-1, Math.min(1, (params.vibrance ?? 0) / 100))
  // 注意：clarity 依赖相邻像素（unsharp mask），单像素无法验证——略过
  let c = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
  const gray = luma(c)
  if (Math.abs(u_saturation) > 1e-4) {
    // mix(vec3(gray), c, 1+u_saturation) = gray + (c-gray)*(1+u_saturation)
    c = c.map((x) => gray + (x - gray) * (1 + u_saturation))
  }
  if (Math.abs(u_vibrance) > 1e-4) {
    const maxC = Math.max(...c)
    const minC = Math.min(...c)
    const curSat = maxC - minC
    const factor = u_vibrance * (1 - smoothstep(0.1, 0.6, curSat))
    c = c.map((x) => gray + (x - gray) * (1 + factor))
  }
  return c.map((x) => Math.round(clamp01(x) * 255))
}

// ============ vignette shader 1:1 翻译（单像素版，取中心半径外一点） ============
// 简化版：只验证"非零 amount 是否产生变化"。实际 shader 复杂，这里只给 feel-check。

// ============ 测试矩阵 ============
const TEST_PIXELS = [
  { name: '纯中灰 (128,128,128)', rgb: [128, 128, 128] },
  { name: '暗部 (50,50,50)', rgb: [50, 50, 50] },
  { name: '高光 (220,220,220)', rgb: [220, 220, 220] },
  { name: '中红 (200,80,80)', rgb: [200, 80, 80] },
  { name: '中绿 (80,180,80)', rgb: [80, 180, 80] },
]

function diff(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

function fmt(rgb) {
  return `(${rgb[0].toString().padStart(3)},${rgb[1].toString().padStart(3)},${rgb[2].toString().padStart(3)})`
}

console.log('\n========== 滑块响应诊断（从 GPU shader 源码 1:1 翻译） ==========\n')
console.log('约定：显示"输入 → 输出 (Δ)"。Δ 是 RGB 三通道最大差值。\n')
console.log('视觉门槛参考：Δ<2 几乎不可见 · Δ=5~10 可感知 · Δ>=20 明显 · Δ>=50 强烈\n')

const CASES = [
  // Tone
  { group: 'Tone', name: '曝光 +1 EV', fn: (p) => applyTone(p, { exposure: 1 }) },
  { group: 'Tone', name: '曝光 +2 EV', fn: (p) => applyTone(p, { exposure: 2 }) },
  { group: 'Tone', name: '对比度 +50', fn: (p) => applyTone(p, { contrast: 50 }) },
  { group: 'Tone', name: '对比度 +100', fn: (p) => applyTone(p, { contrast: 100 }) },
  { group: 'Tone', name: '高光 +50', fn: (p) => applyTone(p, { highlights: 50 }) },
  { group: 'Tone', name: '高光 +100', fn: (p) => applyTone(p, { highlights: 100 }) },
  { group: 'Tone', name: '高光 -100', fn: (p) => applyTone(p, { highlights: -100 }) },
  { group: 'Tone', name: '阴影 +50', fn: (p) => applyTone(p, { shadows: 50 }) },
  { group: 'Tone', name: '阴影 +100', fn: (p) => applyTone(p, { shadows: 100 }) },
  { group: 'Tone', name: '白色 +100', fn: (p) => applyTone(p, { whites: 100 }) },
  { group: 'Tone', name: '黑色 -100', fn: (p) => applyTone(p, { blacks: -100 }) },
  // WB
  { group: 'WB', name: '色温 +50', fn: (p) => applyWB(p, { temp: 50 }) },
  { group: 'WB', name: '色温 +100', fn: (p) => applyWB(p, { temp: 100 }) },
  { group: 'WB', name: '色调 +100', fn: (p) => applyWB(p, { tint: 100 }) },
  // Presence
  { group: 'Presence', name: '饱和度 +50', fn: (p) => applyAdjustments(p, { saturation: 50 }) },
  { group: 'Presence', name: '饱和度 +100', fn: (p) => applyAdjustments(p, { saturation: 100 }) },
  { group: 'Presence', name: '自然饱和度 +100', fn: (p) => applyAdjustments(p, { vibrance: 100 }) },
]

let currentGroup = null
for (const c of CASES) {
  if (c.group !== currentGroup) {
    currentGroup = c.group
    console.log(`\n--- ${currentGroup} ---`)
  }
  console.log(`\n${c.name}:`)
  for (const tp of TEST_PIXELS) {
    const out = c.fn(tp.rgb)
    const d = diff(tp.rgb, out)
    const tag = d < 2 ? '❌不可见' : d < 10 ? '⚠️弱' : d < 30 ? '✓正常' : '✓明显'
    console.log(
      `  ${tp.name.padEnd(22)}  ${fmt(tp.rgb)} → ${fmt(out)}  Δ=${d.toString().padStart(3)}  ${tag}`,
    )
  }
}

console.log('\n\n========== 结论提示 ==========')
console.log('若大量 ❌/⚠️ 出现在中等档位（+50），说明滑块响应曲线过弱 → 用户感受不到变化')
console.log('若同一滑块在所有像素上 Δ=0，说明该滑块 pipeline 真的断了（需排查 shader/uniform）\n')
