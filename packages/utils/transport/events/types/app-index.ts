export interface AppIndexSettings {
  hideNoisySystemApps: boolean
  startupBackfillEnabled: boolean
  startupBackfillRetryMax: number
  startupBackfillRetryBaseMs: number
  startupBackfillRetryMaxMs: number
  fullSyncEnabled: boolean
  fullSyncIntervalMs: number
  fullSyncCheckIntervalMs: number
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
