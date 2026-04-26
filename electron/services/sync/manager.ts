import { nanoid } from 'nanoid'
import type { CloudAccount, CloudProvider } from '../../../shared/types.js'
import { getCloudAccountsTable } from '../storage/init.js'

export async function listCloudAccounts(): Promise<CloudAccount[]> {
  return getCloudAccountsTable().all()
}

export async function connectCloud(provider: CloudProvider): Promise<CloudAccount> {
  // M9 实装：弹出 OAuth 窗口或凭证表单
  const table = getCloudAccountsTable()
  const id = nanoid(10)
  const account: CloudAccount = {
    id,
    provider,
    name: `${provider} account`,
    credentials: {},
    connected: false,
  }
  await table.upsert(account)
  return account
}

export async function syncNow(): Promise<void> {
  console.log('[sync] syncNow invoked (M9 placeholder)')
}
