/**
 * useLutTexture — 按需把 .cube 文件加载进 GPU 3D 纹理
 *
 * 职责：
 *   - 接收 `lutName`（FilterPipeline.lut 字段，通常是 '<nanoid>.cube'）
 *   - fetch(grain://lut/<name>) → 文本 → parseCubeText → RGBA8 volume → textureFromLut3D
 *   - 内部缓存：同一 lutName + glContext 引用不重复上传（LRU，上限 8）
 *   - 返回：{ texture, size, status, error }
 *
 * 清理：组件卸载或 GLContext 变化时，释放缓存里不再使用的 texture
 */
import { useEffect, useRef, useState } from 'react'
import { CubeParseError, cubeToRgba8, parseCubeText } from '../../shared/cubeParser'
import { type GLContext, type Texture, textureFromLut3D } from '../engine/webgl'

export type LutTextureStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface LutTextureResult {
  texture: Texture | null
  /** LUT 每边采样数 N（2..64）；ready 时必定有值 */
  size: number
  status: LutTextureStatus
  error?: string
}

/** 简易 LRU：key=lutName → { texture, size }；上限 8，容纳 ~20MB GPU 内存 */
const CACHE_MAX = 8

interface CacheEntry {
  texture: Texture
  size: number
  lastUsed: number
}

/** 每个 GLContext 一个 cache；Context lost/dispose 时整体丢弃 */
const contextCaches = new WeakMap<GLContext, Map<string, CacheEntry>>()

function getCache(ctx: GLContext): Map<string, CacheEntry> {
  let c = contextCaches.get(ctx)
  if (!c) {
    c = new Map()
    contextCaches.set(ctx, c)
  }
  return c
}

function evictLRU(cache: Map<string, CacheEntry>) {
  while (cache.size > CACHE_MAX) {
    let oldestKey: string | null = null
    let oldestUsed = Number.POSITIVE_INFINITY
    for (const [k, v] of cache) {
      if (v.lastUsed < oldestUsed) {
        oldestUsed = v.lastUsed
        oldestKey = k
      }
    }
    if (oldestKey === null) break
    const e = cache.get(oldestKey)
    e?.texture.dispose()
    cache.delete(oldestKey)
  }
}

export function useLutTexture(ctx: GLContext | null, lutName: string | null | undefined): LutTextureResult {
  const [status, setStatus] = useState<LutTextureStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [snapshot, setSnapshot] = useState<{ texture: Texture; size: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!ctx || !ctx.ok || !lutName) {
      setSnapshot(null)
      setStatus('idle')
      setError(undefined)
      return
    }

    // 命中缓存
    const cache = getCache(ctx)
    const cached = cache.get(lutName)
    if (cached) {
      cached.lastUsed = performance.now()
      setSnapshot({ texture: cached.texture, size: cached.size })
      setStatus('ready')
      setError(undefined)
      return
    }

    // 未命中：fetch + parse + upload
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    let cancelled = false
    setStatus('loading')
    setError(undefined)
    ;(async () => {
      try {
        const res = await fetch(`grain://lut/${encodeURIComponent(lutName)}`, {
          signal: ctrl.signal,
        })
        if (!res.ok) throw new Error(`fetch lut ${lutName}: HTTP ${res.status}`)
        const text = await res.text()
        if (cancelled) return

        const cube = parseCubeText(text)
        const pixels = cubeToRgba8(cube)
        const texture = textureFromLut3D(ctx, cube.size, pixels)

        cache.set(lutName, { texture, size: cube.size, lastUsed: performance.now() })
        evictLRU(cache)

        if (cancelled) {
          // 本次异步已作废，但纹理已入缓存可复用，不需要 dispose
          return
        }
        setSnapshot({ texture, size: cube.size })
        setStatus('ready')
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof CubeParseError ? `parse ${e.code}: ${e.message}` : (e as Error).message
        setError(msg)
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [ctx, lutName])

  return {
    texture: snapshot?.texture ?? null,
    size: snapshot?.size ?? 0,
    status,
    error,
  }
}
