import type { PluginStorageErrorCode } from '@talex-touch/utils/transport/events/types'
import type { PluginSqliteWorkerClientOptions } from './plugin-sqlite-worker-client'
import type {
  PluginSqliteExecuteResult,
  PluginSqliteQueryResult,
  PluginSqliteTransactionResult
} from './plugin-sqlite-worker-protocol'
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { PLUGIN_STORAGE_ERROR_CODES } from '@talex-touch/utils/transport/events/types'
import { PluginSqliteWorkerClient } from './plugin-sqlite-worker-client'
import {
  PLUGIN_SQLITE_MAX_ACTIVE_OPERATIONS,
  PLUGIN_SQLITE_MAX_QUEUE_DEPTH,
  PLUGIN_SQLITE_MAX_WORKERS
} from './plugin-sqlite-worker-protocol'

export interface PluginSqliteOwnerIdentity {
  pluginName: string
  pluginInstanceId: string
  activationGeneration: number
}

export interface PluginSqliteResourceClient {
  readonly isClosed?: boolean
  readonly isIdle?: boolean
  readonly lastUsedAt?: number
  execute: (sql: string, params: unknown[]) => Promise<PluginSqliteExecuteResult>
  query: (sql: string, params: unknown[]) => Promise<PluginSqliteQueryResult>
  transaction: (
    statements: Array<{ sql: string; params: unknown[] }>
  ) => Promise<PluginSqliteTransactionResult>
  close: () => Promise<void> | void
}

export class PluginSqliteResourceError extends Error {
  constructor(
    readonly code: PluginStorageErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'PluginSqliteResourceError'
  }
}

interface ResourceRecord {
  identity: PluginSqliteOwnerIdentity
  client: PluginSqliteResourceClient
}

export interface PluginSqliteResourceOwnerRegistryOptions {
  maxWorkers?: number
  maxActiveOperations?: number
  workerOptions?: PluginSqliteWorkerClientOptions
  createClient?: (databasePath: string) => PluginSqliteResourceClient
}

class PluginSqliteOperationScheduler {
  private active = 0
  private readonly queued: Array<() => void> = []

  constructor(private readonly maxActive: number) {}

  run<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queued.push(() => {
        this.active += 1
        void operation()
          .then(resolve, reject)
          .finally(() => {
            this.active -= 1
            this.drain()
          })
      })
      this.drain()
    })
  }

  private drain(): void {
    while (this.active < this.maxActive) {
      const next = this.queued.shift()
      if (!next) return
      next()
    }
  }
}

class ScheduledPluginSqliteClient implements PluginSqliteResourceClient {
  private pending = 0
  private lastUsed = Date.now()

  constructor(
    private readonly client: PluginSqliteResourceClient,
    private readonly scheduler: PluginSqliteOperationScheduler
  ) {}

  get isClosed(): boolean {
    return this.client.isClosed === true
  }

  get isIdle(): boolean {
    return this.pending === 0
  }

  get lastUsedAt(): number {
    return this.lastUsed
  }

  execute(sql: string, params: unknown[]): Promise<PluginSqliteExecuteResult> {
    return this.schedule(() => this.client.execute(sql, params))
  }

  query(sql: string, params: unknown[]): Promise<PluginSqliteQueryResult> {
    return this.schedule(() => this.client.query(sql, params))
  }

  transaction(
    statements: Array<{ sql: string; params: unknown[] }>
  ): Promise<PluginSqliteTransactionResult> {
    return this.schedule(() => this.client.transaction(statements))
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  private schedule<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= PLUGIN_SQLITE_MAX_QUEUE_DEPTH) {
      return Promise.reject(
        new PluginSqliteResourceError(
          PLUGIN_STORAGE_ERROR_CODES.CONCURRENCY_LIMIT,
          'Plugin SQLite queue limit exceeded.'
        )
      )
    }
    this.pending += 1
    this.lastUsed = Date.now()
    return this.scheduler.run(operation).finally(() => {
      this.pending -= 1
      this.lastUsed = Date.now()
    })
  }
}

function isPathInside(parentPath: string, targetPath: string): boolean {
  const relative = path.relative(parentPath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export async function resolvePluginSqliteDatabasePath(dataPath: string): Promise<string> {
  const absoluteDataPath = path.resolve(dataPath)
  const ownerPath = path.dirname(absoluteDataPath)
  const pluginRootPath = path.dirname(ownerPath)

  const [rootStat, ownerStat] = await Promise.all([lstat(pluginRootPath), lstat(ownerPath)])
  if (rootStat.isSymbolicLink() || ownerStat.isSymbolicLink()) {
    throw new PluginSqliteResourceError(
      PLUGIN_STORAGE_ERROR_CODES.SYMLINK_DENIED,
      'Plugin SQLite owner path cannot be a symbolic link.'
    )
  }

  const dataStat = await lstat(absoluteDataPath)
  if (dataStat.isSymbolicLink()) {
    throw new PluginSqliteResourceError(
      PLUGIN_STORAGE_ERROR_CODES.SYMLINK_DENIED,
      'Plugin SQLite data path cannot be a symbolic link.'
    )
  }

  const [canonicalRoot, canonicalOwner, canonicalData] = await Promise.all([
    realpath(pluginRootPath),
    realpath(ownerPath),
    realpath(absoluteDataPath)
  ])
  if (
    !isPathInside(canonicalRoot, canonicalOwner) ||
    path.dirname(canonicalData) !== canonicalOwner
  ) {
    throw new PluginSqliteResourceError(
      PLUGIN_STORAGE_ERROR_CODES.PATH_OUTSIDE_ROOT,
      'Plugin SQLite path is outside the plugin root.'
    )
  }

  const databasePath = path.join(canonicalData, 'plugin-sdk.sqlite')
  const databaseStat = await lstat(databasePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (databaseStat?.isSymbolicLink()) {
    throw new PluginSqliteResourceError(
      PLUGIN_STORAGE_ERROR_CODES.SYMLINK_DENIED,
      'Plugin SQLite database cannot be a symbolic link.'
    )
  }
  return databasePath
}

function sameIdentity(left: PluginSqliteOwnerIdentity, right: PluginSqliteOwnerIdentity): boolean {
  return (
    left.pluginName === right.pluginName &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration
  )
}

export class PluginSqliteResourceOwnerRegistry {
  private readonly records = new Map<string, ResourceRecord>()
  private mutationTail = Promise.resolve()
  private readonly maxWorkers: number
  private readonly createClient: (databasePath: string) => PluginSqliteResourceClient
  private readonly scheduler: PluginSqliteOperationScheduler

  constructor(options: PluginSqliteResourceOwnerRegistryOptions = {}) {
    this.maxWorkers = options.maxWorkers ?? PLUGIN_SQLITE_MAX_WORKERS
    this.scheduler = new PluginSqliteOperationScheduler(
      options.maxActiveOperations ?? PLUGIN_SQLITE_MAX_ACTIVE_OPERATIONS
    )
    this.createClient =
      options.createClient ??
      ((databasePath) => new PluginSqliteWorkerClient(databasePath, options.workerOptions))
  }

  acquire(
    identity: PluginSqliteOwnerIdentity,
    dataPath: string
  ): Promise<PluginSqliteResourceClient> {
    return this.runMutation(async () => {
      const existing = this.records.get(identity.pluginName)
      if (
        existing &&
        sameIdentity(existing.identity, identity) &&
        existing.client.isClosed !== true
      ) {
        return existing.client
      }
      if (existing) {
        this.records.delete(identity.pluginName)
        await existing.client.close()
      }
      if (this.records.size >= this.maxWorkers) await this.evictIdleOwner()
      if (this.records.size >= this.maxWorkers) {
        throw new PluginSqliteResourceError(
          PLUGIN_STORAGE_ERROR_CODES.CONCURRENCY_LIMIT,
          'Plugin SQLite worker limit exceeded.'
        )
      }

      const databasePath = await resolvePluginSqliteDatabasePath(dataPath)
      const client = new ScheduledPluginSqliteClient(
        this.createClient(databasePath),
        this.scheduler
      )
      this.records.set(identity.pluginName, {
        identity: { ...identity },
        client
      })
      return client
    })
  }

  closePlugin(pluginName: string): Promise<boolean> {
    return this.runMutation(async () => {
      const existing = this.records.get(pluginName)
      if (!existing) return false
      this.records.delete(pluginName)
      await existing.client.close()
      return true
    })
  }

  closeActivation(identity: PluginSqliteOwnerIdentity): Promise<boolean> {
    return this.runMutation(async () => {
      const existing = this.records.get(identity.pluginName)
      if (!existing || !sameIdentity(existing.identity, identity)) return false
      this.records.delete(identity.pluginName)
      await existing.client.close()
      return true
    })
  }

  closeAll(): Promise<void> {
    return this.runMutation(async () => {
      const records = [...this.records.values()]
      this.records.clear()
      await Promise.all(records.map((record) => record.client.close()))
    })
  }

  get size(): number {
    return this.records.size
  }

  private async evictIdleOwner(): Promise<void> {
    const candidate = [...this.records.entries()]
      .filter(([, record]) => record.client.isIdle === true)
      .sort(
        (left, right) => (left[1].client.lastUsedAt ?? 0) - (right[1].client.lastUsedAt ?? 0)
      )[0]
    if (!candidate) return
    this.records.delete(candidate[0])
    await candidate[1].client.close()
  }

  private async runMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    this.mutationTail = previous.catch(() => undefined).then(() => gate)
    await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      release?.()
    }
  }
}
