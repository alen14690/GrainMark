/**
 * White Balance shader — 色温 / 色调调整
 *
 * 参数（与 shared/types.ts WhiteBalanceParams 对齐）：
 *   u_temp  ∈ [-1, 1]  色温：负→冷（蓝）、正→暖（黄）
 *   u_tint  ∈ [-1, 1]  色调：负→绿、正→洋红
 *
 * 响应：与 tone.ts 一致的 |x|^1.6 curve，中段敏感度降低避免"推过度"
 */
export const WHITE_BALANCE_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform float u_temp;
uniform float u_tint;

float curve(float x) {
  float ax = abs(x);
  return sign(x) * pow(ax, 1.6);
}

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  float t = curve(u_temp);
  float n = curve(u_tint);

  // 色温：暖色向 (R+, B-)，冷色向 (R-, B+)
  c.r *= (1.0 + t * 0.30);
  c.b *= (1.0 - t * 0.30);
  // 色调：正向洋红 (R+, B+, G-)；负向绿 (G+)
  c.g *= (1.0 - n * 0.30);
  c.r *= (1.0 + n * 0.10);
  c.b *= (1.0 + n * 0.10);

  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

export interface WhiteBalanceUniforms {
  u_temp: number
  u_tint: number
}

export function normalizeWhiteBalanceParams(p: {
  temp?: number
  tint?: number
}): WhiteBalanceUniforms {
  return {
    u_temp: clamp((p.temp ?? 0) / 100, -1, 1),
    u_tint: clamp((p.tint ?? 0) / 100, -1, 1),
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
