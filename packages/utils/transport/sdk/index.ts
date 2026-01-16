/**
 * @fileoverview TuffTransport SDK entry point
 * @module @talex-touch/utils/transport/sdk
 */

import type { ITuffTransport, ITuffTransportMain } from '../types'
import { TuffRendererTransport } from './renderer-transport'
import { TuffMainTransport } from './main-transport'
import { createPluginTuffTransport } from './plugin-transport'

// Singleton instance for renderer transport
let rendererTransportInstance: ITuffTransport | null = null

/**
 * Gets or creates the singleton TuffTransport instance for renderer processes.
 * 
 * @returns The TuffTransport instance
 * 
 * @example
 * ```typescript
 * import { useTuffTransport } from '@talex-touch/utils/transport'
 * import { ClipboardEvents } from '@talex-touch/utils/transport/events'
 * 
 * const transport = useTuffTransport()
 * const latest = await transport.send(ClipboardEvents.getLatest)
 * ```
 */
export function useTuffTransport(): ITuffTransport {
  if (!rendererTransportInstance) {
    rendererTransportInstance = new TuffRendererTransport()
  }
  return rendererTransportInstance
}

/**
 * Creates a new TuffTransport instance for renderer processes.
 * 
 * @param module - Optional module name for namespacing (currently unused, reserved for future use)
 * @returns A new TuffTransport instance
 * 
 * @remarks
 * In most cases, you should use `useTuffTransport()` instead to get the singleton instance.
 * This function is useful when you need multiple isolated transport instances.
 * 
 * @example
 * ```typescript
 * import { createTuffRendererTransport } from '@talex-touch/utils/transport'
 * 
 * const transport = createTuffRendererTransport('clipboard')
 * ```
 */
export function createTuffRendererTransport(module?: string): ITuffTransport {
  // Module parameter is reserved for future namespacing
  void module
  // For now, we create a new instance
  return new TuffRendererTransport()
}

export { createPluginTuffTransport }

/**
 * Gets the TuffTransportMain instance for the main process.
 * 
 * @param channel - The TouchChannel instance from the main process
 * @param keyManager - The plugin key manager instance
 * @returns The TuffTransportMain instance
 * 
 * @remarks
 * This function should only be called from the main process.
 * The channel and keyManager should be obtained from the main process context.
 * 
 * @example
 * ```typescript
 * import { getTuffTransportMain } from '@talex-touch/utils/transport'
 * import { genTouchChannel } from '../core/channel-core'
 * 
 * const channel = genTouchChannel(app)
 * const transport = getTuffTransportMain(channel, keyManager)
 * 
 * transport.on(ClipboardEvents.getLatest, async (payload, context) => {
 *   // Handle request
 *   return latestItem
 * })
 * ```
 */
export function getTuffTransportMain(
  channel: any,
  keyManager: any,
): ITuffTransportMain {
  return new TuffMainTransport(channel, keyManager)
}
