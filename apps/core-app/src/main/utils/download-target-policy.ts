import type { AppPathLike } from './app-root-path'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isSafePathSegment } from '@talex-touch/utils/common/utils/safe-path'
import { app } from 'electron'
import { resolveRuntimeRootPath } from './app-root-path'

export type DownloadTargetRejection =
  | 'unsafe-filename'
  | 'destination-not-absolute'
  | 'destination-outside-roots'

export type DownloadTargetDecision =
  | { allowed: true; destination: string; filename: string }
  | { allowed: false; reason: DownloadTargetRejection }

export type AppPathName = 'downloads' | 'temp' | 'userData'

export interface DownloadRootsAppLike extends AppPathLike {
  getPath: (name: AppPathName) => string
}

const SAFE_DOWNLOAD_TASK_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

const DANGEROUS_DOWNLOAD_OPEN_EXTENSIONS: ReadonlySet<string> = new Set([
  '.action',
  '.app',
  '.appex',
  '.appimage',
  '.applescript',
  '.bash',
  '.bat',
  '.bin',
  '.bundle',
  '.cmd',
  '.com',
  '.command',
  '.component',
  '.cpl',
  '.csh',
  '.deb',
  '.desktop',
  '.dext',
  '.dmg',
  '.exe',
  '.framework',
  '.hta',
  '.inetloc',
  '.inf',
  '.jar',
  '.js',
  '.jse',
  '.kext',
  '.ksh',
  '.lnk',
  '.mpkg',
  '.msi',
  '.msp',
  '.msu',
  '.osascript',
  '.php',
  '.pif',
  '.pkg',
  '.pl',
  '.plugin',
  '.prefpane',
  '.ps1',
  '.psd1',
  '.psm1',
  '.py',
  '.rb',
  '.reg',
  '.rpm',
  '.run',
  '.saver',
  '.scpt',
  '.scptd',
  '.scr',
  '.sh',
  '.systemextension',
  '.terminal',
  '.vbe',
  '.vbs',
  '.wdgt',
  '.webloc',
  '.workflow',
  '.wsf',
  '.wsh',
  '.xpc',
  '.zsh'
])

function safeAppPath(
  appLike: Pick<DownloadRootsAppLike, 'getPath'>,
  name: AppPathName
): string | null {
  try {
    return appLike.getPath(name)
  } catch {
    return name === 'temp' ? os.tmpdir() : null
  }
}

function normalizeComparablePath(targetPath: string): string {
  const resolved = path.resolve(targetPath)
  return process.platform === 'darwin' || process.platform === 'win32'
    ? resolved.toLowerCase()
    : resolved
}

function isWithinResolvedRoot(candidate: string, root: string): boolean {
  const compCandidate = normalizeComparablePath(candidate)
  const compRoot = normalizeComparablePath(root)
  return compCandidate === compRoot || compCandidate.startsWith(compRoot + path.sep)
}

function isStrictDescendantOfRoot(candidate: string, root: string): boolean {
  const compCandidate = normalizeComparablePath(candidate)
  const compRoot = normalizeComparablePath(root)
  return compCandidate !== compRoot && compCandidate.startsWith(compRoot + path.sep)
}

function canonicalizeWithNearestExistingAncestor(targetPath: string): string {
  const resolved = path.resolve(targetPath)
  const tail: string[] = []
  let cursor = resolved

  while (true) {
    try {
      const realCursor = fs.realpathSync(cursor)
      return tail.length > 0 ? path.join(realCursor, ...tail.reverse()) : realCursor
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw error
      }
      // Reject dangling symlinks rather than falling through to their parent directory.
      try {
        if (fs.lstatSync(cursor).isSymbolicLink()) {
          throw new Error('DANGLING_SYMLINK')
        }
      } catch (lstatError) {
        if (lstatError instanceof Error && lstatError.message === 'DANGLING_SYMLINK') {
          throw lstatError
        }
        const lstatCode = (lstatError as NodeJS.ErrnoException)?.code
        if (lstatCode && lstatCode !== 'ENOENT' && lstatCode !== 'ENOTDIR') {
          throw lstatError
        }
      }
      const parent = path.dirname(cursor)
      if (parent === cursor) {
        return resolved
      }
      tail.push(path.basename(cursor))
      cursor = parent
    }
  }
}

function resolveRuntimeDownloadRoots(appLike: DownloadRootsAppLike): string[] {
  try {
    const runtimeRoot = resolveRuntimeRootPath(appLike)
    if (!runtimeRoot) return []
    return [
      path.join(runtimeRoot, 'modules', 'update-packages'),
      path.join(runtimeRoot, 'Downloads', 'dependencies', 'everything'),
      path.join(runtimeRoot, 'temp')
    ]
  } catch {
    return []
  }
}

export function isSafeDownloadTaskId(taskId: unknown): taskId is string {
  return (
    typeof taskId === 'string' &&
    isSafePathSegment(taskId) &&
    SAFE_DOWNLOAD_TASK_ID_RE.test(taskId) &&
    !taskId.includes('..')
  )
}

export function getAllowedDownloadTempRoots(appLike: DownloadRootsAppLike = app): string[] {
  const userData = safeAppPath(appLike, 'userData')
  let runtimeTemp: string | null = null
  let downloadCenterRoot: string | null = null
  try {
    const runtimeRoot = resolveRuntimeRootPath(appLike)
    runtimeTemp = runtimeRoot ? path.join(runtimeRoot, 'temp') : null
    downloadCenterRoot = runtimeRoot ? path.join(runtimeRoot, 'modules', 'download-center') : null
  } catch {
    runtimeTemp = null
    downloadCenterRoot = null
  }

  const roots: Array<string | null> = [
    runtimeTemp,
    downloadCenterRoot,
    userData ? path.join(userData, 'temp') : null,
    safeAppPath(appLike, 'temp'),
    os.tmpdir()
  ]

  const seen: string[] = []
  for (const root of roots) {
    if (!root) continue
    const resolved = path.resolve(root)
    if (!seen.includes(resolved)) seen.push(resolved)
  }
  return seen
}

/**
 * Validates that a download temp directory is a dedicated subdirectory beneath an allowed
 * temporary root (never bare OS temp, home, or application config roots) and does not
 * escape via symlinks.
 */
export function isAllowedDownloadTempDir(
  tempDir: string | undefined,
  tempRoots: string[] = getAllowedDownloadTempRoots()
): boolean {
  const requested = typeof tempDir === 'string' ? tempDir.trim() : ''
  if (!requested || !path.isAbsolute(requested)) {
    return false
  }
  const resolved = path.resolve(requested)
  const resolvedRoots = tempRoots.map((root) => path.resolve(root))
  if (!resolvedRoots.some((root) => isStrictDescendantOfRoot(resolved, root))) {
    return false
  }

  try {
    const canonicalTarget = canonicalizeWithNearestExistingAncestor(resolved)
    const canonicalRoots = resolvedRoots.map((root) =>
      canonicalizeWithNearestExistingAncestor(root)
    )
    return canonicalRoots.some((root) => isStrictDescendantOfRoot(canonicalTarget, root))
  } catch {
    return false
  }
}

/**
 * Blocks launching downloaded executables, scripts, installers, or macOS packages through
 * `shell.openPath`.
 */
export function isDangerousDownloadOpenFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return Boolean(ext) && DANGEROUS_DOWNLOAD_OPEN_EXTENSIONS.has(ext)
}

/**
 * Directories a download may land in.
 *
 * Derived from where downloads actually go today rather than from a guess:
 *
 * - specific download subdirectories beneath the runtime root (`${userData}/tuff(-dev)`):
 *   `modules/update-packages`, `Downloads/dependencies/everything`, and `temp` — never bare
 *   runtime root, which also contains `config/` (`local-secret.v1.key`, `secure-store.json`),
 *   `modules/plugins/`, and `browser-connector/`
 * - `${userData}/temp` — `TempFileService`'s base directory (e.g. `useSvgContent` caches
 *   remote SVGs under `${userData}/temp/icons/svg-cache`). Only the `temp` subdirectory is
 *   included — never bare `userData`, which holds `config.json`, `plugins`, and Electron
 *   profile state (#905)
 * - the OS temp directory (`app.getPath('temp')` / `os.tmpdir()`)
 * - the user's Downloads folder, which is the configured default destination
 */
export function getAllowedDownloadRoots(appLike: DownloadRootsAppLike = app): string[] {
  const userData = safeAppPath(appLike, 'userData')
  const roots: Array<string | null> = [
    ...resolveRuntimeDownloadRoots(appLike),
    userData ? path.join(userData, 'temp') : null,
    safeAppPath(appLike, 'downloads'),
    safeAppPath(appLike, 'temp'),
    os.tmpdir()
  ]

  const seen: string[] = []
  for (const root of roots) {
    if (!root) continue
    const resolved = path.resolve(root)
    if (!seen.includes(resolved)) seen.push(resolved)
  }
  return seen
}

/**
 * Decides where a download request is allowed to write.
 *
 * addTask used to take `destination` and `filename` verbatim from the IPC payload, and the
 * worker would mkdir -p the directory and open a write stream in it. transport.on registers
 * on the plugin channel, so any plugin — or injected renderer script — had arbitrary file
 * write: ~/Library/LaunchAgents for login-item persistence, the Windows Startup folder, or
 * the app's own config and plugin files (#905).
 *
 * `filename` is checked as a single path segment rather than joined and re-resolved, because
 * `../../..` in a filename defeats a fixed destination just as effectively as a hostile
 * destination does.
 */
export function evaluateDownloadTarget(
  destination: string | undefined,
  filename: string,
  roots: string[] = getAllowedDownloadRoots()
): DownloadTargetDecision {
  if (!isSafePathSegment(filename)) {
    return { allowed: false, reason: 'unsafe-filename' }
  }

  const requested = typeof destination === 'string' ? destination.trim() : ''
  if (!requested) {
    return { allowed: false, reason: 'destination-not-absolute' }
  }
  if (!path.isAbsolute(requested)) {
    return { allowed: false, reason: 'destination-not-absolute' }
  }

  const resolved = path.resolve(requested)
  const resolvedRoots = roots.map((root) => path.resolve(root))
  const withinRoot = resolvedRoots.some((resolvedRoot) =>
    isWithinResolvedRoot(resolved, resolvedRoot)
  )
  if (!withinRoot) {
    return { allowed: false, reason: 'destination-outside-roots' }
  }

  try {
    const canonicalDestination = canonicalizeWithNearestExistingAncestor(resolved)
    const canonicalRoots = resolvedRoots.map((root) =>
      canonicalizeWithNearestExistingAncestor(root)
    )
    const withinCanonicalRoot = canonicalRoots.some((canonicalRoot) =>
      isWithinResolvedRoot(canonicalDestination, canonicalRoot)
    )
    if (!withinCanonicalRoot) {
      return { allowed: false, reason: 'destination-outside-roots' }
    }

    const candidateFilePath = path.join(canonicalDestination, filename)
    try {
      if (fs.lstatSync(candidateFilePath).isSymbolicLink()) {
        return { allowed: false, reason: 'destination-outside-roots' }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        return { allowed: false, reason: 'destination-outside-roots' }
      }
    }
  } catch {
    return { allowed: false, reason: 'destination-outside-roots' }
  }

  return { allowed: true, destination: resolved, filename }
}
