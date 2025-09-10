import { BridgeEventForCoreBox } from '../enum/bridge-event'

export type BridgeEvent = BridgeEventForCoreBox

/**
 * Defines the shape of a bridge hook function.
 * @template T The type of data the hook will receive.
 */
export type BridgeHook<T = any> = (data: T) => void

const __hooks: Record<BridgeEvent, Array<BridgeHook>> = {
  [BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE]: [],
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
    window.$channel.regChannel(type, ({ data }) => {
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

    } catch (e) {
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
export const onCoreBoxInputChange = createBridgeHook<{ query: string }>(BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE)
