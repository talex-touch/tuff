import { ElectronAPI } from '@electron-toolkit/preload'

import type { PreloadAPI } from '../shared/preload-loading'

declare global {
  interface Window {
    electron: ElectronAPI
    api: PreloadAPI
  }
}
