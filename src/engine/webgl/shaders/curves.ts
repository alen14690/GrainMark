/**
 * Curves shader — 四条曲线（RGB master + R + G + B）
 *
 * 实现路径：
 *   CPU 侧把 CurvePoint[] 采样成 256 个 float（单调三次插值），作为 uniform1fv 上传。
 *   4 条曲线共 1024 floats —— WebGL 2 保证 uniform 空间足够（min 1024 vec4 / 4096 float）。
 *
 * 参数：
 *   u_curve_rgb[256]  主曲线（作用于亮度）
 *   u_curve_r[256]    红通道
 *   u_curve_g[256]    绿通道
 *   u_curve_b[256]    蓝通道
 *
 * GLSL 没 sampler1D，用数组查表 + 手动线性插值。
 * 未指定的曲线应传"恒等 LUT"（0..255），由 CPU 补齐。
 */
export const CURVES_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
uniform float u_curve_rgb[256];
uniform float u_curve_r[256];
uniform float u_curve_g[256];
uniform float u_curve_b[256];

// 线性插值查表；v ∈ [0, 1]
float sampleLut(float v, float lut[256]) {
  float idx = clamp(v, 0.0, 1.0) * 255.0;
  int i0 = int(floor(idx));
  int i1 = min(i0 + 1, 255);
  float t = idx - float(i0);
  return mix(lut[i0], lut[i1], t);
}

void main() {
  vec3 c = texture(u_image, v_uv).rgb;
  // 每通道应用 RGB 主曲线（亮度塑形）
  c.r = sampleLut(c.r, u_curve_rgb);
  c.g = sampleLut(c.g, u_curve_rgb);
  c.b = sampleLut(c.b, u_curve_rgb);
  // 各自通道曲线（色彩推移）
  c.r = sampleLut(c.r, u_curve_r);
  c.g = sampleLut(c.g, u_curve_g);
  c.b = sampleLut(c.b, u_curve_b);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

export interface CurvePoint {
  x: number // 0..255
  y: number // 0..255
}

export interface CurvesUniforms {
  u_curve_rgb: Float32Array // length 256
  u_curve_r: Float32Array
  u_curve_g: Float32Array
  u_curve_b: Float32Array
}

/** 恒等 LUT：value[i] = i/255 */
const IDENTITY_LUT = (() => {
  const arr = new Float32Array(256)
  for (let i = 0; i < 256; i++) arr[i] = i / 255
  return arr
})()

export function identityCurveLut(): Float32Array {
  return IDENTITY_LUT.slice()
}

/**
 * 把稀疏点 [{x,y},...] 采样为 256 点 LUT（输出 [0,1]）。
 * 使用单调三次样条（Catmull-Rom with monotonic clamp）：
 *   - 端点外推到 x=0 / x=255 以保证 LUT 两端有值
 *   - 若只有 ≤1 个点或所有点都是恒等线（y=x），返回恒等 LUT
 */
export function curvePointsToLut(points: CurvePoint[] | undefined): Float32Array {
  if (!points || points.length === 0) return identityCurveLut()

  // 按 x 排序 + 去重
  const sorted = [...points]
    .map((p) => ({ x: clamp(Math.round(p.x), 0, 255), y: clamp(p.y, 0, 255) }))
    .sort((a, b) => a.x - b.x)
    .filter((p, i, arr) => i === 0 || p.x !== arr[i - 1]!.x)

  if (sorted.length === 0) return identityCurveLut()

  // 前后补齐（如未含 x=0 或 x=255，外推为边界值）
  if (sorted[0]!.x !== 0) sorted.unshift({ x: 0, y: sorted[0]!.y })
  if (sorted[sorted.length - 1]!.x !== 255) {
    sorted.push({ x: 255, y: sorted[sorted.length - 1]!.y })
  }

  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    // 找到 i 所在的段 [sorted[j], sorted[j+1]]
    let j = 0
    while (j < sorted.length - 1 && sorted[j + 1]!.x < i) j++
    if (j >= sorted.length - 1) {
      lut[i] = sorted[sorted.length - 1]!.y / 255
      continue
    }
    const p0 = sorted[j]!
    const p1 = sorted[j + 1]!
    const span = Math.max(1, p1.x - p0.x)
    const t = (i - p0.x) / span
    // 三次平滑（Hermite，切线取 0 使曲线在端点平缓，避免过冲）
    const t2 = t * t
    const t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1
    const h01 = -2 * t3 + 3 * t2
    const y = h00 * p0.y + h01 * p1.y
    lut[i] = clamp(y / 255, 0, 1)
  }
  return lut
}

export function normalizeCurvesParams(p: {
  rgb?: CurvePoint[]
  r?: CurvePoint[]
  g?: CurvePoint[]
  b?: CurvePoint[]
}): CurvesUniforms {
  return {
    u_curve_rgb: curvePointsToLut(p.rgb),
    u_curve_r: curvePointsToLut(p.r),
    u_curve_g: curvePointsToLut(p.g),
    u_curve_b: curvePointsToLut(p.b),
  }
}

export function isCurvesIdentity(p: {
  rgb?: CurvePoint[]
  r?: CurvePoint[]
  g?: CurvePoint[]
  b?: CurvePoint[]
}): boolean {
  const isIdent = (pts?: CurvePoint[]): boolean => {
    if (!pts || pts.length === 0) return true
    // 全部点 y ≈ x 视为恒等
    return pts.every((pt) => Math.abs(pt.x - pt.y) < 0.5)
  }
  return isIdent(p.rgb) && isIdent(p.r) && isIdent(p.g) && isIdent(p.b)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
