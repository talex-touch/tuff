import type { ElectronAPI } from '@electron-toolkit/preload'

import type { PreloadAPI } from '@talex-touch/utils/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: PreloadAPI
    process: {
      platform: NodeJS.Platform
      arch: string
      versions: NodeJS.ProcessVersions
      env: {
        BUILD_TYPE?: string
      }
      getCPUUsage: () => {
        percent: number
      }
      memoryUsage: () => NodeJS.MemoryUsage
    }
  }
}
