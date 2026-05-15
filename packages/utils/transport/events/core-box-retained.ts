import type { TuffItem } from '../../core-box/tuff/tuff-dsl'
import type {
  ActivationState,
  AllowClipboardRequest,
  AllowClipboardResponse,
  AllowInputMonitoringResponse,
  CoreBoxInputVisibilityResponse,
  CoreBoxGetBoundsResponse,
  CoreBoxForwardKeyEvent,
  CoreBoxSetHeightRequest,
  CoreBoxSetHeightResponse,
  CoreBoxSetPositionOffsetRequest,
  CoreBoxSetPositionOffsetResponse,
  CoreBoxUIModeExitedPayload,
  CoreBoxUIViewStateResponse,
  ClearInputResponse,
  DeactivateProviderRequest,
  EnterUIModeRequest,
  ExpandOptions,
  FocusWindowResponse,
  GetInputResponse,
  GetProviderDetailsRequest,
  ProviderDetail,
  SetInputRequest,
  SetInputVisibilityRequest,
  SetInputResponse,
} from './types/core-box'
import { defineEvent, defineRawEvent } from '../event/builder'

export interface CoreBoxActionPanelOpenRequest {
  item?: TuffItem
}

export interface CoreBoxPreviewCopyRequest {
  value?: string
  item?: TuffItem
}

export interface CoreBoxMetaOverlayActionExecutedPayload {
  actionId: string
  item: TuffItem
  pluginId: string
}

export interface CoreBoxMetaOverlayItemActionPayload {
  actionId: string
  item: TuffItem
}

export interface CoreBoxMetaOverlayFlowTransferPayload {
  item: TuffItem
}

export interface CoreBoxUiResumePayload {
  source: string
  featureId?: string | number
  url: string
}

export interface CoreBoxRecommendationRequest {
  limit?: number
  forceRefresh?: boolean
}

export interface CoreBoxRecommendationResponse {
  items: TuffItem[]
  duration: number
  fromCache: boolean
  error?: string
}

export interface CoreBoxAggregateTimeStatsResponse {
  success: boolean
  error?: string
}

export interface CoreBoxIsPinnedRequest {
  sourceId: string
  itemId: string
}

export interface CoreBoxIsPinnedResponse {
  success: boolean
  isPinned: boolean
}

export const CoreBoxRetainedEvents = {
  beginner: {
    shortcutTriggered: defineEvent('beginner')
      .module('shortcut')
      .event('triggered')
      .define<void, void>(),
  },
  input: {
    focus: defineEvent('core-box')
      .module('input')
      .event('focus')
      .define<void, void>(),
    get: defineEvent('core-box')
      .module('input')
      .event('get')
      .define<void, GetInputResponse>(),
    set: defineEvent('core-box')
      .module('input')
      .event('set')
      .define<SetInputRequest, SetInputResponse>(),
    clear: defineEvent('core-box')
      .module('input')
      .event('clear')
      .define<void, ClearInputResponse>(),
    setQuery: defineEvent('core-box')
      .module('input')
      .event('set-query')
      .define<SetInputRequest, void>(),
    setVisibility: defineEvent('core-box')
      .module('input')
      .event('set-visibility')
      .define<SetInputVisibilityRequest, void>(),
    requestValue: defineEvent('core-box')
      .module('input')
      .event('request-value')
      .define<void, GetInputResponse>(),
  },
  inputMonitoring: {
    allow: defineEvent('core-box')
      .module('input-monitoring')
      .event('allow')
      .define<void, AllowInputMonitoringResponse>(),
  },
  clipboard: {
    allow: defineEvent('core-box')
      .module('clipboard')
      .event('allow')
      .define<AllowClipboardRequest, AllowClipboardResponse>(),
  },
  provider: {
    deactivate: defineEvent('core-box')
      .module('provider')
      .event('deactivate')
      .define<DeactivateProviderRequest, ActivationState>(),
    deactivateAll: defineEvent('core-box')
      .module('provider')
      .event('deactivate-all')
      .define<void, ActivationState>(),
    getActivated: defineEvent('core-box')
      .module('provider')
      .event('get-activated')
      .define<void, ActivationState>(),
    getDetails: defineEvent('core-box')
      .module('provider')
      .event('get-details')
      .define<GetProviderDetailsRequest, ProviderDetail[]>({
        batch: { enabled: true, windowMs: 50, mergeStrategy: 'dedupe' },
      }),
  },
  ui: {
    show: defineEvent('core-box')
      .module('ui')
      .event('show')
      .define<void, void>(),
    hide: defineEvent('core-box')
      .module('ui')
      .event('hide')
      .define<void, void>(),
    expand: defineEvent('core-box')
      .module('ui')
      .event('expand')
      .define<ExpandOptions | number, void>(),
    focusWindow: defineEvent('core-box')
      .module('ui')
      .event('focus-window')
      .define<void, FocusWindowResponse>(),
    forwardKeyEvent: defineEvent('core-box')
      .module('ui')
      .event('forward-key-event')
      .define<CoreBoxForwardKeyEvent, void>(),
    getUIViewState: defineEvent('core-box')
      .module('ui')
      .event('get-ui-view-state')
      .define<void, CoreBoxUIViewStateResponse>(),
    shortcutTriggered: defineEvent('core-box')
      .module('ui')
      .event('shortcut-triggered')
      .define<void, void>(),
    uiModeExited: defineEvent('core-box')
      .module('ui')
      .event('mode-exited')
      .define<CoreBoxUIModeExitedPayload, void>(),
    hideInput: defineEvent('core-box')
      .module('ui')
      .event('hide-input')
      .define<void, CoreBoxInputVisibilityResponse>(),
    showInput: defineEvent('core-box')
      .module('ui')
      .event('show-input')
      .define<void, CoreBoxInputVisibilityResponse>(),
    resume: defineEvent('core-box')
      .module('ui')
      .event('resume')
      .define<CoreBoxUiResumePayload, void>(),
  },
  recommendation: {
    get: defineEvent('core-box')
      .module('recommendation')
      .event('get')
      .define<CoreBoxRecommendationRequest, CoreBoxRecommendationResponse>(),
    aggregateTimeStats: defineEvent('core-box')
      .module('recommendation')
      .event('aggregate-time-stats')
      .define<void, CoreBoxAggregateTimeStatsResponse>(),
    isPinned: defineEvent('core-box')
      .module('recommendation')
      .event('is-pinned')
      .define<CoreBoxIsPinnedRequest, CoreBoxIsPinnedResponse>(),
  },
  layout: {
    setHeight: defineEvent('core-box')
      .module('layout')
      .event('set-height')
      .define<CoreBoxSetHeightRequest, CoreBoxSetHeightResponse>(),
    setPositionOffset: defineEvent('core-box')
      .module('layout')
      .event('set-position-offset')
      .define<CoreBoxSetPositionOffsetRequest, CoreBoxSetPositionOffsetResponse>(),
    getBounds: defineEvent('core-box')
      .module('layout')
      .event('get-bounds')
      .define<void, CoreBoxGetBoundsResponse>(),
  },
  uiMode: {
    enter: defineEvent('core-box')
      .module('ui-mode')
      .event('enter')
      .define<EnterUIModeRequest, void>(),
    exit: defineEvent('core-box')
      .module('ui-mode')
      .event('exit')
      .define<void, void>(),
  },
  previewHistory: {
    show: defineEvent('core-box')
      .module('preview-history')
      .event('show')
      .define<void, void>(),
    hide: defineEvent('core-box')
      .module('preview-history')
      .event('hide')
      .define<void, void>(),
  },
  preview: {
    copy: defineEvent('core-box')
      .module('preview')
      .event('copy')
      .define<CoreBoxPreviewCopyRequest, void>(),
  },
  actionPanel: {
    open: defineEvent('core-box')
      .module('action-panel')
      .event('open')
      .define<CoreBoxActionPanelOpenRequest, void>(),
  },
  metaOverlay: {
    actionExecuted: defineEvent('core-box')
      .module('meta-overlay')
      .event('action-executed')
      .define<CoreBoxMetaOverlayActionExecutedPayload, void>(),
    itemAction: defineEvent('core-box')
      .module('meta-overlay')
      .event('item-action')
      .define<CoreBoxMetaOverlayItemActionPayload, void>(),
    flowTransfer: defineEvent('core-box')
      .module('meta-overlay')
      .event('flow-transfer')
      .define<CoreBoxMetaOverlayFlowTransferPayload, void>(),
  },
  legacy: {
    beginnerShortcutTriggered: defineRawEvent<void, void>('beginner:shortcut-triggered'),
    focusInput: defineRawEvent<void, void>('corebox:focus-input'),
    getInput: defineRawEvent<void, GetInputResponse>('core-box:get-input'),
    setInput: defineRawEvent<SetInputRequest, SetInputResponse>('core-box:set-input'),
    clearInput: defineRawEvent<void, ClearInputResponse>('core-box:clear-input'),
    setQuery: defineRawEvent<SetInputRequest, void>('core-box:set-query'),
    setInputVisibility: defineRawEvent<SetInputVisibilityRequest, void>(
      'core-box:set-input-visibility',
    ),
    requestInputValue: defineRawEvent<void, GetInputResponse>('core-box:request-input-value'),
    showHistory: defineRawEvent<void, void>('corebox:show-history'),
    hideHistory: defineRawEvent<void, void>('corebox:hide-history'),
    copyPreview: defineRawEvent<CoreBoxPreviewCopyRequest, void>('corebox:copy-preview'),
    openActionPanel: defineRawEvent<CoreBoxActionPanelOpenRequest, void>(
      'corebox:open-action-panel',
    ),
    metaOverlayActionExecuted: defineRawEvent<CoreBoxMetaOverlayActionExecutedPayload, void>(
      'meta-overlay:action-executed',
    ),
    metaOverlayItemAction: defineRawEvent<CoreBoxMetaOverlayItemActionPayload, void>(
      'meta-overlay:item-action',
    ),
    metaOverlayFlowTransfer: defineRawEvent<CoreBoxMetaOverlayFlowTransferPayload, void>(
      'meta-overlay:flow-transfer',
    ),
    show: defineRawEvent<void, void>('core-box:show'),
    hide: defineRawEvent<void, void>('core-box:hide'),
    expand: defineRawEvent<ExpandOptions | number, void>('core-box:expand'),
    focusWindow: defineRawEvent<void, FocusWindowResponse>('core-box:focus-window'),
    forwardKeyEvent: defineRawEvent<CoreBoxForwardKeyEvent, void>(
      'core-box:forward-key-event',
    ),
    getUIViewState: defineRawEvent<void, CoreBoxUIViewStateResponse>(
      'core-box:get-ui-view-state',
    ),
    shortcutTriggered: defineRawEvent<void, void>('core-box:shortcut-triggered'),
    uiModeExited: defineRawEvent<CoreBoxUIModeExitedPayload, void>(
      'core-box:ui-mode-exited',
    ),
    hideInput: defineRawEvent<void, CoreBoxInputVisibilityResponse>('core-box:hide-input'),
    showInput: defineRawEvent<void, CoreBoxInputVisibilityResponse>('core-box:show-input'),
    setHeight: defineRawEvent<CoreBoxSetHeightRequest, CoreBoxSetHeightResponse>(
      'core-box:set-height',
    ),
    setPositionOffset: defineRawEvent<
      CoreBoxSetPositionOffsetRequest,
      CoreBoxSetPositionOffsetResponse
    >('core-box:set-position-offset'),
    getBounds: defineRawEvent<void, CoreBoxGetBoundsResponse>('core-box:get-bounds'),
    enterUIMode: defineRawEvent<EnterUIModeRequest, void>('core-box:enter-ui-mode'),
    exitUIMode: defineRawEvent<void, void>('core-box:exit-ui-mode'),
    allowInput: defineRawEvent<void, AllowInputMonitoringResponse>('core-box:allow-input'),
    allowClipboard: defineRawEvent<AllowClipboardRequest, AllowClipboardResponse>(
      'core-box:allow-clipboard',
    ),
    deactivateProvider: defineRawEvent<DeactivateProviderRequest, ActivationState>(
      'core-box:deactivate-provider',
    ),
    deactivateProviders: defineRawEvent<void, ActivationState>('core-box:deactivate-providers'),
    getActivatedProviders: defineRawEvent<void, ActivationState>(
      'core-box:get-activated-providers',
    ),
    getProviderDetails: defineRawEvent<GetProviderDetailsRequest, ProviderDetail[]>(
      'core-box:get-provider-details',
      {
        batch: { enabled: true, windowMs: 50, mergeStrategy: 'dedupe' },
      },
    ),
    uiResume: defineRawEvent<CoreBoxUiResumePayload, void>('core-box:ui-resume'),
    getRecommendations: defineRawEvent<
      CoreBoxRecommendationRequest,
      CoreBoxRecommendationResponse
    >('core-box:get-recommendations'),
    aggregateTimeStats: defineRawEvent<void, CoreBoxAggregateTimeStatsResponse>(
      'core-box:aggregate-time-stats',
    ),
    isPinned: defineRawEvent<CoreBoxIsPinnedRequest, CoreBoxIsPinnedResponse>(
      'core-box:is-pinned',
    ),
  },
} as const
