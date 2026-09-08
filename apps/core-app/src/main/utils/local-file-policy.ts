import { readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import { normalizeAbsolutePath, resolveSafePath } from '@talex-touch/utils/common/utils/safe-path'
import { resolveRuntimeRootPath } from './app-root-path'

type AppPathName = 'home' | 'userData' | 'temp' | 'cache'

function appPathSafe(name: AppPathName): string {
  try {
    const value = app.getPath(name as Parameters<typeof app.getPath>[0])
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`app.getPath(${name}) returned no path`)
    }
    return value
  } catch {
    return name === 'temp' ? os.tmpdir() : process.cwd()
  }
}

let additionalAllowedRoots: string[] = []

/**
 * Roots the `tfile:` handler serves beyond the built-in allowlist — today the temp-file base dir,
 * where generated thumbnails live. The file-protocol module registers them once; the handler and
 * {@link isServableLocalFilePath} both read them here, so "will this URL load" has one answer.
 */
export function configureAdditionalAllowedLocalFileRoots(roots: string[]): () => void {
  const configured = roots.filter((root) => typeof root === 'string' && root.length > 0)
  additionalAllowedRoots = configured
  return () => {
    if (additionalAllowedRoots === configured) {
      additionalAllowedRoots = []
    }
  }
}

export function getAdditionalAllowedLocalFileRoots(): string[] {
  return additionalAllowedRoots
}

/**
 * The directories under the user's home that local-file access legitimately needs.
 *
 * This list used to be `app.getPath('home')` — the whole home directory. The tfile: protocol
 * is registered on the default session and whitelisted in the renderer CSP, so any renderer
 * script could read ~/.ssh/id_rsa, ~/.aws/credentials or a browser cookie database through it
 * and exfiltrate the result (#914).
 *
 * Home roots are limited to application-scan locations. The runtime plugin resource roots are
 * limited to each installed plugin's `assets` and `public` directories, which contain manifest-
 * owned icons. Plugin data, logs, and configuration remain outside the local-resource data plane.
 * Nothing else under home was ever needed: userData, the exact app-icon cache root, and temp are
 * separate least-privilege roots below.
 */
function getAllowedHomeSubRoots(): string[] {
  const home = appPathSafe('home')
  if (!home) {
    return []
  }

  if (process.platform === 'darwin') {
    return [path.join(home, 'Applications')]
  }

  if (process.platform === 'win32') {
    return [
      path.join(home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(home, 'AppData', 'Local', 'Programs'),
      path.join(home, 'AppData', 'Local', 'Steam')
    ]
  }

  return [path.join(home, '.local', 'share', 'applications')]
}

function getRuntimePluginResourceRoots(): string[] {
  const runtimePluginRoot = path.join(resolveRuntimeRootPath(app), 'modules', 'plugins')
  try {
    return readdirSync(runtimePluginRoot, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory() || entry.name.startsWith('.')) return []
      return ['assets', 'public'].map((directory) => path.join(runtimePluginRoot, entry.name, directory))
    })
  } catch {
    return []
  }
}

export function getAllowedLocalFileRoots(options: { includeCwd?: boolean } = {}): string[] {
  const winRoots =
    process.platform === 'win32'
      ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.SystemRoot].filter(
          (value): value is string => Boolean(value)
        )
      : []
  const linuxRoots = process.platform === 'linux' ? ['/usr/share', '/usr/local/share', '/opt'] : []

  const runtimePluginResourceRoots = getRuntimePluginResourceRoots()
  const candidates = [
    options.includeCwd ? process.cwd() : null,
    ...getAllowedHomeSubRoots(),
    path.join(appPathSafe('cache'), 'app-icons'),
    appPathSafe('userData'),
    ...runtimePluginResourceRoots,
    appPathSafe('temp'),
    os.tmpdir(),
    ...winRoots,
    ...linuxRoots,
    '/Applications',
    '/System/Applications',
    '/System/Library/CoreServices'
  ]

  const roots: string[] = []
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.length) {
      continue
    }
    const normalized = normalizeAbsolutePath(candidate)
    if (normalized && !roots.includes(normalized)) {
      roots.push(normalized)
    }
  }
  return roots
}

export function normalizeDarwinUsersPath(filePath: string): string {
  if (process.platform !== 'darwin') {
    return filePath
  }

  const normalized = normalizeAbsolutePath(filePath)
  if (!normalized) {
    return filePath
  }

  const lowerPath = normalized.toLowerCase()
  if (!lowerPath.startsWith('/users/')) {
    return normalized
  }

  const home = normalizeAbsolutePath(os.homedir())
  if (!home) {
    return normalized
  }

  const lowerHome = home.toLowerCase()
  if (lowerPath.startsWith(lowerHome)) {
    return `${home}${normalized.slice(lowerHome.length)}`
  }

  return normalized
}

export function isAllowedLocalFilePath(filePath: string, roots: string[]): boolean {
  const normalized = normalizeAbsolutePath(filePath)
  if (!normalized) {
    return false
  }

  if (process.platform === 'darwin') {
    const lower = normalized.toLowerCase()
    return roots.some((root) => {
      const normalizedRoot = normalizeAbsolutePath(root)
      if (!normalizedRoot) return false
      const lowerRoot = normalizedRoot.toLowerCase()
      return lower === lowerRoot || lower.startsWith(`${lowerRoot}/`)
    })
  }

  return roots.some((root) => {
    const normalizedRoot = normalizeAbsolutePath(root)
    if (!normalizedRoot) {
      return false
    }

    return Boolean(
      resolveSafePath(normalizedRoot, normalized, {
        allowAbsolute: true,
        allowRoot: true
      }).resolvedPath
    )
  })
}

/**
 * Whether a `tfile:` URL for this path would be served rather than blocked (preview grants
 * aside). Item builders ask before handing the renderer a local image: a request the handler
 * refuses — anything under the user's home outside ~/Applications on macOS (#914) — leaves the
 * row showing the "image failed" placeholder, a grey square where a file icon belongs.
 */
export function isServableLocalFilePath(filePath: string): boolean {
  try {
    return isAllowedLocalFilePath(filePath, [
      ...getAllowedLocalFileRoots(),
      ...additionalAllowedRoots
    ])
  } catch {
    return false
  }
}
