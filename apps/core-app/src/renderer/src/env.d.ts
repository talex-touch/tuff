/// <reference types="vite/client" />

import type { IArgMapperOptions } from '@talex-touch/utils/electron'
import type { PreloadAPI } from '@talex-touch/utils/preload'
import type { TuffInputType } from '@talex-touch/utils'
import type { ElectronAPI } from '@electron-toolkit/preload'
import type { Router } from 'vue-router'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module 'talex-touch:information' {
  export const packageJson: Record<string, unknown>
  const information: Record<string, unknown>
  export default information
}

declare global {
  export interface Window {
    $argMapper: IArgMapperOptions
    __VUE_ROUTER__?: Router
    __devAuthToken?: (token: string) => void
    __coreboxQueryInputDebug?: {
      builtAt: string
      queryTextLength: number
      clipboardLastType: string | null
      pendingTextClipboardType: string | null
      filePathCount: number
      useFileMode: boolean
      inputTypes: TuffInputType[]
      inputCount: number
      hasImageInput: boolean
      hasTextInput: boolean
      hasFileInput: boolean
    }
    api: PreloadAPI
    electron: ElectronAPI
  }
}

export {}
