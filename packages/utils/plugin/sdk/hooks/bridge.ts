import { getLogger } from '../../../common/logger'
import { ensureRendererChannel } from '../channel'
import { BridgeEventForCoreBox } from '../enum/bridge-event'

export type BridgeEvent = BridgeEventForCoreBox

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

const __hooks: Record<BridgeEvent, Array<BridgeHook>> = {
  [BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE]: [],
  [BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE]: [],
  [BridgeEventForCoreBox.CORE_BOX_KEY_EVENT]: [],
}

const __eventCache: Map<BridgeEvent, CachedEvent[]> = new Map()
const __channelRegistered = new Set<BridgeEvent>()

const CACHE_MAX_SIZE: Record<BridgeEvent, number> = {
  [BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE]: 1,
  [BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE]: 1,
  [BridgeEventForCoreBox.CORE_BOX_KEY_EVENT]: 10,
}

const bridgeLog = getLogger('plugin-sdk')

function invokeHook<T>(hook: BridgeHook<T>, data: T, fromCache: boolean, timestamp: number): void {
  try {
    hook({ data, meta: { timestamp, fromCache } })
  }
  catch (e) {
    bridgeLog.error('[TouchSDK] Bridge hook error', { error: e })
  }
}

function registerEarlyListener(type: BridgeEvent): void {
  if (__channelRegistered.has(type))
    return

  try {
    const channel = ensureRendererChannel()
    channel.regChannel(type, ({ data }) => {
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
export function clearBridgeEventCache(type?: BridgeEvent): void {
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
    Object.values(BridgeEventForCoreBox).forEach(e => registerEarlyListener(e as BridgeEvent))
  }, 0)
})()

/**
 * @internal
 */
export function injectBridgeEvent<T>(type: BridgeEvent, hook: BridgeHook<T>) {
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
export const createBridgeHook = <T>(type: BridgeEvent) => (hook: BridgeHook<T>) => injectBridgeEvent<T>(type, hook)

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

/** Hook for keyboard events forwarded from CoreBox. Payload includes `data` and `meta` (timestamp, fromCache). */
export const onCoreBoxKeyEvent = createBridgeHook<CoreBoxKeyEventData>(BridgeEventForCoreBox.CORE_BOX_KEY_EVENT)
