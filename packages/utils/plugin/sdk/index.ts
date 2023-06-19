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
