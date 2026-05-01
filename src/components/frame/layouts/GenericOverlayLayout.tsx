import { DEFAULT_FRAME_SHOW_FIELDS, buildFrameParamLine } from '../../../../shared/frame-text'
/**
 * GenericOverlayLayout · 阶段 5 通用前端预览(2026-05-01)
 *
 * 用途:
 *   阶段 5 的 14 个高级质感风格都先用此组件做前端预览。
 *   它按 style.group 自动挑选对应的 CSS 装饰层(玻璃/霓虹/金属/油画纸/浮卡/印章)。
 *
 * 与后端 genericFallback.ts 对齐:
 *   - 后端 SVG 数据层契约:读 layout.slots 画文字 · 装饰阶段 5b 补
 *   - 前端 CSS 装饰:本组件按 group 分派装饰层(CSS 比 SVG 装饰性更强更快)
 *
 * 装饰分派(按 style.group):
 *   - glass:     backdrop-filter:blur 磨砂玻璃条 / chip 胶囊
 *   - oil:       纸质 noise 背景(radial/repeating gradient)
 *   - ambient:   照片自身放大 CSS blur 作底 · 原图浮起
 *   - cinema:    黑条幕 / 双色霓虹辉光 box-shadow
 *   - editorial: 瑞士网格细线 / KODAK 橙带
 *   - metal:     拉丝渐变 + 内凹浮雕
 *   - floating:  浮卡 drop-shadow / 印章辉光
 *
 * 类型安全:
 *   所有分派都用 switch(style.group) · TS 要求覆盖全部 FrameStyleGroup · 漏一个就 never 报错
 */
import { FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameContentSlot, FrameStyle } from '../../../../shared/types'
import { thumbSrc } from '../../../lib/grainUrl'
import type { FrameLayoutProps } from '../FrameStyleRegistry'

export function GenericOverlayLayout({
  photo,
  style,
  overrides,
  containerWidth,
  containerHeight,
}: FrameLayoutProps) {
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const borderTop = scaleByMinEdge(layout.borderTop, containerWidth, containerHeight)
  const borderBottom = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)
  const borderLeft = scaleByMinEdge(layout.borderLeft, containerWidth, containerHeight)
  const borderRight = scaleByMinEdge(layout.borderRight, containerWidth, containerHeight)

  const showFields = overrides.showFields ?? DEFAULT_FRAME_SHOW_FIELDS
  const hasModelSlot = layout.slots.some((s) => s.id === 'model')
  const modelLine = [photo.exif.make, photo.exif.model].filter(Boolean).join(' ')
  const paramLine = buildFrameParamLine(photo.exif, showFields, { excludeModelMake: hasModelSlot })
  const dateLine = showFields.dateTime ? (photo.exif.dateTimeOriginal ?? '') : ''
  const artistLine = showFields.artist ? (overrides.artistName ?? photo.exif.artist ?? '') : ''

  const imageSrc = photo.thumbPath ? thumbSrc(photo) : undefined
  const groupDecoration = renderGroupDecoration(style, {
    containerWidth,
    containerHeight,
    borderBottom,
    orientation: orientation === 'portrait' ? 'portrait' : 'landscape',
    imageSrc,
  })

  return (
    <div
      className="relative w-full h-full"
      style={{
        backgroundColor: layout.backgroundColor,
        paddingTop: `${borderTop}px`,
        paddingBottom: `${borderBottom}px`,
        paddingLeft: `${borderLeft}px`,
        paddingRight: `${borderRight}px`,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      data-frame-style-id={style.id}
      data-frame-orientation={orientation}
      data-frame-group={style.group}
    >
      {/* 装饰背景层(ambient 用模糊图 · oil 用纸质 noise) */}
      {groupDecoration.background}

      {/* 照片 */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt=""
          className="relative w-full h-full object-contain"
          style={{ backgroundColor: '#000', zIndex: 1 }}
        />
      )}

      {/* 装饰前景层(glass bar · neon edge · medal · floater · stamp) */}
      {groupDecoration.foreground}

      {/* 文字 slot(遍历 5 种 area) */}
      {layout.slots.map((slot) => {
        const text = pickText(slot, { modelLine, paramLine, dateLine, artistLine })
        if (!text) return null
        return (
          <AbsSlot
            key={`${slot.id}-${slot.area}`}
            slot={slot}
            text={text}
            layoutTextColor={layout.textColor}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            borderTopPx={borderTop}
            borderBottomPx={borderBottom}
            borderLeftPx={borderLeft}
            borderRightPx={borderRight}
          />
        )
      })}
    </div>
  )
}

function pickText(
  slot: FrameContentSlot,
  texts: { modelLine: string; paramLine: string; dateLine: string; artistLine: string },
): string {
  if (slot.id === 'model') return texts.modelLine
  if (slot.id === 'params') return texts.paramLine
  if (slot.id === 'date') return texts.dateLine
  if (slot.id === 'artist') return texts.artistLine
  return ''
}

// ============================================================================
// 分组装饰层 · 每个 group 返回 { background, foreground }
// ============================================================================

interface DecorationContext {
  containerWidth: number
  containerHeight: number
  borderBottom: number
  orientation: 'landscape' | 'portrait'
  imageSrc?: string
}

interface GroupDecoration {
  background: React.ReactNode
  foreground: React.ReactNode
}

function renderGroupDecoration(style: FrameStyle, ctx: DecorationContext): GroupDecoration {
  switch (style.group) {
    case 'classic':
      return { background: null, foreground: null } // 走 BottomTextLayout/MinimalBar 等专属组件,不应到这
    case 'glass':
      return renderGlassDecoration(style, ctx)
    case 'oil':
      return { background: <OilPaperTexture />, foreground: null }
    case 'ambient':
      return renderAmbientDecoration(ctx)
    case 'cinema':
      return renderCinemaDecoration(style, ctx)
    case 'editorial':
      return renderEditorialDecoration(style)
    case 'metal':
      return renderMetalDecoration(style, ctx)
    case 'floating':
      return renderFloatingDecoration(style, ctx)
    default: {
      // TS 覆盖性检查:若新增 group 忘加分支这里会 never 报错
      const _exhaustive: never = style.group
      void _exhaustive
      return { background: null, foreground: null }
    }
  }
}

// ----- glass -----
function renderGlassDecoration(style: FrameStyle, ctx: DecorationContext): GroupDecoration {
  const { containerWidth, containerHeight } = ctx
  if (style.id === 'frosted-glass') {
    const barH = containerHeight * 0.12
    return {
      background: null,
      foreground: (
        <div
          style={{
            position: 'absolute',
            left: `${containerWidth * 0.05}px`,
            right: `${containerWidth * 0.05}px`,
            bottom: `${containerHeight * 0.05}px`,
            height: `${barH}px`,
            borderRadius: '14px',
            background: 'rgba(255, 255, 255, 0.18)',
            backdropFilter: 'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
            zIndex: 5,
          }}
        />
      ),
    }
  }
  // glass-chip(胶囊)
  return {
    background: null,
    foreground: (
      <div
        style={{
          position: 'absolute',
          right: `${containerWidth * 0.04}px`,
          bottom: `${containerHeight * 0.04}px`,
          maxWidth: `${containerWidth * 0.6}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px 8px 10px',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          background: 'rgba(20, 20, 20, 0.48)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          zIndex: 5,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ff8c42, #ff3a3a)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)',
            flexShrink: 0,
          }}
        />
      </div>
    ),
  }
}

// ----- oil -----
function OilPaperTexture() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(ellipse at 30% 20%, rgba(200,170,120,0.12) 0%, transparent 50%), ' +
          'radial-gradient(ellipse at 70% 80%, rgba(180,140,100,0.08) 0%, transparent 60%), ' +
          'repeating-linear-gradient(33deg, rgba(120,90,60,0.03) 0px, rgba(120,90,60,0.03) 1px, transparent 1px, transparent 3px)',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}

// ----- ambient -----
function renderAmbientDecoration(ctx: DecorationContext): GroupDecoration {
  if (!ctx.imageSrc) return { background: null, foreground: null }
  return {
    background: (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${ctx.imageSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(40px) saturate(140%)',
          transform: 'scale(1.3)',
          zIndex: 0,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      </div>
    ),
    foreground: null,
  }
}

// ----- cinema -----
function renderCinemaDecoration(style: FrameStyle, ctx: DecorationContext): GroupDecoration {
  if (style.id === 'neon-edge') {
    return {
      background: null,
      foreground: (
        <div
          style={{
            position: 'absolute',
            inset: `${ctx.containerWidth * 0.05}px`,
            boxShadow:
              '0 0 0 1.5px rgba(232, 184, 109, 0.8), 0 0 12px rgba(232, 184, 109, 0.4), 0 0 32px rgba(124, 95, 232, 0.3), inset 0 0 0 1.5px rgba(255,255,255,0.08)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      ),
    }
  }
  // cinema-scope: 黑条幕由 layout.borderTop/Bottom 已经绘制,此处无需额外装饰
  return { background: null, foreground: null }
}

// ----- editorial -----
function renderEditorialDecoration(style: FrameStyle): GroupDecoration {
  if (style.id === 'contact-sheet') {
    // KODAK 橙带已由 layout 的 borderTop + backgroundColor 组合近似表达 · CSS 层添加脚注式细节
    return {
      background: (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3%',
            background: '#D4A017',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      ),
      foreground: null,
    }
  }
  // swiss-grid:细线装饰(从照片下缘到文字区的水平分隔线) · 由 anchor.y + CSS 表达
  return { background: null, foreground: null }
}

// ----- metal -----
function renderMetalDecoration(style: FrameStyle, ctx: DecorationContext): GroupDecoration {
  if (style.id === 'brushed-metal') {
    const plateH = ctx.borderBottom
    return {
      background: null,
      foreground: (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${plateH}px`,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.2) 100%), ' +
              'repeating-linear-gradient(90deg, #8a8a8d 0px, #9a9a9d 1px, #7a7a7d 2px), #8a8a8d',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      ),
    }
  }
  // medal-plate: 金章圆饼
  const medalSize = Math.min(ctx.containerWidth, ctx.containerHeight) * 0.12
  return {
    background: null,
    foreground: (
      <div
        style={{
          position: 'absolute',
          right: `${ctx.containerWidth * 0.05}px`,
          bottom: `${ctx.containerHeight * 0.05}px`,
          width: medalSize,
          height: medalSize,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #ffd89b, #b8860b 45%, #6b4500 100%)',
          boxShadow:
            '0 6px 18px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
    ),
  }
}

// ----- floating -----
function renderFloatingDecoration(style: FrameStyle, ctx: DecorationContext): GroupDecoration {
  if (style.id === 'floating-caption') {
    const cardW = ctx.containerWidth * (ctx.orientation === 'portrait' ? 0.55 : 0.42)
    const cardH = ctx.containerHeight * (ctx.orientation === 'portrait' ? 0.11 : 0.14)
    return {
      background: null,
      foreground: (
        <div
          style={{
            position: 'absolute',
            right: `${ctx.containerWidth * 0.04}px`,
            bottom: `${ctx.containerHeight * 0.04}px`,
            width: cardW,
            height: cardH,
            background: '#fff',
            padding: '10px 16px',
            borderRadius: 3,
            boxShadow: '0 12px 36px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
            zIndex: 4,
          }}
        >
          {/* 左侧橙红竖条 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: '#FF6B00',
            }}
          />
        </div>
      ),
    }
  }
  // stamp-corner:无装饰(橙红文字自己带 text-shadow 辉光)
  return { background: null, foreground: null }
}

// ============================================================================
// AbsSlot · 通用文字 slot 绝对定位(支持 top/bottom/left/right/overlay)
// ============================================================================

function AbsSlot({
  slot,
  text,
  layoutTextColor,
  containerWidth,
  containerHeight,
  borderTopPx,
  borderBottomPx,
  borderLeftPx,
  borderRightPx,
}: {
  slot: FrameContentSlot
  text: string
  layoutTextColor: string
  containerWidth: number
  containerHeight: number
  borderTopPx: number
  borderBottomPx: number
  borderLeftPx: number
  borderRightPx: number
}) {
  const fontPx = scaleByMinEdge(slot.fontSize, containerWidth, containerHeight)
  const color = slot.colorOverride ?? layoutTextColor

  // 根据 area 算 anchor 绝对坐标
  let top: number
  let left: number
  let transform =
    slot.align === 'center' ? 'translateX(-50%)' : slot.align === 'right' ? 'translateX(-100%)' : ''
  let rotate: string | undefined

  if (slot.area === 'top') {
    top = slot.anchor.y * borderTopPx - fontPx * 0.5
    left = slot.anchor.x * containerWidth
  } else if (slot.area === 'bottom') {
    top = containerHeight - borderBottomPx + slot.anchor.y * borderBottomPx - fontPx * 0.5
    left = slot.anchor.x * containerWidth
  } else if (slot.area === 'left') {
    top = slot.anchor.y * containerHeight
    left = slot.anchor.x * borderLeftPx
    rotate = 'rotate(-90deg)'
    transform = `${transform} ${rotate}`.trim()
  } else if (slot.area === 'right') {
    top = slot.anchor.y * containerHeight
    left = containerWidth - borderRightPx + slot.anchor.x * borderRightPx
    rotate = 'rotate(90deg)'
    transform = `${transform} ${rotate}`.trim()
  } else {
    // overlay 坐标以照片区左上为原点
    top = borderTopPx + slot.anchor.y * (containerHeight - borderTopPx - borderBottomPx) - fontPx * 0.5
    left = borderLeftPx + slot.anchor.x * (containerWidth - borderLeftPx - borderRightPx)
  }

  // 可用宽度按 align 智能计算
  const safety = containerWidth * 0.04
  let maxW: number
  if (slot.align === 'left') maxW = containerWidth - left - safety
  else if (slot.align === 'right') maxW = left - safety
  else maxW = Math.min(left, containerWidth - left) * 2 - safety
  maxW = Math.max(maxW, 40)

  return (
    <div
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        transform: transform || undefined,
        color,
        fontSize: `${fontPx}px`,
        fontFamily: FONT_STACK[slot.fontFamily].css,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
        maxWidth: `${maxW}px`,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  )
}
