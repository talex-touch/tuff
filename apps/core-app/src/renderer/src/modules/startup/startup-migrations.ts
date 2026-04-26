import { hasWindow } from '@talex-touch/utils/env'
import { cleanupLegacyAuthEnvStorage } from '../auth/auth-env'
import { migrateLegacyThemeStyleStorage } from '../storage/theme-style'

const STARTUP_MIGRATION_PREFIX = 'tuff.startup-migrations'

interface RendererStartupMigrationTask {
  id: string
  version: number
  run: () => Promise<void>
}

function getMarkerStorage(): Storage | null {
  if (!hasWindow()) {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function getMarkerKey(id: string): string {
  return `${STARTUP_MIGRATION_PREFIX}.${id.replace(/[^\w.-]+/g, '-')}`
}

function hasCompletedMigration(id: string, version: number): boolean {
  const storage = getMarkerStorage()
  if (!storage) {
    return false
  }

  try {
    const raw = storage.getItem(getMarkerKey(id))
    if (!raw) {
      return false
    }

    const parsed = JSON.parse(raw) as { version?: unknown; status?: unknown }
    return (
      parsed.status === 'completed' &&
      typeof parsed.version === 'number' &&
      parsed.version >= version
    )
  } catch {
    return false
  }
}

function markMigrationCompleted(id: string, version: number): void {
  const storage = getMarkerStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(
      getMarkerKey(id),
      JSON.stringify({
        version,
        status: 'completed',
        updatedAt: new Date().toISOString()
      })
    )
  } catch {
    // best-effort marker
  }
}

async function runRendererStartupMigration(task: RendererStartupMigrationTask): Promise<void> {
  if (hasCompletedMigration(task.id, task.version)) {
    return
  }

  await task.run()
  markMigrationCompleted(task.id, task.version)
}

export async function runRendererStartupMigrations(): Promise<void> {
  await runRendererStartupMigration({
    id: 'legacy-auth-env-cleanup',
    version: 1,
    run: async () => {
      await cleanupLegacyAuthEnvStorage()
    }
  })

  await runRendererStartupMigration({
    id: 'legacy-theme-style',
    version: 1,
    run: async () => {
      await migrateLegacyThemeStyleStorage()
    }
  })
}
