/**
 * @fileoverview Plugin broadcast events for inter-plugin and plugin-to-CoreBox communication
 * @module @talex-touch/utils/transport/events/plugin-broadcast
 *
 * @description
 * This module defines events used for broadcasting messages to specific plugins.
 * These events are used with `TuffMainTransport.broadcastPlugin()` method.
 *
 * @example
 * ```typescript
 * import { PluginBroadcastEvents } from '@talex-touch/utils/transport/events'
 * import { useTuffTransport } from '@talex-touch/utils/transport/sdk'
 *
 * const transport = useTuffTransport()
 *
 * // Broadcast state change to a specific plugin
 * transport.broadcastPlugin('my-plugin', PluginBroadcastEvents.stateChanged, {
 *   pluginName: 'my-plugin',
 *   state: 'active'
 * })
 * ```
 */

import { defineEvent } from '../event/builder'

// ============================================================================
// Plugin Broadcast Events
// ============================================================================

/**
 * Events for broadcasting messages to specific plugins.
 *
 * @remarks
 * These events are designed for fire-and-forget communication from main process
 * to plugin renderer processes. They are used with `TuffMainTransport.broadcastPlugin()`.
 */
export const PluginBroadcastEvents = {
  /**
   * Input change broadcast from plugin to CoreBox.
   *
   * @remarks
   * Used when a plugin's input changes and needs to notify the CoreBox
   * to update its search query or state.
   */
  inputChange: defineEvent('plugin')
    .module('broadcast')
    .event('input-change')
    .define<{
      /** Name of the plugin sending the input change */
      pluginName: string
      /** Feature ID that triggered the input change */
      featureId: string
      /** Input value (type depends on feature implementation) */
      input: unknown
    }, void>(),

  /**
   * Clipboard change broadcast from OCR to plugin.
   *
   * @remarks
   * Used when OCR detects clipboard content change and needs to notify
   * plugins that are monitoring clipboard.
   */
  clipboardChange: defineEvent('plugin')
    .module('broadcast')
    .event('clipboard-change')
    .define<{
      /** Name of the plugin to notify */
      pluginName: string
      /** Clipboard item data */
      item: unknown
    }, void>(),

  /**
   * Plugin state changed notification.
   *
   * @remarks
   * Broadcast when a plugin's state changes (active, inactive, enabled, disabled, crashed).
   * Other plugins or UI components can listen to update their state.
   */
  stateChanged: defineEvent('plugin')
    .module('broadcast')
    .event('state-changed')
    .define<{
      /** Name of the plugin whose state changed */
      pluginName: string
      /** New state of the plugin */
      state: 'active' | 'inactive' | 'enabled' | 'disabled' | 'crashed'
    }, void>(),

  /**
   * Plugin reload notification.
   *
   * @remarks
   * Broadcast when a plugin is being reloaded (e.g., during development hot-reload).
   * Other components can use this to refresh their plugin-related state.
   */
  reload: defineEvent('plugin')
    .module('broadcast')
    .event('reload')
    .define<{
      /** Name of the plugin being reloaded */
      pluginName: string
    }, void>(),

  /**
   * Plugin crashed notification.
   *
   * @remarks
   * Broadcast when a plugin crashes. Other components can use this to
   * update UI state or attempt recovery.
   */
  crashed: defineEvent('plugin')
    .module('broadcast')
    .event('crashed')
    .define<{
      /** Name of the plugin that crashed */
      pluginName: string
      /** Optional error message */
      error?: string
    }, void>(),

  /**
   * CoreBox UI resume notification to plugin.
   *
   * @remarks
   * Broadcast to notify a plugin that the CoreBox UI is resuming
   * (e.g., after being hidden and shown again).
   */
  uiResume: defineEvent('plugin')
    .module('broadcast')
    .event('ui-resume')
    .define<{
      /** Name of the plugin to notify */
      pluginName: string
      /** Optional payload for the resume event */
      payload?: unknown
    }, void>(),
} as const

// Re-export for convenience
export type PluginBroadcastEventPayloads = {
  inputChange: {
    pluginName: string
    featureId: string
    input: unknown
  }
  clipboardChange: {
    pluginName: string
    item: unknown
  }
  stateChanged: {
    pluginName: string
    state: 'active' | 'inactive' | 'enabled' | 'disabled' | 'crashed'
  }
  reload: {
    pluginName: string
  }
  crashed: {
    pluginName: string
    error?: string
  }
  uiResume: {
    pluginName: string
    payload?: unknown
  }
}