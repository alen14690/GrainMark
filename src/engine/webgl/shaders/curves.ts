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
import { clamp } from './mathUtils.js'

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
 *
 * F9 修复：使用**真正的 monotonic cubic Hermite interpolation**。
 *
 * 原版问题：
 *   - 旧代码只算了 h00/h01，丢掉了切线项 h10·m0 / h11·m1，退化为 smoothstep
 *   - 与注释声称的 "Catmull-Rom with monotonic clamp" 完全不符
 *
 * 新实现：
 *   - 用邻居节点估算每个控制点的切线 m_k = (y_{k+1} - y_{k-1}) / (x_{k+1} - x_{k-1})
 *   - 单调性 clamp（Fritsch-Carlson 方法）：若相邻段有符号变化，切线强制为 0，
 *     防止 S 曲线过冲
 *   - Hermite 基函数 h00/h10/h01/h11 完整使用
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

  const n = sorted.length

  // 段斜率 delta_k = (y_{k+1} - y_k) / (x_{k+1} - x_k)
  const delta = new Float32Array(n - 1)
  for (let k = 0; k < n - 1; k++) {
    const dx = Math.max(1, sorted[k + 1]!.x - sorted[k]!.x)
    delta[k] = (sorted[k + 1]!.y - sorted[k]!.y) / dx
  }

  // 节点切线 m_k：
  //   端点：直接取邻段斜率
  //   内点：相邻段斜率平均；若相邻段符号不同（极值点），强制 m=0 保单调
  const m = new Float32Array(n)
  m[0] = delta[0] ?? 0
  m[n - 1] = delta[n - 2] ?? 0
  for (let k = 1; k < n - 1; k++) {
    const dPrev = delta[k - 1]!
    const dNext = delta[k]!
    // Fritsch-Carlson monotonic clamp：符号不同即为 0
    if (dPrev * dNext <= 0) {
      m[k] = 0
    } else {
      m[k] = (dPrev + dNext) * 0.5
    }
  }
  // 进一步 monotonic clamp：若 |m_k| > 3·|delta|，裁到 3·delta（经典 Hyman / Fritsch 准则）
  for (let k = 0; k < n - 1; k++) {
    const d = delta[k]!
    if (d === 0) {
      m[k] = 0
      m[k + 1] = 0
    } else {
      const a = m[k]! / d
      const b = m[k + 1]! / d
      const s = a * a + b * b
      if (s > 9) {
        const t = 3 / Math.sqrt(s)
        m[k] = t * a * d
        m[k + 1] = t * b * d
      }
    }
  }

  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    // 找到 i 所在的段
    let j = 0
    while (j < n - 1 && sorted[j + 1]!.x < i) j++
    if (j >= n - 1) {
      lut[i] = sorted[n - 1]!.y / 255
      continue
    }
    const p0 = sorted[j]!
    const p1 = sorted[j + 1]!
    const span = Math.max(1, p1.x - p0.x)
    const t = (i - p0.x) / span
    const t2 = t * t
    const t3 = t2 * t

    // Hermite 基函数（单位区间）：
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2

    // 切线要乘以 span（区间宽度），因为基函数定义在 [0,1]
    const y = h00 * p0.y + h10 * m[j]! * span + h01 * p1.y + h11 * m[j + 1]! * span
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

