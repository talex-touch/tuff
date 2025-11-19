import type { ElectronAPI } from '@electron-toolkit/preload'

import type { PreloadAPI } from '@talex-touch/utils/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: PreloadAPI
  }
}
