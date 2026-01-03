/**
 * @fileoverview MetaOverlay domain events
 * @module @talex-touch/utils/transport/events/meta-overlay
 */

import type {
  MetaActionExecuteRequest,
  MetaActionExecuteResponse,
  MetaRegisterActionRequest,
  MetaShowRequest,
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
    show: defineEvent('meta-overlay')
      .module('ui')
      .event('show')
      .define<MetaShowRequest, void>(),

    /**
     * Hide MetaOverlay
     */
    hide: defineEvent('meta-overlay')
      .module('ui')
      .event('hide')
      .define<void, void>(),

    /**
     * Check visibility
     */
    isVisible: defineEvent('meta-overlay')
      .module('ui')
      .event('is-visible')
      .define<void, MetaVisibilityResponse>(),
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
    register: defineEvent('meta-overlay')
      .module('action')
      .event('register')
      .define<MetaRegisterActionRequest, void>(),

    /**
     * Unregister all actions for a plugin
     */
    unregister: defineEvent('meta-overlay')
      .module('action')
      .event('unregister')
      .define<MetaUnregisterActionsRequest, void>(),
  },
} as const
