import fse from 'fs-extra'
import { resolveSafePath } from '@talex-touch/utils/common/utils/safe-path'
import type { PluginStorageSyncKind, PluginStorageSyncManifest } from '@talex-touch/utils/plugin'
import type { TouchPlugin } from './plugin'

type PluginStorageSyncHost = Pick<
  TouchPlugin,
  'getConfigPath' | 'listPluginFiles' | 'storageSync' | 'storageSyncMode'
>

export function listPluginStorageSyncFiles(plugin: PluginStorageSyncHost): string[] {
  if (plugin.storageSyncMode === 'invalid') return []
  if (plugin.storageSyncMode === 'legacy') return plugin.listPluginFiles()

  const configPath = plugin.getConfigPath()
  return (plugin.storageSync?.files ?? [])
    .map((file) => file.path)
    .filter((fileName) => {
      const safePath = resolveSafePath(configPath, fileName)
      return Boolean(
        safePath.resolvedPath &&
        fse.existsSync(safePath.resolvedPath) &&
        fse.statSync(safePath.resolvedPath).isFile()
      )
    })
}

export function matchesPluginStorageSyncFile(
  plugin: PluginStorageSyncHost,
  fileName: string
): boolean {
  const normalized = fileName.trim().replaceAll('\\', '/')
  if (!normalized) return false
  if (plugin.storageSyncMode === 'invalid') return false
  if (plugin.storageSyncMode === 'legacy') {
    return !normalized.includes('/') && normalized.endsWith('.json')
  }
  return plugin.storageSync?.files.some((file) => file.path === normalized) === true
}

export function readPluginStorageSyncMetadata(
  plugin: PluginStorageSyncHost,
  fileName: string
): { kind: PluginStorageSyncKind; displayName?: string } {
  const entry = plugin.storageSync?.files.find((file) => file.path === fileName)
  return {
    kind: entry?.kind ?? 'settings',
    ...(typeof entry?.displayName === 'string' && entry.displayName.trim()
      ? { displayName: entry.displayName.trim() }
      : {})
  }
}

export function setPluginStorageSyncPolicy(
  plugin: PluginStorageSyncHost,
  mode: 'legacy' | 'allowlist' | 'invalid',
  manifest?: PluginStorageSyncManifest
): void {
  plugin.storageSyncMode = mode
  plugin.storageSync = manifest
}
