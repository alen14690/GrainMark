/**
 * Tone shader — 基础色调调整
 *
 * 参数（与 shared/types.ts ToneParams 对齐）：
 *   u_exposure     ∈ [-5, 5]  EV（2^EV 线性乘）
 *   u_contrast     ∈ [-100, 100]  围绕 0.5 灰度中点拉伸/压缩
 *   u_highlights   ∈ [-100, 100]  仅影响高光区域（luma > 0.6）
 *   u_shadows      ∈ [-100, 100]  仅影响阴影区域（luma < 0.4）
 *   u_whites       ∈ [-100, 100]  白色裁切点上下移
 *   u_blacks       ∈ [-100, 100]  黑色裁切点上下移
 *
 * 实现说明：
 *   - 所有参数都是 [-1, 1] 归一化后（uniform 传入前 /100）
 *   - 使用 Rec.709 luma 系数 (0.2126, 0.7152, 0.0722)
 *   - 运算在 sRGB 空间（与 Lightroom 的视觉直觉一致；HDR 扩展留给 M5）
 */
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
  // amount ∈ [-1, 1]；正值增加对比、负值减少
  return clamp((v - 0.5) * (1.0 + amount) + 0.5, 0.0, 1.0);
}

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  // 曝光（线性 EV）
  c *= pow(2.0, u_exposure);

  // 对比度（基于 luma，保持色相）
  float luma = dot(c, LUMA);
  float lumaAdj = applyContrast(luma, u_contrast);
  c *= (lumaAdj / max(luma, 1e-4));

  // 高光：luma > 0.6 区域衰减/抬升
  float hlMask = smoothstep(0.55, 0.95, luma);
  c *= (1.0 + u_highlights * 0.5 * hlMask);

  // 阴影：luma < 0.4 区域抬升/压暗
  float shMask = 1.0 - smoothstep(0.0, 0.45, luma);
  c *= (1.0 + u_shadows * 0.5 * shMask);

  // 白色点 / 黑色点
  float whiteMask = smoothstep(0.75, 1.0, luma);
  c = mix(c, c * (1.0 + u_whites * 0.4), whiteMask);
  float blackMask = 1.0 - smoothstep(0.0, 0.25, luma);
  c = mix(c, c * (1.0 + u_blacks * 0.5), blackMask);

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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
