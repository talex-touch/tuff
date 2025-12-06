import { BridgeEventForCoreBox } from '../enum/bridge-event'
import { ensureRendererChannel } from '../channel'

export type BridgeEvent = BridgeEventForCoreBox

/**
 * Defines the shape of a bridge hook function.
 * @template T The type of data the hook will receive.
 */
export type BridgeHook<T = any> = (data: T) => void

const __hooks: Record<BridgeEvent, Array<BridgeHook>> = {
  [BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE]: [],
  [BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE]: [],
  [BridgeEventForCoreBox.CORE_BOX_KEY_EVENT]: [],
}

/**
 * Injects a hook for a given bridge event.
 * @param type The bridge event type.
 * @param hook The hook function to inject.
 * @returns The wrapped hook function.
 * @internal
 * @template T The type of data the hook will receive.
 */
export function injectBridgeEvent<T>(type: BridgeEvent, hook: BridgeHook<T>) {
  const hooks: Array<BridgeHook<T>> = __hooks[type] || (__hooks[type] = [])

  // Only register the channel listener once per event type
  if (hooks.length === 0) {
    const channel = ensureRendererChannel('[TouchSDK] Bridge channel not available. Make sure hooks run in plugin renderer context.')
    channel.regChannel(type, ({ data }) => {
      console.debug(`[TouchSDK] ${type} event received: `, data)
      // When the event is received, call all registered hooks for this type
      const registeredHooks = __hooks[type]
      if (registeredHooks) {
        registeredHooks.forEach(h => h(data))
      }
    })
  }

  const wrappedHook = (data: T) => {
    try {
      hook(data)
    }
    catch (e) {
      console.error(`[TouchSDK] ${type} hook error: `, e)
    }
  }

  hooks.push(wrappedHook)

  return wrappedHook
}

/**
 * Creates a hook for a given bridge event.
 * @param type The bridge event type.
 * @returns A function that takes a hook function and injects it.
 * @template T The type of data the hook will receive.
 */
export const createBridgeHook = <T>(type: BridgeEvent) => (hook: BridgeHook<T>) => injectBridgeEvent<T>(type, hook)

/**
 * Hook for when the core box input changes.
 * The hook receives the new input value as a string.
 * @param data The input change data (string).
 */
export const onCoreBoxInputChange = createBridgeHook<{ query: { inputs: Array<any>, text: string } }>(BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE)

export const onCoreBoxClipboardChange = createBridgeHook<{ item: any }>(BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE)

/**
 * Hook for when a keyboard event is forwarded from CoreBox.
 * This is triggered when the plugin's UI view is attached and the user
 * presses certain keys (Enter, Arrow keys, Meta+key combinations).
 * @param data The forwarded keyboard event data.
 */
export const onCoreBoxKeyEvent = createBridgeHook<{
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}>(BridgeEventForCoreBox.CORE_BOX_KEY_EVENT)
