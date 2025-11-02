import * as HOOKS from './hooks/index'

export interface ITouchSDK {
  hooks: typeof HOOKS
  __hooks: {}
}

// Note: Window.$touchSDK is declared in ../preload.ts to avoid duplicate declarations

export * from './types'
export * from './window/index'
export * from './hooks/index'
export * from './service/index'

export * from './channel'
export * from './clipboard'
export * from './core-box'
export * from './storage'
export * from './system'
export { createFeaturesManager, useFeatures } from './features'
