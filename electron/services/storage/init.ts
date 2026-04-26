import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { BatchJob, CloudAccount, Photo } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'
import { runStartupSweep } from './cacheSweeper.js'
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
/** Editor 预览渲染输出缓存（当 data URL 过大时改用文件路径 + grain 协议） */
export const getPreviewCacheDir = () => subDir('preview-cache')

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

  // 启动期磁盘 GC（异步 fire-and-forget，不阻塞主窗口启动）
  // - preview-cache/ LRU 清理（上限 500MB）
  // - thumbs/ 孤儿清理（不被 photos.json 引用的 jpg）
  void (async () => {
    try {
      const inUseThumbs = new Set<string>()
      for (const p of photosTable?.all() ?? []) {
        if (p.thumbPath) inUseThumbs.add(p.thumbPath)
      }
      await runStartupSweep(inUseThumbs)
    } catch (err) {
      logger.warn('startupSweep.unhandled', { err: (err as Error).message })
    }
  })()
}
