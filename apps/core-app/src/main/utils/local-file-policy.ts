import os from 'node:os'
import process from 'node:process'
import { app } from 'electron'
import { normalizeAbsolutePath, resolveSafePath } from '@talex-touch/utils/common/utils/safe-path'

type AppPathName = 'home' | 'userData' | 'temp'

function appPathSafe(name: AppPathName): string {
  try {
    return app.getPath(name)
  } catch {
    return name === 'temp' ? os.tmpdir() : process.cwd()
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

  const candidates = [
    options.includeCwd ? process.cwd() : null,
    appPathSafe('home'),
    appPathSafe('userData'),
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
