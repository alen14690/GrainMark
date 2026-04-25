import type { IpcApi, IpcChannel } from '../../shared/types'

export interface GrainWindow {
  grain: {
    invoke: <K extends IpcChannel>(channel: K, ...args: Parameters<IpcApi[K]>) => ReturnType<IpcApi[K]>
    on: (channel: string, listener: (...args: unknown[]) => void) => () => void
    platform: NodeJS.Platform
    versions: NodeJS.ProcessVersions
  }
}

declare global {
  interface Window extends GrainWindow {}
}
