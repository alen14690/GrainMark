/**
 * Pipeline — 有序执行多个 Pass，支持 AbortController 取消
 *
 * 架构：
 *   输入纹理 (sourceTex) → pass[0] → tex A → pass[1] → tex B → pass[n] → canvas
 *
 *   内部维护两张"乒乓"纹理（双缓冲），避免每个 pass 都分配新 FBO：
 *   pass[i] 从 ping 读取，写入 pong；pass[i+1] 从 pong 读取，写入 ping……
 *   最后一个 pass 直接写 canvas（output=null）。
 *
 * 取消机制：
 *   - 接受 AbortSignal；pass 之间检查 signal.aborted
 *   - 用户拖滑块快速连发时，旧 Pipeline 被 abort → 直接退出 run()
 *   - 注意：WebGL 无法中断正在进行的 drawArrays（GPU 同步），只能在 CPU 调度层检测
 */
import type { GLContext } from './GLContext'
import { type PassConfig, runPass } from './Pass'
import type { ShaderRegistry } from './ShaderRegistry'
import { Texture } from './Texture'

export interface PipelineStep {
  /** 步骤标识（日志 / 调试用） */
  id: string
  /** 片元 shader 源码（顶点固定为 Pass.DEFAULT_VERT） */
  frag: string
  /** 附加 uniforms（不含主输入纹理 `u_image`，由 Pipeline 自动绑定） */
  uniforms?: PassConfig['uniforms']
  /**
   * 额外纹理输入（除了 u_image 之外的 sampler，如 LUT3D）。
   * name 必须匹配 shader 里的 uniform 名；Pipeline 不会解释语义
   */
  extraInputs?: PassConfig['inputs']
}

export interface PipelineRunArgs {
  /** 源纹理（已上传的用户照片） */
  source: Texture
  /** abort 信号；用户快速拖滑块时可中断旧任务 */
  signal?: AbortSignal
}

export interface PipelineStats {
  stepCount: number
  durationMs: number
  aborted: boolean
}

export class PipelineAbortError extends Error {
  constructor() {
    super('Pipeline aborted')
    this.name = 'PipelineAbortError'
  }
}

export class Pipeline {
  private steps: PipelineStep[] = []
  private vert: string

  /** 乒乓纹理（按需创建） */
  private _ping: Texture | null = null
  private _pong: Texture | null = null
  private _pingPongSize: { w: number; h: number } | null = null

  constructor(
    private ctx: GLContext,
    private registry: ShaderRegistry,
    vert: string,
  ) {
    this.vert = vert
  }

  /** 替换整条 pipeline 步骤（结构变化时调用，如通道开/关、LUT 加载完成） */
  setSteps(steps: PipelineStep[]): void {
    this.steps = steps
  }

  /**
   * P0-2 快路径：pipeline **结构不变**时只原地更新 uniforms，不重建 step 数组。
   *
   * 典型场景：滑块拖动只改 `u_exposure` 数值，step 数量/顺序/shader/extraInputs 都没变。
   *
   * @param nextUniforms 新 uniform 数组，length 必须等于当前 steps.length；第 i 项对应 steps[i]
   * @returns true 表示成功原地更新；false 表示长度不匹配（调用方应走 setSteps 降级）
   */
  updateUniforms(nextUniforms: Array<PassConfig['uniforms']>): boolean {
    if (nextUniforms.length !== this.steps.length) return false
    for (let i = 0; i < this.steps.length; i++) {
      this.steps[i]!.uniforms = nextUniforms[i]
    }
    return true
  }

  /**
   * 生成当前 steps 的结构签名（不含 uniform 数值）。
   * 签名相同 ⇔ 可以用 updateUniforms 快路径。
   *
   * 签名包含：顺序 + id + frag 源码身份（字符串相等 OK，因为 shader 是 import 常量）+
   *           extraInputs 的 name+texture 身份。
   */
  getStructuralKey(): string {
    if (this.steps.length === 0) return '∅'
    const parts: string[] = []
    for (const s of this.steps) {
      parts.push(s.id)
      // frag 是 import 的字符串常量，长度足够区分；为安全起见带长度
      parts.push(String(s.frag.length))
      if (s.extraInputs && s.extraInputs.length > 0) {
        for (const inp of s.extraInputs) {
          parts.push(`${inp.name}#${inp.texture.width}x${inp.texture.height}`)
        }
      }
    }
    return parts.join('|')
  }

  getSteps(): readonly PipelineStep[] {
    return this.steps
  }

  /**
   * 执行 pipeline，输出到 canvas
   */
  async run(args: PipelineRunArgs): Promise<PipelineStats> {
    const start = performance.now()
    if (!this.ctx.gl) {
      throw new Error('GL not available')
    }
    if (args.signal?.aborted) {
      return { stepCount: 0, durationMs: 0, aborted: true }
    }

    const steps = this.steps
    if (steps.length === 0) {
      // 无 step：直接把 source 画到 canvas（passthrough）
      this._blit(args.source, null)
      return { stepCount: 0, durationMs: performance.now() - start, aborted: false }
    }

    this._ensurePingPong(args.source.width, args.source.height)

    let input: Texture = args.source
    for (let i = 0; i < steps.length; i++) {
      if (args.signal?.aborted) {
        return {
          stepCount: i,
          durationMs: performance.now() - start,
          aborted: true,
        }
      }
      const step = steps[i]!
      const isLast = i === steps.length - 1
      // 最后一步直接写 canvas，中间步骤写 ping/pong
      const output: Texture | null = isLast ? null : i % 2 === 0 ? this._pong! : this._ping!

      runPass(this.ctx, this.registry, {
        vert: this.vert,
        frag: step.frag,
        inputs: [{ name: 'u_image', texture: input }, ...(step.extraInputs ?? [])],
        uniforms: step.uniforms,
        output,
      })
      // 下一步输入 = 这一步输出（最后一步没有"下一步"）
      if (!isLast) input = output!
    }

    // F8：pipeline 结束后统一解绑（一次性，替代每个 pass 都 unbind 的 state churn）
    const gl = this.ctx.gl
    if (gl) {
      gl.bindVertexArray(null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    return {
      stepCount: steps.length,
      durationMs: performance.now() - start,
      aborted: false,
    }
  }

  /** 释放乒乓纹理 */
  dispose(): void {
    this._ping?.dispose()
    this._pong?.dispose()
    this._ping = null
    this._pong = null
    this._pingPongSize = null
  }

  private _ensurePingPong(w: number, h: number): void {
    if (this._pingPongSize && this._pingPongSize.w === w && this._pingPongSize.h === h) return
    // 尺寸变化或首次：重建
    this._ping?.dispose()
    this._pong?.dispose()
    this._ping = new Texture(this.ctx, { width: w, height: h, renderable: true })
    this._pong = new Texture(this.ctx, { width: w, height: h, renderable: true })
    this._pingPongSize = { w, h }
  }

  /** 简单 passthrough 到 canvas（无 step 时用） */
  private _blit(source: Texture, output: Texture | null): void {
    runPass(this.ctx, this.registry, {
      vert: this.vert,
      frag: BLIT_FRAG,
      inputs: [{ name: 'u_image', texture: source }],
      output,
    })
  }
}

const BLIT_FRAG = `
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_image;
void main() {
  fragColor = texture(u_image, v_uv);
}
`
