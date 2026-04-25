import type { BatchJobConfig } from '../../shared/types.js'
import { cancelBatch, getBatchStatus, startBatch } from '../services/filter-engine/batch.js'
import { registerIpc } from './safeRegister.js'

export function registerBatchIpc() {
  registerIpc('batch:start', async (config: unknown, photoPaths: unknown) =>
    startBatch(config as BatchJobConfig, photoPaths as string[]),
  )
  registerIpc('batch:cancel', async (jobId: unknown) => {
    cancelBatch(jobId as string)
  })
  registerIpc('batch:status', async (jobId: unknown) => getBatchStatus(jobId as string))
}
