import { DEFAULT_FRAME_SHOW_FIELDS, buildFrameParamLine } from '../../../../shared/frame-text'
/**
 * GenericOverlayLayout · 阶段 5 高级质感统一前端预览(2026-05-01 重写)
 *
 * 为什么要重写:
 *   老版"装饰 + AbsSlot"分离方案在 neon-edge / floating-caption / glass-chip 出现
 *   "装饰几何和文字坐标不贴合"的 Bug · 用户反馈"大量错误"
 *
 * 新架构:
 *   每个 group 的 renderer 是一个完整 React 节点 · 内部自己负责:
 *     - 装饰几何(玻璃条 · 浮卡 · 金章 · 拉丝金属等)
 *     - 文字排版(直接 flex/block,不用绝对定位 anchor)
 *   slot 数据仍用 style.portrait/landscape.slots 提供文字内容,但字号/位置在装饰
 *   组件内固定(因为装饰本身就是"卡片/条状"有既定布局)。
 *
 * 覆盖阶段 5 的 14 个风格(7 簇):
 *   glass:     frosted-glass · glass-chip
 *   oil:       oil-texture · watercolor-caption
 *   ambient:   ambient-glow · bokeh-pillar
 *   cinema:    cinema-scope · neon-edge
 *   editorial: swiss-grid · contact-sheet
 *   metal:     brushed-metal · medal-plate
 *   floating:  floating-caption · stamp-corner
 *
 * 数据契约:
 *   - photo.exif:提供 make/model/lens/aperture/shutter/iso/focalLength
 *   - overrides.showFields:字段可见性
 *   - overrides.artistName:摄影师名
 *   - style.id:每个 id 在 renderByStyleId 内部独立排版
 *
 * 不依赖:
 *   - style.landscape/portrait.slots 的 anchor(老版依赖 · 导致装饰和坐标脱钩)
 *   - 只读 style.landscape/portrait 的 backgroundColor / textColor / accentColor 作视觉参考
 */
import { classifyOrientation } from '../../../../shared/frame-tokens'
import type { FrameLayout, FrameStyle, PhotoExif } from '../../../../shared/types'
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
  const resolvedOrientation: 'landscape' | 'portrait' = orientation === 'portrait' ? 'portrait' : 'landscape'
  const layout = resolvedOrientation === 'portrait' ? style.portrait : style.landscape

  const showFields = overrides.showFields ?? DEFAULT_FRAME_SHOW_FIELDS
  // 所有阶段 5 风格都带独立 model slot(数据层 hasModelSlot=true) · 参数行排除 make/model
  const modelText = [photo.exif.make, photo.exif.model].filter(Boolean).join(' ').trim()
  const paramText = buildFrameParamLine(photo.exif, showFields, { excludeModelMake: true })
  const artistText = showFields.artist ? (overrides.artistName ?? photo.exif.artist ?? '') : ''

  const imageSrc = photo.thumbPath ? thumbSrc(photo) : undefined

  const ctx: StageFiveContext = {
    styleId: style.id,
    group: style.group,
    layout,
    orientation: resolvedOrientation,
    containerWidth,
    containerHeight,
    imageSrc,
    modelText,
    paramText,
    artistText,
    exif: photo.exif,
  }

  return (
    <div
      className="relative w-full h-full"
      data-frame-style-id={style.id}
      data-frame-orientation={resolvedOrientation}
      data-frame-group={style.group}
      style={{
        backgroundColor: layout.backgroundColor,
        overflow: 'hidden',
      }}
    >
      {renderByStyleId(ctx)}
    </div>
  )
}

// ============================================================================
// 渲染上下文 + 分派
// ============================================================================

interface StageFiveContext {
  styleId: FrameStyle['id']
  group: FrameStyle['group']
  layout: FrameLayout
  orientation: 'landscape' | 'portrait'
  containerWidth: number
  containerHeight: number
  imageSrc?: string
  modelText: string
  paramText: string
  artistText: string
  exif: PhotoExif
}

function renderByStyleId(ctx: StageFiveContext): React.ReactNode {
  switch (ctx.styleId) {
    // glass
    case 'frosted-glass':
      return renderFrostedGlass(ctx)
    case 'glass-chip':
      return renderGlassChip(ctx)
    // oil
    case 'oil-texture':
      return renderOilTexture(ctx)
    case 'watercolor-caption':
      return renderWatercolorCaption(ctx)
    // ambient
    case 'ambient-glow':
      return renderAmbientGlow(ctx)
    case 'bokeh-pillar':
      return renderBokehPillar(ctx)
    // cinema
    case 'cinema-scope':
      return renderCinemaScope(ctx)
    case 'neon-edge':
      return renderNeonEdge(ctx)
    // editorial
    case 'swiss-grid':
      return renderSwissGrid(ctx)
    case 'contact-sheet':
      return renderContactSheet(ctx)
    // metal
    case 'brushed-metal':
      return renderBrushedMetal(ctx)
    case 'medal-plate':
      return renderMedalPlate(ctx)
    // floating
    case 'floating-caption':
      return renderFloatingCaption(ctx)
    case 'stamp-corner':
      return renderStampCorner(ctx)
    // 老 classic 风格在 stage5 layout 里不应出现 · 若出现兜底图
    default:
      return renderPlainPhoto(ctx)
  }
}

// ============================================================================
// 基础原件:照片 cover 层 / 画布背景工具
// ============================================================================

function PhotoCover({ src }: { src?: string }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      draggable={false}
      style={{ zIndex: 1 }}
    />
  )
}

/** 无 imageSrc 时的纯图占位(不报错)*/
function renderPlainPhoto(ctx: StageFiveContext) {
  return (
    <>
      <PhotoCover src={ctx.imageSrc} />
    </>
  )
}

/** 计算与 minEdge 相对的字号 · 前端预览用 container minEdge 做比例参考 */
function scale(ratio: number, ctx: StageFiveContext): number {
  return Math.max(Math.round(ratio * Math.min(ctx.containerWidth, ctx.containerHeight)), 8)
}

// ============================================================================
// GLASS · 玻璃拟态
// ============================================================================

function renderFrostedGlass(ctx: StageFiveContext) {
  const { containerWidth, containerHeight } = ctx
  const padX = containerWidth * 0.05
  return (
    <>
      <PhotoCover src={ctx.imageSrc} />
      {/* 磨砂玻璃底条 · 居中浮起在照片底部 5% 位置 */}
      <div
        style={{
          position: 'absolute',
          left: `${padX}px`,
          right: `${padX}px`,
          bottom: `${containerHeight * 0.05}px`,
          padding: `${scale(0.018, ctx)}px ${scale(0.022, ctx)}px`,
          borderRadius: 14,
          background: 'rgba(255, 255, 255, 0.18)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
          color: '#ffffff',
          zIndex: 10,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <GlassLine size={scale(0.022, ctx)} weight={600}>
          {ctx.modelText || '—'}
        </GlassLine>
        <GlassLine size={scale(0.016, ctx)} color="rgba(255,255,255,0.88)" mono mt={3}>
          {ctx.paramText || '—'}
        </GlassLine>
      </div>
    </>
  )
}

function GlassLine({
  children,
  size,
  weight = 400,
  color = '#ffffff',
  mono = false,
  mt = 0,
}: {
  children: React.ReactNode
  size: number
  weight?: number
  color?: string
  mono?: boolean
  mt?: number
}) {
  return (
    <div
      style={{
        color,
        fontSize: `${size}px`,
        fontWeight: weight,
        marginTop: mt,
        fontFamily: mono ? "'JetBrains Mono', monospace" : undefined,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: 1.3,
      }}
    >
      {children}
    </div>
  )
}

function renderGlassChip(ctx: StageFiveContext) {
  const { containerWidth, containerHeight } = ctx
  return (
    <>
      <PhotoCover src={ctx.imageSrc} />
      <div
        style={{
          position: 'absolute',
          right: `${containerWidth * 0.04}px`,
          bottom: `${containerHeight * 0.04}px`,
          maxWidth: `${containerWidth * 0.6}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: `${scale(0.012, ctx)}px ${scale(0.018, ctx)}px ${scale(0.012, ctx)}px ${scale(0.01, ctx)}px`,
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          background: 'rgba(20, 20, 20, 0.48)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          color: '#fff',
          zIndex: 10,
          overflow: 'hidden',
        }}
      >
        {/* 品牌色点(非 Logo · 仅视觉识别) */}
        <span
          style={{
            width: scale(0.03, ctx),
            height: scale(0.03, ctx),
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ff8c42, #ff3a3a)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)',
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, flex: 1, fontFamily: "'JetBrains Mono', monospace" }}>
          <GlassLine size={scale(0.015, ctx)} weight={600}>
            {ctx.modelText || '—'}
          </GlassLine>
          <GlassLine size={scale(0.012, ctx)} color="rgba(255,255,255,0.8)" mt={1}>
            {ctx.paramText || '—'}
          </GlassLine>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// OIL · 油画 / 水彩
// ============================================================================

function renderOilTexture(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const frame = orientation === 'portrait' ? 0.04 : 0.04
  const captionH = orientation === 'portrait' ? 0.22 : 0.18
  const innerLeft = containerWidth * frame
  const innerRight = containerWidth * frame
  const innerTop = containerHeight * frame
  const innerBottom = containerHeight * captionH

  return (
    <>
      {/* 油画纸纹理背景 */}
      <OilPaperTexture />
      {/* 照片(留 4% 四周纸边 · 底部给 caption 让位) */}
      <div
        style={{
          position: 'absolute',
          top: innerTop,
          left: innerLeft,
          right: innerRight,
          bottom: innerBottom,
          zIndex: 1,
          backgroundColor: '#000',
          overflow: 'hidden',
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      {/* Caption · 居中衬线字 · 纸面感 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          color: '#3A2E1E',
          zIndex: 5,
          padding: '0 8%',
        }}
      >
        <div
          style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontStyle: 'italic',
            fontSize: `${scale(orientation === 'portrait' ? 0.034 : 0.03, ctx)}px`,
            fontWeight: 400,
            marginBottom: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontFamily: "'Georgia', serif",
            fontSize: `${scale(0.015, ctx)}px`,
            color: '#7D6C4E',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.paramText || '—'}
        </div>
      </div>
    </>
  )
}

function OilPaperTexture() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(ellipse at 30% 20%, rgba(200,170,120,0.12) 0%, transparent 50%), ' +
          'radial-gradient(ellipse at 70% 80%, rgba(180,140,100,0.08) 0%, transparent 60%), ' +
          'repeating-linear-gradient(33deg, rgba(120,90,60,0.03) 0px, rgba(120,90,60,0.03) 1px, transparent 1px, transparent 3px), #F3ECE0',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}

function renderWatercolorCaption(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const captionH = orientation === 'portrait' ? 0.24 : 0.2
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: `${containerHeight * 0.04}px ${containerWidth * 0.04}px ${containerHeight * captionH}px ${containerWidth * 0.04}px`,
          zIndex: 1,
          backgroundColor: '#000',
          overflow: 'hidden',
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
        {/* 底部向纸白羽化 · 不遮挡中心内容 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 92%, rgba(253,250,244,0.85) 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: `${containerWidth * 0.06}px`,
          right: `${containerWidth * 0.06}px`,
          bottom: `${containerHeight * 0.04}px`,
          color: '#3A2E1E',
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontFamily: "'Georgia', serif",
            fontStyle: 'italic',
            fontSize: `${scale(orientation === 'portrait' ? 0.036 : 0.032, ctx)}px`,
            fontWeight: 400,
            marginBottom: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontFamily: "'Georgia', serif",
            fontStyle: 'italic',
            fontSize: `${scale(0.016, ctx)}px`,
            color: '#7D6C4E',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.paramText || '—'}
        </div>
      </div>
    </>
  )
}

// ============================================================================
// AMBIENT · 氛围模糊
// ============================================================================

function renderAmbientGlow(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const captionH = orientation === 'portrait' ? 0.2 : 0.14
  const photoSide = orientation === 'portrait' ? 0.1 : 0.08
  const photoTop = containerHeight * 0.06
  return (
    <>
      {/* 背景 = 同张照片放大高斯模糊 */}
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(40px) saturate(140%)',
            transform: 'scale(1.3)',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1 }} />
      {/* 原图居中浮起(深阴影) */}
      <div
        style={{
          position: 'absolute',
          top: photoTop,
          left: containerWidth * photoSide,
          right: containerWidth * photoSide,
          bottom: containerHeight * captionH + containerHeight * 0.06,
          boxShadow: '0 18px 48px rgba(0,0,0,0.5)',
          borderRadius: 2,
          overflow: 'hidden',
          zIndex: 2,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      {/* Caption */}
      <div
        style={{
          position: 'absolute',
          left: '8%',
          right: '8%',
          bottom: `${containerHeight * 0.05}px`,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.95)',
          textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: `${scale(orientation === 'portrait' ? 0.028 : 0.022, ctx)}px`,
            fontWeight: 500,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: `${scale(0.016, ctx)}px`,
            opacity: 0.8,
            marginTop: 3,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.paramText || '—'}
        </div>
      </div>
    </>
  )
}

function renderBokehPillar(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const pillarW = orientation === 'portrait' ? 0.2 : 0.15
  return (
    <>
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(60px)',
            transform: 'scale(1.5)',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1 }} />
      {/* 中间原图柱 */}
      <div
        style={{
          position: 'absolute',
          top: `${containerHeight * 0.04}px`,
          bottom: `${containerHeight * 0.1}px`,
          left: `${containerWidth * pillarW}px`,
          right: `${containerWidth * pillarW}px`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          borderRadius: 2,
          overflow: 'hidden',
          zIndex: 2,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      {/* 底部左右两角小字 */}
      <div
        style={{
          position: 'absolute',
          left: `${containerWidth * 0.04}px`,
          bottom: `${containerHeight * 0.04}px`,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: `${scale(0.014, ctx)}px`,
          color: 'rgba(255,255,255,0.85)',
          letterSpacing: '0.08em',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          zIndex: 5,
          maxWidth: '40%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {ctx.modelText || '—'}
      </div>
      <div
        style={{
          position: 'absolute',
          right: `${containerWidth * 0.04}px`,
          bottom: `${containerHeight * 0.04}px`,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: `${scale(0.014, ctx)}px`,
          color: 'rgba(255,255,255,0.85)',
          letterSpacing: '0.08em',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          zIndex: 5,
          maxWidth: '40%',
          textAlign: 'right',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {ctx.paramText || '—'}
      </div>
    </>
  )
}

// ============================================================================
// CINEMA · 电影 / 霓虹
// ============================================================================

function renderCinemaScope(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const barH = (orientation === 'portrait' ? 0.14 : 0.18) * containerHeight
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      {/* 中间照片 · 上下黑条幕 */}
      <div
        style={{
          position: 'absolute',
          top: barH,
          bottom: barH,
          left: orientation === 'portrait' ? containerWidth * 0.06 : 0,
          right: orientation === 'portrait' ? containerWidth * 0.06 : 0,
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      {/* 顶部黑条:REC 红点 + 机型 | 拍摄参数 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: barH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${containerWidth * 0.05}px`,
          color: 'rgba(255,255,255,0.95)',
          fontFamily: "'Courier New', monospace",
          fontSize: `${scale(orientation === 'portrait' ? 0.018 : 0.014, ctx)}px`,
          letterSpacing: '0.15em',
          zIndex: 5,
          gap: 12,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ color: '#FF6B00', marginRight: 6 }}>●</span>
          REC · {ctx.modelText || '—'}
        </span>
      </div>
      {/* 底部黑条:参数大字 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: barH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: `0 ${containerWidth * 0.05}px`,
          color: 'rgba(255,255,255,0.85)',
          fontFamily: "'Courier New', monospace",
          fontSize: `${scale(orientation === 'portrait' ? 0.024 : 0.02, ctx)}px`,
          letterSpacing: '0.3em',
          fontWeight: 600,
          zIndex: 5,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {ctx.paramText || '—'}
      </div>
    </div>
  )
}

function renderNeonEdge(ctx: StageFiveContext) {
  const { containerWidth, containerHeight } = ctx
  const pad = containerWidth * 0.05
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0A0612' }}>
      {/* 照片 + 霓虹辉光边 */}
      <div
        style={{
          position: 'absolute',
          top: pad,
          left: pad,
          right: pad,
          bottom: pad,
          overflow: 'hidden',
          boxShadow:
            '0 0 0 1.5px rgba(232, 184, 109, 0.8), 0 0 12px rgba(232, 184, 109, 0.4), 0 0 32px rgba(124, 95, 232, 0.3), inset 0 0 0 1.5px rgba(255,255,255,0.08)',
          zIndex: 1,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      {/* 右下角 overlay 字 · 落在照片区域内(pad 偏移正确) */}
      <div
        style={{
          position: 'absolute',
          right: `${pad + containerWidth * 0.02}px`,
          bottom: `${pad + containerHeight * 0.03}px`,
          textAlign: 'right',
          color: '#E8B86D',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.08em',
          textShadow: '0 0 8px rgba(232,184,109,0.6)',
          zIndex: 10,
          maxWidth: '60%',
        }}
      >
        <div
          style={{
            color: '#fff',
            fontSize: `${scale(0.022, ctx)}px`,
            marginBottom: 2,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontSize: `${scale(0.016, ctx)}px`,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.paramText || '—'}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// EDITORIAL · 印刷 / 杂志
// ============================================================================

function renderSwissGrid(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const captionH = (orientation === 'portrait' ? 0.22 : 0.18) * containerHeight
  const pad = containerWidth * 0.05
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#F5F2EA' }}>
      {/* 照片(占据上半部分,留底部 caption) */}
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.04,
          left: pad,
          right: pad,
          bottom: captionH,
          overflow: 'hidden',
          zIndex: 1,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      {/* 顶部极细线(瑞士网格标志) */}
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: captionH + 8,
          height: 1,
          background: 'rgba(26,26,26,0.25)',
          zIndex: 3,
        }}
      />
      {/* Caption:左粗体大字 + 右 mono 参数 */}
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: containerHeight * 0.04,
          display: 'flex',
          flexDirection: orientation === 'portrait' ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: orientation === 'portrait' ? 'flex-start' : 'flex-end',
          gap: orientation === 'portrait' ? 6 : 24,
          zIndex: 5,
          color: '#1A1A1A',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: `${scale(orientation === 'portrait' ? 0.034 : 0.028, ctx)}px`,
              letterSpacing: '-0.01em',
              marginBottom: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ctx.modelText || '—'}
          </div>
          <div
            style={{
              fontSize: `${scale(0.014, ctx)}px`,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#666',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ctx.exif.lensModel || '—'}
          </div>
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: `${scale(0.014, ctx)}px`,
            color: '#444',
            letterSpacing: '0.06em',
            textAlign: orientation === 'portrait' ? 'left' : 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}
        >
          {ctx.paramText || '—'}
        </div>
      </div>
    </div>
  )
}

function renderContactSheet(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const kodakBandH = containerHeight * 0.03
  const captionH = (orientation === 'portrait' ? 0.2 : 0.16) * containerHeight
  const pad = containerWidth * 0.04

  const exifItems: Array<{ label: string; value: string }> = [
    { label: 'CAMERA', value: ctx.exif.model || '—' },
    { label: 'LENS', value: shortLens(ctx.exif.lensModel) },
    { label: 'FOCAL', value: ctx.exif.focalLength ? `${ctx.exif.focalLength}mm` : '—' },
    { label: 'APERTURE', value: ctx.exif.fNumber ? `f/${ctx.exif.fNumber}` : '—' },
    { label: 'SHUTTER', value: ctx.exif.exposureTime || '—' },
    { label: 'ISO', value: ctx.exif.iso ? `${ctx.exif.iso}` : '—' },
  ]

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#EDE8D9' }}>
      {/* 顶部 KODAK 橙带 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: kodakBandH,
          background: '#D4A017',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Courier New', monospace",
          fontSize: `${Math.max(scale(0.01, ctx), 8)}px`,
          letterSpacing: '0.3em',
          fontWeight: 700,
          color: '#3A2A00',
          zIndex: 3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        KODAK GOLD 200 · {ctx.modelText || '—'}
      </div>
      {/* 照片 */}
      <div
        style={{
          position: 'absolute',
          top: kodakBandH + containerHeight * 0.02,
          left: pad,
          right: pad,
          bottom: captionH,
          overflow: 'hidden',
          zIndex: 1,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      {/* 底部参数 grid */}
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: containerHeight * 0.03,
          display: 'grid',
          gridTemplateColumns: orientation === 'portrait' ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          gap: `${scale(0.008, ctx)}px ${scale(0.016, ctx)}px`,
          fontFamily: "'Courier New', monospace",
          fontSize: `${scale(0.013, ctx)}px`,
          color: '#2A2A2A',
          zIndex: 5,
        }}
      >
        {exifItems.map((item) => (
          <div
            key={item.label}
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.3,
            }}
          >
            <span
              style={{
                fontSize: `${scale(0.01, ctx)}px`,
                opacity: 0.55,
                display: 'block',
                textTransform: 'uppercase',
                marginBottom: 2,
                letterSpacing: '0.15em',
                fontWeight: 700,
              }}
            >
              {item.label}
            </span>
            <span>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function shortLens(lens?: string): string {
  if (!lens) return '—'
  // "FE 70-200mm F2.8 GM OSS II" → "70-200mm F2.8"
  const m = lens.match(/(\d+(?:-\d+)?mm(?:\s*F[\d.]+)?)/i)
  return m?.[1] ?? lens.slice(0, 20)
}

// ============================================================================
// METAL · 金属 / 徽章
// ============================================================================

function renderBrushedMetal(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const plateH = (orientation === 'portrait' ? 0.2 : 0.14) * containerHeight
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#1A1A1C' }}>
      {/* 照片(顶满 · 底部给铭牌让位) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: plateH,
          overflow: 'hidden',
          zIndex: 1,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      {/* 金属拉丝铭牌 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: plateH,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.2) 100%), ' +
            'repeating-linear-gradient(90deg, #8a8a8d 0px, #9a9a9d 1px, #7a7a7d 2px), #8a8a8d',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${containerWidth * 0.06}px`,
          zIndex: 2,
          gap: 16,
        }}
      >
        <div
          style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: `${scale(orientation === 'portrait' ? 0.034 : 0.022, ctx)}px`,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#1A1A1A',
            textShadow: '0 1px 0 rgba(255,255,255,0.4), 0 -1px 0 rgba(0,0,0,0.2)',
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: `${scale(0.014, ctx)}px`,
            color: 'rgba(26,26,26,0.7)',
            letterSpacing: '0.15em',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {ctx.paramText || '—'}
        </div>
      </div>
    </div>
  )
}

function renderMedalPlate(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const medalSize = Math.min(containerWidth, containerHeight) * (orientation === 'portrait' ? 0.17 : 0.14)
  return (
    <>
      <PhotoCover src={ctx.imageSrc} />
      {/* 右下角金色圆章 */}
      <div
        style={{
          position: 'absolute',
          right: `${containerWidth * 0.05}px`,
          bottom: `${containerHeight * 0.05}px`,
          width: medalSize,
          height: medalSize,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #ffd89b, #b8860b 45%, #6b4500 100%)',
          boxShadow:
            '0 6px 18px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#3A2500',
          zIndex: 10,
          padding: `0 ${medalSize * 0.1}px`,
        }}
      >
        <div
          style={{
            fontFamily: "'Times New Roman', serif",
            fontWeight: 700,
            fontSize: `${medalSize * 0.16}px`,
            letterSpacing: '0.05em',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '90%',
            lineHeight: 1,
          }}
        >
          {ctx.exif.make || '—'}
        </div>
        <div
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: `${medalSize * 0.11}px`,
            letterSpacing: '0.05em',
            marginTop: 3,
            opacity: 0.85,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '90%',
            textAlign: 'center',
            lineHeight: 1,
          }}
        >
          {ctx.exif.model || '—'}
        </div>
      </div>
    </>
  )
}

// ============================================================================
// FLOATING · 浮动徽章
// ============================================================================

function renderFloatingCaption(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const cardW = containerWidth * (orientation === 'portrait' ? 0.7 : 0.5)
  return (
    <>
      <PhotoCover src={ctx.imageSrc} />
      <div
        style={{
          position: 'absolute',
          right: `${containerWidth * 0.04}px`,
          bottom: `${containerHeight * 0.04}px`,
          maxWidth: cardW,
          background: '#fff',
          padding: `${scale(0.014, ctx)}px ${scale(0.02, ctx)}px ${scale(0.014, ctx)}px ${scale(0.024, ctx)}px`,
          borderRadius: 3,
          boxShadow: '0 12px 36px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)',
          zIndex: 10,
          overflow: 'hidden',
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
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 700,
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.02, ctx)}px`,
            color: '#1A1A1A',
            marginBottom: 3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: `${scale(0.014, ctx)}px`,
            color: '#444',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.paramText || '—'}
        </div>
      </div>
    </>
  )
}

function renderStampCorner(ctx: StageFiveContext) {
  const { containerWidth, containerHeight } = ctx
  return (
    <>
      <PhotoCover src={ctx.imageSrc} />
      <div
        style={{
          position: 'absolute',
          right: `${containerWidth * 0.04}px`,
          bottom: `${containerHeight * 0.04}px`,
          fontFamily: "'Courier New', monospace",
          fontWeight: 700,
          color: '#FF6B00',
          textShadow: '0 0 4px rgba(255,107,0,0.4), 0 0 10px rgba(255,107,0,0.25)',
          textAlign: 'right',
          zIndex: 10,
          maxWidth: '60%',
        }}
      >
        <div
          style={{
            fontSize: `${scale(0.03, ctx)}px`,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontSize: `${scale(0.014, ctx)}px`,
            letterSpacing: '0.1em',
            opacity: 0.85,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.paramText || '—'}
        </div>
      </div>
    </>
  )
}
