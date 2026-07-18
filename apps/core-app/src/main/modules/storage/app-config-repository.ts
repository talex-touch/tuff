import type { Client, InStatement, Value } from '@libsql/client'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@libsql/client'
import fse from 'fs-extra'
import { createLogger } from '../../utils/logger'

const configRepositoryLog = createLogger('Storage').child('ConfigRepository')
const MIGRATION_ID = 'legacy-v1'
const LEGACY_BACKUP_DIR = 'legacy-backups'
const LEGACY_BACKUP_NAME = 'app-config-v1'
const EXCLUDED_ROOT_ENTRIES = new Set(['plugins', 'startup-migrations', LEGACY_BACKUP_DIR])

export type AppConfigBackend = 'sqlite' | 'legacy'

export interface AppConfigRecord {
  key: string
  data: object
  serialized: string
  revision: number
  deleted: boolean
  updatedAt: number
}

type StoredAppConfigRecord = Omit<AppConfigRecord, 'data'>

export interface AppConfigMigrationSummary {
  phase: 'skipped' | 'completed' | 'failed'
  importedCount: number
  skippedCount: number
  failedCount: number
  backupPath?: string
}

export interface AppConfigInitializationResult {
  backend: AppConfigBackend
  records: AppConfigRecord[]
  migration: AppConfigMigrationSummary
  fallbackReason?: string
}

export interface AppConfigPersistInput {
  key: string
  serialized: string
  revision: number
  deleted: boolean
  updatedAt?: number
}

interface LegacyCandidate {
  key: string
  sourcePath: string
}

interface ParsedLegacyCandidate extends LegacyCandidate {
  data: object
  serialized: string
}

interface RepositoryOptions {
  client: Client | null
  legacyRoot: string
  env?: NodeJS.ProcessEnv
  now?: () => number
}

export interface StartupAppConfigResult {
  settings: Record<string, unknown>
  source: 'sqlite' | 'legacy' | 'default'
  fallbackReason?: string
}

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return defaultValue
}

export function resolveAppConfigBackend(env: NodeJS.ProcessEnv = process.env): AppConfigBackend {
  const value = env.TALEX_CONFIG_STORAGE_BACKEND?.trim().toLowerCase()
  if (!value || value === 'sqlite') return 'sqlite'
  if (value === 'legacy') return 'legacy'
  configRepositoryLog.warn('Ignoring invalid configuration storage backend', {
    meta: { backend: value }
  })
  return 'sqlite'
}

function normalizeConfigKey(key: string): string {
  if (
    typeof key !== 'string' ||
    key.length === 0 ||
    key.includes('\0') ||
    key.includes('\\') ||
    path.posix.isAbsolute(key) ||
    path.win32.isAbsolute(key)
  ) {
    throw new Error(`Invalid config key: ${JSON.stringify(key)}`)
  }

  const segments = key.split('/')
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`Invalid config key: ${JSON.stringify(key)}`)
  }
  return segments.join('/')
}

function resolveLegacyPath(root: string, key: string): string {
  const normalized = normalizeConfigKey(key)
  const resolved = path.resolve(root, ...normalized.split('/'))
  const relative = path.relative(root, resolved)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Config key escapes legacy root: ${JSON.stringify(key)}`)
  }
  return resolved
}

function toFiniteInteger(value: Value | undefined, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  if (typeof value === 'bigint') return Math.max(0, Number(value))
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return Math.max(0, parsed)
  }
  return fallback
}

function toStoredRecord(record: AppConfigRecord): StoredAppConfigRecord {
  return {
    key: record.key,
    serialized: record.serialized,
    revision: record.revision,
    deleted: record.deleted,
    updatedAt: record.updatedAt
  }
}

function materializeRecord(record: StoredAppConfigRecord): AppConfigRecord {
  return {
    ...record,
    data: JSON.parse(record.serialized) as object
  }
}

function parseStoredRecord(row: Record<string, Value>): AppConfigRecord {
  const key = normalizeConfigKey(String(row.key ?? ''))
  const serialized = String(row.value ?? '')
  const parsed = JSON.parse(serialized) as object
  return {
    key,
    data: parsed,
    serialized,
    revision: toFiniteInteger(row.revision),
    deleted: toFiniteInteger(row.deleted) === 1,
    updatedAt: toFiniteInteger(row.updated_at)
  }
}

function readLegacyConfig(root: string, key: string): AppConfigRecord | null {
  const sourcePath = resolveLegacyPath(root, key)
  try {
    if (!fse.existsSync(sourcePath)) return null
    const serialized = fse.readFileSync(sourcePath, 'utf-8')
    const normalizedSerialized = serialized.length > 0 ? serialized : '{}'
    return {
      key: normalizeConfigKey(key),
      data: JSON.parse(normalizedSerialized) as object,
      serialized: normalizedSerialized,
      revision: 1,
      deleted: false,
      updatedAt: Math.max(0, Math.trunc(fse.statSync(sourcePath).mtimeMs))
    }
  } catch {
    configRepositoryLog.warn('Failed to read legacy config', {
      meta: { configKey: key }
    })
    return null
  }
}

async function discoverLegacyCandidates(root: string): Promise<LegacyCandidate[]> {
  if (!(await fse.pathExists(root))) return []

  const candidates: LegacyCandidate[] = []
  const visit = async (currentPath: string, relativeSegments: string[]): Promise<void> => {
    const entries = await fse.readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (relativeSegments.length === 0 && EXCLUDED_ROOT_ENTRIES.has(entry.name)) continue
      if (entry.name.startsWith('.')) continue
      if (entry.name.endsWith('.tmp')) continue

      const nextPath = path.join(currentPath, entry.name)
      const nextSegments = [...relativeSegments, entry.name]
      if (entry.isDirectory()) {
        await visit(nextPath, nextSegments)
        continue
      }
      if (!entry.isFile()) continue

      const key = normalizeConfigKey(nextSegments.join('/'))
      candidates.push({ key, sourcePath: nextPath })
    }
  }

  await visit(root, [])
  candidates.sort((left, right) => left.key.localeCompare(right.key))
  return candidates
}

async function parseLegacyCandidates(
  candidates: LegacyCandidate[]
): Promise<{ parsed: ParsedLegacyCandidate[]; failedCount: number }> {
  const parsed: ParsedLegacyCandidate[] = []
  let failedCount = 0

  for (const candidate of candidates) {
    try {
      const source = await fse.readFile(candidate.sourcePath, 'utf8')
      const serialized = source.length > 0 ? source : '{}'
      parsed.push({
        ...candidate,
        data: JSON.parse(serialized) as object,
        serialized
      })
    } catch {
      failedCount += 1
      configRepositoryLog.warn('Skipping invalid legacy config during migration', {
        meta: { configKey: candidate.key }
      })
    }
  }

  return { parsed, failedCount }
}

export class ApplicationConfigRepository {
  private readonly client: Client | null
  private readonly legacyRoot: string
  private readonly requestedBackend: AppConfigBackend
  private readonly mirrorEnabled: boolean
  private readonly now: () => number
  private readonly records = new Map<string, StoredAppConfigRecord>()
  private activeBackend: AppConfigBackend
  private writeTail: Promise<void> = Promise.resolve()
  private tempFileSequence = 0

  constructor(options: RepositoryOptions) {
    this.client = options.client
    this.legacyRoot = path.resolve(options.legacyRoot)
    this.requestedBackend = resolveAppConfigBackend(options.env)
    this.activeBackend = this.requestedBackend
    this.mirrorEnabled = parseBooleanFlag(
      options.env?.TALEX_CONFIG_LEGACY_MIRROR,
      this.requestedBackend === 'sqlite'
    )
    this.now = options.now ?? Date.now
  }

  getBackend(): AppConfigBackend {
    return this.activeBackend
  }

  getRecord(key: string): AppConfigRecord | null {
    const normalized = normalizeConfigKey(key)
    const cached = this.records.get(normalized)
    if (cached) return materializeRecord(cached)
    if (this.activeBackend !== 'legacy') return null

    const legacy = readLegacyConfig(this.legacyRoot, normalized)
    if (legacy) this.records.set(normalized, toStoredRecord(legacy))
    return legacy
  }

  reloadRecord(key: string): AppConfigRecord | null {
    const normalized = normalizeConfigKey(key)
    if (this.activeBackend !== 'legacy') return this.getRecord(normalized)

    const legacy = readLegacyConfig(this.legacyRoot, normalized)
    if (legacy) this.records.set(normalized, toStoredRecord(legacy))
    else this.records.delete(normalized)
    return legacy
  }

  async initialize(): Promise<AppConfigInitializationResult> {
    if (this.requestedBackend === 'legacy') {
      return await this.initializeLegacy()
    }

    try {
      const migration = await this.migrateLegacyFiles()
      const records = await this.loadSqliteRecords()
      this.activeBackend = 'sqlite'
      configRepositoryLog.info('Configuration storage initialized', {
        meta: {
          backend: this.activeBackend,
          records: records.length,
          migrationPhase: migration.phase,
          imported: migration.importedCount,
          skipped: migration.skippedCount,
          failed: migration.failedCount,
          mirrorEnabled: this.mirrorEnabled
        }
      })
      return { backend: this.activeBackend, records, migration }
    } catch {
      const fallbackReason = 'sqlite-initialization-failed'
      configRepositoryLog.error(
        'SQLite configuration initialization failed; using legacy backend',
        {
          meta: { backend: 'legacy', reason: fallbackReason }
        }
      )
      this.activeBackend = 'legacy'
      const fallback = await this.initializeLegacy()
      return { ...fallback, fallbackReason }
    }
  }

  persist(input: AppConfigPersistInput): Promise<void> {
    const normalized: AppConfigPersistInput = {
      ...input,
      key: normalizeConfigKey(input.key),
      revision: Math.max(0, Math.trunc(input.revision)),
      updatedAt: input.updatedAt ?? this.now()
    }

    const operation = async (): Promise<void> => {
      if (this.activeBackend === 'legacy') {
        await this.persistLegacyPrimary(normalized)
        return
      }
      await this.persistSqlitePrimary(normalized)
    }
    const result = this.writeTail.then(operation, operation)
    this.writeTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  async flush(): Promise<void> {
    await this.writeTail
  }

  private async initializeLegacy(): Promise<AppConfigInitializationResult> {
    const candidates = await discoverLegacyCandidates(this.legacyRoot)
    const records: AppConfigRecord[] = []
    let failedCount = 0
    for (const candidate of candidates) {
      const record = readLegacyConfig(this.legacyRoot, candidate.key)
      if (record) records.push(record)
      else failedCount += 1
    }

    this.records.clear()
    for (const record of records) this.records.set(record.key, toStoredRecord(record))
    this.activeBackend = 'legacy'
    configRepositoryLog.info('Configuration storage initialized', {
      meta: { backend: this.activeBackend, records: records.length, failed: failedCount }
    })
    return {
      backend: this.activeBackend,
      records,
      migration: {
        phase: 'skipped',
        importedCount: 0,
        skippedCount: candidates.length - failedCount,
        failedCount
      }
    }
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new Error('Application configuration SQLite client is unavailable')
    }
    return this.client
  }

  private async loadSqliteRecords(): Promise<AppConfigRecord[]> {
    const result = await this.requireClient().execute(`
      SELECT key, value, revision, deleted, updated_at
      FROM app_config_entries
      ORDER BY key
    `)
    const records = result.rows.map((row) => parseStoredRecord(row))
    this.records.clear()
    for (const record of records) this.records.set(record.key, toStoredRecord(record))
    return records
  }

  private async migrateLegacyFiles(): Promise<AppConfigMigrationSummary> {
    const client = this.requireClient()
    const state = await client.execute({
      sql: `
        SELECT phase, backup_path, imported_count, skipped_count, failed_count
        FROM app_config_migration_state
        WHERE id = ?
        LIMIT 1
      `,
      args: [MIGRATION_ID]
    })
    const existingState = state.rows[0]
    if (existingState?.phase === 'completed') {
      return {
        phase: 'skipped',
        importedCount: toFiniteInteger(existingState.imported_count),
        skippedCount: toFiniteInteger(existingState.skipped_count),
        failedCount: toFiniteInteger(existingState.failed_count),
        backupPath:
          typeof existingState.backup_path === 'string' ? existingState.backup_path : undefined
      }
    }

    const candidates = await discoverLegacyCandidates(this.legacyRoot)
    const backupPath = path.join(this.legacyRoot, LEGACY_BACKUP_DIR, LEGACY_BACKUP_NAME)
    await this.backupLegacyCandidates(candidates, backupPath)
    const { parsed, failedCount } = await parseLegacyCandidates(candidates)
    if (failedCount > 0) {
      await this.recordMigrationFailure(backupPath, failedCount)
      throw new Error(`Legacy configuration migration rejected ${failedCount} invalid file(s)`)
    }
    const existingRows = await client.execute('SELECT key FROM app_config_entries')
    const existingKeys = new Set(existingRows.rows.map((row) => String(row.key ?? '')))
    const importable = parsed.filter((candidate) => !existingKeys.has(candidate.key))
    const skippedCount = parsed.length - importable.length
    const now = this.now()

    const statements: InStatement[] = importable.map((candidate) => ({
      sql: `
        INSERT INTO app_config_entries (key, value, revision, deleted, updated_at)
        VALUES (?, ?, 1, 0, ?)
        ON CONFLICT(key) DO NOTHING
      `,
      args: [candidate.key, candidate.serialized, now]
    }))
    statements.push({
      sql: `
        INSERT INTO app_config_migration_state (
          id, phase, backup_path, imported_count, skipped_count, failed_count, completed_at, updated_at
        ) VALUES (?, 'completed', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          phase = excluded.phase,
          backup_path = excluded.backup_path,
          imported_count = excluded.imported_count,
          skipped_count = excluded.skipped_count,
          failed_count = excluded.failed_count,
          completed_at = excluded.completed_at,
          updated_at = excluded.updated_at
      `,
      args: [MIGRATION_ID, backupPath, importable.length, skippedCount, failedCount, now, now]
    })

    try {
      await client.batch(statements, 'write')
    } catch (error) {
      await this.recordMigrationFailure(backupPath, failedCount)
      throw error
    }

    return {
      phase: 'completed',
      importedCount: importable.length,
      skippedCount,
      failedCount,
      backupPath
    }
  }

  private async backupLegacyCandidates(
    candidates: LegacyCandidate[],
    backupRoot: string
  ): Promise<void> {
    await fse.ensureDir(backupRoot)
    for (const candidate of candidates) {
      const destination = resolveLegacyPath(backupRoot, candidate.key)
      if (await fse.pathExists(destination)) continue
      await fse.ensureDir(path.dirname(destination))
      await fse.copy(candidate.sourcePath, destination, {
        overwrite: false,
        errorOnExist: false,
        preserveTimestamps: true
      })
    }
  }

  private async recordMigrationFailure(backupPath: string, failedCount: number): Promise<void> {
    const now = this.now()
    try {
      await this.requireClient().execute({
        sql: `
          INSERT INTO app_config_migration_state (
            id, phase, backup_path, imported_count, skipped_count, failed_count, completed_at, updated_at
          ) VALUES (?, 'failed', ?, 0, 0, ?, NULL, ?)
          ON CONFLICT(id) DO UPDATE SET
            phase = 'failed',
            backup_path = excluded.backup_path,
            failed_count = excluded.failed_count,
            completed_at = NULL,
            updated_at = excluded.updated_at
        `,
        args: [MIGRATION_ID, backupPath, failedCount, now]
      })
    } catch {
      configRepositoryLog.warn('Failed to record configuration migration failure')
    }
  }

  private async persistSqlitePrimary(input: AppConfigPersistInput): Promise<void> {
    const result = await this.requireClient().execute({
      sql: `
        INSERT INTO app_config_entries (key, value, revision, deleted, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          revision = excluded.revision,
          deleted = excluded.deleted,
          updated_at = excluded.updated_at
        WHERE excluded.revision >= app_config_entries.revision
      `,
      args: [
        input.key,
        input.serialized,
        input.revision,
        input.deleted ? 1 : 0,
        input.updatedAt ?? this.now()
      ]
    })
    if (result.rowsAffected === 0) return
    this.rememberPersisted(input)

    if (!this.mirrorEnabled) return
    try {
      await this.persistLegacyMirror(input)
    } catch {
      configRepositoryLog.warn('Legacy configuration mirror failed', {
        meta: { configKey: input.key, deleted: input.deleted }
      })
    }
  }

  private async persistLegacyPrimary(input: AppConfigPersistInput): Promise<void> {
    await this.persistLegacyMirror(input)
    this.rememberPersisted(input)
  }

  private rememberPersisted(input: AppConfigPersistInput): void {
    this.records.set(input.key, {
      key: input.key,
      serialized: input.serialized,
      revision: input.revision,
      deleted: input.deleted,
      updatedAt: input.updatedAt ?? this.now()
    })
  }

  private async persistLegacyMirror(input: AppConfigPersistInput): Promise<void> {
    const target = resolveLegacyPath(this.legacyRoot, input.key)
    if (input.deleted) {
      await fse.remove(target)
      return
    }

    await fse.ensureDir(path.dirname(target))
    this.tempFileSequence += 1
    const tempPath = `${target}.${process.pid}.${this.tempFileSequence}.tmp`
    try {
      await fse.writeFile(tempPath, input.serialized, 'utf-8')
      await fse.rename(tempPath, target)
    } finally {
      await fse.remove(tempPath).catch(() => undefined)
    }
  }
}

export async function readStartupAppConfig(options: {
  databasePath: string
  legacyRoot: string
  key: string
  env?: NodeJS.ProcessEnv
}): Promise<StartupAppConfigResult> {
  const key = normalizeConfigKey(options.key)
  const backend = resolveAppConfigBackend(options.env)
  const legacyFallback = (fallbackReason?: string): StartupAppConfigResult => {
    const legacy = readLegacyConfig(options.legacyRoot, key)
    if (
      !legacy ||
      legacy.deleted ||
      !legacy.data ||
      typeof legacy.data !== 'object' ||
      Array.isArray(legacy.data)
    ) {
      return { settings: {}, source: 'default', fallbackReason }
    }
    return {
      settings: legacy.data as Record<string, unknown>,
      source: 'legacy',
      fallbackReason
    }
  }

  if (backend === 'legacy') return legacyFallback('explicit-legacy-backend')
  if (!(await fse.pathExists(options.databasePath))) return legacyFallback('database-missing')

  const client = createClient({ url: `file:${options.databasePath}`, timeout: 5_000 })
  try {
    const result = await client.execute({
      sql: `
        SELECT value, deleted
        FROM app_config_entries
        WHERE key = ?
        LIMIT 1
      `,
      args: [key]
    })
    const row = result.rows[0]
    if (!row) return legacyFallback('sqlite-row-missing')
    if (toFiniteInteger(row.deleted) === 1) return { settings: {}, source: 'sqlite' }
    const parsed = JSON.parse(String(row.value ?? '')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return legacyFallback('sqlite-row-invalid')
    }
    return { settings: parsed as Record<string, unknown>, source: 'sqlite' }
  } catch {
    configRepositoryLog.debug('Startup app config SQLite preflight fell back to legacy', {
      meta: { reason: 'sqlite-preflight-failed' }
    })
    return legacyFallback('sqlite-preflight-failed')
  } finally {
    client.close()
  }
}
