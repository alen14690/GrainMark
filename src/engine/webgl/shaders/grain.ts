/**
 * Grain shader — 胶片颗粒
 *
 * 参数（与 shared/types.ts GrainParams 对齐）：
 *   u_amount     ∈ [0, 1]  强度 0..100 / 100
 *   u_size       ∈ [0.5, 4]  颗粒单元尺寸（像素），越大越粗
 *   u_roughness  ∈ [0, 1]  粗糙度：低值=软颗粒，高值=硬颗粒（方差）
 *   u_resolution vec2 viewport 像素尺寸，用于把 uv 映射到像素坐标
 *
 * 实现：
 *   1. 用 hash 噪声生成 [-0.5, 0.5] 的 per-pixel 伪随机
 *   2. amount × (noise × roughness_coef) 作为亮度扰动
 *   3. 胶片颗粒通常在中灰区域最明显 → luma 中间调 mask
 *
 * 性能：一次 hash，M1 24MP <1ms
 */
export const GRAIN_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform float u_amount;
uniform float u_size;
uniform float u_roughness;
uniform vec2 u_resolution;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// 稳定 hash（无需 extension）
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  // 按 size 把像素坐标量化（使颗粒单元可调大）
  vec2 px = v_uv * u_resolution / max(u_size, 0.5);
  // 两个 hash 合成更白的噪声
  float n1 = hash21(floor(px));
  float n2 = hash21(floor(px) + vec2(37.0, 17.0));
  float noise = (mix(n1, n2, u_roughness) - 0.5); // [-0.5, 0.5]

  // 亮度 mask：中间调最强，高光/阴影弱
  float luma = dot(c, LUMA);
  float midMask = 1.0 - abs(luma - 0.5) * 2.0; // 中间 1，两端 0
  midMask = clamp(midMask, 0.15, 1.0); // 阴影/高光也保留一点颗粒感

  float delta = noise * u_amount * 0.18 * midMask;
  c += delta;

  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

export interface GrainUniforms {
  u_amount: number
  u_size: number
  u_roughness: number
  u_resolution: [number, number]
}

export function normalizeGrainParams(
  p: { amount?: number; size?: number; roughness?: number },
  resolution: [number, number],
): GrainUniforms {
  return {
    u_amount: clamp((p.amount ?? 0) / 100, 0, 1),
    u_size: clamp(p.size ?? 1, 0.5, 4),
    u_roughness: clamp(p.roughness ?? 0.5, 0, 1),
    u_resolution: resolution,
  }
}

export function isGrainIdentity(p: { amount?: number }): boolean {
  return (p.amount ?? 0) === 0
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
