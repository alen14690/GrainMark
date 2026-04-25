/**
 * Adjustments shader — clarity / saturation / vibrance 合并为一个 pass
 *
 * 把三个小调整合并到一个 shader 里，减少 FBO 交换开销：
 *
 *   u_clarity     ∈ [-1, 1]   中间调锐化/柔化（局部对比度，实现上是简化版 unsharp mask）
 *   u_saturation  ∈ [-1, 1]   线性饱和度
 *   u_vibrance    ∈ [-1, 1]   智能饱和度（低饱和区域加得多，高饱和区少加）
 *   u_texelSize   vec2        1/resolution（clarity 采样用）
 *
 * 实现说明：
 *   clarity：4 tap "十字"取样做 box blur，原像素 - blur = high-freq；再加权回去
 *   saturation：基于 luma 灰度做 mix
 *   vibrance：同 saturation，但权重 ∝ (1 - currentSaturation)
 */
export const ADJUSTMENTS_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform float u_clarity;
uniform float u_saturation;
uniform float u_vibrance;
uniform vec2 u_texelSize;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  // ---------- clarity（简化 unsharp mask）----------
  if (abs(u_clarity) > 1e-4) {
    vec3 blurred = (
      texture(u_image, v_uv + vec2(u_texelSize.x, 0.0)).rgb +
      texture(u_image, v_uv - vec2(u_texelSize.x, 0.0)).rgb +
      texture(u_image, v_uv + vec2(0.0, u_texelSize.y)).rgb +
      texture(u_image, v_uv - vec2(0.0, u_texelSize.y)).rgb
    ) * 0.25;
    vec3 highFreq = c - blurred;
    // 中间调 mask，避免极端阴影/高光被过度强化
    float luma = dot(c, LUMA);
    float midMask = 1.0 - abs(luma - 0.5) * 2.0;
    midMask = clamp(midMask, 0.2, 1.0);
    c += highFreq * u_clarity * midMask * 1.5;
  }

  // ---------- saturation ----------
  if (abs(u_saturation) > 1e-4) {
    float gray = dot(c, LUMA);
    c = mix(vec3(gray), c, 1.0 + u_saturation);
  }

  // ---------- vibrance（智能饱和）----------
  if (abs(u_vibrance) > 1e-4) {
    float gray = dot(c, LUMA);
    float maxC = max(max(c.r, c.g), c.b);
    float minC = min(min(c.r, c.g), c.b);
    float currentSat = maxC - minC;
    // 低饱和度像素加得多，高饱和度像素加得少（防"饱和过饱和"）
    float factor = u_vibrance * (1.0 - smoothstep(0.1, 0.6, currentSat));
    c = mix(vec3(gray), c, 1.0 + factor);
  }

  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

export interface AdjustmentsUniforms {
  u_clarity: number
  u_saturation: number
  u_vibrance: number
  u_texelSize: [number, number]
}

export function normalizeAdjustmentsParams(
  p: { clarity?: number; saturation?: number; vibrance?: number },
  resolution: [number, number],
): AdjustmentsUniforms {
  return {
    u_clarity: clamp((p.clarity ?? 0) / 100, -1, 1),
    u_saturation: clamp((p.saturation ?? 0) / 100, -1, 1),
    u_vibrance: clamp((p.vibrance ?? 0) / 100, -1, 1),
    u_texelSize: [1 / Math.max(resolution[0], 1), 1 / Math.max(resolution[1], 1)],
  }
}

export function isAdjustmentsIdentity(p: {
  clarity?: number
  saturation?: number
  vibrance?: number
}): boolean {
  return (p.clarity ?? 0) === 0 && (p.saturation ?? 0) === 0 && (p.vibrance ?? 0) === 0
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
