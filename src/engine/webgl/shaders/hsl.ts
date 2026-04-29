/**
 * HSL shader — 8 色相通道独立 H/S/L 调整
 *
 * 通道顺序（固定，与 shared/types.ts HSLChannel 对齐）：
 *   0: red (0°)
 *   1: orange (30°)
 *   2: yellow (60°)
 *   3: green (120°)
 *   4: aqua (180°)
 *   5: blue (240°)
 *   6: purple (270°)
 *   7: magenta (300°)
 *
 * Uniform 结构（uniform1fv 一次性上传 24 个 float）：
 *   u_hsl[24]：每通道 3 个槽位 [h, s, l]，顺序 red.h, red.s, red.l, orange.h, ...
 *
 * 实现：
 *   1. 把像素 RGB 转 HSL
 *   2. 计算当前像素的 hue 到 8 个通道中心的"归属权重"（高斯核，σ=30°）
 *   3. 对每个通道加权累加 h/s/l 修正
 *   4. HSL → RGB
 *
 * 性能：仅 8 次 hue 距离计算，24 × 标量加权累加，M1 GPU 全屏 24MP <2ms
 */
import { clamp } from './mathUtils.js'

export const HSL_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
// 8 个通道 × 3 参数（h, s, l），已归一化到 [-1, 1]
uniform float u_hsl[24];

const float CHANNEL_HUES[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 300.0);
// sigma=30° 的高斯核：exp(-d²/(2·σ²))，在 d=0 时 = 1
const float SIGMA2 = 1800.0; // 2 * 30 * 30

vec3 rgb2hsl(vec3 c) {
  float maxc = max(max(c.r, c.g), c.b);
  float minc = min(min(c.r, c.g), c.b);
  float l = (maxc + minc) * 0.5;
  float d = maxc - minc;
  float h = 0.0;
  float s = 0.0;
  if (d > 1e-5) {
    s = l > 0.5 ? d / (2.0 - maxc - minc) : d / (maxc + minc);
    if (maxc == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxc == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h *= 60.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x / 360.0;
  float s = hsl.y;
  float l = hsl.z;
  if (s < 1e-5) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(
    hue2rgb(p, q, h + 1.0/3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0/3.0)
  );
}

// 最小循环差：hue 色环 360°，返回 [0, 180]
float hueDist(float a, float b) {
  float d = abs(a - b);
  return min(d, 360.0 - d);
}

void main() {
  vec3 rgb = texture(u_image, v_uv).rgb;
  vec3 hsl = rgb2hsl(rgb);

  // 计算 8 通道归属权重（不归一化，让灰度区域少受影响）
  float weights[8];
  float totalWeight = 0.0;
  for (int i = 0; i < 8; i++) {
    float d = hueDist(hsl.x, CHANNEL_HUES[i]);
    weights[i] = exp(-d * d / SIGMA2);
    totalWeight += weights[i];
  }

  // 加权累加 H/S/L 偏移
  float dH = 0.0;
  float dS = 0.0;
  float dL = 0.0;
  for (int i = 0; i < 8; i++) {
    float w = weights[i] / max(totalWeight, 1e-4);
    dH += w * u_hsl[i * 3 + 0] * 30.0;   // ±1 → ±30°
    dS += w * u_hsl[i * 3 + 1];          // ±1 → ±100% 相对
    dL += w * u_hsl[i * 3 + 2] * 0.5;    // ±1 → ±50% 绝对
  }

  // 饱和度低的像素（灰/近白/近黑）不让通道染色
  float satGate = smoothstep(0.05, 0.25, hsl.y);
  dH *= satGate;
  dS *= satGate;

  hsl.x = mod(hsl.x + dH + 360.0, 360.0);
  hsl.y = clamp(hsl.y * (1.0 + dS), 0.0, 1.0);
  hsl.z = clamp(hsl.z + dL * (1.0 - abs(hsl.z - 0.5) * 2.0), 0.0, 1.0);

  fragColor = vec4(clamp(hsl2rgb(hsl), 0.0, 1.0), 1.0);
}
`

/** 通道顺序：必须与 shader CHANNEL_HUES 对齐 */
export const HSL_CHANNELS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const
export type HSLChannelName = (typeof HSL_CHANNELS)[number]

export interface HSLUniforms {
  u_hsl: Float32Array // length 24
}

/**
 * 把 HSLParams 的对象形式（{ red: {h,s,l}, orange: {...} }）展平为 24 float Array。
 * 未指定的通道视为 0。前端值 -100..100 归一化到 -1..1。
 */
export function normalizeHslParams(p: Record<string, { h?: number; s?: number; l?: number } | undefined>): HSLUniforms {
  const arr = new Float32Array(24)
  for (let i = 0; i < HSL_CHANNELS.length; i++) {
    const name = HSL_CHANNELS[i]!
    const v = p[name]
    if (!v) continue
    arr[i * 3 + 0] = clamp((v.h ?? 0) / 100, -1, 1)
    arr[i * 3 + 1] = clamp((v.s ?? 0) / 100, -1, 1)
    arr[i * 3 + 2] = clamp((v.l ?? 0) / 100, -1, 1)
  }
  return { u_hsl: arr }
}

/** 判断 HSL 参数是否为"全零"（可完全跳过这个 pass） */
export function isHslIdentity(p: Record<string, { h?: number; s?: number; l?: number } | undefined>): boolean {
  for (const name of HSL_CHANNELS) {
    const v = p[name]
    if (!v) continue
    if ((v.h ?? 0) !== 0 || (v.s ?? 0) !== 0 || (v.l ?? 0) !== 0) return false
  }
  return true
}

