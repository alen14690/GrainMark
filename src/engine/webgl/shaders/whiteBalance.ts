/**
 * White Balance shader — 色温 / 色调调整
 *
 * 参数（与 shared/types.ts WhiteBalanceParams 对齐）：
 *   u_temp  ∈ [-1, 1]  色温：负→冷（蓝）、正→暖（黄）
 *   u_tint  ∈ [-1, 1]  色调：负→绿、正→洋红
 *
 * 设计取舍（M4.5 前置整改）：
 *   - 移除原版内部 curve(x)=sign(x)·|x|^1.6 的中段降敏——shader 只做线性响应，
 *     中段敏感度交给 UI Slider `curve="ease-center"`。
 *   - 强度系数保持 0.30 / 0.10（白平衡本就应是"微调方向"而非"强染色"，
 *     Lightroom 也是类似幅度）。实测 ±100 档在中灰像素上产生 Δ≈38，已够用。
 */
export const WHITE_BALANCE_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform float u_temp;
uniform float u_tint;

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  // 色温：暖向 (R+, B-)，冷向 (R-, B+)
  c.r *= (1.0 + u_temp * 0.30);
  c.b *= (1.0 - u_temp * 0.30);
  // 色调：正向洋红 (R+, B+, G-)；负向绿 (G+)
  c.g *= (1.0 - u_tint * 0.30);
  c.r *= (1.0 + u_tint * 0.10);
  c.b *= (1.0 + u_tint * 0.10);

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
