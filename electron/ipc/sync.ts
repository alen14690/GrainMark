import type { CloudProvider } from '../../shared/types.js'
import { connectCloud, listCloudAccounts, syncNow } from '../services/sync/manager.js'
import { registerIpc } from './safeRegister.js'

export function registerSyncIpc() {
  registerIpc('sync:listAccounts', async () => listCloudAccounts())
  registerIpc('sync:connect', async (provider: unknown) => connectCloud(provider as CloudProvider))
  registerIpc('sync:now', async () => {
    await syncNow()
  })
}
