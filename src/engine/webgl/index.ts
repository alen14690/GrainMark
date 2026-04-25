/**
 * src/engine/webgl — 统一导出
 */
export { GLContext, detectPrecision } from './GLContext'
export type { GLContextOptions, Precision } from './GLContext'

export { ShaderRegistry, ShaderCompileError } from './ShaderRegistry'

export { Texture, textureFromBitmap } from './Texture'
export type { InternalFormat, TextureInit } from './Texture'

export { runPass, DEFAULT_VERT } from './Pass'
export type { PassConfig, PassInput, UniformValue } from './Pass'

export { Pipeline, PipelineAbortError } from './Pipeline'
export type { PipelineStep, PipelineRunArgs, PipelineStats } from './Pipeline'

export { TONE_FRAG, normalizeToneParams } from './shaders/tone'
export type { ToneUniforms } from './shaders/tone'
export { VIGNETTE_FRAG, normalizeVignetteParams } from './shaders/vignette'
export type { VignetteUniforms } from './shaders/vignette'
