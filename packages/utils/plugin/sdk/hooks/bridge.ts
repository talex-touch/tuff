import { getLogger } from '../../../common/logger'
import { createPluginTuffTransport } from '../../../transport'
import { CoreBoxEvents } from '../../../transport/events'
import type { TuffEvent } from '../../../transport/event/types'
import { ensureRendererChannel } from '../channel'
import { BridgeEventForCoreBox } from '../enum/bridge-event'

type SupportedBridgeEvent =
  | BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE
  | BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE
export type BridgeEvent = SupportedBridgeEvent

export interface BridgeEventMeta {
  timestamp: number
  fromCache: boolean
}

export interface BridgeEventPayload<T = any> {
  data: T
  meta: BridgeEventMeta
}

/** @template T The type of data the hook will receive. */
export type BridgeHook<T = any> = (payload: BridgeEventPayload<T>) => void

interface CachedEvent<T = any> {
  data: T
  timestamp: number
}

const __hooks: Record<SupportedBridgeEvent, Array<BridgeHook>> = {
  [BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE]: [],
  [BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE]: [],
}

const __eventCache: Map<SupportedBridgeEvent, CachedEvent[]> = new Map()
const __channelRegistered = new Set<SupportedBridgeEvent>()

const CACHE_MAX_SIZE: Record<SupportedBridgeEvent, number> = {
  [BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE]: 1,
  [BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE]: 1,
}

const bridgeLog = getLogger('plugin-sdk')
const bridgeEventCatalog = {
  [BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE]: CoreBoxEvents.input.change,
  [BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE]: CoreBoxEvents.clipboard.change,
} satisfies Record<SupportedBridgeEvent, TuffEvent<any, any>>

function createRemovedBridgeKeyEventError(): Error {
  return Object.assign(
    new Error(
      '[TouchSDK] onCoreBoxKeyEvent was removed by the hard-cut because core-box:key-event has no production sender. Use attached UI hostKeyEvent props for plugin UI keyboard handling.'
    ),
    { code: 'plugin_bridge_key_event_removed' },
  )
}

function invokeHook<T>(hook: BridgeHook<T>, data: T, fromCache: boolean, timestamp: number): void {
  try {
    hook({ data, meta: { timestamp, fromCache } })
  }
  catch (e) {
    bridgeLog.error('[TouchSDK] Bridge hook error', { error: e })
  }
}

function registerEarlyListener(type: SupportedBridgeEvent): void {
  if (__channelRegistered.has(type))
    return
  const event = bridgeEventCatalog[type]

  try {
    const channel = ensureRendererChannel()
    const transport = createPluginTuffTransport(channel as any)
    transport.on(event, (data) => {
      const timestamp = Date.now()
      const hooks = __hooks[type]

      if (hooks && hooks.length > 0) {
        hooks.forEach(h => invokeHook(h, data, false, timestamp))
      }
      else {
        if (!__eventCache.has(type))
          __eventCache.set(type, [])
        const cache = __eventCache.get(type)!
        const maxSize = CACHE_MAX_SIZE[type] ?? 1
        cache.push({ data, timestamp })
        while (cache.length > maxSize) cache.shift()
        bridgeLog.debug(`[TouchSDK] ${type} cached, size: ${cache.length}`)
      }
    })
    __channelRegistered.add(type)
  }
  catch {
    // Channel not ready yet
  }
}

/** Clears the event cache for a specific event type or all types. */
export function clearBridgeEventCache(type?: SupportedBridgeEvent): void {
  if (type) {
    __eventCache.delete(type)
  }
  else {
    __eventCache.clear()
  }
}

// Auto-init on module load
;(function initBridgeEventCache() {
  setTimeout(() => {
    Object.keys(bridgeEventCatalog).forEach(e => registerEarlyListener(e as SupportedBridgeEvent))
  }, 0)
})()

/**
 * @internal
 */
export function injectBridgeEvent<T>(type: SupportedBridgeEvent, hook: BridgeHook<T>) {
  const hooks: Array<BridgeHook<T>> = __hooks[type] || (__hooks[type] = [])

  // Ensure channel listener is registered
  registerEarlyListener(type)

  // Replay cached events to this new hook
  const cached = __eventCache.get(type)
  if (cached && cached.length > 0) {
    cached.forEach(({ data, timestamp }) => invokeHook(hook, data as T, true, timestamp))
    __eventCache.delete(type)
  }

  hooks.push(hook)
  return hook
}

/**
 * Creates a hook for a given bridge event.
 * @param type The bridge event type.
 * @returns A function that takes a hook function and injects it.
 * @template T The type of data the hook will receive.
 */
export const createBridgeHook = <T>(type: SupportedBridgeEvent) => (hook: BridgeHook<T>) => injectBridgeEvent<T>(type, hook)

export interface CoreBoxInputData {
  query: { inputs: Array<any>, text: string }
}

export interface CoreBoxKeyEventData {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

export interface CoreBoxClipboardData {
  item: any
}

/** Hook for CoreBox input changes. Payload includes `data` and `meta` (timestamp, fromCache). */
export const onCoreBoxInputChange = createBridgeHook<CoreBoxInputData>(BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE)

/** Hook for CoreBox clipboard changes. Payload includes `data` and `meta` (timestamp, fromCache). */
export const onCoreBoxClipboardChange = createBridgeHook<CoreBoxClipboardData>(BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE)

/** @deprecated Removed: core-box:key-event has no production sender. Use attached UI hostKeyEvent props. */
export const onCoreBoxKeyEvent = (_hook: BridgeHook<CoreBoxKeyEventData>) => {
  throw createRemovedBridgeKeyEventError()
}
