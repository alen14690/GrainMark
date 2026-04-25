/**
 * src/engine/webgl — 统一导出
 */
export { GLContext, detectPrecision } from './GLContext'
export type { GLContextOptions, Precision } from './GLContext'

export { ShaderRegistry, ShaderCompileError } from './ShaderRegistry'

export { Texture, textureFromBitmap, textureFromLut3D } from './Texture'
export type { InternalFormat, TextureInit, TextureTarget } from './Texture'

export { runPass, DEFAULT_VERT } from './Pass'
export type { PassConfig, PassInput, UniformValue } from './Pass'

export { Pipeline, PipelineAbortError } from './Pipeline'
export type { PipelineStep, PipelineRunArgs, PipelineStats } from './Pipeline'

// ============ 所有 shader（Pass 3a + 3b-1） ============

export { TONE_FRAG, normalizeToneParams } from './shaders/tone'
export type { ToneUniforms } from './shaders/tone'

export { VIGNETTE_FRAG, normalizeVignetteParams } from './shaders/vignette'
export type { VignetteUniforms } from './shaders/vignette'

export { WHITE_BALANCE_FRAG, normalizeWhiteBalanceParams } from './shaders/whiteBalance'
export type { WhiteBalanceUniforms } from './shaders/whiteBalance'

export { HSL_FRAG, HSL_CHANNELS, normalizeHslParams, isHslIdentity } from './shaders/hsl'
export type { HSLUniforms, HSLChannelName } from './shaders/hsl'

export {
  COLOR_GRADING_FRAG,
  normalizeColorGradingParams,
  isColorGradingIdentity,
} from './shaders/colorGrading'
export type { ColorGradingUniforms } from './shaders/colorGrading'

export {
  CURVES_FRAG,
  normalizeCurvesParams,
  curvePointsToLut,
  identityCurveLut,
  isCurvesIdentity,
} from './shaders/curves'
export type { CurvesUniforms, CurvePoint } from './shaders/curves'

export { GRAIN_FRAG, normalizeGrainParams, isGrainIdentity } from './shaders/grain'
export type { GrainUniforms } from './shaders/grain'

export { HALATION_FRAG, normalizeHalationParams, isHalationIdentity } from './shaders/halation'
export type { HalationUniforms } from './shaders/halation'

export {
  ADJUSTMENTS_FRAG,
  normalizeAdjustmentsParams,
  isAdjustmentsIdentity,
} from './shaders/adjustments'
export type { AdjustmentsUniforms } from './shaders/adjustments'

export { LUT3D_FRAG, normalizeLut3dParams } from './shaders/lut3d'
export type { Lut3dUniforms } from './shaders/lut3d'
