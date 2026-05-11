import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export const COREBOX_SCREENSHOT_TRANSLATE_ACTION_ID = 'translate-image'
export const COREBOX_SCREENSHOT_TRANSLATE_PIN_ACTION_ID = 'translate-image-pin'
export const COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID = 'corebox.screenshot.translate'
export const COREBOX_FX_LATEST_SCENE_ID = 'corebox.fx.latest'
export const COREBOX_FX_CONVERT_SCENE_ID = 'corebox.fx.convert'

export interface CoreBoxImageTranslateRequest {
  item: unknown
  targetLang?: string
  openPinWindow?: boolean
}

export type CoreBoxImageTranslateErrorCode =
  | 'INVALID_ITEM'
  | 'IMAGE_UNAVAILABLE'
  | 'SCENE_UNAVAILABLE'

export interface CoreBoxImageTranslateResponse {
  success: boolean
  translatedImageBase64?: string
  sourceText?: string
  targetText?: string
  error?: string
  code?: CoreBoxImageTranslateErrorCode
}

export const coreBoxImageTranslateEvent = defineRawEvent<
  CoreBoxImageTranslateRequest,
  CoreBoxImageTranslateResponse
>('core-box:image-translate')
