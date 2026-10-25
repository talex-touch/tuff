import type { PluginStorageSyncKind, PluginStorageSyncManifest } from '@talex-touch/utils/plugin'
import { resolveSafePath } from '@talex-touch/utils/common/utils/safe-path'
import fse from 'fs-extra'

type PluginStorageSyncMode = 'legacy' | 'allowlist' | 'invalid'

export interface PluginStorageSyncOwner {
  getConfigPath(): string
}

interface PluginStorageSyncState {
  mode: PluginStorageSyncMode
  manifest?: PluginStorageSyncManifest
}

const storageSyncState = new WeakMap<PluginStorageSyncOwner, PluginStorageSyncState>()

function getState(owner: PluginStorageSyncOwner): PluginStorageSyncState {
  const state = storageSyncState.get(owner)
  if (state) return state
  const next = { mode: 'legacy' as const }
  storageSyncState.set(owner, next)
  return next
}

export function listPluginFiles(owner: PluginStorageSyncOwner): string[] {
  const configPath = owner.getConfigPath()
  if (!fse.existsSync(configPath)) return []
  return fse.readdirSync(configPath).filter((file) => file.endsWith('.json'))
}

export function setPluginStorageSyncPolicy(
  owner: PluginStorageSyncOwner,
  mode: PluginStorageSyncMode,
  manifest?: PluginStorageSyncManifest
): void {
  const state = getState(owner)
  state.mode = mode
  state.manifest = manifest
}

export function getPluginStorageSyncFiles(owner: PluginStorageSyncOwner): string[] {
  const state = getState(owner)
  if (state.mode === 'invalid') return []
  if (state.mode === 'legacy') return listPluginFiles(owner)

  const configPath = owner.getConfigPath()
  return (state.manifest?.files ?? [])
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

export function isPluginStorageSyncFile(owner: PluginStorageSyncOwner, fileName: string): boolean {
  const state = getState(owner)
  const normalized = fileName.trim().replaceAll('\\', '/')
  if (!normalized || state.mode === 'invalid') return false
  if (state.mode === 'legacy') return !normalized.includes('/') && normalized.endsWith('.json')
  return state.manifest?.files.some((file) => file.path === normalized) === true
}

export function getPluginStorageSyncMetadata(
  owner: PluginStorageSyncOwner,
  fileName: string
): { kind: PluginStorageSyncKind; displayName?: string } {
  const entry = getState(owner).manifest?.files.find((file) => file.path === fileName)
  return {
    kind: entry?.kind ?? 'settings',
    ...(typeof entry?.displayName === 'string' && entry.displayName.trim()
      ? { displayName: entry.displayName.trim() }
      : {})
  }
}
export abstract class PluginStorageSyncHost implements PluginStorageSyncOwner {
  abstract getConfigPath(): string

  listPluginFiles(): string[] {
    return listPluginFiles(this)
  }

  setStorageSyncPolicy(mode: PluginStorageSyncMode, manifest?: PluginStorageSyncManifest): void {
    setPluginStorageSyncPolicy(this, mode, manifest)
  }

  getPluginStorageSyncFiles(): string[] {
    return getPluginStorageSyncFiles(this)
  }

  isPluginStorageSyncFile(fileName: string): boolean {
    return isPluginStorageSyncFile(this, fileName)
  }

  getPluginStorageSyncMetadata(fileName: string) {
    return getPluginStorageSyncMetadata(this, fileName)
  }
}
