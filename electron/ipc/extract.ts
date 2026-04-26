import { extractFilterFromReference } from '../services/extractor/reference.js'
import { registerIpc } from './safeRegister.js'

export function registerExtractIpc() {
  // F1：refPath 必填走 PathGuard；targetSamplePath 可选，有值也走
  registerIpc(
    'extract:fromReference',
    async (refPath: unknown, targetSamplePath: unknown) =>
      extractFilterFromReference(refPath as string, targetSamplePath as string | undefined),
    { pathFields: ['args.0', 'args.1'] },
  )
}
