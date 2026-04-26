import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { AppSettings, FilterPreset, Photo } from '../../shared/types'
import { hasGrain, ipc, ipcOn } from '../lib/ipc'

interface AppState {
  settings: AppSettings | null
  filters: FilterPreset[]
  photos: Photo[]
  selectedPhotoIds: string[]
  activeFilterId: string | null
  loading: boolean
  error: string | null

  // actions
  init: () => Promise<void>
  refreshFilters: () => Promise<void>
  refreshPhotos: () => Promise<void>
  importPhotos: (paths: string[]) => Promise<void>
  /**
   * 仅移除导入记录（不删硬盘原图）。成功后自动 refreshPhotos + 清空 selection 中相关条目
   */
  removePhotos: (ids: string[]) => Promise<{ removed: number; orphanedThumbs: number }>
  selectPhotos: (ids: string[]) => void
  toggleSelectPhoto: (id: string) => void
  setActiveFilter: (id: string | null) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
}

export const useAppStore = create<AppState>()(
  immer((set, get) => ({
    settings: null,
    filters: [],
    photos: [],
    selectedPhotoIds: [],
    activeFilterId: null,
    loading: false,
    error: null,

    async init() {
      if (!hasGrain()) {
        set((s) => {
          s.error = '请在 Electron 环境中运行（npm run dev）'
        })
        return
      }
      set((s) => {
        s.loading = true
      })
      try {
        const [settings, filters, photos] = await Promise.all([
          ipc('settings:get'),
          ipc('filter:list'),
          ipc('photo:list'),
        ])
        set((s) => {
          s.settings = settings
          s.filters = filters.sort((a, b) => b.popularity - a.popularity)
          s.photos = photos
          s.loading = false
          s.error = null
        })
        // 订阅懒补完成通知：老记录 thumbPath / dimsVerified 被修复后
        // 主进程 push 'photo:repaired'，UI 自动 refreshPhotos → 显示新 thumb
        ipcOn('photo:repaired', () => {
          void get().refreshPhotos()
        })
      } catch (e) {
        set((s) => {
          s.loading = false
          s.error = e instanceof Error ? e.message : String(e)
        })
      }
    },

    async refreshFilters() {
      const filters = await ipc('filter:list')
      set((s) => {
        s.filters = filters.sort((a, b) => b.popularity - a.popularity)
      })
    },

    async refreshPhotos() {
      const photos = await ipc('photo:list')
      set((s) => {
        s.photos = photos
      })
    },

    async importPhotos(paths) {
      if (paths.length === 0) return
      await ipc('photo:import', paths)
      await get().refreshPhotos()
    },

    /**
     * 仅从图库移除导入记录 —— **不会删除硬盘上的原图文件**。
     *  - 主进程会删 `photos.json` 中的对应记录
     *  - 顺带清理 `userData/thumbs/` 下不再被引用的孤儿缩略图
     *  - 硬盘上的 `.ARW`/`.JPG` 等原始文件完全不动
     * 成功后自动刷新 photos 列表并清空 selection
     */
    async removePhotos(ids) {
      if (ids.length === 0) return { removed: 0, orphanedThumbs: 0 }
      const result = await ipc('photo:remove', ids)
      set((s) => {
        // 乐观更新：立刻从 photos 列表移除（refreshPhotos 会再次核对）
        const removed = new Set(ids)
        s.photos = s.photos.filter((p) => !removed.has(p.id))
        s.selectedPhotoIds = s.selectedPhotoIds.filter((id) => !removed.has(id))
      })
      // 背靠背 refresh 以应对：(a) 部分 id 没匹配到的情况；(b) 懒补可能又写了新字段
      await get().refreshPhotos()
      return result
    },

    selectPhotos(ids) {
      set((s) => {
        s.selectedPhotoIds = ids
      })
    },

    toggleSelectPhoto(id) {
      set((s) => {
        const idx = s.selectedPhotoIds.indexOf(id)
        if (idx >= 0) s.selectedPhotoIds.splice(idx, 1)
        else s.selectedPhotoIds.push(id)
      })
    },

    setActiveFilter(id) {
      set((s) => {
        s.activeFilterId = id
      })
    },

    async updateSettings(patch) {
      const next = await ipc('settings:update', patch)
      set((s) => {
        s.settings = next
      })
    },
  })),
)
