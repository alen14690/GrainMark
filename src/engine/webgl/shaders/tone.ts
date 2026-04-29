/**
 * Tone shader — 基础色调调整
 *
 * 参数（与 shared/types.ts ToneParams 对齐）：
 *   u_exposure     ∈ [-5, 5]  EV（2^EV 线性乘；用户最常用，保持强响应）
 *   u_contrast     ∈ [-1, 1]  围绕 0.5 灰度中点拉伸/压缩
 *   u_highlights   ∈ [-1, 1]  影响高光（luma > 0.35 软切到 0.85）
 *   u_shadows      ∈ [-1, 1]  影响阴影（luma < 0.65 软切到 0.15）
 *   u_whites       ∈ [-1, 1]  白色裁切点（luma > 0.60 软切到 0.98）
 *   u_blacks       ∈ [-1, 1]  黑色裁切点（luma < 0.40 软切到 0.02）
 *
 * 设计取舍（M4.5 前置整改，commit 待发）：
 *   - 原版 shader 内部再套一层 curve(x)=sign(x)·|x|^1.6 中段降敏，导致 +50 档位
 *     实际只有 33% 效应。调查见 artifact 《滑块失效与测试体系架构复盘》。
 *   - 此版 **shader 只做线性响应**，中段敏感度由 UI 层 Slider `curve="ease-center"` 负责。
 *     UI 拖动 +50 ≈ shader 参数 0.5，产生清晰可见变化；极端档位 ±100 对应强烈效果。
 *   - smoothstep 蒙版阈值**大幅放宽**：
 *     原版 highlights/shadows 蒙版只覆盖 luma∈[0.55,0.95]∪[0.0,0.45]，留出 0.45~0.55 死区；
 *     典型照片中间调（0.3~0.6）占 70%+ 面积，用户拖"高光/阴影"滑块几乎感受不到。
 *     新蒙版让"高光"覆盖 luma>0.35 的上半区、"阴影"覆盖 luma<0.65 的下半区，有适度重叠
 *     （0.35~0.65 同时受两者影响，但权重渐变），符合用户直觉。
 *   - 强度系数 ×1.8：highlights/whites 0.30→0.55、shadows/blacks 0.35→0.65。
 *     ±100 档位在高光/暗部产生 40~55% 的亮度位移，视觉上"强烈"。
 *   - Rec.709 luma；sRGB 空间（与 Lightroom 视觉直觉一致；HDR 扩展留给 M5）。
 */
import { clamp } from './mathUtils.js'

export const TONE_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float applyContrast(float v, float amount) {
  // amount ∈ [-1, 1]；正值增加对比、负值减少。线性响应：
  //   amount=0 → 系数 1（不变）；amount=+1 → 系数 2（对比度翻倍）；-1 → 系数 0（全灰）
  return clamp((v - 0.5) * (1.0 + amount) + 0.5, 0.0, 1.0);
}

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  // 曝光（线性 EV；±5 EV = ±32×，用户最核心的整体亮度手段）
  c *= pow(2.0, u_exposure);

  // 对比度：基于 luma 保持色相
  float luma = dot(c, LUMA);
  float lumaAdj = applyContrast(luma, u_contrast);
  c *= (lumaAdj / max(luma, 1e-4));

  // 高光：覆盖 luma > 0.35 的上半区，强度系数 0.55（±100 档 ≈ ±55%）
  float hlMask = smoothstep(0.35, 0.85, luma);
  c *= (1.0 + u_highlights * 0.55 * hlMask);

  // 阴影：覆盖 luma < 0.65 的下半区，强度系数 0.65（±100 档 ≈ ±65%）
  float shMask = 1.0 - smoothstep(0.15, 0.65, luma);
  c *= (1.0 + u_shadows * 0.65 * shMask);

  // 白色点：仅极亮区（luma > 0.60）受影响，系数 0.55
  float whiteMask = smoothstep(0.60, 0.98, luma);
  c = mix(c, c * (1.0 + u_whites * 0.55), whiteMask);

  // 黑色点：仅极暗区（luma < 0.40）受影响，系数 0.65
  float blackMask = 1.0 - smoothstep(0.02, 0.40, luma);
  c = mix(c, c * (1.0 + u_blacks * 0.65), blackMask);

  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

/** 把 ToneParams（前端 -100..100）归一化到 shader 期望的 -1..1（EV 不变） */
export interface ToneUniforms {
  u_exposure: number
  u_contrast: number
  u_highlights: number
  u_shadows: number
  u_whites: number
  u_blacks: number
}

export function normalizeToneParams(p: {
  exposure?: number
  contrast?: number
  highlights?: number
  shadows?: number
  whites?: number
  blacks?: number
}): ToneUniforms {
  return {
    u_exposure: clamp(p.exposure ?? 0, -5, 5),
    u_contrast: clamp((p.contrast ?? 0) / 100, -1, 1),
    u_highlights: clamp((p.highlights ?? 0) / 100, -1, 1),
    u_shadows: clamp((p.shadows ?? 0) / 100, -1, 1),
    u_whites: clamp((p.whites ?? 0) / 100, -1, 1),
    u_blacks: clamp((p.blacks ?? 0) / 100, -1, 1),
  }
}
