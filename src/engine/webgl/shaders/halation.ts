/**
 * Halation shader — 胶片高光溢光（红色泛光）
 *
 * 原理：模拟胶片高光区域由于感光层散射造成的红色泛光
 *   1. 提取高光 mask（luma > threshold）
 *   2. 用 separable 高斯近似对 mask 做模糊（两次线性采样半径取样）
 *   3. 把模糊后的红色偏向"溢光"以 additive 方式叠回原图
 *
 * 参数（与 shared/types.ts HalationParams 对齐）：
 *   u_amount     ∈ [0, 1]     强度 0..100 / 100
 *   u_threshold  ∈ [0, 1]     触发亮度 0..255 / 255
 *   u_radius     ∈ [1, 30]    扩散半径（像素）
 *   u_texelSize  vec2         1/resolution（shader 内采样步长）
 *
 * 性能：
 *   完整双向分离高斯需要 2 个 pass，此处单 pass 用 9 tap 近似，M1 24MP ~2-3ms。
 *   Pass 3c 再做专用 blur pass + ping-pong 优化。
 */
export const HALATION_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform float u_amount;
uniform float u_threshold;
uniform float u_radius;
uniform vec2 u_texelSize;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
// 9 个 2D 径向 tap（近似旋转对称的单 pass 模糊）
const vec2 TAPS[9] = vec2[9](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),  vec2(-1.0, 0.0),
  vec2(0.0, 1.0),  vec2(0.0, -1.0),
  vec2(0.707, 0.707), vec2(-0.707, 0.707),
  vec2(0.707, -0.707), vec2(-0.707, -0.707)
);
const float WEIGHTS[9] = float[9](
  0.20,
  0.12, 0.12, 0.12, 0.12,
  0.08, 0.08, 0.08, 0.08
);

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  // 高光 mask —— soft threshold
  float luma0 = dot(c, LUMA);
  float gate = smoothstep(u_threshold, min(u_threshold + 0.15, 1.0), luma0);

  // 对附近像素采样 R 通道（halation 主要是红色）+ 高光 mask 卷积近似
  float haloR = 0.0;
  for (int i = 0; i < 9; i++) {
    vec2 uv = v_uv + TAPS[i] * u_texelSize * u_radius;
    vec3 s = texture(u_image, uv).rgb;
    float sLuma = dot(s, LUMA);
    float sGate = smoothstep(u_threshold, min(u_threshold + 0.15, 1.0), sLuma);
    haloR += s.r * sGate * WEIGHTS[i];
  }

  // Halation 是 additive：把红泛光加回当前像素
  vec3 out_c = c;
  out_c.r += haloR * u_amount;
  // 一点点紫/品色偏移（真实胶片），避免看起来像噪点
  out_c.b += haloR * u_amount * 0.15;

  // 高光本身不要被再次增亮（已经在 haloR 里了），gate 让纯高光区域颜色更稳定
  out_c = mix(out_c, c, gate * 0.2);

  fragColor = vec4(clamp(out_c, 0.0, 1.0), 1.0);
}
`

export interface HalationUniforms {
  u_amount: number
  u_threshold: number
  u_radius: number
  u_texelSize: [number, number]
}

export function normalizeHalationParams(
  p: { amount?: number; threshold?: number; radius?: number },
  resolution: [number, number],
): HalationUniforms {
  return {
    u_amount: clamp((p.amount ?? 0) / 100, 0, 1),
    u_threshold: clamp((p.threshold ?? 220) / 255, 0, 1),
    u_radius: clamp(p.radius ?? 10, 1, 30),
    u_texelSize: [1 / Math.max(resolution[0], 1), 1 / Math.max(resolution[1], 1)],
  }
}

export function isHalationIdentity(p: { amount?: number }): boolean {
  return (p.amount ?? 0) === 0
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
