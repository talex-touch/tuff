import path from 'node:path'
import process from 'node:process'
import fse from 'fs-extra'
import { APP_FOLDER_NAME } from '../config/default'

export const DEV_APP_FOLDER_NAME = `${APP_FOLDER_NAME}-dev`
export const DEV_DATA_MIGRATION_MARKER = '.dev-data-migration.json'

export type DevDataMigrationStatus =
  | 'skipped-packaged'
  | 'skipped-marker-exists'
  | 'skipped-source-missing'
  | 'skipped-target-not-empty'
  | 'skipped-same-path'
  | 'migrated'
  | 'failed'

export interface AppPathLike {
  isPackaged: boolean
  getPath(name: 'userData'): string
  getAppPath(): string
}

export interface DevDataMigrationResult {
  status: DevDataMigrationStatus
  reason: string
  sourcePath: string
  targetPath: string
  markerPath: string
  error?: string
  markerWriteError?: string
}

interface DevDataMigrationMarker {
  version: 1
  status: DevDataMigrationStatus
  reason: string
  sourcePath: string
  targetPath: string
  createdAt: string
  error?: string
}

function normalizePath(input: string): string {
  const normalized = path.resolve(input)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function safeGetUserDataPath(appLike: AppPathLike, fallbackBasePath: string): string {
  try {
    return appLike.getPath('userData')
  } catch {
    return fallbackBasePath
  }
}

function safeGetAppPath(appLike: AppPathLike, fallbackBasePath: string): string {
  try {
    return appLike.getAppPath()
  } catch {
    return fallbackBasePath
  }
}

function isDirectoryEmpty(targetPath: string): boolean {
  try {
    if (!fse.existsSync(targetPath)) return true
    return fse.readdirSync(targetPath).length === 0
  } catch {
    return false
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function writeMigrationMarker(
  markerPath: string,
  status: DevDataMigrationStatus,
  reason: string,
  sourcePath: string,
  targetPath: string,
  error?: string
): string | undefined {
  const payload: DevDataMigrationMarker = {
    version: 1,
    status,
    reason,
    sourcePath,
    targetPath,
    createdAt: new Date().toISOString(),
    ...(error ? { error } : {})
  }

  try {
    fse.ensureDirSync(path.dirname(markerPath))
    fse.writeJSONSync(markerPath, payload, { spaces: 2 })
    return undefined
  } catch (writeError) {
    return toErrorMessage(writeError)
  }
}

export function resolveRuntimeRootPath(
  appLike: AppPathLike,
  fallbackBasePath = process.cwd()
): string {
  const userDataPath = safeGetUserDataPath(appLike, fallbackBasePath)
  const folderName = appLike.isPackaged ? APP_FOLDER_NAME : DEV_APP_FOLDER_NAME
  return path.join(userDataPath, folderName)
}

export function resolveLegacyDevRootPath(
  appLike: AppPathLike,
  fallbackBasePath = process.cwd()
): string {
  const appPath = safeGetAppPath(appLike, fallbackBasePath)
  return path.join(appPath, APP_FOLDER_NAME)
}

export function migrateLegacyDevDataIfNeeded(
  appLike: AppPathLike,
  fallbackBasePath = process.cwd()
): DevDataMigrationResult {
  const sourcePath = resolveLegacyDevRootPath(appLike, fallbackBasePath)
  const targetPath = resolveRuntimeRootPath(appLike, fallbackBasePath)
  const markerPath = path.join(targetPath, DEV_DATA_MIGRATION_MARKER)

  const buildResult = (
    status: DevDataMigrationStatus,
    reason: string,
    error?: string
  ): DevDataMigrationResult => {
    const markerWriteError = writeMigrationMarker(
      markerPath,
      status,
      reason,
      sourcePath,
      targetPath,
      error
    )

    return {
      status,
      reason,
      sourcePath,
      targetPath,
      markerPath,
      ...(error ? { error } : {}),
      ...(markerWriteError ? { markerWriteError } : {})
    }
  }

  if (appLike.isPackaged) {
    return {
      status: 'skipped-packaged',
      reason: 'packaged-build',
      sourcePath,
      targetPath,
      markerPath
    }
  }

  if (normalizePath(sourcePath) === normalizePath(targetPath)) {
    return buildResult('skipped-same-path', 'source-and-target-are-identical')
  }

  if (fse.existsSync(markerPath)) {
    return {
      status: 'skipped-marker-exists',
      reason: 'marker-exists',
      sourcePath,
      targetPath,
      markerPath
    }
  }

  if (!fse.existsSync(sourcePath)) {
    return buildResult('skipped-source-missing', 'legacy-source-missing')
  }

  if (!isDirectoryEmpty(targetPath)) {
    return buildResult('skipped-target-not-empty', 'target-not-empty')
  }

  try {
    fse.ensureDirSync(targetPath)
    const entries = fse.readdirSync(sourcePath)
    for (const entry of entries) {
      fse.copySync(path.join(sourcePath, entry), path.join(targetPath, entry), {
        overwrite: false,
        errorOnExist: false
      })
    }
    return buildResult('migrated', 'legacy-dev-data-copied')
  } catch (error) {
    return buildResult('failed', 'migration-copy-failed', toErrorMessage(error))
  }
}
