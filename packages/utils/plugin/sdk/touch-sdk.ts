import type { ITouchSDK } from './index'

const DEFAULT_TOUCH_SDK_ERROR
  = '[TouchSDK] Touch SDK not available. Make sure this is called in a plugin context.'

export function useTouchSDK(errorMessage: string = DEFAULT_TOUCH_SDK_ERROR): ITouchSDK {
  const sdk = (window as any)?.$touchSDK as ITouchSDK | undefined
  if (!sdk) {
    throw new Error(errorMessage)
  }
  return sdk
}
