/**
 * MetaOverlay SDK for Plugin Development
 *
 * Provides API for plugins to register global actions in MetaOverlay.
 * MetaOverlay is a floating action panel that appears above plugin UI.
 */

import type { TuffItem } from '../../core-box/tuff/tuff-dsl'
import type { MetaAction } from '../../transport/events/types/meta-overlay'
import { MetaOverlayEvents } from '../../transport/events/meta-overlay'

/**
 * Action execution handler
 */
export type ActionExecuteHandler = (data: {
  actionId: string
  item: TuffItem
}) => void

/**
 * MetaOverlay SDK interface for plugins
 *
 * @example
 * ```typescript
 * // Register a global action
 * const unregister = plugin.meta.registerAction({
 *   id: 'my-plugin-action',
 *   render: {
 *     basic: {
 *       title: 'My Action',
 *       subtitle: 'Execute my plugin action',
 *       icon: { type: 'class', value: 'i-ri-star-line' }
 *     },
 *     shortcut: '⌘M',
 *     group: '插件操作'
 *   },
 *   priority: 100
 * })
 *
 * // Listen for action execution
 * plugin.meta.onActionExecute((data) => {
 *   if (data.actionId === 'my-plugin-action') {
 *     // Handle action
 *   }
 * })
 *
 * // Unregister all actions
 * plugin.meta.unregisterAll()
 * ```
 */
export interface MetaSDK {
  /**
   * Registers a global action that will appear in MetaOverlay
   *
   * @param action - Action definition
   * @returns Cleanup function to unregister this action
   *
   * @example
   * ```typescript
   * const unregister = plugin.meta.registerAction({
   *   id: 'custom-action',
   *   render: {
   *     basic: {
   *       title: 'Custom Action',
   *       subtitle: 'Description',
   *       icon: { type: 'emoji', value: '🚀' }
   *     },
   *     shortcut: '⌘K',
   *     group: 'Custom'
   *   },
   *   priority: 100
   * })
   *
   * // Later: unregister
   * unregister()
   * ```
   */
  registerAction: (action: MetaAction) => () => void

  /**
   * Unregisters all actions registered by this plugin
   *
   * @example
   * ```typescript
   * // Cleanup on plugin unload
   * plugin.meta.unregisterAll()
   * ```
   */
  unregisterAll: () => void

  /**
   * Registers a listener for when actions registered by this plugin are executed
   *
   * @param handler - Handler function
   * @returns Cleanup function to remove listener
   *
   * @example
   * ```typescript
   * const unsubscribe = plugin.meta.onActionExecute((data) => {
   *   console.log(`Action ${data.actionId} executed for item ${data.item.id}`)
   *   // Handle the action
   * })
   *
   * // Later: unsubscribe
   * unsubscribe()
   * ```
   */
  onActionExecute: (handler: ActionExecuteHandler) => () => void
}

/**
 * Creates a MetaSDK instance for plugin use
 *
 * @param channel - The plugin channel bridge for IPC communication
 * @param pluginId - Plugin identifier
 * @returns Configured MetaSDK instance
 *
 * @internal
 */
export function createMetaSDK(channel: any, pluginId: string): MetaSDK {
  const actionExecuteHandlers: Set<ActionExecuteHandler> = new Set()
  const registeredActionIds: Set<string> = new Set()

  // Register listener for action execution events
  const registerListener = () => {
    if (channel.onMain) {
      // Main process plugin context
      channel.onMain('meta-overlay:action-executed', (event: any) => {
        const data = event.data || event
        if (data.pluginId === pluginId && registeredActionIds.has(data.actionId)) {
          actionExecuteHandlers.forEach(handler => handler({
            actionId: data.actionId,
            item: data.item,
          }))
        }
      })
    }
    else if (channel.on) {
      // Renderer process context
      channel.on('meta-overlay:action-executed', (data: any) => {
        if (data.pluginId === pluginId && registeredActionIds.has(data.actionId)) {
          actionExecuteHandlers.forEach(handler => handler({
            actionId: data.actionId,
            item: data.item,
          }))
        }
      })
    }
  }

  registerListener()

  const send: (eventName: string, payload?: any) => Promise<any>
    = typeof channel?.sendToMain === 'function'
      ? channel.sendToMain.bind(channel)
      : typeof channel?.send === 'function'
        ? channel.send.bind(channel)
        : (() => {
            throw new Error('[MetaSDK] Channel send function not available')
          })()

  return {
    registerAction(action: MetaAction): () => void {
      registeredActionIds.add(action.id)

      void send(MetaOverlayEvents.action.register.toEventName(), {
        pluginId,
        action: {
          ...action,
          handler: pluginId,
          priority: action.priority ?? 100,
        },
      }).catch((error) => {
        console.error('[MetaSDK] Failed to register action', error)
      })

      return () => {
        registeredActionIds.delete(action.id)
        void send(MetaOverlayEvents.action.unregister.toEventName(), {
          pluginId,
          actionId: action.id,
        }).catch((error) => {
          console.error('[MetaSDK] Failed to unregister action', error)
        })
      }
    },

    unregisterAll(): void {
      registeredActionIds.clear()

      void send(MetaOverlayEvents.action.unregister.toEventName(), {
        pluginId,
      }).catch((error) => {
        console.error('[MetaSDK] Failed to unregister all actions', error)
      })
    },

    onActionExecute(handler: ActionExecuteHandler): () => void {
      actionExecuteHandlers.add(handler)
      return () => {
        actionExecuteHandlers.delete(handler)
      }
    },
  }
}
