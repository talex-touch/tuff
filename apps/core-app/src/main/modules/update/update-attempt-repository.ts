import type {
  AppPreviewChannel,
  UpdateInstallMode,
  UpdateLifecycleError,
  UpdateLifecyclePhase,
  UpdateLifecycleSnapshot,
  UpdateProviderSource
} from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { UpdateLifecyclePatch } from './update-lifecycle'
import { isUpdateLifecyclePhase } from '@talex-touch/utils'
import { and, desc, eq, notInArray } from 'drizzle-orm'
import * as schema from '../../db/schema'
import {
  isTerminalUpdatePhase,
  reduceUpdateLifecycle,
  UpdateLifecycleConflictError
} from './update-lifecycle'

const TERMINAL_PHASES: UpdateLifecyclePhase[] = ['idle', 'healthy', 'recovered', 'failed']

type UpdateAttemptRow = typeof schema.appUpdateAttempts.$inferSelect

export interface CreateUpdateAttemptInput {
  id: string
  currentVersion: string
  channel: AppPreviewChannel
  installOnNormalQuit: boolean
  now?: number
}

export interface TransitionUpdateAttemptInput {
  attemptId: string
  expectedRevision: number
  expectedPhase: UpdateLifecyclePhase
  to: UpdateLifecyclePhase
  patch?: UpdateLifecyclePatch
  now?: number
}

export interface UpdateAttemptRepositoryOptions {
  onCommitted?: (snapshot: UpdateLifecycleSnapshot) => void
  onObserverError?: (error: unknown) => void
}

export class UpdateAttemptRepository {
  constructor(
    private readonly db: LibSQLDatabase<typeof schema>,
    private readonly options: UpdateAttemptRepositoryOptions = {}
  ) {}

  async createChecking(input: CreateUpdateAttemptInput): Promise<UpdateLifecycleSnapshot> {
    const now = input.now ?? Date.now()

    const snapshot = await this.db.transaction(async (tx) => {
      const [active] = await tx
        .select({ id: schema.appUpdateAttempts.id })
        .from(schema.appUpdateAttempts)
        .where(notInArray(schema.appUpdateAttempts.phase, TERMINAL_PHASES))
        .limit(1)

      if (active) {
        throw new UpdateLifecycleConflictError('An update lifecycle attempt is already active')
      }

      const [created] = await tx
        .insert(schema.appUpdateAttempts)
        .values({
          id: input.id,
          phase: 'checking',
          currentVersion: input.currentVersion,
          channel: input.channel,
          installOnNormalQuit: input.installOnNormalQuit,
          createdAt: now,
          updatedAt: now
        })
        .returning()

      if (!created) {
        throw new Error('Failed to create update lifecycle attempt')
      }
      return rowToLifecycleSnapshot(created)
    })

    this.notifyCommitted(snapshot)
    return snapshot
  }

  async getActive(): Promise<UpdateLifecycleSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.appUpdateAttempts)
      .where(notInArray(schema.appUpdateAttempts.phase, TERMINAL_PHASES))
      .orderBy(desc(schema.appUpdateAttempts.updatedAt))
      .limit(1)

    return row ? rowToLifecycleSnapshot(row) : null
  }

  async getLatest(): Promise<UpdateLifecycleSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.appUpdateAttempts)
      .orderBy(desc(schema.appUpdateAttempts.updatedAt), desc(schema.appUpdateAttempts.createdAt))
      .limit(1)

    return row ? rowToLifecycleSnapshot(row) : null
  }

  async getById(attemptId: string): Promise<UpdateLifecycleSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.appUpdateAttempts)
      .where(eq(schema.appUpdateAttempts.id, attemptId))
      .limit(1)

    return row ? rowToLifecycleSnapshot(row) : null
  }

  async getByDownloadTaskId(taskId: string): Promise<UpdateLifecycleSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.appUpdateAttempts)
      .where(eq(schema.appUpdateAttempts.downloadTaskId, taskId))
      .orderBy(desc(schema.appUpdateAttempts.updatedAt))
      .limit(1)

    return row ? rowToLifecycleSnapshot(row) : null
  }

  async transition(input: TransitionUpdateAttemptInput): Promise<UpdateLifecycleSnapshot> {
    const snapshot = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.appUpdateAttempts)
        .where(eq(schema.appUpdateAttempts.id, input.attemptId))
        .limit(1)

      if (!row) {
        throw new UpdateLifecycleConflictError('Update lifecycle attempt was not found')
      }
      if (row.phase !== input.expectedPhase) {
        throw new UpdateLifecycleConflictError('Update lifecycle phase changed before transition')
      }

      const next = reduceUpdateLifecycle(rowToLifecycleSnapshot(row), {
        attemptId: input.attemptId,
        expectedRevision: input.expectedRevision,
        to: input.to,
        patch: input.patch,
        now: input.now
      })
      const terminalAt = isTerminalUpdatePhase(next.phase) ? next.updatedAt : null

      const [updated] = await tx
        .update(schema.appUpdateAttempts)
        .set({
          revision: next.revision,
          phase: next.phase,
          targetVersion: next.targetVersion,
          source: next.source,
          releaseTag: next.releaseTag,
          downloadTaskId: next.taskId,
          installMode: next.installMode,
          installOnNormalQuit: next.installOnNormalQuit,
          rollbackCompatible: next.rollbackCompatible,
          rollbackFromVersion: next.rollbackFromVersion,
          previousVersion: next.previousVersion,
          recoveryAvailable: next.recoveryAvailable,
          errorCode: next.error?.code ?? null,
          errorMessage: next.error?.message ?? null,
          errorRetryable: next.error?.retryable ?? null,
          updatedAt: next.updatedAt,
          terminalAt
        })
        .where(
          and(
            eq(schema.appUpdateAttempts.id, input.attemptId),
            eq(schema.appUpdateAttempts.revision, input.expectedRevision),
            eq(schema.appUpdateAttempts.phase, input.expectedPhase)
          )
        )
        .returning()

      if (!updated) {
        throw new UpdateLifecycleConflictError('Update lifecycle compare-and-transition failed')
      }
      return rowToLifecycleSnapshot(updated)
    })

    this.notifyCommitted(snapshot)
    return snapshot
  }

  private notifyCommitted(snapshot: UpdateLifecycleSnapshot): void {
    try {
      this.options.onCommitted?.(snapshot)
    } catch (error) {
      try {
        this.options.onObserverError?.(error)
      } catch {
        // A post-commit observer must never change the committed lifecycle result.
      }
    }
  }
}

function rowToLifecycleSnapshot(row: UpdateAttemptRow): UpdateLifecycleSnapshot {
  const phase = normalizePhase(row.phase)
  const error = normalizeError(row.errorCode, row.errorMessage, row.errorRetryable)

  return {
    attemptId: row.id,
    revision: row.revision,
    phase,
    currentVersion: row.currentVersion,
    targetVersion: row.targetVersion,
    source: normalizeSource(row.source),
    channel: row.channel as AppPreviewChannel,
    releaseTag: row.releaseTag,
    taskId: row.downloadTaskId,
    installMode: normalizeInstallMode(row.installMode),
    installOnNormalQuit: row.installOnNormalQuit,
    rollbackCompatible: row.rollbackCompatible,
    rollbackFromVersion: row.rollbackFromVersion,
    previousVersion: row.previousVersion,
    recoveryAvailable: row.recoveryAvailable,
    lastCheckAt: null,
    error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function normalizePhase(value: string): UpdateLifecyclePhase {
  if (!isUpdateLifecyclePhase(value)) {
    throw new Error(`Unknown persisted update lifecycle phase: ${value}`)
  }
  return value
}

function normalizeSource(value: string | null): UpdateProviderSource | null {
  if (value === 'nexus' || value === 'github') {
    return value
  }
  return null
}

function normalizeInstallMode(value: string | null): UpdateInstallMode | null {
  if (value === 'normal-quit' || value === 'install-now') {
    return value
  }
  return null
}

function normalizeError(
  code: string | null,
  message: string | null,
  retryable: boolean | null
): UpdateLifecycleError | null {
  if (!code || !message) {
    return null
  }
  return { code, message, retryable: retryable === true }
}
