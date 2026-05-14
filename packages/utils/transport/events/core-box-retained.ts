import type { TuffItem } from '../../core-box/tuff/tuff-dsl'
import type {
  AllowInputMonitoringResponse,
  ExpandOptions,
  FocusWindowResponse,
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
    allowInput: defineRawEvent<void, AllowInputMonitoringResponse>('core-box:allow-input'),
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
