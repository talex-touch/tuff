/**
 * Plugin SDK Common Utilities
 *
 * @description
 * 提供插件SDK的通用功能，包括通信、快捷键等
 */

import { genChannel } from '../channel'

/**
 * Register a shortcut
 * @param key - The shortcut combination
 * @param func - The trigger function
 * @returns Whether the shortcut is registered successfully
 */
export function regShortcut(key: string, func: Function): boolean {
  const channel = genChannel()

  const res = channel.sendSync('shortcon:reg', { key })
  if (res instanceof String) throw new Error(String(res))
  if (res === false) return false

  channel.regChannel('shortcon:trigger', ({ data }) => key === data.key && func())

  return true
}

/**
 * Communicate with other plugins via the index:communicate channel
 * @param key - The message key
 * @param info - The message data
 * @returns Promise<any> The communication result
 */
export async function communicateWithPlugin(
  key: string,
  info: any = {}
): Promise<any> {
  const channel = genChannel()

  try {
    return await channel.send('index:communicate', {
      key,
      info
    })
  } catch (error) {
    console.error(`[Plugin SDK] Failed to communicate`, error)
    throw error
  }
}

/**
 * Send a message to the main application
 * @param message - The message type
 * @param data - The message data
 * @returns Promise<any> The message result
 */
export async function sendMessage(message: string, data: any = {}): Promise<any> {
  const channel = genChannel()

  try {
    return await channel.send(`plugin:${message}`, data)
  } catch (error) {
    console.error(`[Plugin SDK] Failed to send message: ${message}`, error)
    throw error
  }
}

/**
 * Get the channel object for the plugin
 * Attention: Using this function make sure you know what you are doing.
 * @returns The channel object for the plugin
 */
export function getChannel() {
  return genChannel()
}

export * from './window'
