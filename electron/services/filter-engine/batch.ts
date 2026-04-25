/**
 * 批量处理占位（M3 扩展为 Worker Pool）
 */
import { nanoid } from 'nanoid'
import type { BatchJob, BatchJobConfig } from '../../../shared/types.js'

const jobs = new Map<string, BatchJob>()

export async function startBatch(config: BatchJobConfig, photoPaths: string[]): Promise<string> {
  const id = nanoid(12)
  const job: BatchJob = {
    id,
    createdAt: Date.now(),
    config,
    status: 'pending',
    items: photoPaths.map((p) => ({
      id: nanoid(8),
      photoPath: p,
      photoName: p.split('/').pop() ?? p,
      status: 'pending',
      progress: 0,
    })),
  }
  jobs.set(id, job)
  // TODO M3: 用 worker_threads 池真实处理
  return id
}

export function cancelBatch(jobId: string): void {
  const job = jobs.get(jobId)
  if (job) {
    job.status = 'cancelled'
  }
}

export function getBatchStatus(jobId: string): BatchJob | null {
  return jobs.get(jobId) ?? null
}
