/**
 * Channel Permission Guard
 *
 * Middleware for adding permission checks to channel handlers.
 */

import type { ChannelCallback, StandardChannelData } from '@talex-touch/utils/channel'
import { DataCode } from '@talex-touch/utils/channel'
import { getPermissionModule } from './index'

/**
 * Options for permission-protected channel
 */
export interface ProtectedChannelOptions {
  /** Permission ID required for this channel */
  permissionId: string
  /** Whether to allow if plugin has no sdkapi (legacy mode) */
  allowLegacy?: boolean
  /** Custom error message */
  errorMessage?: string
}

/**
 * Wrap a channel callback with permission checking
 *
 * @param options - Permission options
 * @param callback - Original channel callback
 * @returns Wrapped callback that checks permission first
 *
 * @example
 * ```typescript
 * channel.regChannel(
 *   ChannelType.PLUGIN,
 *   'fs:read',
 *   withPermission({ permissionId: 'fs.read' }, async ({ data, reply }) => {
 *     // Handler code - only runs if permission granted
 *   })
 * )
 * ```
 */
export function withPermission(
  options: ProtectedChannelOptions,
  callback: ChannelCallback
): ChannelCallback {
  const { permissionId, allowLegacy = true, errorMessage } = options

  return (channelData: StandardChannelData) => {
    const permModule = getPermissionModule()

    // If permission module not loaded, allow (during startup)
    if (!permModule) {
      return callback(channelData)
    }

    // Get plugin info from channel data
    const pluginId = (channelData as any).plugin
    const sdkapi = (channelData.data as any)?._sdkapi

    // If not from a plugin, allow
    if (!pluginId) {
      return callback(channelData)
    }

    // Check permission
    const result = permModule.checkPermission(pluginId, permissionId, sdkapi)

    if (!result.allowed) {
      // Permission denied
      const message = errorMessage || result.reason || `Permission '${permissionId}' denied`

      // If showing request dialog, we could emit an event here
      // For now, just return error
      return channelData.reply(DataCode.ERROR, {
        code: 'PERMISSION_DENIED',
        message,
        permissionId,
        pluginId,
        showRequest: result.showRequest,
      })
    }

    // Permission granted, proceed with original handler
    return callback(channelData)
  }
}

/**
 * Create a permission-protected channel registrar
 *
 * @example
 * ```typescript
 * const protectedReg = createProtectedRegister(channel, ChannelType.PLUGIN)
 *
 * protectedReg('fs:read', { permissionId: 'fs.read' }, async ({ data, reply }) => {
 *   // Handler code
 * })
 * ```
 */
export function createProtectedRegister(
  channel: { regChannel: (type: any, name: string, cb: ChannelCallback) => () => void },
  channelType: any
) {
  return (
    name: string,
    options: ProtectedChannelOptions,
    callback: ChannelCallback
  ): (() => void) => {
    return channel.regChannel(channelType, name, withPermission(options, callback))
  }
}

/**
 * Batch register protected channels
 */
export interface ProtectedChannelDefinition {
  name: string
  options: ProtectedChannelOptions
  callback: ChannelCallback
}

export function registerProtectedChannels(
  channel: { regChannel: (type: any, name: string, cb: ChannelCallback) => () => void },
  channelType: any,
  definitions: ProtectedChannelDefinition[]
): (() => void)[] {
  return definitions.map((def) =>
    channel.regChannel(channelType, def.name, withPermission(def.options, def.callback))
  )
}
