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

const SYSTEM_SHELL_PATH_REQUIRED = 'SYSTEM_SHELL_PATH_REQUIRED'
const SYSTEM_SHELL_PATH_UNAVAILABLE = 'SYSTEM_SHELL_PATH_UNAVAILABLE'
const SYSTEM_SHELL_OPEN_PATH_FAILED = 'SYSTEM_SHELL_OPEN_PATH_FAILED'
const SYSTEM_SHELL_PATH_OUTSIDE_APP_ROOT = 'SYSTEM_SHELL_PATH_OUTSIDE_APP_ROOT'
const SYSTEM_SHELL_PATH_NOT_A_DIRECTORY = 'SYSTEM_SHELL_PATH_NOT_A_DIRECTORY'

/**
 * Whether `target` is the app root itself or a path beneath it.
 *
 * Compared after path.resolve so that '..' segments cannot climb out, and with a trailing
 * separator so a sibling like `<root>-backup` does not match the prefix.
 */
function isWithinAppRoot(target: string, appRoot: string): boolean {
  const resolvedRoot = path.resolve(appRoot)
  const resolvedTarget = path.resolve(target)
  if (resolvedTarget === resolvedRoot) {
    return true
  }
  return resolvedTarget.startsWith(resolvedRoot + path.sep)
}

export interface SystemShellHandlerOptions {
  configRootPath: () => string | null | undefined
  /** The app's own data root. executeCommand may not open anything outside it. */
  appRootPath: () => string | null | undefined
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
    transport.on(AppEvents.system.showInFolder, async (payload) => {
      const target = typeof payload?.path === 'string' ? payload.path : ''
      if (!target.trim()) {
        throw new Error(SYSTEM_SHELL_PATH_REQUIRED)
      }

      let stats: Awaited<ReturnType<typeof fs.stat>>
      try {
        stats = await fs.stat(target)
      } catch {
        throw new Error(SYSTEM_SHELL_PATH_UNAVAILABLE)
      }

      if (stats.isDirectory()) {
        let error: string
        try {
          error = await shell.openPath(target)
        } catch {
          throw new Error(SYSTEM_SHELL_OPEN_PATH_FAILED)
        }
        if (error) {
          throw new Error(SYSTEM_SHELL_OPEN_PATH_FAILED)
        }
        return
      }

      shell.showItemInFolder(target)
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

        // shell.openPath does not "run a command" — it hands the path to the OS association,
        // which for a .command, .bat or .app means execution. The event accepted any string,
        // so a plugin could write a script through the download handler and then ask the main
        // process to launch it (#909).
        //
        // The one caller in the app is Settings > About opening the application folder, so
        // the surface it actually needs is: a directory, inside the app's own root. Both
        // conditions matter — restricting to the root alone would still allow launching a
        // .app bundle or a script that a plugin had written into its own storage.
        const appRoot = options.appRootPath()
        if (!appRoot) {
          throw new Error(SYSTEM_SHELL_PATH_UNAVAILABLE)
        }
        if (!isWithinAppRoot(command, appRoot)) {
          options.logger.warn('Blocked executeCommand outside the app root', {
            meta: { reason: SYSTEM_SHELL_PATH_OUTSIDE_APP_ROOT }
          })
          throw new Error(SYSTEM_SHELL_PATH_OUTSIDE_APP_ROOT)
        }

        let stats: Awaited<ReturnType<typeof fs.stat>>
        try {
          stats = await fs.stat(command)
        } catch {
          throw new Error(SYSTEM_SHELL_PATH_UNAVAILABLE)
        }
        // A macOS .app bundle is a directory that executes, so the directory check alone is
        // not enough even inside the root.
        if (!stats.isDirectory() || path.extname(command).toLowerCase() === '.app') {
          options.logger.warn('Blocked executeCommand on a non-directory target', {
            meta: { reason: SYSTEM_SHELL_PATH_NOT_A_DIRECTORY }
          })
          throw new Error(SYSTEM_SHELL_PATH_NOT_A_DIRECTORY)
        }

        const error = await shell.openPath(command)
        if (error) {
          throw new Error(error)
        }
      }
    )
  ]
}
