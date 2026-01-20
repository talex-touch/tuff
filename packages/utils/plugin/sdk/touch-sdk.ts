import { hasWindow } from '../../env'
import type { ITouchSDK } from './index'

const DEFAULT_TOUCH_SDK_ERROR
  = '[TouchSDK] Touch SDK not available. Make sure this is called in a plugin context.'

let cachedTouchSDK: ITouchSDK | null = null

export function useTouchSDK(errorMessage: string = DEFAULT_TOUCH_SDK_ERROR): ITouchSDK {
  const globalWindow = hasWindow() ? window : undefined
  const windowSdk = (globalWindow as any)?.$touchSDK as ITouchSDK | undefined
  const sdk = windowSdk ?? cachedTouchSDK
  if (!sdk) {
    throw new Error(errorMessage)
  }
  cachedTouchSDK = sdk
  return sdk
}
