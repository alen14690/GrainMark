import type { AppSettings } from '../../shared/types.js'
import { getSettings, updateSettings } from '../services/storage/settingsStore.js'
import { registerIpc } from './safeRegister.js'

export function registerSettingsIpc() {
  registerIpc('settings:get', async () => getSettings())
  registerIpc('settings:update', async (patch: unknown) => updateSettings(patch as Partial<AppSettings>))
}
