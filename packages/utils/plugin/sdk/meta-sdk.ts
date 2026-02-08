/**
 * MetaOverlay SDK for Plugin Development
 *
 * Provides API for plugins to register global actions in MetaOverlay.
 * MetaOverlay is a floating action panel that appears above plugin UI.
 */

import type { TuffItem } from '../../core-box/tuff/tuff-dsl'
import type { MetaAction } from '../../transport/events/types/meta-overlay'
import { createPluginTuffTransport } from '../../transport'
import { defineRawEvent } from '../../transport/event/builder'
import { MetaOverlayEvents } from '../../transport/events/meta-overlay'
import { createDisposableBag } from '../../transport/sdk'

/**
 * Action execution handler
 */
export type ActionExecuteHandler = (data: {
  actionId: string
  item: TuffItem
}) => void

const metaOverlayActionExecutedEvent = defineRawEvent<{ pluginId: string, actionId: string, item: TuffItem }, void>('meta-overlay:action-executed')

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

  /**
   * 释放 SDK 内部监听器
   */
  dispose: () => void
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
  const transport = createPluginTuffTransport(channel)
  const disposables = createDisposableBag()
  let disposed = false

  const emitActionExecute = (data: { pluginId: string, actionId: string, item: TuffItem }) => {
    if (data.pluginId !== pluginId || !registeredActionIds.has(data.actionId)) {
      return
    }

    for (const handler of actionExecuteHandlers) {
      try {
        handler({
          actionId: data.actionId,
          item: data.item,
        })
      }
      catch (error) {
        console.error('[MetaSDK] onActionExecute handler error', error)
      }
    }
  }

  const dispose = () => {
    if (disposed) {
      return
    }

    disposed = true
    actionExecuteHandlers.clear()

    if (registeredActionIds.size > 0) {
      void transport.send(MetaOverlayEvents.action.unregister, { pluginId }).catch((error) => {
        console.error('[MetaSDK] Failed to unregister all actions during dispose', error)
      })
    }

    registeredActionIds.clear()
    disposables.dispose()
    transport.destroy()
  }

  const ensureActive = (method: string) => {
    if (disposed) {
      throw new Error(`[MetaSDK] Cannot call ${method} after dispose`)
    }
  }

  disposables.add(
    transport.on(metaOverlayActionExecutedEvent, (payload) => {
      emitActionExecute(payload)
    }),
  )

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onBeforeUnload = () => dispose()
    window.addEventListener('beforeunload', onBeforeUnload, { once: true })
    disposables.add(() => window.removeEventListener('beforeunload', onBeforeUnload))
  }

  return {
    registerAction(action: MetaAction): () => void {
      ensureActive('registerAction')
      registeredActionIds.add(action.id)

      void transport.send(MetaOverlayEvents.action.register, {
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
        if (!registeredActionIds.has(action.id)) {
          return
        }

        registeredActionIds.delete(action.id)
        void transport.send(MetaOverlayEvents.action.unregister, {
          pluginId,
          actionId: action.id,
        } as any).catch((error) => {
          console.error('[MetaSDK] Failed to unregister action', error)
        })
      }
    },

    unregisterAll(): void {
      ensureActive('unregisterAll')
      registeredActionIds.clear()

      void transport.send(MetaOverlayEvents.action.unregister, {
        pluginId,
      }).catch((error) => {
        console.error('[MetaSDK] Failed to unregister all actions', error)
      })
    },

    onActionExecute(handler: ActionExecuteHandler): () => void {
      ensureActive('onActionExecute')
      actionExecuteHandlers.add(handler)
      return () => {
        actionExecuteHandlers.delete(handler)
      }
    },

    dispose,
  }
}
