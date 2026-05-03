/**
 * frameExport.tsx — 离屏 BrowserWindow 的渲染端脚本
 *
 * 直接渲染 Layout 组件（跳过 FramePreviewHost 的 contain-fit 中间层），
 * 容器尺寸 = canvasW × canvasH，Layout 填满整个画面。
 * 渲染完成后通知主进程用 capturePage 截图。
 */
import { createRoot, type Root } from 'react-dom/client'
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

// ★ 复用同一个 React root — 避免重复 createRoot 导致 DOM 残留旧内容
let reactRoot: Root | null = null

grain?.invoke('frame:export:ready')

grain?.on('frame:export:task', async (...args: unknown[]) => {
  const task = args[0] as FrameExportTask
  const root = document.getElementById('frame-root')
  if (!root) {
    grain?.invoke('frame:export:rendered', { taskId: task.taskId, ok: false, error: 'No root element' })
    return
  }

  try {
    // 卸载旧内容，确保每次导出从干净状态开始
    if (reactRoot) {
      reactRoot.unmount()
      reactRoot = null
    }
    // 清空 DOM（防止 unmount 后有残留）
    root.innerHTML = ''

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

    // 创建新 root 并渲染最新的 Layout
    reactRoot = createRoot(root)
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
