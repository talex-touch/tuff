/**
 * @fileoverview MetaOverlay domain events
 * @module @talex-touch/utils/transport/events/meta-overlay
 */

import type {
  MetaActionExecuteRequest,
  MetaActionExecuteResponse,
  MetaPageChangeRequest,
  MetaRegisterActionRequest,
  MetaRendererReadyResponse,
  MetaShowRequest,
  MetaShowResponse,
  MetaUnregisterActionsRequest,
  MetaVisibilityResponse,
} from './types/meta-overlay'
import { defineEvent } from '../event/builder'

// ============================================================================
// UI Events
// ============================================================================

/**
 * Show MetaOverlay with merged actions
 */
export const MetaOverlayEvents = {
  ui: {
    /**
     * Show MetaOverlay
     */
    show: defineEvent('meta-overlay').module('ui').event('show').define<MetaShowRequest, MetaShowResponse>(),

    /**
     * Announce that the current MetaOverlay renderer has mounted its transport listeners.
     */
    ready: defineEvent('meta-overlay').module('ui').event('ready').define<void, MetaRendererReadyResponse>(),

    /**
     * Hide MetaOverlay
     */
    hide: defineEvent('meta-overlay').module('ui').event('hide').define<void, void>(),

    /**
     * Check visibility
     */
    isVisible: defineEvent('meta-overlay').module('ui').event('is-visible').define<void, MetaVisibilityResponse>(),

    /**
     * Tell main the card changed page, or that the page on screen needs a different height.
     * Accepted only from the overlay renderer; the reply carries nothing.
     */
    page: defineEvent('meta-overlay').module('ui').event('page').define<MetaPageChangeRequest, void>(),
  },

  // ============================================================================
  // Action Events
  // ============================================================================

  action: {
    /**
     * Execute an action
     */
    execute: defineEvent('meta-overlay')
      .module('action')
      .event('execute')
      .define<MetaActionExecuteRequest, MetaActionExecuteResponse>(),

    /**
     * Register a plugin action
     */
    register: defineEvent('meta-overlay').module('action').event('register').define<MetaRegisterActionRequest, void>(),

    /**
     * Unregister all actions for a plugin
     */
    unregister: defineEvent('meta-overlay')
      .module('action')
      .event('unregister')
      .define<MetaUnregisterActionsRequest, void>(),
  },
} as const
