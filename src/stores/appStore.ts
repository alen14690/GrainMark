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
