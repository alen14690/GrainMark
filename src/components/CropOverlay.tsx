/**
 * CropOverlay — 画布裁切覆盖层
 *
 * 功能：
 *   - 半透明遮罩 + 裁切区域高亮
 *   - 四角/四边拖拽手柄调整区域
 *   - 比例锁定：自由 / 1:1 / 4:3 / 3:2 / 16:9
 *   - 确认/取消按钮
 *   - 输出比例值 CropParams (0-1)
 */
import { Check, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { CropParams } from '../../shared/types'
import { cn } from '../design'

interface Props {
  /** 画布容器宽度（CSS 像素） */
  containerWidth: number
  /** 画布容器高度（CSS 像素） */
  containerHeight: number
  /** 初始裁切（比例值）；null 表示全选 */
  initial: CropParams | null
  /** 确认裁切 */
  onConfirm: (crop: CropParams) => void
  /** 取消裁切 */
  onCancel: () => void
}

type AspectRatio = 'free' | '1:1' | '4:3' | '3:2' | '16:9'

const RATIOS: Array<{ label: string; value: AspectRatio; ratio: number | null }> = [
  { label: '自由', value: 'free', ratio: null },
  { label: '1:1', value: '1:1', ratio: 1 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '3:2', value: '3:2', ratio: 3 / 2 },
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
]

function CropOverlay({ containerWidth, containerHeight, initial, onConfirm, onCancel }: Props) {
  const [aspect, setAspect] = useState<AspectRatio>('free')

  // 裁切区域（像素坐标，相对于容器）
  const [crop, setCrop] = useState(() => {
    if (initial) {
      return {
        x: initial.x * containerWidth,
        y: initial.y * containerHeight,
        w: initial.width * containerWidth,
        h: initial.height * containerHeight,
      }
    }
    // 默认全选
    return { x: 0, y: 0, w: containerWidth, h: containerHeight }
  })

  // 拖拽状态
  const dragging = useRef<{
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'
    startX: number
    startY: number
    startCrop: typeof crop
  } | null>(null)

  // 当比例变化时，重新计算裁切区域（以中心为锚点）
  useEffect(() => {
    const r = RATIOS.find((r) => r.value === aspect)
    if (!r?.ratio) return
    const ratio = r.ratio
    const centerX = crop.x + crop.w / 2
    const centerY = crop.y + crop.h / 2

    let newW = crop.w
    let newH = crop.w / ratio
    if (newH > containerHeight) {
      newH = containerHeight
      newW = newH * ratio
    }
    if (newW > containerWidth) {
      newW = containerWidth
      newH = newW / ratio
    }

    const newX = Math.max(0, Math.min(containerWidth - newW, centerX - newW / 2))
    const newY = Math.max(0, Math.min(containerHeight - newH, centerY - newH / 2))
    setCrop({ x: newX, y: newY, w: newW, h: newH })
  }, [aspect]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseDown = useCallback((type: NonNullable<typeof dragging.current>['type'], e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = { type, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } }
  }, [crop])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const { type, startX, startY, startCrop } = dragging.current
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const ratioObj = RATIOS.find((r) => r.value === aspect)
    const lockedRatio = ratioObj?.ratio ?? null

    if (type === 'move') {
      const newX = Math.max(0, Math.min(containerWidth - startCrop.w, startCrop.x + dx))
      const newY = Math.max(0, Math.min(containerHeight - startCrop.h, startCrop.y + dy))
      setCrop({ ...startCrop, x: newX, y: newY })
    } else {
      // 角/边拖拽
      let { x, y, w, h } = startCrop
      if (type.includes('e')) w = Math.max(40, Math.min(containerWidth - x, w + dx))
      if (type.includes('w')) { const nw = Math.max(40, w - dx); x = x + w - nw; w = nw }
      if (type.includes('s')) h = Math.max(40, Math.min(containerHeight - y, h + dy))
      if (type.includes('n')) { const nh = Math.max(40, h - dy); y = y + h - nh; h = nh }

      // 锁定比例
      if (lockedRatio) {
        if (type.includes('e') || type.includes('w')) {
          h = w / lockedRatio
          if (y + h > containerHeight) { h = containerHeight - y; w = h * lockedRatio }
        } else {
          w = h * lockedRatio
          if (x + w > containerWidth) { w = containerWidth - x; h = w / lockedRatio }
        }
      }

      setCrop({ x: Math.max(0, x), y: Math.max(0, y), w, h })
    }
  }, [aspect, containerWidth, containerHeight])

  const handleMouseUp = useCallback(() => {
    dragging.current = null
  }, [])

  const handleConfirm = () => {
    onConfirm({
      x: crop.x / containerWidth,
      y: crop.y / containerHeight,
      width: crop.w / containerWidth,
      height: crop.h / containerHeight,
    })
  }

  const handleSize = 8

  return (
    <div
      className="absolute inset-0 z-30"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 半透明遮罩（裁切区域外） */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="crop-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#crop-mask)" />
      </svg>

      {/* 裁切区域边框 */}
      <div
        className="absolute border-2 border-white/90 cursor-move"
        style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
        onMouseDown={(e) => handleMouseDown('move', e)}
      >
        {/* 三分线 */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
        </div>
      </div>

      {/* 四角拖拽手柄 */}
      {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
        const isLeft = corner.includes('w')
        const isTop = corner.includes('n')
        const left = isLeft ? crop.x - handleSize / 2 : crop.x + crop.w - handleSize / 2
        const top = isTop ? crop.y - handleSize / 2 : crop.y + crop.h - handleSize / 2
        const cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
        return (
          <div
            key={corner}
            className="absolute bg-white border border-fg-4/50 rounded-sm"
            style={{ left, top, width: handleSize, height: handleSize, cursor }}
            onMouseDown={(e) => handleMouseDown(corner, e)}
          />
        )
      })}

      {/* 顶部比例选择栏 */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1 bg-bg-0/80 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-fg-4/40">
        {RATIOS.map((r) => (
          <button
            key={r.value}
            type="button"
            className={cn(
              'text-xxs px-2 py-0.5 rounded transition-colors',
              aspect === r.value ? 'bg-brand-amber text-white' : 'text-fg-2 hover:bg-fg-4/20',
            )}
            onClick={() => setAspect(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 底部确认/取消 */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost btn-xs bg-bg-0/80 backdrop-blur-sm"
        >
          <X className="w-3.5 h-3.5" />
          取消
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="btn-primary btn-xs"
        >
          <Check className="w-3.5 h-3.5" />
          确认裁切
        </button>
      </div>
    </div>
  )
}

export default memo(CropOverlay)
