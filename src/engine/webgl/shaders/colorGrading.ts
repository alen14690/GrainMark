/**
 * Color Grading shader — 三向色轮（阴影 / 中间调 / 高光）
 *
 * 参数（与 shared/types.ts ColorGradingParams 对齐）：
 *   u_shadows       vec3 (h°, s∈[0,1], l∈[-1,1])  阴影色轮位置 + 偏移量
 *   u_midtones      vec3  同上
 *   u_highlights    vec3  同上
 *   u_blending      ∈ [0, 1]     三向之间过渡软硬（0 硬切、1 软融合）
 *   u_balance       ∈ [-1, 1]    整体明暗平衡（+ 偏向高光、- 偏向阴影）
 *
 * 实现：
 *   1. 计算像素 luma
 *   2. 根据 luma + balance + blending 生成 shadow/mid/high 三个权重
 *   3. 每个 zone 把 (h,s) 转 RGB 偏移向量，按 l 强度和 zone 权重叠加
 */
export const COLOR_GRADING_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform vec3 u_shadows;       // (hue°, sat, lift)
uniform vec3 u_midtones;
uniform vec3 u_highlights;
uniform float u_blending;     // 0..1
uniform float u_balance;      // -1..1

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 hueToRgb(float h, float s) {
  // h ∈ [0, 360]，s ∈ [0, 1]，l 固定 0.5 得到一个色相向量（中性时 (0.5,0.5,0.5)）
  float hp = mod(h, 360.0) / 60.0;
  float x = s * (1.0 - abs(mod(hp, 2.0) - 1.0));
  vec3 c;
  if (hp < 1.0)      c = vec3(s, x, 0.0);
  else if (hp < 2.0) c = vec3(x, s, 0.0);
  else if (hp < 3.0) c = vec3(0.0, s, x);
  else if (hp < 4.0) c = vec3(0.0, x, s);
  else if (hp < 5.0) c = vec3(x, 0.0, s);
  else               c = vec3(s, 0.0, x);
  // 让 (h,s) 生成 0 均值的偏移向量（色轮注入而非加光）
  return c - dot(c, LUMA);
}

void main() {
  vec3 c = texture(u_image, v_uv).rgb;
  float luma = dot(c, LUMA);

  // balance 把 zone 中心上移/下移
  float bal = u_balance * 0.25;
  float blend = mix(0.15, 0.45, u_blending);

  // 三 zone 权重（smoothstep 软切）
  float wShadow = 1.0 - smoothstep(0.1 + bal, 0.4 + bal + blend, luma);
  float wHigh = smoothstep(0.6 + bal - blend, 0.9 + bal, luma);
  float wMid = max(0.0, 1.0 - wShadow - wHigh);

  // 每 zone 的偏移 = 色轮向量 × lift 强度 × zone 权重
  vec3 sOff = hueToRgb(u_shadows.x, u_shadows.y) * u_shadows.z;
  vec3 mOff = hueToRgb(u_midtones.x, u_midtones.y) * u_midtones.z;
  vec3 hOff = hueToRgb(u_highlights.x, u_highlights.y) * u_highlights.z;

  c += sOff * wShadow + mOff * wMid + hOff * wHigh;

  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

export interface ColorGradingUniforms {
  u_shadows: [number, number, number]
  u_midtones: [number, number, number]
  u_highlights: [number, number, number]
  u_blending: number
  u_balance: number
}

export function normalizeColorGradingParams(p: {
  shadows?: { h?: number; s?: number; l?: number }
  midtones?: { h?: number; s?: number; l?: number }
  highlights?: { h?: number; s?: number; l?: number }
  blending?: number
  balance?: number
}): ColorGradingUniforms {
  const zone = (z?: { h?: number; s?: number; l?: number }): [number, number, number] => [
    clamp(z?.h ?? 0, 0, 360),
    clamp((z?.s ?? 0) / 100, 0, 1),
    clamp((z?.l ?? 0) / 100, -1, 1),
  ]
  return {
    u_shadows: zone(p.shadows),
    u_midtones: zone(p.midtones),
    u_highlights: zone(p.highlights),
    u_blending: clamp((p.blending ?? 50) / 100, 0, 1),
    u_balance: clamp((p.balance ?? 0) / 100, -1, 1),
  }
}

/**
 * Identity 判断：只看 l（lift 强度）。
 *
 * 设计契约（务必保持）：
 *   shader 里 sOff = hueToRgb(h, s) * l。l=0 ⇒ 每个 zone 偏移向量恒为 (0,0,0)，
 *   shader 输出恒等于输入，此时跳过该 pass 是 100% 数学安全的优化。
 *   h 和 s 只是"方向+饱和度"参数，没有 l 这个总开关打开时不会产生任何效果。
 *
 * 若将来给 colorGrading 接入 UI 滑块，务必让用户在 UI 上先设置 l（如"阴影强度 50"），
 * 否则无论怎么调色轮 h/s，画面都不会动——这是一个"UI 不暴露但 shader 隐含"的约束。
 */
export function isColorGradingIdentity(p: {
  shadows?: { l?: number }
  midtones?: { l?: number }
  highlights?: { l?: number }
}): boolean {
  return (p.shadows?.l ?? 0) === 0 && (p.midtones?.l ?? 0) === 0 && (p.highlights?.l ?? 0) === 0
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
