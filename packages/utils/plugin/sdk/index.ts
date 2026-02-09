import type * as HOOKS from './hooks/index'

export interface ITouchSDK {
  hooks: typeof HOOKS
  __hooks: Record<string, unknown>
}

// Note: Window.$touchSDK is declared in ../preload.ts to avoid duplicate declarations

export * from './box-items'
export * from './box-sdk'
export * from './channel'
export * from './clipboard'
export * from './cloud-sync'
export * from './core-box'
export * from './division-box'
export * from './feature-sdk'
export { createFeaturesManager, useFeatures } from './features'
export * from './flow'
export * from './hooks/index'
export * from './intelligence'

export * from './meta-sdk'
export * from './notification'
export * from './performance'
export * from './power'
export * from './plugin-info'
export * from './service/index'
export * from './storage'
export * from './system'
export * from './temp-files'
export * from './touch-sdk'
export * from './types'
export * from './window/index'
