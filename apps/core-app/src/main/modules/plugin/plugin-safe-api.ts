import type { ClipboardCopyAndPasteRequest } from '@talex-touch/utils/transport/events/types'
import type { PluginLogger } from '@talex-touch/utils/plugin/node'
import { clipboard, dialog, shell } from 'electron'
import { validateExternalUrl } from '../../utils/external-url-policy'

/**
 * The wrappers a plugin reaches Electron through.
 *
 * Lifted out of `plugin.ts` for #339. The reason is `createSafePluginOpenUrl`, not the line
 * count: a plugin passes a URL straight from its own code, and `validateExternalUrl` is the last
 * thing before `shell.openExternal`. `external-url-policy` is tested; the wrapper that decides
 * whether to call it was not, because it sat among four thousand lines with no export.
 *
 * The dialog and clipboard wrappers are here for the opposite reason -- they narrow Electron's
 * surface to a named set, and a set is only worth having if something notices when it changes.
 */

export type PluginCopyAndPasteOptions = Omit<ClipboardCopyAndPasteRequest, '_sdkapi'>

export type PluginClipboardApi = Pick<
  Electron.Clipboard,
  'readText' | 'writeText' | 'readImage' | 'writeImage' | 'clear' | 'has'
> & {
  copyAndPaste: (options: PluginCopyAndPasteOptions) => Promise<boolean>
}

export function createSafePluginDialogApi() {
  return {
    showMessageBox: (...args: Parameters<typeof dialog.showMessageBox>) =>
      dialog.showMessageBox(...args),
    showOpenDialog: (...args: Parameters<typeof dialog.showOpenDialog>) =>
      dialog.showOpenDialog(...args),
    showSaveDialog: (...args: Parameters<typeof dialog.showSaveDialog>) =>
      dialog.showSaveDialog(...args)
  }
}

export function createSafePluginClipboardApi(
  copyAndPaste: PluginClipboardApi['copyAndPaste']
): PluginClipboardApi {
  return {
    readText: (...args: Parameters<typeof clipboard.readText>) => clipboard.readText(...args),
    writeText: (...args: Parameters<typeof clipboard.writeText>) => clipboard.writeText(...args),
    readImage: (...args: Parameters<typeof clipboard.readImage>) => clipboard.readImage(...args),
    writeImage: (...args: Parameters<typeof clipboard.writeImage>) => clipboard.writeImage(...args),
    clear: (...args: Parameters<typeof clipboard.clear>) => clipboard.clear(...args),
    has: (...args: Parameters<typeof clipboard.has>) => clipboard.has(...args),
    copyAndPaste
  }
}

export function createSafePluginOpenUrl(pluginName: string, logger: PluginLogger) {
  return async (url: string): Promise<void> => {
    const decision = validateExternalUrl(url)
    if (!decision.allowed) {
      const error = new Error(`PLUGIN_OPEN_URL_BLOCKED:${decision.reason}`)
      logger.warn(`[Plugin ${pluginName}] openUrl blocked`, {
        reason: decision.reason,
        protocol: decision.protocol
      })
      throw error
    }

    try {
      await shell.openExternal(decision.url)
    } catch (error) {
      logger.warn(`[Plugin ${pluginName}] openUrl failed`, {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }
}

export function withPluginSdkapiPayload(payload: unknown, sdkapi?: number): unknown {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    typeof sdkapi !== 'number'
  ) {
    return payload
  }

  return {
    ...(payload as Record<string, unknown>),
    _sdkapi: sdkapi
  }
}

export function createRemovedChannelError(capability: 'channel.raw'): Error {
  return new Error(
    `[Plugin API] ${capability} was removed by the core-app hard-cut. Migrate this plugin to typed transport send/on APIs.`
  )
}
