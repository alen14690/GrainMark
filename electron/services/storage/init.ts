import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { BatchJob, CloudAccount, Photo } from '../../../shared/types.js'
import { seedBuiltinPresets } from './filterStore.js'
import { JsonKV, JsonTable } from './jsonTable.js'

let photosTable: JsonTable<Photo> | null = null
let batchJobsTable: JsonTable<BatchJob> | null = null
let cloudAccountsTable: JsonTable<CloudAccount> | null = null
let trendingTable: JsonTable<{
  id: string
  name: string
  score: number
  source: string
  tags: string[]
  fetched_at: number
}> | null = null
let settingsKV: JsonKV | null = null

export function getUserDataDir(): string {
  const dir = app.getPath('userData')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function subDir(name: string): string {
  const dir = path.join(getUserDataDir(), name)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export const getFiltersDir = () => subDir('filters')
export const getThumbsDir = () => subDir('thumbs')
export const getLUTDir = () => subDir('luts')
export const getCacheDir = () => subDir('cache')
export const getModelsDir = () => subDir('models')
export const getDataDir = () => subDir('data')

export function getPhotosTable(): JsonTable<Photo> {
  if (!photosTable) throw new Error('Storage not initialized')
  return photosTable
}
export function getBatchJobsTable(): JsonTable<BatchJob> {
  if (!batchJobsTable) throw new Error('Storage not initialized')
  return batchJobsTable
}
export function getCloudAccountsTable(): JsonTable<CloudAccount> {
  if (!cloudAccountsTable) throw new Error('Storage not initialized')
  return cloudAccountsTable
}
export function getTrendingTable() {
  if (!trendingTable) throw new Error('Storage not initialized')
  return trendingTable
}
export function getSettingsKV(): JsonKV {
  if (!settingsKV) throw new Error('Storage not initialized')
  return settingsKV
}

export async function initStorage(): Promise<void> {
  const dataDir = getDataDir()
  photosTable = new JsonTable<Photo>(dataDir, 'photos')
  batchJobsTable = new JsonTable<BatchJob>(dataDir, 'batch_jobs')
  cloudAccountsTable = new JsonTable<CloudAccount>(dataDir, 'cloud_accounts')
  trendingTable = new JsonTable(dataDir, 'trending')
  settingsKV = new JsonKV(dataDir, 'settings')

  // 同步内置滤镜
  seedBuiltinPresets()
}
