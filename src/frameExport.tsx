/**
 * frameExport.tsx — 离屏 BrowserWindow 的渲染端脚本
 *
 * 直接渲染 Layout 组件（跳过 FramePreviewHost 的 contain-fit 中间层），
 * 容器尺寸 = canvasW × canvasH，Layout 填满整个画面。
 * 渲染完成后通知主进程用 capturePage 截图。
 */
import { createRoot } from 'react-dom/client'
import type { FrameStyle, FrameStyleOverrides, Photo } from '../shared/types'
import { getFrameLayoutComponent } from './components/frame/FrameStyleRegistry'
import './styles/global.css'

interface FrameExportTask {
  taskId: string
  photoDataUrl: string
  photo: Photo
  style: FrameStyle
  overrides: FrameStyleOverrides
  width: number
  height: number
}

const grain = (
  window as unknown as {
    grain?: {
      invoke: (ch: string, ...a: unknown[]) => Promise<unknown>
      on: (ch: string, cb: (...args: unknown[]) => void) => () => void
    }
  }
).grain

grain?.invoke('frame:export:ready')

grain?.on('frame:export:task', async (...args: unknown[]) => {
  const task = args[0] as FrameExportTask
  const root = document.getElementById('frame-root')
  if (!root) {
    grain?.invoke('frame:export:rendered', { taskId: task.taskId, ok: false, error: 'No root element' })
    return
  }

  try {
    root.style.width = `${task.width}px`
    root.style.height = `${task.height}px`
    document.body.style.width = `${task.width}px`
    document.body.style.height = `${task.height}px`

    const Layout = getFrameLayoutComponent(task.style.id)
    if (!Layout) {
      grain?.invoke('frame:export:rendered', {
        taskId: task.taskId,
        ok: false,
        error: `Layout not found for ${task.style.id}`,
      })
      return
    }

    // 直接渲染 Layout 组件（与编辑器预览完全相同的组件），跳过 FramePreviewHost 的 contain-fit
    // containerWidth/Height = 完整 canvas 尺寸，Layout 填满整个画面
    const reactRoot = createRoot(root)
    reactRoot.render(
      <div
        style={{
          position: 'relative',
          width: task.width,
          height: task.height,
          overflow: 'hidden',
          backgroundColor: task.style.landscape.backgroundColor,
        }}
      >
        <Layout
          photo={task.photo}
          style={task.style}
          overrides={task.overrides}
          containerWidth={task.width}
          containerHeight={task.height}
          photoSrcOverride={task.photoDataUrl}
        />
      </div>,
    )

    // 等待渲染 + 图片加载 + CSS 滤镜生效
    await new Promise((r) => setTimeout(r, 500))
    const images = root.querySelectorAll('img')
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) { resolve(); return }
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }),
      ),
    )
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    await new Promise((r) => setTimeout(r, 300))

    grain?.invoke('frame:export:rendered', {
      taskId: task.taskId,
      ok: true,
      width: task.width,
      height: task.height,
    })
  } catch (err) {
    grain?.invoke('frame:export:rendered', {
      taskId: task.taskId,
      ok: false,
      error: (err as Error).message,
    })
  }
})
