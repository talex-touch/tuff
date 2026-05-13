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

function getWindowsEnvironmentValue(name: string): string | undefined {
  const direct = process.env[name]
  if (direct !== undefined) return direct

  const matchedKey = Object.keys(process.env).find(
    (key) => key.toLowerCase() === name.toLowerCase()
  )
  return matchedKey ? process.env[matchedKey] : undefined
}

export function expandWindowsEnvironmentVariables(value: string): string {
  if (process.platform !== 'win32' || !value.includes('%')) return value

  let expanded = value
  for (let i = 0; i < 3; i += 1) {
    const next = expanded.replace(/%([^%\s"'<>]+)%/g, (token, name: string) => {
      const resolved = getWindowsEnvironmentValue(name)
      return resolved && resolved.length > 0 ? resolved : token
    })
    if (next === expanded) break
    expanded = next
  }

  return expanded
}

export function inferManagedEntryLaunchKind(targetPath: string): AppLaunchKind {
  if (/^steam:\/\/rungameid\/\d+$/i.test(targetPath.trim())) {
    return 'protocol'
  }
  if (process.platform === 'darwin' && targetPath.endsWith('.app')) {
    return 'path'
  }
  if (process.platform === 'win32') {
    return /\.(lnk|exe|cmd|bat|com|ps1)$/i.test(targetPath) ? 'shortcut' : 'path'
  }
  return /\.(sh|bash|zsh|command|py|js|mjs|cjs)$/i.test(targetPath) ? 'shortcut' : 'path'
}
