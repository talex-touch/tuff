import path from 'node:path'
import fse from 'fs-extra'

export interface StartupMigrationRecord {
  id: string
  version: number
  status: 'completed'
  updatedAt: string
}

interface StartupMigrationTask<T> {
  id: string
  version: number
  markerDir: string
  run: () => T
}

interface AsyncStartupMigrationTask<T> {
  id: string
  version: number
  markerDir: string
  run: () => Promise<T>
}

function toMarkerName(id: string): string {
  return id.replace(/[^\w.-]+/g, '-')
}

function getMarkerPath(markerDir: string, id: string): string {
  return path.join(markerDir, 'startup-migrations', `${toMarkerName(id)}.json`)
}

function readMigrationRecord(markerPath: string): StartupMigrationRecord | null {
  try {
    if (!fse.existsSync(markerPath)) {
      return null
    }
    return fse.readJsonSync(markerPath) as StartupMigrationRecord
  } catch {
    return null
  }
}

function writeMigrationRecord(markerPath: string, id: string, version: number): void {
  fse.ensureDirSync(path.dirname(markerPath))
  fse.writeJsonSync(
    markerPath,
    {
      id,
      version,
      status: 'completed',
      updatedAt: new Date().toISOString()
    } satisfies StartupMigrationRecord,
    { spaces: 2 }
  )
}

function shouldSkipMigration(markerPath: string, version: number): boolean {
  const record = readMigrationRecord(markerPath)
  return record?.status === 'completed' && record.version >= version
}

export function runStartupMigrationSync<T>(task: StartupMigrationTask<T>): T | undefined {
  const markerPath = getMarkerPath(task.markerDir, task.id)
  if (shouldSkipMigration(markerPath, task.version)) {
    return undefined
  }

  const result = task.run()
  writeMigrationRecord(markerPath, task.id, task.version)
  return result
}

export async function runStartupMigration<T>(
  task: AsyncStartupMigrationTask<T>
): Promise<T | undefined> {
  const markerPath = getMarkerPath(task.markerDir, task.id)
  if (shouldSkipMigration(markerPath, task.version)) {
    return undefined
  }

  const result = await task.run()
  writeMigrationRecord(markerPath, task.id, task.version)
  return result
}
