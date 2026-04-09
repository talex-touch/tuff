/**
 * Permission Store
 *
 * Persistent storage for plugin permissions.
 */

import type {
  PermissionAuditLog,
  PermissionGrant,
  PluginPermissionStatus
} from '@talex-touch/utils/permission'
import type { Client, InValue } from '@libsql/client'
import path from 'node:path'
import { createClient } from '@libsql/client'
import {
  DEFAULT_PERMISSIONS,
  getPermissionIdCandidates,
  getPluginPermissionStatus,
  normalizePermissionId
} from '@talex-touch/utils/permission'
import { PERMISSION_ENFORCEMENT_MIN_VERSION } from '@talex-touch/utils/plugin'
import fse from 'fs-extra'

type AuditLogEntry = PermissionAuditLog

interface PermissionData {
  /** Version for migration */
  version: number
  /** Plugin permission grants: { pluginId: { permissionId: PermissionGrant } } */
  grants: Record<string, Record<string, PermissionGrant>>
  /** Audit logs (recent 500 entries) */
  auditLogs?: AuditLogEntry[]
}

export interface PermissionAccessState {
  allowed: boolean
  reason: 'sdkapi-blocked' | 'default' | 'granted' | 'not-granted' | 'not-declared'
  hasHistoricalGrant: boolean
}

export type PermissionBackendMode = 'sqlite' | 'degraded/backend-unavailable'

export interface PermissionBackendStatus {
  mode: PermissionBackendMode
  writable: boolean
  reason?: string
}

interface PermissionStoreBackend {
  initialize(): Promise<void>
  load(): Promise<PermissionData>
  persist(data: PermissionData): Promise<void>
  close(): Promise<void>
}

interface PermissionStoreOptions {
  createBackend?: (dbPath: string) => PermissionStoreBackend
}

const CURRENT_VERSION = 1
const MAX_AUDIT_LOGS = 500

class PermissionBackendUnavailableError extends Error {
  code = 'PERMISSION_BACKEND_UNAVAILABLE'

  constructor(message: string) {
    super(message)
    this.name = 'PermissionBackendUnavailableError'
  }
}

function createEmptyData(): PermissionData {
  return {
    version: CURRENT_VERSION,
    grants: {},
    auditLogs: []
  }
}

function cloneData(data: PermissionData): PermissionData {
  return JSON.parse(JSON.stringify(data)) as PermissionData
}

function cloneSessionGrants(
  sessionGrants: Record<string, Set<string>>
): Record<string, Set<string>> {
  return Object.fromEntries(
    Object.entries(sessionGrants).map(([pluginId, permissions]) => [pluginId, new Set(permissions)])
  )
}

function hasPersistedData(data: PermissionData): boolean {
  return Object.keys(data.grants).length > 0 || (data.auditLogs?.length ?? 0) > 0
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

class SqlitePermissionBackend {
  private readonly dbPath: string
  private client: Client | null = null

  constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  async initialize(): Promise<void> {
    await fse.ensureDir(path.dirname(this.dbPath))
    this.client = createClient({ url: `file:${this.dbPath}` })
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS permission_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS permission_grants (
        plugin_id TEXT NOT NULL,
        permission_id TEXT NOT NULL,
        granted_at INTEGER NOT NULL,
        granted_by TEXT NOT NULL,
        PRIMARY KEY(plugin_id, permission_id)
      )
    `)
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS permission_audit_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        plugin_id TEXT NOT NULL,
        action TEXT NOT NULL,
        permission_id TEXT NOT NULL,
        context_json TEXT
      )
    `)
  }

  async load(): Promise<PermissionData> {
    const client = this.ensureClient()
    const grantsResult = await client.execute(`
      SELECT plugin_id, permission_id, granted_at, granted_by
      FROM permission_grants
    `)
    const logsResult = await client.execute(`
      SELECT id, timestamp, plugin_id, action, permission_id, context_json
      FROM permission_audit_logs
      ORDER BY timestamp DESC
      LIMIT ${MAX_AUDIT_LOGS}
    `)
    const versionResult = await client.execute({
      sql: 'SELECT value FROM permission_meta WHERE key = ? LIMIT 1',
      args: ['version']
    })

    const data = createEmptyData()
    const metaVersion = versionResult.rows[0]?.value
    data.version = Math.max(CURRENT_VERSION, asNumber(metaVersion, CURRENT_VERSION))

    for (const row of grantsResult.rows) {
      const pluginId = asString(row.plugin_id)
      const permissionId = normalizePermissionId(asString(row.permission_id))
      if (!pluginId || !permissionId) continue
      if (!data.grants[pluginId]) {
        data.grants[pluginId] = {}
      }
      data.grants[pluginId][permissionId] = {
        pluginId,
        permissionId,
        grantedAt: asNumber(row.granted_at, Date.now()),
        grantedBy: asString(row.granted_by) as PermissionGrant['grantedBy']
      }
    }

    data.auditLogs = logsResult.rows
      .map((row) => {
        let context: Record<string, unknown> | undefined
        const contextText = asString(row.context_json)
        if (contextText) {
          try {
            context = JSON.parse(contextText) as Record<string, unknown>
          } catch {
            context = undefined
          }
        }
        return {
          id: asString(row.id),
          timestamp: asNumber(row.timestamp, Date.now()),
          pluginId: asString(row.plugin_id),
          action: asString(row.action) as AuditLogEntry['action'],
          permissionId: normalizePermissionId(asString(row.permission_id)),
          context
        } satisfies AuditLogEntry
      })
      .filter((entry) => entry.id && entry.pluginId && entry.permissionId)

    return data
  }

  async persist(data: PermissionData): Promise<void> {
    const client = this.ensureClient()
    await client.execute('BEGIN IMMEDIATE')
    try {
      await client.execute('DELETE FROM permission_grants')
      for (const [pluginId, grants] of Object.entries(data.grants)) {
        for (const grant of Object.values(grants)) {
          await client.execute({
            sql: `
              INSERT INTO permission_grants (plugin_id, permission_id, granted_at, granted_by)
              VALUES (?, ?, ?, ?)
            `,
            args: [
              pluginId,
              normalizePermissionId(grant.permissionId),
              grant.grantedAt,
              grant.grantedBy
            ] as InValue[]
          })
        }
      }

      await client.execute('DELETE FROM permission_audit_logs')
      for (const log of data.auditLogs || []) {
        await client.execute({
          sql: `
            INSERT INTO permission_audit_logs (id, timestamp, plugin_id, action, permission_id, context_json)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          args: [
            log.id,
            log.timestamp,
            log.pluginId,
            log.action,
            normalizePermissionId(log.permissionId),
            log.context ? JSON.stringify(log.context) : null
          ] as InValue[]
        })
      }

      await client.execute({
        sql: `
          INSERT INTO permission_meta (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `,
        args: ['version', String(data.version)]
      })

      await client.execute('COMMIT')
    } catch (error) {
      await client.execute('ROLLBACK').catch(() => {})
      throw error
    }
  }

  async close(): Promise<void> {
    const client = this.client
    if (!client) return
    this.client = null
    await Promise.resolve((client as { close?: () => void | Promise<void> }).close?.())
  }

  private ensureClient(): Client {
    if (!this.client) {
      throw new Error('Permission sqlite backend is not initialized')
    }
    return this.client
  }
}

/**
 * PermissionStore - SQLite-primary permission storage with compat JSON migration.
 */
export class PermissionStore {
  private dirPath: string
  private jsonFilePath: string
  private sqliteFilePath: string
  private data: PermissionData = createEmptyData()
  private dirty = false
  private initialized = false
  private persistChain: Promise<void> = Promise.resolve()
  private backendMode: PermissionBackendMode = 'degraded/backend-unavailable'
  private backendReason = 'Permission backend is not initialized.'
  private sqliteBackend: PermissionStoreBackend | null = null
  private createBackend: (dbPath: string) => PermissionStoreBackend

  /** Session-level permissions (memory only, cleared on app restart) */
  private sessionGrants: Record<string, Set<string>> = {}

  /** Declared permissions from currently loaded plugin manifests (memory only) */
  private declaredPermissions: Record<string, Set<string>> = {}

  constructor(dirPath: string, options: PermissionStoreOptions = {}) {
    this.dirPath = dirPath
    this.jsonFilePath = path.join(dirPath, 'permissions.json')
    this.sqliteFilePath = path.join(dirPath, 'permissions.db')
    this.createBackend = options.createBackend ?? ((dbPath) => new SqlitePermissionBackend(dbPath))
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await fse.ensureDir(this.dirPath)

    let backend: PermissionStoreBackend | null = null
    try {
      backend = this.createBackend(this.sqliteFilePath)
      await backend.initialize()
      const sqliteData = await backend.load()
      const jsonData = this.loadFromJson()

      if (hasPersistedData(sqliteData)) {
        this.data = sqliteData
      } else if (jsonData) {
        this.data = this.migrate(jsonData)
        await backend.persist(this.data)
        await this.backupLegacyJson()
        console.info('[PermissionStore] Compat migration hit: permissions.json upgraded to SQLite')
      } else {
        this.data = createEmptyData()
      }

      this.sqliteBackend = backend
      this.backendMode = 'sqlite'
      this.backendReason = ''
    } catch (error) {
      await backend?.close().catch(() => {})
      const jsonData = this.loadFromJson()
      this.data = jsonData ? this.migrate(jsonData) : createEmptyData()
      this.markBackendUnavailable(error, 'initialize')
    }

    this.initialized = true
  }

  /**
   * Load permissions from compat JSON snapshot (if present)
   */
  private loadFromJson(): PermissionData | null {
    try {
      if (fse.existsSync(this.jsonFilePath)) {
        const data = fse.readJSONSync(this.jsonFilePath) as PermissionData
        return data
      }
    } catch (error) {
      console.error('[PermissionStore] Failed to load compat JSON snapshot:', error)
    }
    return null
  }

  /**
   * Normalize compat JSON data into the current SQLite-backed format
  */
  private migrate(data: Partial<PermissionData>): PermissionData {
    console.info('[PermissionStore] Compat migration hit: normalizing permission data', {
      targetVersion: CURRENT_VERSION
    })
    return {
      version: CURRENT_VERSION,
      grants: data.grants || {},
      auditLogs: data.auditLogs || []
    }
  }

  private async backupLegacyJson(): Promise<void> {
    if (!(await fse.pathExists(this.jsonFilePath))) return
    const backupPath = `${this.jsonFilePath}.backup-${Date.now()}`
    await fse.move(this.jsonFilePath, backupPath, { overwrite: true })
    console.info('[PermissionStore] Compat migration archived permissions.json snapshot', {
      from: this.jsonFilePath,
      to: backupPath
    })
  }

  /**
   * Save permissions to persistence backend.
   */
  async flush(): Promise<void> {
    this.persistChain = this.persistChain.then(async () => {
      if (!this.dirty) return

      if (this.backendMode !== 'sqlite' || !this.sqliteBackend) {
        throw this.createBackendUnavailableError('flush')
      }

      await this.sqliteBackend.persist(cloneData(this.data))
      this.dirty = false
    })
    return this.persistChain.catch((error) => {
      this.markBackendUnavailable(error, 'persist')
      throw error
    })
  }

  async shutdown(): Promise<void> {
    try {
      await this.flush()
    } catch {
      // keep degraded shutdown non-fatal
    }
    await this.sqliteBackend?.close()
  }

  getBackendMode(): PermissionBackendMode {
    return this.backendMode
  }

  getBackendStatus(): PermissionBackendStatus {
    return {
      mode: this.backendMode,
      writable: this.backendMode === 'sqlite',
      reason: this.backendReason || undefined
    }
  }

  private createBackendUnavailableError(action: string): PermissionBackendUnavailableError {
    return new PermissionBackendUnavailableError(
      `[PermissionStore] Cannot ${action}: backend unavailable (${this.backendReason || 'unknown'}).`
    )
  }

  private markBackendUnavailable(error: unknown, phase: string): void {
    const reason = error instanceof Error ? error.message : String(error)
    this.backendMode = 'degraded/backend-unavailable'
    this.backendReason = reason || 'backend unavailable'
    this.sqliteBackend = null
    console.warn(`[PermissionStore] SQLite backend unavailable during ${phase}:`, error)
  }

  private ensureWritable(action: string): void {
    if (this.backendMode !== 'sqlite' || !this.sqliteBackend) {
      throw this.createBackendUnavailableError(action)
    }
  }

  private async commitPersistentMutation(action: string, mutate: () => void): Promise<void> {
    this.ensureWritable(action)
    const previous = cloneData(this.data)
    const previousDirty = this.dirty
    const previousSessionGrants = cloneSessionGrants(this.sessionGrants)

    try {
      mutate()
      this.dirty = true
      await this.flush()
    } catch (error) {
      this.data = previous
      this.dirty = previousDirty
      this.sessionGrants = previousSessionGrants
      throw error
    }
  }

  /**
   * Grant permission to plugin
   */
  async grant(
    pluginId: string,
    permissionId: string,
    grantedBy: 'user' | 'auto' | 'trust' = 'user'
  ): Promise<void> {
    const normalizedPermissionId = normalizePermissionId(permissionId)
    await this.commitPersistentMutation('grant', () => {
      if (!this.data.grants[pluginId]) {
        this.data.grants[pluginId] = {}
      }

      this.data.grants[pluginId][normalizedPermissionId] = {
        pluginId,
        permissionId: normalizedPermissionId,
        grantedAt: Date.now(),
        grantedBy
      }

      this.addAuditLog(
        'granted',
        pluginId,
        normalizedPermissionId,
        grantedBy === 'trust' ? 'system' : grantedBy === 'auto' ? 'auto' : 'user'
      )
    })
  }

  /**
   * Revoke permission from plugin
   */
  async revoke(pluginId: string, permissionId: string): Promise<void> {
    const normalizedPermissionId = normalizePermissionId(permissionId)
    this.ensureWritable('revoke')
    if (!this.data.grants[pluginId]) {
      return
    }

    await this.commitPersistentMutation('revoke', () => {
      for (const candidate of getPermissionIdCandidates(normalizedPermissionId)) {
        delete this.data.grants[pluginId][candidate]
      }

      this.addAuditLog('revoked', pluginId, normalizedPermissionId, 'user')
    })
  }

  /**
   * Revoke all permissions for plugin
   */
  async revokeAll(pluginId: string): Promise<void> {
    const permissions = Object.keys(this.data.grants[pluginId] || {})
    await this.commitPersistentMutation('revokeAll', () => {
      delete this.data.grants[pluginId]

      for (const permissionId of permissions) {
        this.addAuditLog('revoked', pluginId, permissionId, 'user', 'Revoked via "revoke all"')
      }
    })
  }

  /**
   * Grant session-level permission (memory only, not persisted)
   */
  async grantSession(pluginId: string, permissionId: string): Promise<void> {
    const normalizedPermissionId = normalizePermissionId(permissionId)
    await this.commitPersistentMutation('grantSession', () => {
      if (!this.sessionGrants[pluginId]) {
        this.sessionGrants[pluginId] = new Set()
      }
      this.sessionGrants[pluginId].add(normalizedPermissionId)
      this.addAuditLog('granted', pluginId, normalizedPermissionId, 'user', 'Session-only grant')
    })
  }

  /**
   * Grant multiple session-level permissions
   */
  async grantSessionMultiple(pluginId: string, permissionIds: string[]): Promise<void> {
    await this.commitPersistentMutation('grantSessionMultiple', () => {
      if (!this.sessionGrants[pluginId]) {
        this.sessionGrants[pluginId] = new Set()
      }
      for (const permissionId of permissionIds) {
        const normalizedPermissionId = normalizePermissionId(permissionId)
        this.sessionGrants[pluginId].add(normalizedPermissionId)
        this.addAuditLog('granted', pluginId, normalizedPermissionId, 'user', 'Session-only grant')
      }
    })
  }

  /**
   * Check if plugin has session-level permission
   */
  hasSessionPermission(pluginId: string, permissionId: string): boolean {
    const candidates = getPermissionIdCandidates(permissionId)
    return candidates.some((candidate) => this.sessionGrants[pluginId]?.has(candidate) ?? false)
  }

  /**
   * Update declared permissions for a plugin (runtime memory state).
   */
  setDeclaredPermissions(
    pluginId: string,
    declared: { required?: string[]; optional?: string[] }
  ): void {
    const ids = [...(declared.required || []), ...(declared.optional || [])]
      .map((id) => normalizePermissionId(id))
      .filter(Boolean)
    this.declaredPermissions[pluginId] = new Set(ids)
  }

  /**
   * Clear declared permission snapshot for a plugin.
   */
  clearDeclaredPermissions(pluginId: string): void {
    delete this.declaredPermissions[pluginId]
  }

  /**
   * Check whether permission is declared by current plugin manifest.
   * Returns null when declaration info is unavailable.
   */
  private isPermissionDeclared(pluginId: string, permissionId: string): boolean | null {
    const declaredSet = this.declaredPermissions[pluginId]
    if (!declaredSet) return null
    const candidates = getPermissionIdCandidates(permissionId)
    return candidates.some((candidate) => declaredSet.has(candidate))
  }

  /**
   * Resolve runtime access state for a permission.
   */
  checkPermissionAccess(
    pluginId: string,
    permissionId: string,
    sdkapi?: number
  ): PermissionAccessState {
    const normalizedPermissionId = normalizePermissionId(permissionId)
    const candidates = getPermissionIdCandidates(normalizedPermissionId)

    if (
      typeof sdkapi !== 'number' ||
      !Number.isFinite(sdkapi) ||
      sdkapi < PERMISSION_ENFORCEMENT_MIN_VERSION
    ) {
      return {
        allowed: false,
        reason: 'sdkapi-blocked',
        hasHistoricalGrant: false
      }
    }

    if (candidates.some((candidate) => DEFAULT_PERMISSIONS.includes(candidate))) {
      return {
        allowed: true,
        reason: 'default',
        hasHistoricalGrant: false
      }
    }

    const hasSessionGrant = this.hasSessionPermission(pluginId, normalizedPermissionId)
    const hasStoredGrant = candidates.some((candidate) =>
      Boolean(this.data.grants[pluginId]?.[candidate])
    )
    const declared = this.isPermissionDeclared(pluginId, normalizedPermissionId)

    if (declared === false) {
      return {
        allowed: false,
        reason: 'not-declared',
        hasHistoricalGrant: hasSessionGrant || hasStoredGrant
      }
    }

    if (hasSessionGrant || hasStoredGrant) {
      return {
        allowed: true,
        reason: 'granted',
        hasHistoricalGrant: false
      }
    }

    return {
      allowed: false,
      reason: 'not-granted',
      hasHistoricalGrant: false
    }
  }

  /**
   * Check if plugin has permission
   */
  hasPermission(pluginId: string, permissionId: string, sdkapi?: number): boolean {
    return this.checkPermissionAccess(pluginId, permissionId, sdkapi).allowed
  }

  /**
   * Get all permissions for a plugin
   */
  getPluginPermissions(pluginId: string): PermissionGrant[] {
    const pluginGrants = this.data.grants[pluginId]
    if (!pluginGrants) return []
    const normalizedMap = new Map<string, PermissionGrant>()
    for (const grant of Object.values(pluginGrants)) {
      const normalizedPermissionId = normalizePermissionId(grant.permissionId)
      const existing = normalizedMap.get(normalizedPermissionId)
      if (!existing || existing.grantedAt < grant.grantedAt) {
        normalizedMap.set(normalizedPermissionId, {
          ...grant,
          permissionId: normalizedPermissionId
        })
      }
    }
    return Array.from(normalizedMap.values())
  }

  /**
   * Get all plugin permissions
   */
  getAllPluginPermissions(): Record<string, PermissionGrant[]> {
    const result: Record<string, PermissionGrant[]> = {}
    for (const [pluginId, grants] of Object.entries(this.data.grants)) {
      result[pluginId] = Object.values(grants)
    }
    return result
  }

  /**
   * Get permission status for a plugin
   */
  getPluginPermissionStatus(
    pluginId: string,
    sdkapi: number | undefined,
    declared: { required: string[]; optional: string[] }
  ): PluginPermissionStatus {
    const grantedIds = this.getPluginPermissions(pluginId).map((g) => g.permissionId)
    return getPluginPermissionStatus(pluginId, sdkapi, declared, grantedIds)
  }

  /**
   * Get granted permission IDs for a plugin
   */
  getGrantedPermissionIds(pluginId: string): string[] {
    return this.getPluginPermissions(pluginId).map((g) => g.permissionId)
  }

  // ==================== Audit Log Methods ====================

  /**
   * Add an audit log entry
   */
  addAuditLog(
    action: AuditLogEntry['action'],
    pluginId: string,
    permissionId: string,
    triggeredBy: 'user' | 'auto' | 'system' | 'plugin' = 'system',
    reason?: string
  ): void {
    if (!this.data.auditLogs) {
      this.data.auditLogs = []
    }

    const context: Record<string, unknown> = { triggeredBy }
    if (reason) {
      context.reason = reason
    }

    const entry: AuditLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      pluginId,
      action,
      permissionId,
      context
    }

    this.data.auditLogs.unshift(entry)

    // Keep only recent entries
    if (this.data.auditLogs.length > MAX_AUDIT_LOGS) {
      this.data.auditLogs = this.data.auditLogs.slice(0, MAX_AUDIT_LOGS)
    }
  }

  /**
   * Get audit logs with optional filters
   */
  getAuditLogs(options?: {
    pluginId?: string
    action?: AuditLogEntry['action']
    limit?: number
    offset?: number
  }): AuditLogEntry[] {
    let logs = this.data.auditLogs || []

    // Apply filters
    if (options?.pluginId) {
      logs = logs.filter((l) => l.pluginId === options.pluginId)
    }
    if (options?.action) {
      logs = logs.filter((l) => l.action === options.action)
    }

    // Apply pagination
    const offset = options?.offset || 0
    const limit = options?.limit || 50
    logs = logs.slice(offset, offset + limit)

    return logs
  }

  /**
   * Clear all audit logs
   */
  async clearAuditLogs(): Promise<void> {
    await this.commitPersistentMutation('clearAuditLogs', () => {
      this.data.auditLogs = []
    })
  }
}

export type { AuditLogEntry }
