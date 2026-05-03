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
  photoSrcOverride,
}: FrameLayoutProps) {
  const orientation = classifyOrientation(photo.width, photo.height)
  const resolvedOrientation: 'landscape' | 'portrait' = orientation === 'portrait' ? 'portrait' : 'landscape'
  const layout = resolvedOrientation === 'portrait' ? style.portrait : style.landscape

  const showFields = overrides.showFields ?? DEFAULT_FRAME_SHOW_FIELDS
  // 所有阶段 5 风格都带独立 model slot(数据层 hasModelSlot=true) · 参数行排除 make/model
  const modelText = [photo.exif.make, photo.exif.model].filter(Boolean).join(' ').trim()
  const paramText = buildFrameParamLine(photo.exif, showFields, { excludeModelMake: true })
  // 按逻辑分组：镜头型号独立一行，拍摄参数独立一行
  const lensText = showFields.lens && photo.exif.lensModel ? photo.exif.lensModel : ''
  const shootingParts: string[] = []
  if (showFields.focalLength && photo.exif.focalLength) shootingParts.push(`${photo.exif.focalLength}mm`)
  if (showFields.aperture && photo.exif.fNumber) shootingParts.push(`f/${photo.exif.fNumber}`)
  if (showFields.shutter && photo.exif.exposureTime) shootingParts.push(`${photo.exif.exposureTime}s`)
  if (showFields.iso && photo.exif.iso) shootingParts.push(`ISO ${photo.exif.iso}`)
  const shootingText = shootingParts.join('  ·  ')
  const artistText = showFields.artist ? (overrides.artistName ?? photo.exif.artist ?? '') : ''

  const imageSrc = photoSrcOverride ?? (photo.thumbPath ? thumbSrc(photo) : undefined)

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
    lensText,
    shootingText,
    artistText,
    exif: photo.exif,
    logoSrc,
    photoAspect:
      photo.width && photo.height
        ? photo.width / photo.height
        : resolvedOrientation === 'portrait'
          ? 2 / 3
          : 3 / 2,
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
  /** 镜头型号（独立一行） */
  lensText: string
  /** 拍摄参数：焦距 · 光圈 · 快门 · ISO（独立一行） */
  shootingText: string
  artistText: string
  exif: PhotoExif
  logoSrc?: string
  /** 照片原始宽高比 (width / height) · 用于动态计算照片容器避免留白或裁切 */
  photoAspect: number
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
    case 'ambient-rounded':
      return renderAmbientRounded(ctx)
    case 'ambient-island':
      return renderAmbientIsland(ctx)
    case 'ambient-glass':
      return renderAmbientGlass(ctx)
    case 'ambient-aurora':
      return renderAmbientAurora(ctx)
    case 'ambient-frost':
      return renderAmbientFrost(ctx)
    case 'ambient-breathe':
      return renderAmbientBreathe(ctx)
    case 'ambient-mirror':
      return renderAmbientMirror(ctx)
    case 'ambient-vignette':
      return renderAmbientVignette(ctx)
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
    case 'editorial-minimal':
      return renderEditorialMinimal(ctx)
    case 'magazine-cover':
      return renderMagazineCover(ctx)
    // floating
    case 'floating-caption':
      return renderFloatingCaption(ctx)
    case 'stamp-corner':
      return renderStampCorner(ctx)
    case 'transparent-overlay':
      return renderTransparentOverlay(ctx)
    // simple
    case 'white-classic':
      return renderWhiteClassic(ctx)
    case 'separator-line':
      return renderSeparatorLine(ctx)
    case 'rounded-shadow':
      return renderRoundedShadow(ctx)
    case 'gradient-border':
      return renderGradientBorder(ctx)
    case 'geo-info':
      return renderGeoInfo(ctx)
    // collage
    case 'half-frame':
      return renderHalfFrame(ctx)
    case 'diptych':
      return renderDiptych(ctx)
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
      draggable={false}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: 1,
      }}
    />
  )
}

/**
 * 根据照片实际宽高比计算照片容器在给定可用区域内的最优尺寸
 * 保证照片完整显示（不裁切、不留白）
 *
 * @param availW 可用宽度
 * @param availH 可用高度
 * @param photoAspect 照片宽高比 (w/h)
 * @returns { width, height, offsetX, offsetY } 容器尺寸和居中偏移
 */
function photoFit(availW: number, availH: number, photoAspect: number) {
  const areaAspect = availW / availH
  let w: number
  let h: number
  if (photoAspect > areaAspect) {
    // 照片更宽 → 宽度撑满，高度按比例缩小
    w = availW
    h = availW / photoAspect
  } else {
    // 照片更高 → 高度撑满，宽度按比例缩小
    h = availH
    w = availH * photoAspect
  }
  return {
    width: Math.round(w),
    height: Math.round(h),
    offsetX: Math.round((availW - w) / 2),
    offsetY: Math.round((availH - h) / 2),
  }
}

/**
 * 带宽高比自适应的照片容器
 * 根据照片实际比例在可用区域内居中显示，不裁切不留白
 */
function FitPhotoBox({
  ctx,
  top,
  left,
  right,
  bottom,
  shadow,
  radius,
  zIndex,
}: {
  ctx: StageFiveContext
  top: number
  left: number
  right: number
  bottom: number
  shadow?: string
  radius?: number
  zIndex?: number
}) {
  const availW = ctx.containerWidth - left - right
  const availH = ctx.containerHeight - top - bottom
  const pf = photoFit(availW, availH, ctx.photoAspect)
  return (
    <div
      style={{
        position: 'absolute',
        top: top + pf.offsetY,
        left: left + pf.offsetX,
        width: pf.width,
        height: pf.height,
        boxShadow: shadow ?? 'none',
        borderRadius: radius ?? 0,
        overflow: 'hidden',
        zIndex: zIndex ?? 2,
        backgroundColor: '#000',
      }}
    >
      <PhotoCover src={ctx.imageSrc} />
    </div>
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

/**
 * 预览基准 minEdge（CSS 像素）。
 * 在预览场景下 containerWidth/Height 通常为 400-800px 级别，
 * blur(60px) 在此尺度下视觉效果良好。
 * 导出时容器可达 3000-6000px 像素，blur 必须等比放大，
 * 否则模糊效果几乎看不见。
 */
const BLUR_PREVIEW_BASE = 600

/**
 * 按容器 minEdge 等比缩放 blur 半径 —— 保证预览和导出视觉一致。
 *
 * 原理：`blur(60px)` 在 600px 容器中占 10%，在 4000px 容器中只占 1.5%。
 * 等比缩放后，4000px 容器会使用 `blur(400px)`，视觉效果与预览一致。
 */
function scaleBlur(basePx: number, ctx: StageFiveContext): number {
  const minEdge = Math.min(ctx.containerWidth, ctx.containerHeight)
  return Math.round(basePx * (minEdge / BLUR_PREVIEW_BASE))
}

/**
 * 按容器尺寸等比缩放 inset 溢出值（防模糊边缘白边）。
 */
function scaleInset(basePx: number, ctx: StageFiveContext): number {
  const minEdge = Math.min(ctx.containerWidth, ctx.containerHeight)
  return Math.round(basePx * (minEdge / BLUR_PREVIEW_BASE))
}

/**
 * 构造动态 filter 字符串：将 `blur(Npx)` 中的 N 按容器尺寸等比缩放，
 * 其余 saturate/brightness 等保持原样。
 */
function scaleFilterBlur(filterStr: string, ctx: StageFiveContext): string {
  return filterStr.replace(/blur\((\d+)px\)/g, (_m, px) => `blur(${scaleBlur(Number(px), ctx)}px)`)
}

/**
 * Logo + 机型文字的统一渲染组件
 *
 * 两种布局模式（由调用方根据可用空间决定）：
 *   - 'top'（默认）：Logo 在机型文字正上方水平居中，适合有足够垂直空间的 caption 区域
 *   - 'inline'：Logo 在机型文字左侧、与文字垂直居中，适合高度受限的底栏（glass/cinema 等）
 *
 * 使用 em 单位使 Logo 相对父元素字号自适应
 */
function LogoModel({
  logoSrc,
  modelText,
  placement = 'top',
}: {
  logoSrc?: string
  modelText: string
  /** 'top' = Logo 在文字正上方居中; 'inline' = Logo 在文字左侧垂直居中 */
  placement?: 'top' | 'inline'
}) {
  if (!logoSrc) {
    return <>{modelText || '—'}</>
  }
  if (placement === 'inline') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4em',
        }}
      >
        <img
          src={logoSrc}
          alt=""
          draggable={false}
          style={{
            height: '1.4em',
            width: 'auto',
            objectFit: 'contain',
            opacity: 0.9,
            flexShrink: 0,
          }}
        />
        <span>{modelText || '—'}</span>
      </span>
    )
  }
  // placement === 'top': Logo 在文字正上方，整体宽度居中
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.3em',
      }}
    >
      <img
        src={logoSrc}
        alt=""
        draggable={false}
        style={{
          height: '1.8em',
          width: 'auto',
          objectFit: 'contain',
          opacity: 0.9,
        }}
      />
      <span>{modelText || '—'}</span>
    </span>
  )
}

/**
 * 参数文本按逻辑分组显示为两行：
 *   第 1 行：镜头型号（如 FE 70-200mm F2.8 GM OSS II）
 *   第 2 行：拍摄参数（如 200mm · f/5.6 · 1/125s · ISO 200）
 * 不随意折行，按语义分组换行
 */
function ParamLines({
  lensText,
  shootingText,
  fontSize,
  color,
  letterSpacing,
  mono = true,
}: {
  lensText: string
  shootingText: string
  fontSize: number
  color?: string
  letterSpacing?: string
  mono?: boolean
}) {
  if (!lensText && !shootingText) return <div style={{ fontSize: `${fontSize}px`, color }}>—</div>
  const baseStyle: React.CSSProperties = {
    fontFamily: mono ? "'JetBrains Mono', monospace" : undefined,
    fontSize: `${fontSize}px`,
    color: color ?? 'inherit',
    letterSpacing: letterSpacing ?? undefined,
    lineHeight: 1.6,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {lensText && <div style={baseStyle}>{lensText}</div>}
      {shootingText && <div style={baseStyle}>{shootingText}</div>}
    </div>
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
          backdropFilter: `blur(${scaleBlur(30, ctx)}px) saturate(150%)`,
          WebkitBackdropFilter: `blur(${scaleBlur(30, ctx)}px) saturate(150%)`,
          background: 'rgba(20, 20, 30, 0.75)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${containerWidth * 0.05}px`,
          gap: scale(0.015, ctx),
          zIndex: 5,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, color: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }}>
          <GlassLine size={scale(0.02, ctx)} weight={600}>
            <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
          </GlassLine>
          {ctx.lensText && (
            <GlassLine size={scale(0.012, ctx)} color="rgba(255,255,255,0.7)" mono mt={2}>
              {ctx.lensText}
            </GlassLine>
          )}
          <GlassLine size={scale(0.012, ctx)} color="rgba(255,255,255,0.6)" mono mt={1}>
            {ctx.shootingText || '—'}
          </GlassLine>
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
        maxWidth: '100%',
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
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: glassH,
          height: glassH * 0.5,
          background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.5))',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: glassH,
          backdropFilter: `blur(${scaleBlur(24, ctx)}px) saturate(150%)`,
          WebkitBackdropFilter: `blur(${scaleBlur(24, ctx)}px) saturate(150%)`,
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 999,
            padding: `${scale(0.008, ctx)}px ${scale(0.014, ctx)}px`,
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ fontFamily: "'JetBrains Mono', monospace", minWidth: 0 }}>
            <GlassLine size={scale(0.013, ctx)} weight={600}>
              <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
            </GlassLine>
            {ctx.lensText && (
              <GlassLine size={scale(0.009, ctx)} color="rgba(255,255,255,0.65)" mt={1}>
                {ctx.lensText}
              </GlassLine>
            )}
            <GlassLine size={scale(0.009, ctx)} color="rgba(255,255,255,0.55)" mt={1}>
              {ctx.shootingText || '—'}
            </GlassLine>
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
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.015, ctx)}
          color="#7D6C4E"
          letterSpacing="0.12em"
          mono={false}
        />
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
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.016, ctx)}
          color="#7D6C4E"
          mono={false}
        />
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
  const margin = containerWidth * 0.04
  const topPad = containerHeight * 0.04
  const bottomPad = containerHeight * captionH + containerHeight * 0.04
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
            filter: scaleFilterBlur('blur(40px) saturate(140%)', ctx),
            transform: 'scale(1.3)',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1 }} />
      {/* 原图居中浮起 · 按照片比例自适应 */}
      <FitPhotoBox
        ctx={ctx}
        top={topPad}
        left={margin}
        right={margin}
        bottom={bottomPad}
        shadow="0 18px 48px rgba(0,0,0,0.5)"
        radius={2}
      />
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
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: `${scale(orientation === 'portrait' ? 0.028 : 0.022, ctx)}px`,
            fontWeight: 500,
            letterSpacing: '0.05em',
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.016, ctx)}
          color="rgba(255,255,255,0.8)"
          letterSpacing="0.06em"
        />
      </div>
    </>
  )
}

function renderBokehPillar(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, imageSrc } = ctx
  const margin = containerWidth * 0.04
  const topPad = containerHeight * 0.04
  const bottomPad = containerHeight * 0.1
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
            filter: scaleFilterBlur('blur(60px)', ctx),
            transform: 'scale(1.5)',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1 }} />
      <FitPhotoBox
        ctx={ctx}
        top={topPad}
        left={margin}
        right={margin}
        bottom={bottomPad}
        shadow="0 20px 60px rgba(0,0,0,0.6)"
        radius={2}
      />
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
        <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
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
        {ctx.shootingText || '—'}
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
            maxWidth: '100%',
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
          maxWidth: '100%',
        }}
      >
        {ctx.shootingText || '—'}
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
            maxWidth: '100%',
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
        </div>
        {ctx.lensText && (
          <div
            style={{
              fontSize: `${scale(0.014, ctx)}px`,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            {ctx.lensText}
          </div>
        )}
        <div
          style={{
            fontSize: `${scale(0.013, ctx)}px`,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
            opacity: 0.8,
          }}
        >
          {ctx.shootingText || '—'}
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
              lineHeight: 1.4,
            }}
          >
            <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
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
              maxWidth: '100%',
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
            lineHeight: 1.6,
            flexWrap: 'wrap',
          }}
        >
          {ctx.shootingText || '—'}
        </div>
      </div>
    </div>
  )
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
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: glassH,
          height: glassH * 0.6,
          background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.5))',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: glassH,
          background:
            'linear-gradient(90deg, rgba(120,80,220,0.2), rgba(80,180,220,0.15), rgba(220,120,80,0.2))',
          backdropFilter: `blur(${scaleBlur(24, ctx)}px) saturate(150%)`,
          WebkitBackdropFilter: `blur(${scaleBlur(24, ctx)}px) saturate(150%)`,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${containerWidth * 0.05}px`,
          gap: scale(0.015, ctx),
          zIndex: 5,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, color: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }}>
          <GlassLine size={scale(0.02, ctx)} weight={600}>
            <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
          </GlassLine>
          {ctx.lensText && (
            <GlassLine size={scale(0.012, ctx)} color="rgba(255,255,255,0.7)" mono mt={2}>
              {ctx.lensText}
            </GlassLine>
          )}
          <GlassLine size={scale(0.012, ctx)} color="rgba(255,255,255,0.6)" mono mt={1}>
            {ctx.shootingText || '—'}
          </GlassLine>
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
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: glassH,
          height: glassH * 0.4,
          background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.4))',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: glassH,
          background: 'rgba(10, 10, 15, 0.85)',
          backdropFilter: `blur(${scaleBlur(20, ctx)}px)`,
          WebkitBackdropFilter: `blur(${scaleBlur(20, ctx)}px)`,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${containerWidth * 0.05}px`,
          gap: scale(0.012, ctx),
          zIndex: 5,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, color: '#fff' }}>
          <GlassLine size={scale(0.012, ctx)} color="rgba(255,255,255,0.85)">
            <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
          </GlassLine>
          {ctx.lensText && (
            <GlassLine size={scale(0.009, ctx)} color="rgba(255,255,255,0.5)" mt={1}>
              {ctx.lensText}
            </GlassLine>
          )}
          <GlassLine size={scale(0.009, ctx)} color="rgba(255,255,255,0.4)" mt={1}>
            {ctx.shootingText || '—'}
          </GlassLine>
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
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="#7D6C4E"
          mono={false}
        />
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
            filter: scaleFilterBlur('blur(50px) saturate(120%)', ctx),
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
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.014, ctx)}
          color="rgba(255,255,255,0.7)"
        />
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
            filter: scaleFilterBlur('blur(80px) saturate(180%) brightness(0.8)', ctx),
            transform: 'scale(1.6)',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1 }} />
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.08}
        left={containerWidth * photoSide}
        right={containerWidth * photoSide}
        bottom={containerHeight * (orientation === 'portrait' ? 0.2 : 0.16)}
        shadow="0 24px 64px rgba(0,0,0,0.5)"
        radius={4}
      />
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
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.014, ctx)}
          color="rgba(255,255,255,0.75)"
        />
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
            filter: scaleFilterBlur('blur(60px) saturate(80%) brightness(1.3)', ctx),
            transform: 'scale(1.4)',
            opacity: 0.3,
            zIndex: 1,
          }}
        />
      )}
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.08}
        left={containerWidth * photoSide}
        right={containerWidth * photoSide}
        bottom={containerHeight * (orientation === 'portrait' ? 0.2 : 0.16)}
        shadow="0 16px 48px rgba(0,0,0,0.1)"
        radius={3}
      />
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
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="#888"
        />
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
            filter: scaleFilterBlur('blur(80px) brightness(0.3) saturate(60%)', ctx),
            transform: 'scale(1.5)',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,5,0.75)', zIndex: 1 }} />
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.06}
        left={containerWidth * photoSide}
        right={containerWidth * photoSide}
        bottom={containerHeight * (orientation === 'portrait' ? 0.18 : 0.14)}
        shadow="0 20px 60px rgba(0,0,0,0.7)"
        radius={2}
      />
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
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.012, ctx)}
          color="rgba(255,255,255,0.5)"
        />
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
            filter: scaleFilterBlur('blur(70px) saturate(150%) brightness(0.6)', ctx),
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
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.06}
        left={containerWidth * photoSide}
        right={containerWidth * photoSide}
        bottom={containerHeight * (orientation === 'portrait' ? 0.2 : 0.18)}
        shadow="0 20px 56px rgba(0,0,0,0.5), 0 0 80px rgba(200,100,30,0.15)"
        radius={3}
        zIndex={3}
      />
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
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="rgba(255,220,180,0.75)"
        />
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
            filter: scaleFilterBlur(colors.filter, ctx),
            transform: 'scale(1.5)',
            zIndex: 1,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: colors.overlay, zIndex: 2 }} />
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.07}
        left={containerWidth * photoSide}
        right={containerWidth * photoSide}
        bottom={containerHeight * (orientation === 'portrait' ? 0.2 : 0.16)}
        shadow="0 20px 56px rgba(0,0,0,0.5)"
        radius={3}
        zIndex={3}
      />
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
        <div
          style={{
            color: colors.modelColor,
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color={colors.paramColor}
        />
      </div>
    </>
  )
}

// ============================================================================
// AMBIENT 新增 · 圆角/阴影/玻璃/极光/霜雾/光圈/反射/暗角
// ============================================================================

function renderAmbientRounded(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const captionH = containerHeight * (orientation === 'portrait' ? 0.22 : 0.18)
  const margin = containerWidth * 0.06
  return (
    <>
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: `-${scaleInset(40, ctx)}px`,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: scaleFilterBlur('blur(50px) saturate(140%) brightness(0.7)', ctx),
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1 }} />
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.05}
        left={margin}
        right={margin}
        bottom={captionH}
        shadow="0 24px 80px rgba(0,0,0,0.6)"
        radius={20}
      />
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          zIndex: 5,
          color: 'rgba(255,255,255,0.92)',
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="rgba(255,255,255,0.6)"
        />
      </div>
    </>
  )
}

function renderAmbientIsland(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const captionH = containerHeight * (orientation === 'portrait' ? 0.2 : 0.16)
  const margin = containerWidth * 0.05
  return (
    <>
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: `-${scaleInset(40, ctx)}px`,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: scaleFilterBlur('blur(60px) saturate(120%) brightness(0.4)', ctx),
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1 }} />
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.05}
        left={margin}
        right={margin}
        bottom={captionH}
        shadow="0 30px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)"
        radius={12}
      />
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          zIndex: 5,
          color: 'rgba(255,255,255,0.9)',
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="rgba(255,255,255,0.55)"
        />
      </div>
    </>
  )
}

function renderAmbientGlass(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const glassH = containerHeight * (orientation === 'portrait' ? 0.2 : 0.18)
  const margin = containerWidth * 0.04
  return (
    <>
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: `-${scaleInset(40, ctx)}px`,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: scaleFilterBlur('blur(40px) saturate(160%) brightness(0.6)', ctx),
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1 }} />
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.04}
        left={margin}
        right={margin}
        bottom={glassH + containerHeight * 0.03}
        shadow="0 20px 60px rgba(0,0,0,0.5)"
        radius={8}
      />
      <div
        style={{
          position: 'absolute',
          left: '4%',
          right: '4%',
          bottom: containerHeight * 0.025,
          height: glassH - containerHeight * 0.01,
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: `blur(${scaleBlur(24, ctx)}px)`,
          WebkitBackdropFilter: `blur(${scaleBlur(24, ctx)}px)`,
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          color: 'rgba(255,255,255,0.92)',
          padding: 12,
        }}
      >
        <div style={{ fontSize: `${scale(0.016, ctx)}px`, fontWeight: 600, lineHeight: 1.4 }}>
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.011, ctx)}
          color="rgba(255,255,255,0.6)"
        />
      </div>
    </>
  )
}

function renderAmbientAurora(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const captionH = containerHeight * (orientation === 'portrait' ? 0.2 : 0.16)
  const margin = containerWidth * 0.06
  return (
    <>
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: `-${scaleInset(40, ctx)}px`,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: scaleFilterBlur('blur(50px) saturate(150%) brightness(0.5)', ctx),
            zIndex: 0,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: `-${scaleInset(30, ctx)}px`,
          background:
            'conic-gradient(from 45deg, rgba(120,80,220,0.2), rgba(80,200,220,0.15), rgba(255,120,80,0.15), rgba(120,80,220,0.2))',
          filter: scaleFilterBlur('blur(40px)', ctx),
          zIndex: 1,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2 }} />
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.06}
        left={margin}
        right={margin}
        bottom={captionH}
        shadow="0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.5), 0 0 50px rgba(120,80,220,0.15)"
        radius={6}
        zIndex={3}
      />
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          zIndex: 5,
          color: 'rgba(255,255,255,0.9)',
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="rgba(255,255,255,0.55)"
        />
      </div>
    </>
  )
}

function renderAmbientFrost(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const captionH = containerHeight * (orientation === 'portrait' ? 0.22 : 0.18)
  const margin = containerWidth * 0.05
  const availW = containerWidth - margin * 2
  const availH = containerHeight - containerHeight * 0.05 - captionH
  const pf = photoFit(availW, availH, ctx.photoAspect)
  return (
    <>
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: `-${scaleInset(40, ctx)}px`,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: scaleFilterBlur('blur(70px) saturate(80%) brightness(0.5)', ctx),
            zIndex: 0,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(180,200,230,0.03)',
          backdropFilter: `blur(${scaleBlur(1, ctx)}px)`,
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.05 + pf.offsetY,
          left: margin + pf.offsetX,
          width: pf.width,
          height: pf.height,
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          border: '2px solid rgba(255,255,255,0.08)',
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
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          zIndex: 5,
          color: 'rgba(255,255,255,0.88)',
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="rgba(255,255,255,0.55)"
        />
      </div>
    </>
  )
}

function renderAmbientBreathe(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const captionH = containerHeight * (orientation === 'portrait' ? 0.22 : 0.18)
  const margin = containerWidth * 0.06
  return (
    <>
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: `-${scaleInset(40, ctx)}px`,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: scaleFilterBlur('blur(50px) saturate(140%) brightness(0.5)', ctx),
            zIndex: 0,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -52%)',
          width: '80%',
          aspectRatio: '1',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, transparent 42%, rgba(100,160,240,0.06) 48%, rgba(100,160,240,0.1) 50%, rgba(100,160,240,0.06) 52%, transparent 58%)',
          boxShadow: '0 0 80px rgba(100,160,240,0.06)',
          zIndex: 1,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1 }} />
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.06}
        left={margin}
        right={margin}
        bottom={captionH}
        shadow="0 24px 70px rgba(0,0,0,0.5)"
        radius={4}
      />
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          zIndex: 5,
          color: 'rgba(255,255,255,0.9)',
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="rgba(255,255,255,0.55)"
        />
      </div>
    </>
  )
}

function renderAmbientMirror(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, imageSrc } = ctx
  const margin = containerWidth * 0.05
  const captionH = containerHeight * 0.12
  const reflectH = containerHeight * 0.1
  const availW = containerWidth - margin * 2
  const availH = containerHeight - containerHeight * 0.04 - reflectH - captionH - containerHeight * 0.02
  const pf = photoFit(availW, availH, ctx.photoAspect)
  return (
    <>
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: `-${scaleInset(40, ctx)}px`,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: scaleFilterBlur('blur(50px) saturate(140%) brightness(0.4)', ctx),
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1 }} />
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.04 + pf.offsetY,
          left: margin + pf.offsetX,
          width: pf.width,
          height: pf.height,
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          zIndex: 2,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      {/* 倒影 */}
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.04 + pf.offsetY + pf.height + 4,
          left: margin + pf.offsetX,
          width: pf.width,
          height: reflectH,
          borderRadius: 4,
          overflow: 'hidden',
          transform: 'scaleY(-1)',
          opacity: 0.15,
          filter: scaleFilterBlur('blur(3px)', ctx),
          zIndex: 2,
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)',
        }}
      >
        <PhotoCover src={imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: containerHeight * 0.03,
          textAlign: 'center',
          zIndex: 5,
          color: 'rgba(255,255,255,0.88)',
        }}
      >
        <div style={{ fontSize: `${scale(0.016, ctx)}px`, fontWeight: 500, lineHeight: 1.4 }}>
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.011, ctx)}
          color="rgba(255,255,255,0.5)"
        />
      </div>
    </>
  )
}

function renderAmbientVignette(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation, imageSrc } = ctx
  const captionH = containerHeight * (orientation === 'portrait' ? 0.2 : 0.16)
  const margin = containerWidth * 0.05
  return (
    <>
      {imageSrc && (
        <div
          style={{
            position: 'absolute',
            inset: `-${scaleInset(40, ctx)}px`,
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: scaleFilterBlur('blur(60px) saturate(100%) brightness(0.35)', ctx),
            zIndex: 0,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.7) 100%)',
          zIndex: 1,
        }}
      />
      <FitPhotoBox
        ctx={ctx}
        top={containerHeight * 0.05}
        left={margin}
        right={margin}
        bottom={captionH}
        shadow="0 20px 60px rgba(0,0,0,0.6)"
        radius={3}
      />
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          zIndex: 5,
          color: 'rgba(255,255,255,0.88)',
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="rgba(255,255,255,0.5)"
        />
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
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
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
          {ctx.shootingText || '—'}
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
            maxWidth: '100%',
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
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
            maxWidth: '100%',
          }}
        >
          {ctx.shootingText || '—'}
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
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.011, ctx)}
          color="#888"
        />
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
            maxWidth: '100%',
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
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
            maxWidth: '100%',
          }}
        >
          {ctx.shootingText || '—'}
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
            maxWidth: '100%',
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
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
            maxWidth: '100%',
          }}
        >
          {ctx.shootingText || '—'}
        </div>
      </div>
    </>
  )
}

// ============================================================================
// SIMPLE · 简约经典（新增 5 个）
// ============================================================================

function renderWhiteClassic(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const pad = containerWidth * 0.06
  const captionH = containerHeight * (orientation === 'portrait' ? 0.2 : 0.18)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF' }}>
      <FitPhotoBox ctx={ctx} top={pad} left={pad} right={pad} bottom={captionH} />
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          zIndex: 5,
          color: '#1A1A1A',
        }}
      >
        <div
          style={{
            fontSize: `${scale(orientation === 'portrait' ? 0.022 : 0.018, ctx)}px`,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.013, ctx)}
          color="#666"
        />
      </div>
    </div>
  )
}

function renderSeparatorLine(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const pad = containerWidth * 0.05
  const captionH = containerHeight * (orientation === 'portrait' ? 0.14 : 0.12)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF' }}>
      <FitPhotoBox ctx={ctx} top={containerHeight * 0.04} left={pad} right={pad} bottom={captionH} />
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: captionH - 4,
          height: 1,
          background: '#E0E0E0',
          zIndex: 3,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: containerHeight * 0.03,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 5,
          color: '#333',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: `${scale(0.015, ctx)}px`,
            fontWeight: 600,
            minWidth: 0,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: `${scale(0.011, ctx)}px`,
            color: '#888',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {ctx.shootingText || '—'}
        </div>
      </div>
    </div>
  )
}

function renderRoundedShadow(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const pad = containerWidth * 0.08
  const captionH = containerHeight * (orientation === 'portrait' ? 0.18 : 0.16)
  const availW = containerWidth - pad * 2
  const availH = containerHeight - pad - captionH
  const pf = photoFit(availW, availH, ctx.photoAspect)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#F0F0F0' }}>
      <div
        style={{
          position: 'absolute',
          top: pad + pf.offsetY,
          left: pad + pf.offsetX,
          width: pf.width,
          height: pf.height,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.1)',
          zIndex: 2,
          backgroundColor: '#000',
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: containerHeight * 0.04,
          textAlign: 'center',
          zIndex: 5,
          color: '#333',
        }}
      >
        <div style={{ fontSize: `${scale(0.015, ctx)}px`, fontWeight: 500, lineHeight: 1.4 }}>
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.011, ctx)}
          color="#888"
        />
      </div>
    </div>
  )
}

function renderGradientBorder(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const pad = containerWidth * 0.04
  const captionH = containerHeight * (orientation === 'portrait' ? 0.16 : 0.14)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
      }}
    >
      <FitPhotoBox
        ctx={ctx}
        top={pad}
        left={pad}
        right={pad}
        bottom={captionH}
        radius={4}
        shadow="0 12px 40px rgba(0,0,0,0.2)"
      />
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          bottom: containerHeight * 0.03,
          textAlign: 'center',
          zIndex: 5,
          color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: `${scale(0.015, ctx)}px`, fontWeight: 600, lineHeight: 1.4 }}>
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <ParamLines
          lensText={ctx.lensText}
          shootingText={ctx.shootingText}
          fontSize={scale(0.011, ctx)}
          color="rgba(255,255,255,0.8)"
        />
      </div>
    </div>
  )
}

function renderGeoInfo(ctx: StageFiveContext) {
  const { containerWidth, containerHeight, orientation } = ctx
  const pad = containerWidth * 0.05
  const captionH = containerHeight * (orientation === 'portrait' ? 0.22 : 0.2)
  const geoItems = [
    { label: 'CAMERA', value: ctx.modelText || '—' },
    { label: 'LENS', value: ctx.lensText || '—' },
    { label: 'PARAMS', value: ctx.shootingText || '—' },
    { label: 'DATE', value: ctx.exif.dateTimeOriginal || '—' },
  ]
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FAFAFA' }}>
      <FitPhotoBox ctx={ctx} top={pad} left={pad} right={pad} bottom={captionH} radius={2} />
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: containerHeight * 0.03,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: `${scale(0.006, ctx)}px ${scale(0.02, ctx)}px`,
          zIndex: 5,
          color: '#444',
        }}
      >
        {geoItems.map((item) => (
          <div key={item.label} style={{ lineHeight: 1.3 }}>
            <div
              style={{
                fontSize: `${scale(0.008, ctx)}px`,
                color: '#999',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontWeight: 700,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                fontSize: `${scale(0.012, ctx)}px`,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderMagazineCover(ctx: StageFiveContext) {
  const { containerWidth, containerHeight } = ctx
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <PhotoCover src={ctx.imageSrc} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.8) 100%)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: containerWidth * 0.05,
          right: containerWidth * 0.15,
          bottom: containerHeight * 0.05,
          zIndex: 5,
          color: '#fff',
        }}
      >
        <div
          style={{
            fontFamily: "'Georgia', serif",
            fontSize: `${scale(0.028, ctx)}px`,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} />
        </div>
        <div
          style={{
            fontSize: `${scale(0.012, ctx)}px`,
            color: 'rgba(255,255,255,0.6)',
            marginTop: 6,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {ctx.lensText && <span>{ctx.lensText} · </span>}
          {ctx.shootingText || '—'}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: containerHeight * 0.04,
          right: containerWidth * 0.04,
          fontSize: `${scale(0.01, ctx)}px`,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: "'Courier New', monospace",
          writingMode: 'vertical-rl',
          zIndex: 5,
          letterSpacing: '0.15em',
        }}
      >
        VOL.{new Date().getFullYear()}
      </div>
    </div>
  )
}

function renderTransparentOverlay(ctx: StageFiveContext) {
  const { containerWidth, containerHeight } = ctx
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <PhotoCover src={ctx.imageSrc} />
      <div
        style={{
          position: 'absolute',
          right: containerWidth * 0.03,
          bottom: containerHeight * 0.03,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: `blur(${scaleBlur(12, ctx)}px)`,
          WebkitBackdropFilter: `blur(${scaleBlur(12, ctx)}px)`,
          borderRadius: 8,
          padding: `${scale(0.008, ctx)}px ${scale(0.012, ctx)}px`,
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 10,
          color: '#fff',
          maxWidth: '60%',
        }}
      >
        <div
          style={{
            fontSize: `${scale(0.012, ctx)}px`,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
        </div>
        <div
          style={{
            fontSize: `${scale(0.009, ctx)}px`,
            opacity: 0.7,
            marginTop: 1,
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ctx.shootingText || '—'}
        </div>
      </div>
    </div>
  )
}

function renderHalfFrame(ctx: StageFiveContext) {
  const { containerWidth, containerHeight } = ctx
  const gap = 3
  const captionH = containerHeight * 0.1
  const photoH = containerHeight - captionH - gap
  const photoW = (containerWidth - gap * 3) / 2
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#1A1A1A' }}>
      <div
        style={{
          position: 'absolute',
          top: gap,
          left: gap,
          width: photoW,
          height: photoH,
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
          top: gap,
          left: gap + photoW + gap,
          width: photoW,
          height: photoH,
          overflow: 'hidden',
          zIndex: 1,
          backgroundColor: '#111',
        }}
      >
        <PhotoCover src={ctx.imageSrc} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: gap * 2,
          right: gap * 2,
          bottom: containerHeight * 0.03,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 5,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: `${scale(0.011, ctx)}px`,
          color: 'rgba(255,255,255,0.75)',
        }}
      >
        <span>
          <LogoModel logoSrc={ctx.logoSrc} modelText={ctx.modelText} placement="inline" />
        </span>
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{ctx.shootingText || '—'}</span>
      </div>
    </div>
  )
}

function renderDiptych(ctx: StageFiveContext) {
  const { containerWidth, containerHeight } = ctx
  const pad = containerWidth * 0.03
  const gap = 3
  const captionH = containerHeight * 0.1
  const photoH = containerHeight - captionH - pad
  const photoW = (containerWidth - pad * 2 - gap) / 2
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF' }}>
      <div
        style={{
          position: 'absolute',
          top: pad,
          left: pad,
          width: photoW,
          height: photoH,
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
          top: pad,
          left: pad + photoW + gap,
          width: photoW,
          height: photoH,
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
          bottom: containerHeight * 0.02,
          textAlign: 'center',
          zIndex: 5,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: `${scale(0.011, ctx)}px`,
          color: '#666',
        }}
      >
        {ctx.modelText} · {ctx.shootingText || '—'}
      </div>
    </div>
  )
}
