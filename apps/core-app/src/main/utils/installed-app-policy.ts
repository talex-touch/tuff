import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * Where installed applications live, per platform.
 *
 * Taken from the directories the launcher already indexes (app-scanner's WATCH_PATHS) plus
 * the system application folders, so "an application this machine has installed" means the
 * same thing to the opener as it does to search.
 */
function applicationRoots(): string[] {
  const home = os.homedir()

  if (process.platform === 'darwin') {
    return ['/Applications', '/System/Applications', path.join(home, 'Applications')]
  }

  if (process.platform === 'win32') {
    return [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      path.join(home, 'AppData', 'Local', 'Programs'),
      path.join(home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
    ].filter((value): value is string => Boolean(value))
  }

  return [
    '/usr/share/applications',
    '/var/lib/snapd/desktop/applications',
    path.join(home, '.local', 'share', 'applications')
  ]
}

/**
 * Extensions that name an application rather than a document.
 *
 * The point of the check is that shell.openPath launches by OS association, so a `.command`,
 * `.bat` or `.sh` sitting in an application directory would run just as readily as an app.
 */
function applicationExtensions(): string[] {
  if (process.platform === 'darwin') return ['.app']
  if (process.platform === 'win32') return ['.exe', '.lnk']
  return ['.desktop']
}

export interface InstalledAppDecision {
  allowed: boolean
  reason?: 'empty' | 'not-absolute' | 'outside-application-roots' | 'not-an-application'
}

/**
 * Whether a path may be handed to shell.openPath as "open this installed application".
 *
 * The handler used to pass `payload.appName || payload.path` straight through, so any caller
 * could name a file it had dropped elsewhere — via the download handler, for instance — and
 * have the OS execute it outside the sandbox (#908).
 *
 * A bare application *name* is rejected along with every other relative value. That is not a
 * regression: shell.openPath takes a filesystem path and never resolved a name like 'Safari'
 * to begin with.
 */
export function evaluateInstalledAppPath(target: string | undefined): InstalledAppDecision {
  const value = typeof target === 'string' ? target.trim() : ''
  if (!value) {
    return { allowed: false, reason: 'empty' }
  }

  if (!path.isAbsolute(value)) {
    return { allowed: false, reason: 'not-absolute' }
  }

  const resolved = path.resolve(value)
  const withinRoot = applicationRoots().some((root) => {
    const resolvedRoot = path.resolve(root)
    return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)
  })
  if (!withinRoot) {
    return { allowed: false, reason: 'outside-application-roots' }
  }

  const extension = path.extname(resolved).toLowerCase()
  if (!applicationExtensions().includes(extension)) {
    return { allowed: false, reason: 'not-an-application' }
  }

  return { allowed: true }
}
