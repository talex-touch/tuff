import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { dialog, shell, type OpenDialogReturnValue } from 'electron'
import type { FileActionResult } from '@talex-touch/utils/transport/events/types/app'
import type { IndexedActionPathResolution } from '../modules/box-tool/addon/files/services/file-provider-asset-service'
import fs from 'node:fs/promises'
import type { Dirent, Stats } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { withPermission } from '../modules/permission/channel-guard'
import { validateExternalUrl } from '../utils/external-url-policy'
import { evaluateInstalledAppPath } from '../utils/installed-app-policy'
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

const SYSTEM_FILE_ACTION_INVALID = 'SYSTEM_FILE_ACTION_INVALID'
const SYSTEM_FILE_ACTION_PATH_UNAVAILABLE = 'SYSTEM_FILE_ACTION_PATH_UNAVAILABLE'
const SYSTEM_FILE_ACTION_PERMISSION_DENIED = 'SYSTEM_FILE_ACTION_PERMISSION_DENIED'
const SYSTEM_FILE_ACTION_DESTINATION_REQUIRED = 'SYSTEM_FILE_ACTION_DESTINATION_REQUIRED'
const SYSTEM_FILE_ACTION_DESTINATION_EXISTS = 'SYSTEM_FILE_ACTION_DESTINATION_EXISTS'
const SYSTEM_FILE_ACTION_BOUNDARY = 'SYSTEM_FILE_ACTION_BOUNDARY'
const SYSTEM_FILE_ACTION_FAILED = 'SYSTEM_FILE_ACTION_FAILED'
const SYSTEM_FILE_ACTION_PARTIAL = 'SYSTEM_FILE_ACTION_PARTIAL'

type IndexedActionPath = IndexedActionPathResolution

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
}

interface StagedCommitResult {
  committed: boolean
  collision: boolean
}

async function commitStagedNoReplace(
  stagingPath: string,
  destinationPath: string
): Promise<StagedCommitResult> {
  let stats: Stats
  try {
    stats = await fs.lstat(stagingPath)
  } catch {
    return { committed: false, collision: false }
  }

  if (stats.isDirectory()) {
    try {
      await fs.mkdir(destinationPath)
    } catch (error) {
      return {
        committed: false,
        collision: (error as NodeJS.ErrnoException)?.code === 'EEXIST'
      }
    }
    let entries: Dirent[]
    try {
      entries = await fs.readdir(stagingPath, { withFileTypes: true })
    } catch {
      return { committed: false, collision: false }
    }
    for (const entry of entries) {
      const result = await commitStagedNoReplace(
        path.join(stagingPath, entry.name),
        path.join(destinationPath, entry.name)
      )
      if (!result.committed) return result
    }
    return { committed: true, collision: false }
  }

  try {
    if (stats.isSymbolicLink()) {
      await fs.symlink(await fs.readlink(stagingPath), destinationPath)
    } else if (stats.isFile()) {
      await fs.link(stagingPath, destinationPath)
    } else {
      return { committed: false, collision: false }
    }
    return { committed: true, collision: false }
  } catch (error) {
    return {
      committed: false,
      collision: (error as NodeJS.ErrnoException)?.code === 'EEXIST'
    }
  }
}

async function isIndexedSourceCurrent(source: IndexedActionPath): Promise<boolean> {
  try {
    const currentPath = await fs.realpath(source.path)
    if (currentPath !== source.path) return false
    const stats = await fs.stat(source.path)
    if (stats.isDirectory() !== source.isDirectory || (!stats.isFile() && !stats.isDirectory())) {
      return false
    }
    return (
      !source.identity || (stats.dev === source.identity.dev && stats.ino === source.identity.ino)
    )
  } catch {
    return false
  }
}

async function copyIndexedPath(
  source: IndexedActionPath,
  destinationDirectory: string
): Promise<FileActionResult> {
  let destination: string
  let destinationStats: Stats
  try {
    destination = await fs.realpath(path.resolve(destinationDirectory))
    destinationStats = await fs.stat(destination)
    await fs.access(destination, fs.constants.W_OK | fs.constants.X_OK)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    return {
      success: false,
      errorCode:
        code === 'EACCES' || code === 'EPERM'
          ? SYSTEM_FILE_ACTION_PERMISSION_DENIED
          : SYSTEM_FILE_ACTION_PATH_UNAVAILABLE
    }
  }
  if (!destinationStats.isDirectory())
    return { success: false, errorCode: SYSTEM_FILE_ACTION_DESTINATION_REQUIRED }

  const destinationPath = path.join(destination, path.basename(source.path))
  if (source.isDirectory && isPathInside(source.path, destination)) {
    return { success: false, errorCode: SYSTEM_FILE_ACTION_BOUNDARY }
  }

  const stagingDirectory = await fs.mkdtemp(path.join(destination, '.tuff-file-action-'))
  const stagingPath = path.join(stagingDirectory, path.basename(source.path))
  try {
    await fs.access(source.path, fs.constants.R_OK)
    await fs.cp(source.path, stagingPath, {
      recursive: source.isDirectory,
      errorOnExist: true,
      force: false
    })
    if (!(await isIndexedSourceCurrent(source))) {
      return { success: false, errorCode: SYSTEM_FILE_ACTION_PATH_UNAVAILABLE }
    }
    const committed = await commitStagedNoReplace(stagingPath, destinationPath)
    if (!committed.committed) {
      return {
        success: false,
        partial: !committed.collision,
        destinationPath: committed.collision ? undefined : destinationPath,
        errorCode: committed.collision
          ? SYSTEM_FILE_ACTION_DESTINATION_EXISTS
          : SYSTEM_FILE_ACTION_FAILED
      }
    }
    return { success: true, destinationPath }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    return {
      success: false,
      errorCode:
        code === 'EACCES' || code === 'EPERM'
          ? SYSTEM_FILE_ACTION_PERMISSION_DENIED
          : SYSTEM_FILE_ACTION_FAILED
    }
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function executeIndexedFileAction(
  action: 'copy-to' | 'move-to' | 'trash',
  source: IndexedActionPath,
  destinationDirectory?: string
): Promise<FileActionResult> {
  try {
    const currentPath = await fs.realpath(source.path)
    if (currentPath !== source.path)
      return { success: false, errorCode: SYSTEM_FILE_ACTION_PATH_UNAVAILABLE }
    const stats = await fs.stat(source.path)
    if (stats.isDirectory() !== source.isDirectory || (!stats.isFile() && !stats.isDirectory())) {
      return { success: false, errorCode: SYSTEM_FILE_ACTION_PATH_UNAVAILABLE }
    }
    if (
      source.identity &&
      (stats.dev !== source.identity.dev || stats.ino !== source.identity.ino)
    ) {
      return { success: false, errorCode: SYSTEM_FILE_ACTION_PATH_UNAVAILABLE }
    }
    if (action === 'trash') {
      await shell.trashItem(source.path)
      return { success: true }
    }
    if (!destinationDirectory?.trim()) {
      return { success: false, errorCode: SYSTEM_FILE_ACTION_DESTINATION_REQUIRED }
    }

    if (action === 'copy-to') return await copyIndexedPath(source, destinationDirectory)

    let destination: string
    let destinationStats: Stats
    try {
      destination = await fs.realpath(path.resolve(destinationDirectory))
      destinationStats = await fs.stat(destination)
      await fs.access(destination, fs.constants.W_OK | fs.constants.X_OK)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      return {
        success: false,
        errorCode:
          code === 'EACCES' || code === 'EPERM'
            ? SYSTEM_FILE_ACTION_PERMISSION_DENIED
            : SYSTEM_FILE_ACTION_PATH_UNAVAILABLE
      }
    }
    if (!destinationStats.isDirectory()) {
      return { success: false, errorCode: SYSTEM_FILE_ACTION_DESTINATION_REQUIRED }
    }
    if (source.isDirectory && isPathInside(source.path, destination)) {
      return { success: false, errorCode: SYSTEM_FILE_ACTION_BOUNDARY }
    }
    const destinationPath = path.join(destination, path.basename(source.path))
    try {
      await fs.lstat(destinationPath)
      return { success: false, errorCode: SYSTEM_FILE_ACTION_DESTINATION_EXISTS }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        return { success: false, errorCode: SYSTEM_FILE_ACTION_FAILED }
      }
    }

    if (!source.isDirectory) {
      try {
        await fs.link(source.path, destinationPath)
        await fs.unlink(source.path)
        return { success: true, destinationPath }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code
        if (code === 'EEXIST') {
          return { success: false, errorCode: SYSTEM_FILE_ACTION_DESTINATION_EXISTS }
        }
        if (code !== 'EXDEV') throw error
      }
    } else {
      try {
        await fs.rename(source.path, destinationPath)
        return { success: true, destinationPath }
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'EXDEV') throw error
      }
    }

    // Cross-device fallback: copy then verify source identity before removing
    const copied = await copyIndexedPath(source, destination)
    if (!copied.success || !copied.destinationPath) return copied
    const stillCurrent = await isIndexedSourceCurrent(source)
    if (!stillCurrent) {
      return {
        success: false,
        partial: true,
        destinationPath: copied.destinationPath,
        errorCode: SYSTEM_FILE_ACTION_PARTIAL
      }
    }
    try {
      await fs.rm(source.path, { recursive: source.isDirectory, force: false })
    } catch {
      return {
        success: false,
        partial: true,
        destinationPath: copied.destinationPath,
        errorCode: SYSTEM_FILE_ACTION_PARTIAL
      }
    }
    return copied
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    return {
      success: false,
      errorCode:
        code === 'EACCES' || code === 'EPERM'
          ? SYSTEM_FILE_ACTION_PERMISSION_DENIED
          : SYSTEM_FILE_ACTION_FAILED
    }
  }
}

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

/**
 * Directories macOS presents as a single item. Opening one never shows a folder: it launches an
 * application, installs a plug-in, mounts an image or hands a document to its app. Finder selects
 * them like files, and so does `showInFolder`.
 */
const MAC_PACKAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  // Launched, loaded or installed.
  '.app',
  '.appex',
  '.xpc',
  '.framework',
  '.bundle',
  '.plugin',
  '.kext',
  '.systemextension',
  '.dext',
  '.component',
  '.vst',
  '.vst3',
  '.prefpane',
  '.saver',
  '.qlgenerator',
  '.mdimporter',
  '.mailbundle',
  '.pkg',
  '.mpkg',
  '.workflow',
  '.action',
  '.wdgt',
  // Mounted, or opened by their application.
  '.sparsebundle',
  '.photoslibrary',
  '.musiclibrary',
  '.tvlibrary',
  '.imovielibrary',
  '.aplibrary',
  '.theater',
  '.fcpbundle',
  '.logicx',
  '.band',
  '.rtfd',
  '.pages',
  '.numbers',
  '.key',
  '.scptd',
  '.playground',
  '.xcodeproj',
  '.xcworkspace',
  '.xcarchive'
])

export function hasMacPackageExtension(target: string): boolean {
  return MAC_PACKAGE_EXTENSIONS.has(path.extname(target).toLowerCase())
}

/**
 * Whether a directory is a macOS package. The real path is checked too: a symlink with a folder's
 * name can point at an `.app`, and opening it would launch the app all the same.
 */
async function isMacPackageDirectory(target: string): Promise<boolean> {
  if (hasMacPackageExtension(target)) return true
  try {
    return hasMacPackageExtension(await fs.realpath(target))
  } catch {
    return false
  }
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
  /** Resolves only a currently indexed file or directory and its canonical identity. */
  resolveIndexedActionPath?: (rawPath: string) => Promise<IndexedActionPath | null>
  /** Platform whose file manager rules apply. Defaults to the running one; tests pin it. */
  platform?: NodeJS.Platform
}

/**
 * `openExternal` and `showInFolder` are reachable from a plugin surface, so both carry the
 * same permission the Prelude's `open-url` capability carries. A surface must not be the
 * cheaper route to the same shell.
 *
 * `requireVerifiedPlugin` is deliberately off: unlike `resolveApplication`, these two are
 * also called by the app's own renderer, which has no plugin context at all — requiring one
 * would reject the host. `withPermission` already lets a context with no plugin through and
 * gates every context that has one.
 */
const SHELL_PERMISSION = {
  permissionId: 'system.shell',
  failClosedForPlugin: true,
  unavailableCode: 'SYSTEM_SHELL_PERMISSION_UNAVAILABLE',
  deniedCode: 'SYSTEM_SHELL_PERMISSION_DENIED',
  sdkMismatchCode: 'SDKAPI_MISMATCH'
} as const

export function registerSystemShellHandlers(
  transport: ITuffTransportMain,
  options: SystemShellHandlerOptions
): Array<() => void> {
  const platform = options.platform ?? process.platform
  return [
    transport.on(
      AppEvents.system.fileAction,
      async (payload, context): Promise<FileActionResult> => {
        if (context?.plugin) {
          options.logger.warn('Blocked host-only file action invoked from a plugin', {
            meta: { eventName: 'system.fileAction', plugin: context.plugin.name }
          })
          throw new Error('HOST_ONLY_HANDLER')
        }
        const sourcePathValue = typeof payload?.sourcePath === 'string' ? payload.sourcePath : ''
        const sourcePath = sourcePathValue.trim() ? sourcePathValue : ''
        const action = payload?.action
        if (!sourcePath || (action !== 'copy-to' && action !== 'move-to' && action !== 'trash')) {
          return { success: false, errorCode: SYSTEM_FILE_ACTION_INVALID }
        }
        if (!options.resolveIndexedActionPath) {
          return { success: false, errorCode: SYSTEM_FILE_ACTION_PATH_UNAVAILABLE }
        }
        let source: IndexedActionPath | null
        try {
          source = await options.resolveIndexedActionPath(sourcePath)
        } catch {
          source = null
        }
        if (!source) return { success: false, errorCode: SYSTEM_FILE_ACTION_PATH_UNAVAILABLE }

        let destinationDirectory: string | undefined
        if (action !== 'trash') {
          let selection: OpenDialogReturnValue
          try {
            selection = await dialog.showOpenDialog({
              properties: ['openDirectory', 'createDirectory', 'noResolveAliases']
            })
          } catch {
            return { success: false, errorCode: SYSTEM_FILE_ACTION_FAILED }
          }
          if (selection.canceled || selection.filePaths.length !== 1) {
            return { success: false, canceled: true }
          }
          destinationDirectory = selection.filePaths[0]
        }
        return await executeIndexedFileAction(action, source, destinationDirectory)
      }
    ),
    transport.on(
      AppEvents.system.openExternal,
      withPermission(SHELL_PERMISSION, (payload) => {
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
      })
    ),
    transport.on(
      AppEvents.system.showInFolder,
      withPermission(SHELL_PERMISSION, async (payload) => {
        const target = typeof payload?.path === 'string' ? payload.path : ''
        if (!target.trim()) {
          throw new Error(SYSTEM_SHELL_PATH_REQUIRED)
        }

        let stats: Stats
        try {
          stats = await fs.stat(target)
        } catch {
          throw new Error(SYSTEM_SHELL_PATH_UNAVAILABLE)
        }

        // Only a plain folder opens. A reveal request, a file and a macOS package are selected in
        // their parent: opening an .app would launch it, the same hole openApp closed (#908).
        if (
          payload?.reveal === true ||
          !stats.isDirectory() ||
          (platform === 'darwin' && (await isMacPackageDirectory(target)))
        ) {
          shell.showItemInFolder(target)
          return
        }

        let error: string
        try {
          error = await shell.openPath(target)
        } catch {
          throw new Error(SYSTEM_SHELL_OPEN_PATH_FAILED)
        }
        if (error) {
          throw new Error(SYSTEM_SHELL_OPEN_PATH_FAILED)
        }
      })
    ),
    transport.on(AppEvents.system.openApp, (payload) => {
      // shell.openPath launches by OS association, so this handler was a way for any caller
      // to execute a file it had dropped elsewhere, e.g. through the download handler (#908).
      // The target must now be an application this machine actually has installed.
      //
      // This event is not on the plugin-facing allowlist, so it is host-only — but the
      // installed-app check is what makes that a defence rather than a configuration.
      const target = payload?.appName || payload?.path
      const decision = evaluateInstalledAppPath(target)
      if (!decision.allowed) {
        options.logger.warn('Blocked openApp request', { meta: { reason: decision.reason } })
        return undefined
      }

      void shell.openPath(target as string)
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

        let stats: Stats
        let canonicalCommand: string
        let canonicalRoot: string
        try {
          stats = await fs.stat(command)
          canonicalCommand = await fs.realpath(command)
          canonicalRoot = await fs.realpath(appRoot).catch(() => path.resolve(appRoot))
        } catch {
          throw new Error(SYSTEM_SHELL_PATH_UNAVAILABLE)
        }
        if (!isWithinAppRoot(canonicalCommand, canonicalRoot)) {
          options.logger.warn('Blocked executeCommand symlink escaping the app root', {
            meta: { reason: SYSTEM_SHELL_PATH_OUTSIDE_APP_ROOT }
          })
          throw new Error(SYSTEM_SHELL_PATH_OUTSIDE_APP_ROOT)
        }
        // macOS packages (.app, .workflow, .pkg, .action, .scptd, etc.) are directories that
        // launch, install, or execute when handed to shell.openPath, so the directory check alone
        // is not enough even inside the root.
        if (
          !stats.isDirectory() ||
          hasMacPackageExtension(command) ||
          hasMacPackageExtension(canonicalCommand) ||
          (await isMacPackageDirectory(command))
        ) {
          options.logger.warn('Blocked executeCommand on a non-directory target', {
            meta: { reason: SYSTEM_SHELL_PATH_NOT_A_DIRECTORY }
          })
          throw new Error(SYSTEM_SHELL_PATH_NOT_A_DIRECTORY)
        }

        const error = await shell.openPath(canonicalCommand)
        if (error) {
          throw new Error(error)
        }
      }
    )
  ]
}
