import { thumbSrc } from '../../../lib/grainUrl'
/**
 * PlaceholderFrameLayout — 阶段 1 占位布局组件
 *
 * 为什么要有这个组件:
 *   - 阶段 1 尚无任何真实 layout 实装,但 FramePreviewHost 不能崩
 *   - 展示"该风格数据结构已就位,但视觉实装在阶段 2"的明确信息
 *   - 同时验证"切换风格时 DOM 真的会重渲染"—— 这是老 WatermarkOverlay 的致命伤
 *     (见 artifact/design/frame-system-2026-05-01.md §1.1)
 *
 * 阶段 2 起:本文件依然保留作为兜底,给尚未实装的风格 fallback 用。
 */
import type { FrameLayoutProps } from '../FrameStyleRegistry'

export function PlaceholderFrameLayout({ photo, style, photoSrcOverride }: FrameLayoutProps) {
  return (
    <div
      className="relative w-full h-full flex flex-col"
      data-frame-style-id={style.id}
      data-frame-status="placeholder"
    >
      {/* 照片本体 · 保持 aspect */}
      {(photoSrcOverride || photo.thumbPath) && (
        <img
          src={photoSrcOverride ?? thumbSrc(photo)}
          alt=""
          className="flex-1 min-h-0 w-full object-contain bg-bg-0"
        />
      )}
      {/* 占位边框 · 用 brand-violet 描边 + 等宽字说明"尚未实装" */}
      <div className="border-t border-brand-violet/40 bg-bg-1/60 px-4 py-3">
        <div className="text-[11px] text-brand-violet font-mono uppercase tracking-wider">
          风格占位 · {style.id}
        </div>
        <div className="text-[10.5px] text-fg-3 mt-1 leading-relaxed">
          数据结构已就位 · 视觉实装在阶段 2(见
          <span className="text-fg-2 mx-1">artifact/design/frame-system-2026-05-01.md</span>)
        </div>
      </div>
    </div>
  )
}
