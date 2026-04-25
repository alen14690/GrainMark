import { extractFilterFromReference } from '../services/extractor/reference.js'
import { registerIpc } from './safeRegister.js'

export function registerExtractIpc() {
  registerIpc('extract:fromReference', async (refPath: unknown, targetSamplePath: unknown) =>
    extractFilterFromReference(refPath as string, targetSamplePath as string | undefined),
  )
}
