import type {
  CoreBoxImageTranslateRouteMetadata,
  IntelligenceErrorCode
} from '@talex-touch/utils/transport/events/types'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export const COREBOX_SCREENSHOT_TRANSLATE_ACTION_ID = 'translate-image'
export const COREBOX_SCREENSHOT_TRANSLATE_PIN_ACTION_ID = 'translate-image-pin'

/**
 * Synthetic action id for the MetaOverlay (⌘K) "primary" action.
 *
 * The primary action mirrors what pressing Enter on the item in the main list
 * does (provider default execute). It is injected at the top of the action list
 * so the ⌘K panel's Enter target is the item's primary action rather than
 * whatever `item.actions[0]` happens to be (historically a copy action).
 */
export const COREBOX_PRIMARY_ACTION_ID = '__corebox_primary__'

/**
 * The ⌘K panel's "bind a shortcut" row on an application.
 *
 * The one built-in row main executes itself rather than relaying back to the CoreBox renderer:
 * what it opens is the applications page in the main window, and the reveal-plus-route delivery
 * behind that is main's. The renderer still builds the row (it is a host action with a fixed
 * label), so the id is shared rather than spelled out on both sides.
 */
export const COREBOX_APP_BIND_SHORTCUT_ACTION_ID = 'app-bind-shortcut'

/**
 * The ⌘K panel's "transfer" row, which opens the Flow picker in the CoreBox renderer.
 *
 * Main relays it like any other renderer row, but does not hand the window's height back on the
 * spot: the picker asks for room through its next layout update, and restoring first made the
 * window shrink and grow again. The renderer builds the row, so the id is shared rather than
 * spelled out on both sides.
 */
export const COREBOX_FLOW_TRANSFER_ACTION_ID = 'flow-transfer'

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
  | IntelligenceErrorCode

export interface CoreBoxImageTranslateResponse {
  success: boolean
  translatedImageBase64?: string
  sourceText?: string
  targetText?: string
  metadata?: CoreBoxImageTranslateRouteMetadata
  error?: string
  reason?: string
  recovery?: string
  code?: CoreBoxImageTranslateErrorCode
}

export const coreBoxImageTranslateEvent = defineRawEvent<
  CoreBoxImageTranslateRequest,
  CoreBoxImageTranslateResponse
>('core-box:image-translate')
