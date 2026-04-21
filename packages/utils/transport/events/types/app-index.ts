export interface AppIndexSettings {
  hideNoisySystemApps: boolean
  startupBackfillEnabled: boolean
  startupBackfillRetryMax: number
  startupBackfillRetryBaseMs: number
  startupBackfillRetryMaxMs: number
  fullSyncEnabled: boolean
  fullSyncIntervalMs: number
  fullSyncCheckIntervalMs: number
  fullSyncCooldownMs: number
  fullSyncPersistRetry: number
}

export interface AppIndexAddPathRequest {
  path: string
}

export interface AppIndexAddPathResult {
  success: boolean
  status: 'added' | 'updated' | 'invalid' | 'error'
  path?: string
  reason?: string
}

export type AppIndexEntryLaunchKind = 'path' | 'shortcut' | 'uwp'

export interface AppIndexManagedEntry {
  path: string
  name: string
  displayName?: string
  icon?: string
  enabled: boolean
  launchKind: AppIndexEntryLaunchKind
  launchTarget: string
  launchArgs?: string
  workingDirectory?: string
  displayPath?: string
  description?: string
}

export interface AppIndexUpsertEntryRequest {
  path: string
  displayName?: string
  icon?: string
  launchKind?: AppIndexEntryLaunchKind
  launchTarget?: string
  launchArgs?: string
  workingDirectory?: string
  displayPath?: string
  description?: string
  enabled?: boolean
}

export interface AppIndexRemoveEntryRequest {
  path: string
}

export interface AppIndexSetEntryEnabledRequest {
  path: string
  enabled: boolean
}

export interface AppIndexEntryMutationResult {
  success: boolean
  status: 'added' | 'updated' | 'removed' | 'invalid' | 'not-found' | 'error'
  entry?: AppIndexManagedEntry
  reason?: string
}
