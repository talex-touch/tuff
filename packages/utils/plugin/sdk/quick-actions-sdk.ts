/**
 * Quick Actions SDK for Plugin Development
 *
 * Provides API for plugins to register global actions in Tuff Quick Actions (Cmd+K / Ctrl+K).
 */

import type { TuffItem, TuffQuickAction } from '../../core-box/tuff/tuff-dsl'
import type {
  FlowPayload,
  FlowPayloadType,
  FlowTargetInfo,
  NativeShareResult,
  NativeShareTarget
} from '../../types/flow'
import { createPluginTuffTransport } from '../../transport'
import {
  CoreBoxEvents,
  CoreBoxRetainedEvents,
  FlowEvents,
  MetaOverlayEvents
} from '../../transport/events'
import { createDisposableBag } from '../../transport/sdk'

/**
 * Action execution handler
 */
export type QuickActionExecuteHandler = (data: {
  actionId: string
  item: TuffItem
}) => void | Promise<void>

export type QuickActionNativeShareTarget = NativeShareTarget | 'system-share' | (string & {})

export interface QuickActionNativeShareOptions {
  /**
   * Preferred native target.
   *
   * Current built-in target IDs are `system-share`, `airdrop`, `mail`, and `messages`.
   */
  target?: QuickActionNativeShareTarget
}

export interface QuickActionNativeShareTargetOptions {
  /**
   * Payload type used to query compatible targets.
   */
  payloadType?: FlowPayloadType

  /**
   * Preferred target order. Defaults prefer AirDrop for files/images and system share for text-like payloads.
   */
  preferredTargets?: QuickActionNativeShareTarget[]

  /**
   * Whether to fall back to the first compatible native target when none of the preferred targets exist.
   *
   * Defaults to true.
   */
  allowFallback?: boolean
}

export interface QuickActionItemSharePayloadOptions {
  /**
   * Override the share title. Defaults to the item title.
   */
  title?: string

  /**
   * Override text content. Defaults to title, subtitle, and URL when available.
   */
  text?: string

  /**
   * Override URL content. Defaults to `item.meta.web.url` when available.
   */
  url?: string

  /**
   * Override files to share. Defaults to `item.meta.file.path` for file-like items.
   */
  files?: string[]

  /**
   * Extra metadata attached to the Flow payload.
   */
  metadata?: Record<string, any>
}

export interface QuickActionShareItemOptions extends QuickActionItemSharePayloadOptions {
  /**
   * Explicit native target. When set, target discovery is skipped.
   */
  target?: QuickActionNativeShareTarget

  /**
   * Preferred target order used when target is not explicit.
   */
  preferredTargets?: QuickActionNativeShareTarget[]

  /**
   * Whether to fall back to the first compatible native target when none of the preferred targets exist.
   *
   * Defaults to true.
   */
  allowFallback?: boolean
}

export interface QuickActionsSDKOptions {
  /**
   * Plugin sdkapi marker forwarded to permission-gated transport handlers.
   */
  sdkapi?: number
}

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
   * Returns native share targets exposed by the current platform.
   *
   * macOS exposes system-share, AirDrop, Mail, and Messages where applicable.
   * Windows/Linux currently expose the explicit Mail fallback only.
   */
  getNativeShareTargets: (payloadType?: FlowPayloadType) => Promise<FlowTargetInfo[]>

  /**
   * Resolves the best available native share target for a payload type.
   */
  resolveNativeShareTarget: (
    options?: QuickActionNativeShareTargetOptions
  ) => Promise<FlowTargetInfo | undefined>

  /**
   * Shares a Flow payload through the platform native share bridge.
   */
  nativeShare: (
    payload: FlowPayload,
    options?: QuickActionNativeShareOptions
  ) => Promise<NativeShareResult>

  /**
   * Builds a native-share-ready Flow payload from a CoreBox item.
   */
  createSharePayloadFromItem: (
    item: TuffItem,
    options?: QuickActionItemSharePayloadOptions
  ) => FlowPayload

  /**
   * Builds and shares a native-share-ready Flow payload from a CoreBox item.
   */
  shareItem: (item: TuffItem, options?: QuickActionShareItemOptions) => Promise<NativeShareResult>

  /**
   * Release internal listeners
   */
  dispose: () => void
}

function resolveItemTitle(item: TuffItem, fallback = 'Tuff item'): string {
  const title = item.render?.basic?.title ?? item.meta?.web?.title ?? item.id ?? fallback
  return typeof title === 'string' && title.trim().length > 0 ? title.trim() : fallback
}

function resolveItemSubtitle(item: TuffItem): string | undefined {
  const subtitle = item.render?.basic?.subtitle ?? item.render?.basic?.description
  return typeof subtitle === 'string' && subtitle.trim().length > 0 ? subtitle.trim() : undefined
}

function normalizeFiles(files?: string[]): string[] {
  if (!Array.isArray(files)) {
    return []
  }
  return files
    .filter((file): file is string => typeof file === 'string' && file.trim().length > 0)
    .map((file) => file.trim())
}

function defaultNativeShareTargetOrder(payloadType?: FlowPayloadType): QuickActionNativeShareTarget[] {
  if (payloadType === 'files' || payloadType === 'image') {
    return ['airdrop', 'system-share', 'mail']
  }

  return ['system-share', 'mail', 'messages']
}

function normalizeTargetId(target: string): string {
  return target === 'system' ? 'system-share' : target
}

function targetMatchesPreference(
  target: FlowTargetInfo,
  preference: QuickActionNativeShareTarget
): boolean {
  const preferredId = normalizeTargetId(String(preference))
  return target.id === preferredId || target.fullId === preferredId || target.fullId === `native.${preferredId}`
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
export function createQuickActionsSDK(
  channel: any,
  pluginId: string,
  sdkOptions: QuickActionsSDKOptions = {}
): QuickActionsSDK {
  const actionExecuteHandlers: Set<QuickActionExecuteHandler> = new Set()
  const registeredActionIds: Set<string> = new Set()
  const transport = createPluginTuffTransport(channel)
  const disposables = createDisposableBag()
  let disposed = false
  let lastExecuteKey = ''
  let lastExecuteAt = 0

  const emitActionExecute = (data: { pluginId: string, actionId: string, item: TuffItem }) => {
    if (data.pluginId !== pluginId || !registeredActionIds.has(data.actionId)) {
      return
    }

    const executeKey = `${data.pluginId}:${data.actionId}:${data.item.id ?? ''}`
    const now = Date.now()
    if (executeKey === lastExecuteKey && now - lastExecuteAt < 250) {
      return
    }

    lastExecuteKey = executeKey
    lastExecuteAt = now

    for (const handler of actionExecuteHandlers) {
      try {
        const result = handler({
          actionId: data.actionId,
          item: data.item
        })
        if (result && typeof (result as Promise<void>).catch === 'function') {
          void (result as Promise<void>).catch((error) => {
            console.error('[QuickActionsSDK] onActionExecute handler error', error)
          })
        }
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

  const createSharePayloadFromItem = (
    item: TuffItem,
    options: QuickActionItemSharePayloadOptions = {}
  ): FlowPayload => {
    const title = options.title ?? resolveItemTitle(item)
    const subtitle = resolveItemSubtitle(item)
    const url = options.url ?? item.meta?.web?.url
    const files = normalizeFiles(options.files)
    const filePath = item.meta?.file?.path

    if (files.length === 0 && typeof filePath === 'string') {
      const normalizedFilePath = filePath.trim()
      if (normalizedFilePath.length > 0) {
        files.push(normalizedFilePath)
      }
    }

    const metadata = {
      title,
      itemId: item.id,
      itemKind: item.kind,
      sourceId: item.source?.id ?? pluginId,
      sourceType: item.source?.type ?? 'plugin',
      ...(url ? { url } : {}),
      ...options.metadata,
    }

    if (files.length > 0) {
      return {
        type: 'files',
        data: files,
        context: {
          sourcePluginId: pluginId,
          metadata,
        },
      }
    }

    const text = options.text ?? [title, subtitle, url].filter(Boolean).join('\n')
    return {
      type: 'text',
      data: text,
      context: {
        sourcePluginId: pluginId,
        metadata,
      },
    }
  }

  const nativeShare = async (
    payload: FlowPayload,
    shareOptions: QuickActionNativeShareOptions = {}
  ): Promise<NativeShareResult> => {
    ensureActive('nativeShare')
    const enrichedPayload: FlowPayload = {
      ...payload,
      context: {
        ...payload.context,
        sourcePluginId: payload.context?.sourcePluginId || pluginId,
      },
    }

    const response = await transport.send(FlowEvents.nativeShare, {
      payload: enrichedPayload,
      target: shareOptions.target,
      _sdkapi: sdkOptions.sdkapi,
    })

    return response || { success: false, error: 'Native share failed' }
  }

  const resolveNativeShareTarget = async (
    options: QuickActionNativeShareTargetOptions = {}
  ): Promise<FlowTargetInfo | undefined> => {
    ensureActive('resolveNativeShareTarget')
    const targets = (await api.getNativeShareTargets(options.payloadType)).filter(
      (target) => target.isEnabled !== false
    )
    const preferredTargets = options.preferredTargets?.length
      ? options.preferredTargets
      : defaultNativeShareTargetOrder(options.payloadType)

    for (const preference of preferredTargets) {
      const matched = targets.find((target) => targetMatchesPreference(target, preference))
      if (matched) {
        return matched
      }
    }

    return options.allowFallback === false ? undefined : targets[0]
  }

  disposables.add(
    transport.on(CoreBoxEvents.metaOverlay.actionExecuted, (payload) => {
      emitActionExecute(payload)
    })
  )
  disposables.add(
    transport.on(CoreBoxRetainedEvents.legacy.metaOverlayActionExecuted, (payload) => {
      emitActionExecute(payload)
    })
  )

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onBeforeUnload = () => dispose()
    window.addEventListener('beforeunload', onBeforeUnload, { once: true })
    disposables.add(() => window.removeEventListener('beforeunload', onBeforeUnload))
  }

  const api: QuickActionsSDK = {
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

    async getNativeShareTargets(payloadType?: FlowPayloadType): Promise<FlowTargetInfo[]> {
      ensureActive('getNativeShareTargets')
      const response = await transport.send(FlowEvents.getTargets, {
        payloadType,
        _sdkapi: sdkOptions.sdkapi,
      })

      if (!response?.success) {
        throw new Error(response?.error?.message || 'Failed to get native share targets')
      }

      return (response.data || []).filter((target) => target.isNativeShare === true)
    },

    resolveNativeShareTarget,

    nativeShare,

    createSharePayloadFromItem(
      item: TuffItem,
      options?: QuickActionItemSharePayloadOptions
    ): FlowPayload {
      ensureActive('createSharePayloadFromItem')
      return createSharePayloadFromItem(item, options)
    },

    async shareItem(
      item: TuffItem,
      options: QuickActionShareItemOptions = {}
    ): Promise<NativeShareResult> {
      ensureActive('shareItem')
      const payload = createSharePayloadFromItem(item, options)
      const resolvedTarget = options.target
        ? options.target
        : (await resolveNativeShareTarget({
          payloadType: payload.type,
          preferredTargets: options.preferredTargets,
          allowFallback: options.allowFallback,
        }))?.id

      if (!resolvedTarget) {
        return { success: false, error: 'No native share target available' }
      }

      return await nativeShare(payload, { target: resolvedTarget })
    },

    dispose
  }

  return api
}
