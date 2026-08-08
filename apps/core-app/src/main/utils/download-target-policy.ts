import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { isSafePathSegment } from '@talex-touch/utils/common/utils/safe-path'
import { resolveRuntimeRootPath } from './app-root-path'

export type DownloadTargetRejection =
  | 'unsafe-filename'
  | 'destination-not-absolute'
  | 'destination-outside-roots'

export type DownloadTargetDecision =
  | { allowed: true; destination: string; filename: string }
  | { allowed: false; reason: DownloadTargetRejection }

function safeAppPath(name: 'downloads' | 'temp'): string | null {
  try {
    return app.getPath(name)
  } catch {
    return name === 'temp' ? os.tmpdir() : null
  }
}

/**
 * Directories a download may land in.
 *
 * Derived from where downloads actually go today rather than from a guess:
 *
 * - the app's own data root — update packages (`modules/update-packages`) and the Everything
 *   bootstrap (`Downloads/dependencies/everything`) both sit under it
 * - the temp directory — the temp-file service, which useSvgContent downloads through
 * - the user's Downloads folder, which is the configured default destination
 */
export function getAllowedDownloadRoots(): string[] {
  const roots: Array<string | null> = [
    (() => {
      try {
        return resolveRuntimeRootPath(app)
      } catch {
        return null
      }
    })(),
    safeAppPath('downloads'),
    safeAppPath('temp'),
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
  const withinRoot = roots.some((root) => {
    const resolvedRoot = path.resolve(root)
    return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)
  })
  if (!withinRoot) {
    return { allowed: false, reason: 'destination-outside-roots' }
  }

  return { allowed: true, destination: resolved, filename }
}
