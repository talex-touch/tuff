import type { AppLaunchKind } from './app-types'
import process from 'node:process'

export function isWindowsUwpShellPath(value: string): boolean {
  return /^shell:AppsFolder\\[^\s"'<>]+$/i.test(value)
}

export function isWindowsUwpAppId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]+_[A-Za-z0-9]+![A-Za-z0-9._-]+$/.test(value)
}

export function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export function inferManagedEntryLaunchKind(targetPath: string): AppLaunchKind {
  if (process.platform === 'darwin' && targetPath.endsWith('.app')) {
    return 'path'
  }
  if (process.platform === 'win32') {
    return /\.(lnk|exe|cmd|bat|com|ps1)$/i.test(targetPath) ? 'shortcut' : 'path'
  }
  return /\.(sh|bash|zsh|command|py|js|mjs|cjs)$/i.test(targetPath) ? 'shortcut' : 'path'
}
