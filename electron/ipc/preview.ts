import { renderPreview } from '../services/filter-engine/preview.js'
import { registerIpc } from './safeRegister.js'

export function registerPreviewIpc() {
  // P1 清理：renderPreview 只需 photoPath（filterId / pipelineOverride 从未被使用，
  // 所有滤镜/滑块实时 GPU 渲染，主进程只做"取原图 + orient + resize + encode"）。
  // IPC schema 仍接受 3 个参数（前端传了 null/undefined），但后两个被忽略。
  registerIpc(
    'preview:render',
    async (photoPath: unknown, _filterId: unknown, _pipelineOverride: unknown) =>
      renderPreview(photoPath as string),
    { pathFields: ['args.0'] },
  )
}
