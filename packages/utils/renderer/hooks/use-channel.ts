import { inject, type InjectionKey } from 'vue'

export interface TouchChannel {
  send<TRequest = any, TResponse = any>(
    eventName: string,
    data?: TRequest
  ): Promise<TResponse>

  regChannel?<TRequest = any>(
    eventName: string,
    handler: (data: TRequest) => Promise<any> | any
  ): () => void
}

// Injection key for the TouchChannel
export const TouchChannelKey: InjectionKey<TouchChannel> = Symbol('TouchChannel')

/**
 * Global reference to the TouchChannel instance
 * This is automatically injected by the main process
 */
declare global {
  interface Window {
    touchChannel?: TouchChannel
    $touchChannel?: TouchChannel
  }

  var touchChannel: TouchChannel | undefined
  var $touchChannel: TouchChannel | undefined
}

/**
 * Resolve TouchChannel from multiple sources
 */
function resolveTouchChannel(): TouchChannel | null {
  // Try dependency injection first
  try {
    const injectedChannel = inject(TouchChannelKey, null)
    if (injectedChannel) return injectedChannel
  } catch {
    // Ignore injection errors outside of Vue context
  }

  // Try global variables
  if (typeof globalThis !== 'undefined') {
    const channel =
      (globalThis as any).touchChannel ||
      (globalThis as any).$touchChannel ||
      (globalThis as any).window?.touchChannel ||
      (globalThis as any).window?.$touchChannel

    if (channel) return channel
  }

  // Try window object (browser environment)
  if (typeof window !== 'undefined') {
    const channel = window.touchChannel || window.$touchChannel
    if (channel) return channel
  }

  return null
}

/**
 * Composable for using TouchChannel communication
 *
 * Provides a reactive interface to communicate with the main process
 * through the TouchChannel IPC system. Works in both renderer and
 * corebox contexts.
 *
 * @example
 * ```ts
 * const channel = useChannel()
 *
 * // Send a message to main process
 * const result = await channel.send('get-app-config')
 *
 * // Send with data
 * const saved = await channel.send('save-config', { theme: 'dark' })
 *
 * // Register a handler (if supported)
 * const cleanup = channel.regChannel?.('config-updated', (data) => {
 *   console.log('Config updated:', data)
 * })
 *
 * // Cleanup handler when component unmounts
 * onUnmounted(() => {
 *   cleanup?.()
 * })
 * ```
 */
export function useChannel(): TouchChannel {
  const channel = resolveTouchChannel()

  if (!channel) {
    throw new Error(
      '[useChannel] TouchChannel not available. ' +
      'Make sure the TouchChannel is properly injected by the main process.'
    )
  }

  return channel
}

/**
 * Helper composable that creates a typed channel wrapper
 * for specific communication patterns
 *
 * @example
 * ```ts
 * interface ConfigAPI {
 *   'get-config': { key: string } => { value: any }
 *   'set-config': { key: string; value: any } => { success: boolean }
 * }
 *
 * const configChannel = useTypedChannel<ConfigAPI>()
 *
 * // Type-safe usage
 * const result = await configChannel.send('get-config', { key: 'theme' })
 * // result is automatically typed as { value: any }
 * ```
 */
export function useTypedChannel<TChannelMap extends Record<string, any>>() {
  const channel = useChannel()

  return {
    send<TEventName extends keyof TChannelMap>(
      eventName: TEventName,
      ...args: TChannelMap[TEventName] extends (arg: infer TArg) => any
        ? [TArg]
        : []
    ): Promise<
      TChannelMap[TEventName] extends (arg: any) => infer TReturn
        ? TReturn
        : any
    > {
      return channel.send(
        eventName as string,
        args.length > 0 ? args[0] : undefined
      )
    },

    regChannel: channel.regChannel
  }
}