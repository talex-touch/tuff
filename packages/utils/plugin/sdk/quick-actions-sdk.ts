/**
 * Quick Actions SDK for Plugin Development
 *
 * Provides API for plugins to register global actions in Tuff Quick Actions (Cmd+K / Ctrl+K).
 */

import type { TuffItem, TuffQuickAction } from '../../core-box/tuff/tuff-dsl'
import { createPluginTuffTransport } from '../../transport'
import { defineRawEvent } from '../../transport/event/builder'
import { MetaOverlayEvents } from '../../transport/events/meta-overlay'
import { createDisposableBag } from '../../transport/sdk'

/**
 * Action execution handler
 */
export type QuickActionExecuteHandler = (data: {
  actionId: string
  item: TuffItem
}) => void

const quickActionsExecutedEvent = defineRawEvent<
  { pluginId: string, actionId: string, item: TuffItem },
  void
>('meta-overlay:action-executed')

/**
 * Quick Actions SDK interface for plugins
 */
export interface QuickActionsSDK {
  /**
   * Registers a global action that will appear in Tuff Quick Actions
   */
  registerAction: (action: TuffQuickAction) => () => void

  /**
   * Unregisters all actions registered by this plugin
   */
  unregisterAll: () => void

  /**
   * Registers a listener for when actions registered by this plugin are executed
   */
  onActionExecute: (handler: QuickActionExecuteHandler) => () => void

  /**
   * Release internal listeners
   */
  dispose: () => void
}

/**
 * Creates a QuickActionsSDK instance for plugin use
 *
 * @param channel - The plugin channel bridge for IPC communication
 * @param pluginId - Plugin identifier
 * @returns Configured QuickActionsSDK instance
 *
 * @internal
 */
export function createQuickActionsSDK(channel: any, pluginId: string): QuickActionsSDK {
  const actionExecuteHandlers: Set<QuickActionExecuteHandler> = new Set()
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
          item: data.item
        })
      } catch (error) {
        console.error('[QuickActionsSDK] onActionExecute handler error', error)
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
        console.error('[QuickActionsSDK] Failed to unregister all actions during dispose', error)
      })
    }

    registeredActionIds.clear()
    disposables.dispose()
    transport.destroy()
  }

  const ensureActive = (method: string) => {
    if (disposed) {
      throw new Error(`[QuickActionsSDK] Cannot call ${method} after dispose`)
    }
  }

  disposables.add(
    transport.on(quickActionsExecutedEvent, (payload) => {
      emitActionExecute(payload)
    })
  )

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onBeforeUnload = () => dispose()
    window.addEventListener('beforeunload', onBeforeUnload, { once: true })
    disposables.add(() => window.removeEventListener('beforeunload', onBeforeUnload))
  }

  return {
    registerAction(action: TuffQuickAction): () => void {
      ensureActive('registerAction')
      registeredActionIds.add(action.id)

      void transport.send(MetaOverlayEvents.action.register, {
        pluginId,
        action: {
          ...action,
          handler: pluginId,
          priority: action.priority ?? 100
        }
      }).catch((error) => {
        console.error('[QuickActionsSDK] Failed to register action', error)
      })

      return () => {
        if (!registeredActionIds.has(action.id)) {
          return
        }

        registeredActionIds.delete(action.id)
        void transport.send(MetaOverlayEvents.action.unregister, {
          pluginId,
          actionId: action.id
        }).catch((error) => {
          console.error('[QuickActionsSDK] Failed to unregister action', error)
        })
      }
    },

    unregisterAll(): void {
      ensureActive('unregisterAll')
      registeredActionIds.clear()

      void transport.send(MetaOverlayEvents.action.unregister, {
        pluginId
      }).catch((error) => {
        console.error('[QuickActionsSDK] Failed to unregister all actions', error)
      })
    },

    onActionExecute(handler: QuickActionExecuteHandler): () => void {
      ensureActive('onActionExecute')
      actionExecuteHandlers.add(handler)
      return () => {
        actionExecuteHandlers.delete(handler)
      }
    },

    dispose
  }
}
