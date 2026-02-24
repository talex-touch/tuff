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

export type OmniPanelFeatureSource = 'builtin' | 'plugin'
export type OmniPanelTransferTarget = 'corebox' | 'plugin' | 'system'
export type OmniPanelFeatureInputType = 'text' | 'image' | 'files' | 'html'

export interface OmniPanelFeatureIconPayload {
  type: string
  value: string
}

export interface OmniPanelFeatureItemPayload {
  id: string
  source: OmniPanelFeatureSource
  target: OmniPanelTransferTarget
  title: string
  subtitle: string
  icon: OmniPanelFeatureIconPayload | null
  enabled: boolean
  order: number
  pluginName?: string
  featureId?: string
  acceptedInputTypes?: OmniPanelFeatureInputType[]
  sdkapi?: number
  autoMounted?: boolean
  declarationMode?: 'declared' | 'fallback'
  unavailable?: boolean
  updatedAt: number
  createdAt: number
}

export interface OmniPanelFeatureListResponse {
  features: OmniPanelFeatureItemPayload[]
  updatedAt: number
}

export interface OmniPanelFeatureToggleRequest {
  id: string
  enabled: boolean
}

export interface OmniPanelFeatureReorderRequest {
  id: string
  direction: 'up' | 'down'
}

export interface OmniPanelFeatureExecuteRequest {
  id: string
  contextText?: string
  source?: string
}

export interface OmniPanelFeatureExecuteResponse {
  success: boolean
  error?: string
  code?: string
}

export interface OmniPanelFeatureRefreshPayload {
  reason: 'init' | 'toggle' | 'reorder' | 'plugin-install' | 'sync'
  updatedAt: number
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

export const omniPanelFeatureListEvent = defineRawEvent<void, OmniPanelFeatureListResponse>(
  'omni-panel:feature:list'
)

export const omniPanelFeatureToggleEvent = defineRawEvent<OmniPanelFeatureToggleRequest, void>(
  'omni-panel:feature:toggle'
)

export const omniPanelFeatureReorderEvent = defineRawEvent<OmniPanelFeatureReorderRequest, void>(
  'omni-panel:feature:reorder'
)

export const omniPanelFeatureExecuteEvent = defineRawEvent<
  OmniPanelFeatureExecuteRequest,
  OmniPanelFeatureExecuteResponse
>('omni-panel:feature:execute')

export const omniPanelFeatureRefreshEvent = defineRawEvent<OmniPanelFeatureRefreshPayload, void>(
  'omni-panel:feature:refresh'
)
