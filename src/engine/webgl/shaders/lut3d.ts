/**
 * LUT3D shader — 3D Color LUT 查表采样
 *
 * 原理：
 *   - 把当前像素的 RGB ∈ [0,1] 作为 3D 纹理坐标
 *   - WebGL 2 sampler3D 的 texture(lut, uv) 自带**三线性插值**，精度远超 CPU 的手动 lerp
 *   - 与原图按 u_intensity 线性混合
 *
 * 坐标偏移（半像素中心）：
 *   LUT 是 N×N×N 的离散体素，采样点应落在每个 cell 的中心：
 *     uv = rgb * (N-1)/N + 1/(2N)
 *   这是 LUT 查表的经典公式，避免边缘采样偏移产生色块。
 *
 * 参数：
 *   u_image       主图
 *   u_lut         sampler3D，LUT 纹理
 *   u_lutSize     LUT 每边的采样数 N（2..64）
 *   u_intensity   强度 [0, 1]，0 = 原图、1 = 完全应用 LUT
 */
export const LUT3D_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform sampler3D u_lut;
uniform float u_lutSize;
uniform float u_intensity;

void main() {
  vec3 c = texture(u_image, v_uv).rgb;

  // 半像素中心校正
  float s = u_lutSize;
  vec3 coord = c * ((s - 1.0) / s) + (0.5 / s);

  vec3 graded = texture(u_lut, coord).rgb;
  vec3 out_c = mix(c, graded, u_intensity);

  fragColor = vec4(clamp(out_c, 0.0, 1.0), 1.0);
}
`

export interface Lut3dUniforms {
  u_lutSize: number
  u_intensity: number
}

export function normalizeLut3dParams(p: {
  lutSize: number
  intensity?: number
}): Lut3dUniforms {
  return {
    u_lutSize: Math.max(2, Math.min(64, Math.floor(p.lutSize))),
    u_intensity: clamp((p.intensity ?? 100) / 100, 0, 1),
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
