import type { FilterPreset } from '../../shared/types.js'
import { exportPresetToCube, importCubeAsPreset } from '../services/lut/cubeIO.js'
import { deleteFilter, getFilter, listFilters, saveFilter } from '../services/storage/filterStore.js'
import { registerIpc } from './safeRegister.js'

export function registerFilterIpc() {
  registerIpc('filter:list', async () => listFilters())
  registerIpc('filter:get', async (id: unknown) => getFilter(id as string))
  registerIpc('filter:save', async (preset: unknown) => {
    saveFilter(preset as FilterPreset)
  })
  registerIpc('filter:delete', async (id: unknown) => {
    deleteFilter(id as string)
  })
  registerIpc('filter:importCube', async (filePath: unknown) => importCubeAsPreset(filePath as string))
  registerIpc('filter:exportCube', async (id: unknown, outPath: unknown) => {
    const preset = getFilter(id as string)
    if (!preset) throw new Error(`Filter not found: ${id}`)
    await exportPresetToCube(preset, outPath as string)
  })
}
