import { existsSync } from 'node:fs'
import { parseStringList, serializeStringList } from './app-utils'

export function hasStringListDrift(
  currentValue: string | null | undefined,
  nextValues: string[] | undefined
): boolean {
  return serializeStringList(parseStringList(currentValue)) !== serializeStringList(nextValues)
}

export function hasAppIconDrift(
  currentIcon: string | null | undefined,
  scannedIcon: string | null | undefined
): boolean {
  const normalizedCurrentIcon = currentIcon?.trim() || ''
  const normalizedScannedIcon = scannedIcon?.trim() || ''
  if (normalizedCurrentIcon !== normalizedScannedIcon && normalizedScannedIcon) return true
  if (!normalizedCurrentIcon) return false

  try {
    return !existsSync(normalizedCurrentIcon)
  } catch {
    return true
  }
}

export function resolveMissingScannedExtensionKeys(
  extensions: Array<{ key: string }>,
  requiredKeys: readonly string[]
): string[] {
  const syncedKeys = new Set(extensions.map((extension) => extension.key))
  return requiredKeys.filter((key) => !syncedKeys.has(key))
}
