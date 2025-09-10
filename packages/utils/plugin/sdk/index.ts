import * as HOOKS from './hooks/index'

export interface ITouchSDK {
  hooks: typeof HOOKS
  __hooks: {}
}

// window type
declare global {
  export interface Window {
    $touchSDK: ITouchSDK
  }
}

export * from './types'
export * from './window/index'
export * from './hooks/index'
export * from './service/index'

export * from './storage'