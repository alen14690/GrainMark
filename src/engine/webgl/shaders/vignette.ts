/**
 * Vignette shader — 径向暗角
 *
 * 参数（与 shared/types.ts VignetteParams 对齐）：
 *   u_amount     ∈ [-1, 1]  负值压暗、正值抬亮
 *   u_midpoint   ∈ [0, 1]   过渡起始半径（0 = 中心、1 = 边缘）
 *   u_roundness  ∈ [-1, 1]  形状：-1 柱形、0 椭圆、1 圆形
 *   u_feather    ∈ [0, 1]   边缘羽化
 *   u_aspect     = width / height（从 viewport 传入，保持形状不随图比例拉伸）
 *
 * 实现：
 *   r = length(aspectAdjustedOffset(uv))
 *   weight = smoothstep(midpoint, midpoint + feather, r)
 *   color = mix(color, color * (1 + amount), weight)
 */
import { clamp } from './mathUtils.js'

export const VIGNETTE_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform float u_amount;
uniform float u_midpoint;
uniform float u_roundness;
uniform float u_feather;
uniform float u_aspect;

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  vec2 offset = v_uv - vec2(0.5);
  // 宽高比补偿（让暗角在非 1:1 图像上仍为圆或椭圆而非被拉扁）
  offset.x *= mix(1.0, u_aspect, 0.5 - 0.5 * u_roundness);
  float r = length(offset) * 2.0; // 中心 0，角落约 sqrt(2)
  float mid = clamp(u_midpoint, 0.0, 1.0);
  float feather = max(u_feather, 1e-3);
  float weight = smoothstep(mid, mid + feather, r);

  // amount < 0 暗角、> 0 光晕
  vec3 adjusted = c * (1.0 + u_amount);
  c = mix(c, adjusted, weight);

  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

export interface VignetteUniforms {
  u_amount: number
  u_midpoint: number
  u_roundness: number
  u_feather: number
  u_aspect: number
}

export function normalizeVignetteParams(
  p: { amount?: number; midpoint?: number; roundness?: number; feather?: number },
  aspect: number,
): VignetteUniforms {
  return {
    u_amount: clamp((p.amount ?? 0) / 100, -1, 1),
    u_midpoint: clamp((p.midpoint ?? 50) / 100, 0, 1),
    u_roundness: clamp((p.roundness ?? 0) / 100, -1, 1),
    u_feather: clamp((p.feather ?? 50) / 100, 0, 1),
    u_aspect: aspect,
  }
}
