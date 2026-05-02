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

  // Logo 路径(从 overrides 传入 · Watermark.tsx 自动按 EXIF make 匹配)
  const logoSrc = overrides.logoPath
    ? `grain://logo/${encodeURIComponent(overrides.logoPath.split('/').pop()!)}?v=1`
    : undefined

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
    logoSrc,
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
  logoSrc?: string
}

function renderByStyleId(ctx: StageFiveContext): React.ReactNode {
  switch (ctx.styleId) {
    // glass
    case 'frosted-glass':
      return renderFrostedGlass(ctx)
    case 'glass-chip':
      return renderGlassChip(ctx)
    case 'glass-gradient':
      return renderGlassGradient(ctx)
    case 'glass-minimal':
      return renderGlassMinimal(ctx)
    // oil
    case 'oil-texture':
      return renderOilTexture(ctx)
    case 'watercolor-caption':
      return renderWatercolorCaption(ctx)
    case 'oil-classic':
      return renderOilClassic(ctx)
    // ambient
    case 'ambient-glow':
      return renderAmbientGlow(ctx)
    case 'bokeh-pillar':
      return renderBokehPillar(ctx)
    case 'ambient-vinyl':
      return renderAmbientVinyl(ctx)
    case 'ambient-aura':
      return renderAmbientAura(ctx)
    case 'ambient-soft':
      return renderAmbientSoft(ctx)
    case 'ambient-dark':
      return renderAmbientDark(ctx)
    case 'ambient-gradient':
      return renderAmbientGradient(ctx)
    case 'ambient-mist':
    case 'ambient-twilight':
    case 'ambient-ocean':
    case 'ambient-forest':
    case 'ambient-film':
    case 'ambient-cream':
    case 'ambient-rose':
    case 'ambient-mono':
      return renderAmbientColored(ctx)
    // cinema
    case 'cinema-scope':
      return renderCinemaScope(ctx)
    case 'neon-edge':
      return renderNeonEdge(ctx)
    case 'cinema-letterbox':
      return renderCinemaLetterbox(ctx)
    case 'cinema-timestamp':
      return renderCinemaTimestamp(ctx)
    // editorial
    case 'swiss-grid':
      return renderSwissGrid(ctx)
    case 'contact-sheet':
      return renderContactSheet(ctx)
    case 'editorial-minimal':
      return renderEditorialMinimal(ctx)
    // floating
    case 'floating-caption':
      return renderFloatingCaption(ctx)
    case 'stamp-corner':
      return renderStampCorner(ctx)
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

/** 品牌 Logo · 与参数文字配合显示(放在文字行左侧或上方) */
function BrandLogo({ ctx, height }: { ctx: StageFiveContext; height?: number }) {
  if (!ctx.logoSrc) return null
  const h = height ?? scale(0.035, ctx)
  return (
    <img
      src={ctx.logoSrc}
      alt=""
      draggable={false}
      style={{
        height: h,
        width: 'auto',
        objectFit: 'contain',
        opacity: 0.9,
        flexShrink: 0,
      }}
    />
  )
}

// ============================================================================
// GLASS · 玻璃拟态
// ============================================================================

function renderFrostedGlass(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const glassH = containerHeight * (orientation === 'portrait' ? 0.14 : 0.12)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      {/* 照片占上方 · 留底部给玻璃区 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: glassH, overflow: 'hidden' }}>
        <PhotoCover src={ctx.imageSrc} />
      </div>
      {/* 照片底部向玻璃区半透明过渡 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: glassH,
          height: glassH * 0.6,
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.6) 100%)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      {/* 底部玻璃区 · 在照片外 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: glassH,
          backdropFilter: 'blur(30px) saturate(150%)',
          WebkitBackdropFilter: 'blur(30px) saturate(150%)',
          background: 'rgba(20, 20, 30, 0.75)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${containerWidth * 0.05}px`,
          gap: scale(0.015, ctx),
          zIndex: 5,
        }}
      >
        <BrandLogo ctx={ctx} height={Math.round(glassH * 0.45)} />
        <div style={{ flex: 1, minWidth: 0, color: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }}>
          <GlassLine size={scale(0.02, ctx)} weight={600}>{ctx.modelText || '—'}</GlassLine>
          <GlassLine size={scale(0.014, ctx)} color="rgba(255,255,255,0.75)" mono mt={2}>{ctx.paramText || '—'}</GlassLine>
        </div>
      </div>
    </div>
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
  const { containerWidth, containerHeight, orientation } = ctx
  const glassH = containerHeight * (orientation === 'portrait' ? 0.12 : 0.1)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: glassH, overflow: 'hidden' }}>
        <PhotoCover src={ctx.imageSrc} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: glassH, height: glassH * 0.5, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.5))', zIndex: 2, pointerEvents: 'none' }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: glassH,
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          background: 'rgba(15, 15, 20, 0.8)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: `0 ${containerWidth * 0.05}px`,
          gap: scale(0.012, ctx),
          zIndex: 5,
        }}
      >
        <BrandLogo ctx={ctx} height={Math.round(glassH * 0.4)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 999, padding: `${scale(0.008, ctx)}px ${scale(0.014, ctx)}px`, border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ width: scale(0.022, ctx), height: scale(0.022, ctx), borderRadius: '50%', background: 'linear-gradient(135deg, #ff8c42, #ff3a3a)', flexShrink: 0 }} />
          <div style={{ fontFamily: "'JetBrains Mono', monospace", minWidth: 0 }}>
            <GlassLine size={scale(0.013, ctx)} weight={600}>{ctx.modelText || '—'}</GlassLine>
            <GlassLine size={scale(0.01, ctx)} color="rgba(255,255,255,0.7)" mt={1}>{ctx.paramText || '—'}</GlassLine>
          </div>
        </div>
      </div>
    </div>
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
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <BrandLogo ctx={ctx} height={scale(0.03, ctx)} />
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: `${scale(orientation === 'portrait' ? 0.028 : 0.022, ctx)}px`,
            fontWeight: 500,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
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
  // swiss-grid 独立显示 lensModel · paramText 需要排除 lens 避免重复
  const paramsNoLens = [
    ctx.exif.focalLength ? `${ctx.exif.focalLength}mm` : null,
    ctx.exif.fNumber ? `f/${ctx.exif.fNumber}` : null,
    ctx.exif.exposureTime ? `${ctx.exif.exposureTime}s` : null,
    ctx.exif.iso ? `ISO ${ctx.exif.iso}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')
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
          {paramsNoLens || '—'}
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
// GLASS 扩展 · glass-gradient / glass-minimal
// ============================================================================

function renderGlassGradient(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const glassH = containerHeight * (orientation === 'portrait' ? 0.14 : 0.12)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: glassH, overflow: 'hidden' }}>
        <PhotoCover src={ctx.imageSrc} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: glassH, height: glassH * 0.6, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.5))', zIndex: 2, pointerEvents: 'none' }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: glassH,
          background: 'linear-gradient(90deg, rgba(120,80,220,0.2), rgba(80,180,220,0.15), rgba(220,120,80,0.2))',
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${containerWidth * 0.05}px`,
          gap: scale(0.015, ctx),
          zIndex: 5,
        }}
      >
        <BrandLogo ctx={ctx} height={Math.round(glassH * 0.45)} />
        <div style={{ flex: 1, minWidth: 0, color: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }}>
          <GlassLine size={scale(0.02, ctx)} weight={600}>{ctx.modelText || '—'}</GlassLine>
          <GlassLine size={scale(0.014, ctx)} color="rgba(255,255,255,0.75)" mono mt={2}>{ctx.paramText || '—'}</GlassLine>
        </div>
      </div>
    </div>
  )
}

function renderGlassMinimal(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const glassH = containerHeight * (orientation === 'portrait' ? 0.1 : 0.08)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: glassH, overflow: 'hidden' }}>
        <PhotoCover src={ctx.imageSrc} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: glassH, height: glassH * 0.4, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.4))', zIndex: 2, pointerEvents: 'none' }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: glassH,
          background: 'rgba(10, 10, 15, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${containerWidth * 0.05}px`,
          gap: scale(0.012, ctx),
          zIndex: 5,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <BrandLogo ctx={ctx} height={Math.round(glassH * 0.4)} />
        <div style={{ flex: 1, minWidth: 0, color: '#fff' }}>
          <GlassLine size={scale(0.012, ctx)} color="rgba(255,255,255,0.85)">{ctx.modelText || '—'}</GlassLine>
          <GlassLine size={scale(0.01, ctx)} color="rgba(255,255,255,0.55)" mt={1}>{ctx.paramText || '—'}</GlassLine>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// OIL 扩展 · oil-classic
// ============================================================================

function renderOilClassic(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const frame = 0.06
  const captionH = orientation === 'portrait' ? 0.18 : 0.14
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#F5F0E6' }}>
      <OilPaperTexture />
      <div
        style={{
          position: 'absolute',
          top: containerHeight * frame,
          left: containerWidth * frame,
          right: containerWidth * frame,
          bottom: containerHeight * captionH,
          overflow: 'hidden',
          zIndex: 1,
          backgroundColor: '#000',
          boxShadow: 'inset 0 0 0 1px rgba(140,110,70,0.2)',
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          color: '#3A2E1E',
          zIndex: 5,
          padding: '0 10%',
        }}
      >
        <div
          style={{
            fontFamily: "'Georgia', serif",
            fontStyle: 'italic',
            fontSize: `${scale(0.02, ctx)}px`,
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
            fontFamily: "'Georgia', serif",
            fontSize: `${scale(0.013, ctx)}px`,
            color: '#7D6C4E',
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
// AMBIENT 扩展 · ambient-vinyl / ambient-aura
// ============================================================================

function renderAmbientVinyl(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
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
            filter: 'blur(50px) saturate(120%)',
            transform: 'scale(1.4)',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1 }} />
      {/* 圆形照片居中 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -55%)',
          width: `${Math.min(containerWidth, containerHeight) * 0.6}px`,
          height: `${Math.min(containerWidth, containerHeight) * 0.6}px`,
          borderRadius: '50%',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          zIndex: 2,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: `${containerHeight * 0.06}px`,
          textAlign: 'center',
          color: '#fff',
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.024 : 0.02, ctx)}px`,
            fontWeight: 500,
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
            opacity: 0.7,
            marginTop: 3,
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

function renderAmbientAura(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const photoSide = orientation === 'portrait' ? 0.06 : 0.08
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
            filter: 'blur(80px) saturate(180%) brightness(0.8)',
            transform: 'scale(1.6)',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1 }} />
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.08,
          left: containerWidth * photoSide,
          right: containerWidth * photoSide,
          bottom: containerHeight * (orientation === 'portrait' ? 0.2 : 0.16),
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          borderRadius: 4,
          overflow: 'hidden',
          zIndex: 2,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '8%',
          right: '8%',
          bottom: `${containerHeight * 0.05}px`,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.95)',
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.024 : 0.02, ctx)}px`,
            fontWeight: 500,
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
            opacity: 0.75,
            marginTop: 3,
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

function renderAmbientSoft(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const photoSide = orientation === 'portrait' ? 0.06 : 0.08
  return (
    <>
      {/* 乳白柔光底色 */}
      <div style={{ position: 'absolute', inset: 0, background: '#F8F6F2', zIndex: 0 }} />
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(60px) saturate(80%) brightness(1.3)',
            transform: 'scale(1.4)',
            opacity: 0.3,
            zIndex: 1,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.08,
          left: containerWidth * photoSide,
          right: containerWidth * photoSide,
          bottom: containerHeight * (orientation === 'portrait' ? 0.2 : 0.16),
          boxShadow: '0 16px 48px rgba(0,0,0,0.1)',
          borderRadius: 3,
          overflow: 'hidden',
          zIndex: 2,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: `${containerHeight * 0.05}px`,
          textAlign: 'center',
          color: '#2A2A2A',
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
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
            fontSize: `${scale(0.013, ctx)}px`,
            color: '#888',
            marginTop: 3,
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

function renderAmbientDark(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const photoSide = orientation === 'portrait' ? 0.05 : 0.06
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
            filter: 'blur(80px) brightness(0.3) saturate(60%)',
            transform: 'scale(1.5)',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,5,0.75)', zIndex: 1 }} />
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.06,
          left: containerWidth * photoSide,
          right: containerWidth * photoSide,
          bottom: containerHeight * (orientation === 'portrait' ? 0.18 : 0.14),
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          borderRadius: 2,
          overflow: 'hidden',
          zIndex: 2,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: `${containerHeight * 0.04}px`,
          textAlign: 'center',
          zIndex: 5,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: `${scale(orientation === 'portrait' ? 0.02 : 0.016, ctx)}px`,
            fontWeight: 400,
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
            fontSize: `${scale(0.012, ctx)}px`,
            color: 'rgba(255,255,255,0.5)',
            marginTop: 3,
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

function renderAmbientGradient(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const photoSide = orientation === 'portrait' ? 0.05 : 0.06
  return (
    <>
      {/* 暖色渐变底 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #1A0F08 0%, #3D1F0A 50%, #1A0F08 100%)',
          zIndex: 0,
        }}
      />
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(70px) saturate(150%) brightness(0.6)',
            transform: 'scale(1.5)',
            opacity: 0.5,
            zIndex: 1,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(26,15,8,0.3) 0%, rgba(200,100,30,0.15) 70%, rgba(26,15,8,0.7) 100%)',
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.06,
          left: containerWidth * photoSide,
          right: containerWidth * photoSide,
          bottom: containerHeight * (orientation === 'portrait' ? 0.2 : 0.18),
          boxShadow: '0 20px 56px rgba(0,0,0,0.5), 0 0 80px rgba(200,100,30,0.15)',
          borderRadius: 3,
          overflow: 'hidden',
          zIndex: 3,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: `${containerHeight * 0.05}px`,
          textAlign: 'center',
          zIndex: 5,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.92)',
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
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
            fontSize: `${scale(0.013, ctx)}px`,
            color: 'rgba(255,220,180,0.75)',
            marginTop: 3,
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

// 8 个色调 ambient 变体共用的渲染函数
const AMBIENT_COLOR_MAP: Record<
  string,
  { bg: string; filter: string; overlay: string; modelColor: string; paramColor: string }
> = {
  'ambient-mist': {
    bg: '#0D1520',
    filter: 'blur(60px) saturate(80%) brightness(0.5)',
    overlay: 'rgba(13,21,32,0.5)',
    modelColor: 'rgba(200,220,240,0.9)',
    paramColor: 'rgba(160,190,220,0.7)',
  },
  'ambient-twilight': {
    bg: '#1A0D1F',
    filter: 'blur(60px) saturate(120%) brightness(0.5)',
    overlay: 'rgba(26,13,31,0.4)',
    modelColor: 'rgba(255,200,150,0.9)',
    paramColor: 'rgba(200,160,200,0.7)',
  },
  'ambient-ocean': {
    bg: '#060E18',
    filter: 'blur(60px) saturate(100%) brightness(0.4)',
    overlay: 'rgba(6,14,24,0.5)',
    modelColor: 'rgba(150,200,240,0.9)',
    paramColor: 'rgba(100,160,220,0.65)',
  },
  'ambient-forest': {
    bg: '#081208',
    filter: 'blur(60px) saturate(120%) brightness(0.4)',
    overlay: 'rgba(8,18,8,0.5)',
    modelColor: 'rgba(180,220,170,0.9)',
    paramColor: 'rgba(140,180,130,0.65)',
  },
  'ambient-film': {
    bg: '#080808',
    filter: 'blur(50px) saturate(60%) brightness(0.3)',
    overlay: 'rgba(8,8,8,0.6)',
    modelColor: 'rgba(255,255,255,0.8)',
    paramColor: 'rgba(255,255,255,0.45)',
  },
  'ambient-cream': {
    bg: '#FDF8F0',
    filter: 'blur(60px) saturate(80%) brightness(1.4)',
    overlay: 'rgba(253,248,240,0.4)',
    modelColor: '#3A3020',
    paramColor: 'rgba(90,70,40,0.6)',
  },
  'ambient-rose': {
    bg: '#1F0D14',
    filter: 'blur(60px) saturate(140%) brightness(0.5)',
    overlay: 'rgba(31,13,20,0.4)',
    modelColor: 'rgba(255,200,210,0.9)',
    paramColor: 'rgba(220,160,180,0.65)',
  },
  'ambient-mono': {
    bg: '#0A0A0A',
    filter: 'blur(60px) saturate(0%) brightness(0.4)',
    overlay: 'rgba(10,10,10,0.5)',
    modelColor: 'rgba(255,255,255,0.88)',
    paramColor: 'rgba(255,255,255,0.5)',
  },
}

function renderAmbientColored(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const colors = AMBIENT_COLOR_MAP[ctx.styleId] ?? AMBIENT_COLOR_MAP['ambient-mist']!
  const photoSide = orientation === 'portrait' ? 0.06 : 0.07
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: colors.bg, zIndex: 0 }} />
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: colors.filter,
            transform: 'scale(1.5)',
            zIndex: 1,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: colors.overlay, zIndex: 2 }} />
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.07,
          left: containerWidth * photoSide,
          right: containerWidth * photoSide,
          bottom: containerHeight * (orientation === 'portrait' ? 0.2 : 0.16),
          boxShadow: '0 20px 56px rgba(0,0,0,0.5)',
          borderRadius: 3,
          overflow: 'hidden',
          zIndex: 3,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: `${containerHeight * 0.05}px`,
          textAlign: 'center',
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <BrandLogo ctx={ctx} height={scale(0.03, ctx)} />
        <div
          style={{
            color: colors.modelColor,
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: `${scale(0.013, ctx)}px`,
            color: colors.paramColor,
            marginTop: 3,
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
// CINEMA 扩展 · cinema-letterbox / cinema-timestamp
// ============================================================================

function renderCinemaLetterbox(ctx: StageFiveContext) {
  const { containerHeight, orientation } = ctx
  const barH = (orientation === 'portrait' ? 0.14 : 0.12) * containerHeight
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <div
        style={{
          position: 'absolute',
          top: barH,
          bottom: barH,
          left: 0,
          right: 0,
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: barH,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.85)',
          fontFamily: "'Courier New', monospace",
          zIndex: 5,
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: `${scale(0.016, ctx)}px`,
            letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '80%',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontSize: `${scale(0.012, ctx)}px`,
            opacity: 0.6,
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '80%',
          }}
        >
          {ctx.paramText || '—'}
        </div>
      </div>
    </div>
  )
}

function renderCinemaTimestamp(ctx: StageFiveContext) {
  const { containerWidth, containerHeight } = ctx
  return (
    <>
      <PhotoCover src={ctx.imageSrc} />
      <div
        style={{
          position: 'absolute',
          left: `${containerWidth * 0.03}px`,
          bottom: `${containerHeight * 0.04}px`,
          maxWidth: '60%',
          fontFamily: "'Courier New', monospace",
          color: '#00FF66',
          zIndex: 10,
          textShadow: '0 0 4px rgba(0,255,102,0.4)',
        }}
      >
        <div
          style={{
            fontSize: `${scale(0.014, ctx)}px`,
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.modelText || '—'}
        </div>
        <div
          style={{
            fontSize: `${scale(0.011, ctx)}px`,
            opacity: 0.7,
            marginTop: 1,
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

// ============================================================================
// EDITORIAL 扩展 · editorial-minimal
// ============================================================================

function renderEditorialMinimal(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const captionH = (orientation === 'portrait' ? 0.18 : 0.12) * containerHeight
  const pad = containerWidth * 0.04
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF' }}>
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
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          color: '#1A1A1A',
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: `${scale(0.014, ctx)}px`,
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
            fontSize: `${scale(0.011, ctx)}px`,
            color: '#888',
            marginTop: 2,
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
