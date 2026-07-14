import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { validateExternalUrl } from '../utils/external-url-policy'
import type { LogOptions } from '../utils/logger'

export interface SystemShellCapabilities {
  openExternal: (url: string) => Promise<void>
}

export const systemShellCapabilities: SystemShellCapabilities = {
  openExternal: async (url) => await shell.openExternal(url)
}

export interface SystemShellHandlerOptions {
  configRootPath: () => string | null | undefined
  logger: { warn: (message: unknown, options?: LogOptions) => void }
  registerSafeHandler: <TReq, TExtra extends Record<string, unknown> = Record<string, never>>(
    event: TuffEvent<TReq, unknown> & { toEventName: () => string },
    handler: (payload: TReq, context: HandlerContext) => Promise<void | TExtra> | void | TExtra
  ) => () => void
}

export function registerSystemShellHandlers(
  transport: ITuffTransportMain,
  options: SystemShellHandlerOptions
): Array<() => void> {
  return [
    transport.on(AppEvents.system.openExternal, (payload) => {
      const decision = validateExternalUrl(payload?.url)
      if (!decision.allowed) {
        options.logger.warn('Blocked external URL open request', {
          meta: {
            reason: decision.reason,
            protocol: decision.protocol
          }
        })
        return undefined
      }
      return systemShellCapabilities.openExternal(decision.url)
    }),
    transport.on(AppEvents.system.showInFolder, (payload) => {
      const target = typeof payload?.path === 'string' ? payload.path : ''
      if (target) {
        shell.showItemInFolder(target)
      }
    }),
    transport.on(AppEvents.system.openApp, (payload) => {
      const target = payload?.appName || payload?.path
      if (target) {
        void shell.openPath(target)
      }
      return undefined
    }),
    transport.on(AppEvents.system.openPromptsFolder, async () => {
      const basePath = options.configRootPath()
      if (!basePath) {
        throw new Error('Config path not available')
      }

      const promptFilePath = path.join(basePath, 'intelligence', 'prompt-library')
      try {
        await fs.stat(promptFilePath)
        shell.showItemInFolder(promptFilePath)
        return
      } catch {
        // Ignore and fallback to opening config root
      }

      const error = await shell.openPath(basePath)
      if (error) {
        throw new Error(error)
      }
    }),
    options.registerSafeHandler(
      AppEvents.system.executeCommand,
      async (payload: { command?: string }) => {
        const command = typeof payload?.command === 'string' ? payload.command : ''
        if (!command) {
          throw new Error('No command provided')
        }

        const error = await shell.openPath(command)
        if (error) {
          throw new Error(error)
        }
      }
    )
  ]
}
