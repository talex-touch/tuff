import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export interface OmniPanelShowRequest {
  /**
   * Attempt to capture selected text from the active app before showing panel.
   */
  captureSelection?: boolean
  /**
   * Source for diagnostics (shortcut, mouse-long-press, command).
   */
  source?: OmniPanelContextSource | string
}

export type OmniPanelContextSource =
  | 'shortcut'
  | 'mouse-long-press'
  | 'manual'
  | 'command'
  | 'unknown'

export interface OmniPanelContextPayload {
  text: string
  hasSelection: boolean
  source: OmniPanelContextSource
  sourceRaw?: string
  capturedAt: number
}

export type OmniPanelFeatureSource = 'builtin' | 'plugin'
export type OmniPanelTransferTarget = 'corebox' | 'plugin' | 'system'
export type OmniPanelFeatureInputType = 'text' | 'image' | 'files' | 'html'
export type OmniPanelFeatureUnavailableCode =
  | 'PLUGIN_NOT_FOUND'
  | 'PLUGIN_UNAVAILABLE'
  | 'FEATURE_NOT_FOUND'
  | 'FEATURE_NOT_EXECUTABLE'

export interface OmniPanelFeatureUnavailableReason {
  code: OmniPanelFeatureUnavailableCode
  message: string
}

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
  unavailableReason?: OmniPanelFeatureUnavailableReason
  updatedAt: number
  createdAt: number
}

export interface OmniPanelFeatureListResponse {
  features: OmniPanelFeatureItemPayload[]
  updatedAt: number
}

/**
 * @deprecated Kept for compatibility with legacy clients.
 */
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
  source?: OmniPanelContextSource | string
  context?: {
    text?: string
    hasSelection?: boolean
  }
}

export type OmniPanelFeatureExecuteErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_FEATURE'
  | 'FEATURE_NOT_FOUND'
  | 'FEATURE_UNAVAILABLE'
  | 'SELECTION_REQUIRED'
  | 'COREBOX_UNAVAILABLE'
  | 'COREBOX_TRANSFER_FAILED'
  | 'SYSTEM_TARGET_NOT_IMPLEMENTED'
  | 'PLUGIN_NOT_FOUND'
  | 'FEATURE_EXECUTION_FAILED'
  | 'UNKNOWN_BUILTIN'
  | 'INTERNAL_ERROR'

export interface OmniPanelFeatureExecuteResponse {
  success: boolean
  error?: string
  code?: OmniPanelFeatureExecuteErrorCode
}

export type OmniPanelFeatureRefreshReason =
  | 'init'
  | 'toggle'
  | 'legacy-toggle'
  | 'reorder'
  | 'plugin-install'
  | 'plugin-change'
  | 'show'
  | 'execute'
  | 'context-updated'
  | 'sync'

export interface OmniPanelFeatureRefreshPayload {
  reason: OmniPanelFeatureRefreshReason
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

/**
 * @deprecated Kept only for legacy bundle typing compatibility.
 * Core-app runtime no longer registers this event.
 */
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
