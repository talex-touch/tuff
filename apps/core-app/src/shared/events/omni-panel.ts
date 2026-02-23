import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export interface OmniPanelShowRequest {
  /**
   * Attempt to capture selected text from the active app before showing panel.
   */
  captureSelection?: boolean
  /**
   * Source for diagnostics (shortcut, mouse-long-press, command).
   */
  source?: string
}

export interface OmniPanelContextPayload {
  text: string
  hasSelection: boolean
  source: string
  capturedAt: number
}

export const omniPanelShowEvent = defineRawEvent<OmniPanelShowRequest | undefined, void>(
  'omni-panel:show'
)

export const omniPanelHideEvent = defineRawEvent<void, void>('omni-panel:hide')

export const omniPanelToggleEvent = defineRawEvent<OmniPanelShowRequest | undefined, void>(
  'omni-panel:toggle'
)

export const omniPanelContextEvent = defineRawEvent<OmniPanelContextPayload, void>(
  'omni-panel:context'
)
