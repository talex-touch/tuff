import type * as HOOKS from './hooks/index'

export interface ITouchSDK {
  hooks: typeof HOOKS
  __hooks: {}
}

// Note: Window.$touchSDK is declared in ../preload.ts to avoid duplicate declarations

export * from './box-sdk'
export * from './channel'
export * from './clipboard'
export * from './core-box'
export * from './division-box'
export * from './feature-sdk'
export * from './flow'
export { createFeaturesManager, useFeatures } from './features'

export * from './hooks/index'
export * from './performance'
export * from './service/index'
export * from './storage'
export * from './system'
export * from './types'
export * from './window/index'
