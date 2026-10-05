/**
 * Conversation file review: evidence captured at the file tool executor boundary, and authorized
 * rollback by Main-owned identity only.
 *
 * - A reviewed mutation needs the Main-only `ctx.workspace` the Pi runtime host passes after its
 *   gate and `assertAuthority()`. The run is re-loaded by `ctx.taskId` and must belong to that
 *   conversation, run in that cwd and live inside the conversation's current project root.
 *   Without `ctx.workspace` the file tools behave exactly as before and nothing is recorded; with a
 *   workspace but no project, mutations are refused.
 * - Each record stores public evidence (`publicJson`: existence/hash/size per path and a bounded
 *   diff) separately from the private rollback payload (`recordJson`: canonical root, original
 *   profile policy and base64 before-snapshots up to 16 MiB each). list/get/fork never decode the
 *   private payload; it lives in the same row so the conversation FK cascade deletes it.
 * - Main's own mutations and rollbacks serialize on sorted canonical path locks across sessions.
 *   Uncooperative external processes can still race the OS write window; that is not claimed away.
 */

import type { AgentPermission } from '@talex-touch/utils'
import type { AiAgentPermissionPolicy } from '@talex-touch/utils/types/ai-orchestrator'
import type {
  FileReviewChangeNotification,
  FileReviewDiff,
  FileReviewOperation,
  FileReviewPath,
  FileReviewReason,
  FileReviewRecord,
  FileReviewRollbackCode,
  FileReviewRollbackResult,
  FileReviewSide,
  FileReviewStatus
} from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import type { ToolExecutionContext } from '../ai/agents/tool-registry'
import type { CapturedFileState } from './file-review-fs'
import { randomUUID, createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { app } from 'electron'
import { z } from 'zod'
import {
  buildReviewDiff,
  didReviewStateChange,
  isUnchangedSince,
  REVIEW_MAX_SNAPSHOT_BYTES
} from '@talex-touch/pi-desktop-reuse/review'
import { getLogger } from '@talex-touch/utils/common/logger'
import { scheduleDbWrite } from '../../db/db-write'
import { conversationFileReviews, conversations } from '../../db/schema'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import { aiOrchestratorStore } from '../ai/ai-orchestrator-store'
import { databaseModule } from '../database'
import { getProject } from '../project/project-store'
import { subscribeConversationMutations } from './conversation-store'
import {
  captureFileState,
  checkConfinement,
  classifySnapshotContent,
  containsCredentialContent,
  currentFileState,
  isCredentialPath,
  joinStoredRelative,
  PathLockRegistry,
  relativeInside,
  resolveToolPath,
  writeFileAtomically
} from './file-review-fs'

const reviewLog = getLogger('conversation-file-review')

const FILE_READ = 'file:read' as AgentPermission
const FILE_WRITE = 'file:write' as AgentPermission
const FILE_DELETE = 'file:delete' as AgentPermission
const LIST_LIMIT = 500

/** Private, Main-only authority handed to the parent's rollback gate. Never sent to a renderer. */
export interface FileReviewRollbackAuthority {
  readonly conversationId: string
  readonly reviewId: string
  readonly runId: string
  readonly turnId: string
  readonly projectId: string
  readonly profileId: string
  /** Profile `updatedAt` when the operation ran. */
  readonly profileVersion: number
  readonly canonicalRoot: string
  readonly operation: FileReviewOperation
  readonly originalPolicy: Readonly<AiAgentPermissionPolicy>
  readonly relativePaths: readonly string[]
  /** Permissions the inverse operation needs (restoring content, deleting a created file, reading to verify). */
  readonly requiredPermissions: readonly AgentPermission[]
}

export interface FileReviewServiceOptions {
  /**
   * Must freshly resolve the original run's profile, current enablement/allowlist/permissions and
   * project, and obtain a NEW gate decision for this rollback (never replaying a completed tool
   * grant). Throw to refuse; an error whose `code` or `message` is a `FileReviewRollbackCode`
   * (e.g. `REVIEW_APPROVAL_REQUIRED`) is reported as that code, anything else as
   * `REVIEW_PERMISSION_DENIED`.
   * Return a fresh authority check for each inverse write; it must not ask for approval again.
   */
  authorizeRollback: (authority: FileReviewRollbackAuthority) => Promise<() => Promise<void>>
  onChanged?: (notification: FileReviewChangeNotification) => void | Promise<void>
}

/** Row shape the fork transaction inserts verbatim. */
export type FileReviewEvidenceInsert = typeof conversationFileReviews.$inferInsert

// ---------------------------------------------------------------------------
// Persisted shapes
// ---------------------------------------------------------------------------

const REASONS = [
  'binary',
  'too_large',
  'snapshot_failed',
  'snapshot_missing',
  'capture_failed',
  'diff_limit',
  'read_only_evidence',
  'shell_mcp_unsupported',
  'operation_failed',
  'partial_failure',
  'sensitive_content'
] as const satisfies readonly FileReviewReason[]

const ROLLBACK_CODES = [
  'REVIEW_NOT_FOUND',
  'REVIEW_READ_ONLY',
  'REVIEW_UNSUPPORTED',
  'REVIEW_AUTHORITY_CHANGED',
  'REVIEW_PERMISSION_DENIED',
  'REVIEW_APPROVAL_REQUIRED',
  'REVIEW_PATH_OUTSIDE_ROOT',
  'REVIEW_SYMLINK_CHANGED',
  'REVIEW_CONTENT_CONFLICT',
  'REVIEW_SNAPSHOT_MISSING',
  'REVIEW_SNAPSHOT_INVALID',
  'REVIEW_ROLLBACK_PARTIAL',
  'REVIEW_ROLLBACK_FAILED',
  'REVIEW_PERSIST_FAILED'
] as const satisfies readonly FileReviewRollbackCode[]

const reasonSchema = z.enum(REASONS)

const sideSchema = z.object({
  exists: z.boolean().nullable(),
  hash: z.string().optional(),
  size: z.number().optional()
})

const diffSchema = z.object({
  binary: z.boolean(),
  truncated: z.boolean(),
  tooLarge: z.boolean(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
  hunks: z.array(
    z.object({
      header: z.string(),
      lines: z.array(z.object({ type: z.enum(['context', 'add', 'del']), text: z.string() }))
    })
  )
})

const publicSchema = z.object({
  version: z.literal(1),
  readonly: z.boolean(),
  operation: z.enum(['write', 'delete', 'copy', 'move']),
  timestamp: z.number(),
  status: z.enum(['recorded', 'partial', 'unsupported', 'rolled_back', 'rollback_failed']),
  supported: z.boolean(),
  reason: reasonSchema.optional(),
  paths: z.array(
    z.object({
      path: z.string(),
      before: sideSchema,
      after: sideSchema,
      diff: diffSchema.optional(),
      reason: reasonSchema.optional()
    })
  )
})

/** Stored in `publicJson`: the record minus row-level identity columns. */
export type FileReviewPublicJson = z.infer<typeof publicSchema>

const privatePathSchema = z.object({
  path: z.string(),
  before: sideSchema.extend({ mode: z.number().optional() }),
  after: sideSchema,
  /** base64 of the before content; present only when it is a valid rollback snapshot. */
  snapshot: z.string().optional()
})

const privateSchema = z.union([
  z.object({ version: z.literal(1), readonly: z.literal(true) }),
  z.object({
    version: z.literal(1),
    readonly: z.literal(false),
    profileId: z.string(),
    profileVersion: z.number(),
    originalPolicy: z.object({
      mode: z.enum(['manual', 'preauthorized']),
      allowedPermissions: z.array(z.string())
    }),
    canonicalRoot: z.string(),
    paths: z.array(privatePathSchema),
    restoredPaths: z.array(z.string())
  })
])

type PrivateRecord = z.infer<typeof privateSchema>
type WritablePrivateRecord = Extract<PrivateRecord, { readonly: false }>
type PrivatePath = z.infer<typeof privatePathSchema>

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Tool-facing refusal that the registry projects through its stable error contract. */
function toolRefusal(code: 'TOOL_RESOURCE_ACCESS_DENIED' | 'TOOL_INPUT_INVALID'): Error {
  return Object.assign(new Error(code), { code })
}

class RollbackRefusal extends Error {
  constructor(readonly reviewCode: FileReviewRollbackCode) {
    super(reviewCode)
  }
}

function readRollbackCode(error: unknown): FileReviewRollbackCode | undefined {
  if (error instanceof RollbackRefusal) return error.reviewCode
  if (!error || typeof error !== 'object') return undefined
  for (const key of ['code', 'message'] as const) {
    const value = (error as Record<string, unknown>)[key]
    if (typeof value === 'string' && (ROLLBACK_CODES as readonly string[]).includes(value)) {
      return value as FileReviewRollbackCode
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Capture helpers
// ---------------------------------------------------------------------------

interface ReviewedAuthority {
  conversationId: string
  turnId: string
  runId: string
  projectId: string
  canonicalRoot: string
  profileId: string
  profileVersion: number
  originalPolicy: AiAgentPermissionPolicy
}

interface ReviewedPath {
  absolute: string
  relative: string
  sensitive: boolean
}

function publicSide(state: CapturedFileState): FileReviewSide {
  const side: FileReviewSide = { exists: state.exists }
  if (state.hash !== undefined) side.hash = state.hash
  if (state.size !== undefined) side.size = state.size
  return side
}

function sideState(side: FileReviewSide): { exists: boolean | null; hash?: string } {
  return side.hash === undefined
    ? { exists: side.exists }
    : { exists: side.exists, hash: side.hash }
}

function inversePermissions(paths: readonly PrivatePath[]): AgentPermission[] {
  const permissions = new Set<AgentPermission>([FILE_READ])
  for (const entry of paths) {
    if (didReviewStateChange(sideState(entry.before), sideState(entry.after)) !== true) continue
    if (entry.before.exists) permissions.add(FILE_WRITE)
    else permissions.add(FILE_DELETE)
  }
  return Array.from(permissions)
}

let runtimeRootPromise: Promise<string | null> | null = null

function canonicalRuntimeRoot(): Promise<string | null> {
  runtimeRootPromise ??= (async () => {
    try {
      return await fs.realpath(resolveRuntimeRootPath(app))
    } catch {
      return null
    }
  })()
  return runtimeRootPromise
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FileReviewService {
  private options: FileReviewServiceOptions | null = null
  private readonly locks = new PathLockRegistry()

  /**
   * Install the parent's rollback authorizer and change notifier, and take ownership of review
   * cleanup when a conversation is deleted. Returns a disposer for the cleanup subscription.
   */
  initialize(options: FileReviewServiceOptions): () => void {
    if (typeof options?.authorizeRollback !== 'function') {
      throw new TypeError('FileReviewService requires an authorizeRollback callback')
    }
    this.options = options
    const unsubscribe = subscribeConversationMutations((mutation) => {
      if (mutation.type !== 'delete') return
      void this.cleanupConversation(mutation.conversationId).catch(() => {
        reviewLog.warn('Failed to clean up file reviews of a deleted conversation')
      })
    })
    return () => {
      unsubscribe()
      if (this.options === options) this.options = null
    }
  }

  /**
   * Run one file mutation inside the review lifecycle. `execute` receives the resolved absolute
   * paths in the order given and must operate on exactly those. The executor's own result or error
   * always wins: a review capture or persistence failure is logged, never thrown over it.
   */
  async executeFileOperation<T>(
    ctx: ToolExecutionContext,
    operation: FileReviewOperation,
    paths: readonly string[],
    execute: (resolvedPaths: readonly string[]) => Promise<T>
  ): Promise<T> {
    if (!ctx.workspace) {
      const resolved = paths.map((value) => resolveToolPath(value, ctx.workingDirectory))
      return this.locks.withLocks(resolved, () => execute(resolved))
    }

    const authority = await this.resolveAuthority(ctx)
    const targets = await this.resolveReviewedPaths(authority, ctx.workingDirectory!, paths)
    const absolutes = targets.map((target) => target.absolute)

    const outcome = await this.locks.withLocks(absolutes, async () => {
      for (const target of targets) {
        const confinement = await checkConfinement(authority.canonicalRoot, target.absolute)
        if (confinement !== 'ok') throw toolRefusal('TOOL_RESOURCE_ACCESS_DENIED')
      }
      const before = await Promise.all(
        targets.map((target) => captureFileState(target.absolute, !target.sensitive))
      )
      let result: { ok: true; value: T } | { ok: false; error: unknown }
      try {
        result = { ok: true, value: await execute(absolutes) }
      } catch (error) {
        result = { ok: false, error }
      }
      const after = await Promise.all(
        targets.map((target) => captureFileState(target.absolute, false))
      )
      return { result, before, after }
    })

    try {
      await this.recordOperation(
        authority,
        operation,
        targets,
        outcome.before,
        outcome.after,
        outcome.result.ok
      )
    } catch {
      reviewLog.warn(
        'File review evidence could not be recorded; the file operation result is unchanged'
      )
    }
    if (!outcome.result.ok) throw outcome.result.error
    return outcome.result.value
  }

  async list(conversationId: string): Promise<FileReviewRecord[]> {
    if (typeof conversationId !== 'string' || !conversationId) return []
    const rows = await databaseModule
      .getDb()
      .select({
        id: conversationFileReviews.id,
        conversationId: conversationFileReviews.conversationId,
        runId: conversationFileReviews.runId,
        turnId: conversationFileReviews.turnId,
        projectId: conversationFileReviews.projectId,
        publicJson: conversationFileReviews.publicJson
      })
      .from(conversationFileReviews)
      .where(eq(conversationFileReviews.conversationId, conversationId))
      .orderBy(desc(conversationFileReviews.createdAt))
      .limit(LIST_LIMIT)
    const records: FileReviewRecord[] = []
    for (const row of rows) {
      const record = projectRecord(row, false)
      if (record) records.push(record)
    }
    return records
  }

  async get(conversationId: string, reviewId: string): Promise<FileReviewRecord | null> {
    if (typeof conversationId !== 'string' || typeof reviewId !== 'string') return null
    const [row] = await databaseModule
      .getDb()
      .select({
        id: conversationFileReviews.id,
        conversationId: conversationFileReviews.conversationId,
        runId: conversationFileReviews.runId,
        turnId: conversationFileReviews.turnId,
        projectId: conversationFileReviews.projectId,
        publicJson: conversationFileReviews.publicJson
      })
      .from(conversationFileReviews)
      .where(
        and(
          eq(conversationFileReviews.id, reviewId),
          eq(conversationFileReviews.conversationId, conversationId)
        )
      )
    return row ? projectRecord(row, true) : null
  }

  /** Roll back one review by Main identity. Never throws for a refusal; returns a stable code. */
  async rollback(conversationId: string, reviewId: string): Promise<FileReviewRollbackResult> {
    if (
      typeof conversationId !== 'string' ||
      typeof reviewId !== 'string' ||
      !conversationId ||
      !reviewId
    ) {
      return { ok: false, code: 'REVIEW_NOT_FOUND', review: null, restoredPaths: [] }
    }
    const loaded = await this.loadPrivate(conversationId, reviewId)
    if (!loaded) return { ok: false, code: 'REVIEW_NOT_FOUND', review: null, restoredPaths: [] }
    const review = projectRecord(loaded.row, true)
    if (!review)
      return { ok: false, code: 'REVIEW_SNAPSHOT_INVALID', review: null, restoredPaths: [] }
    if (loaded.publicRecord.readonly || loaded.privateRecord.readonly) {
      return { ok: false, code: 'REVIEW_READ_ONLY', review, restoredPaths: [] }
    }
    if (
      !loaded.publicRecord.supported ||
      (review.status !== 'recorded' && review.status !== 'partial')
    ) {
      return { ok: false, code: 'REVIEW_UNSUPPORTED', review, restoredPaths: [] }
    }

    const privateRecord = loaded.privateRecord
    const root = privateRecord.canonicalRoot
    const lockKeys: string[] = []
    for (const entry of privateRecord.paths) {
      const absolute = joinStoredRelative(root, entry.path)
      if (!absolute)
        return { ok: false, code: 'REVIEW_PATH_OUTSIDE_ROOT', review, restoredPaths: [] }
      lockKeys.push(absolute)
    }

    return this.locks.withLocks(lockKeys, () =>
      this.rollbackLocked(loaded.row, loaded.publicRecord, privateRecord, review, lockKeys)
    )
  }

  /** Remove every review row (and with it every private snapshot) owned by a conversation. */
  async cleanupConversation(conversationId: string): Promise<void> {
    await scheduleDbWrite('conversation.file-review.cleanup', async () => {
      await databaseModule
        .getDb()
        .delete(conversationFileReviews)
        .where(eq(conversationFileReviews.conversationId, conversationId))
    })
  }

  /**
   * Read-only evidence for a fork child, restricted to reviews of the given completed source turns.
   * Rows get fresh ids and fresh private provenance; no snapshot, root, profile or policy is copied.
   * The caller inserts them in its own fork transaction.
   */
  async buildForkEvidenceRows(
    sourceId: string,
    childId: string,
    completedTurnIds: ReadonlySet<string>
  ): Promise<FileReviewEvidenceInsert[]> {
    if (completedTurnIds.size === 0) return []
    const rows = await databaseModule
      .getDb()
      .select({
        projectId: conversationFileReviews.projectId,
        publicJson: conversationFileReviews.publicJson,
        createdAt: conversationFileReviews.createdAt
      })
      .from(conversationFileReviews)
      .where(
        and(
          eq(conversationFileReviews.conversationId, sourceId),
          inArray(conversationFileReviews.turnId, Array.from(completedTurnIds))
        )
      )
      .orderBy(conversationFileReviews.createdAt)
    const now = Date.now()
    const privateJson = JSON.stringify({ version: 1, readonly: true } satisfies PrivateRecord)
    const inserts: FileReviewEvidenceInsert[] = []
    for (const row of rows) {
      const parsed = parsePublic(row.publicJson)
      if (!parsed) continue
      const evidence: FileReviewPublicJson = {
        ...parsed,
        readonly: true,
        supported: false,
        reason: 'read_only_evidence'
      }
      inserts.push({
        id: randomUUID(),
        conversationId: childId,
        runId: randomUUID(),
        turnId: randomUUID(),
        projectId: row.projectId,
        publicJson: JSON.stringify(evidence),
        recordJson: privateJson,
        createdAt: row.createdAt,
        updatedAt: now
      })
    }
    return inserts
  }

  // -------------------------------------------------------------------------
  // Executor internals
  // -------------------------------------------------------------------------

  private async resolveAuthority(ctx: ToolExecutionContext): Promise<ReviewedAuthority> {
    const workspace = ctx.workspace!
    if (!workspace.projectId) throw toolRefusal('TOOL_RESOURCE_ACCESS_DENIED')
    await workspace.assertAuthority()

    const run = await aiOrchestratorStore.getOrchestratorRun(ctx.taskId)
    if (
      !run ||
      run.sessionId !== workspace.conversationId ||
      run.metadata?.workspaceExecution !== true ||
      !ctx.workingDirectory ||
      ctx.workingDirectory !== run.cwd
    ) {
      throw toolRefusal('TOOL_RESOURCE_ACCESS_DENIED')
    }

    const [conversation] = await databaseModule
      .getDb()
      .select({ projectId: conversations.projectId })
      .from(conversations)
      .where(eq(conversations.id, workspace.conversationId))
    if (!conversation || conversation.projectId !== workspace.projectId) {
      throw toolRefusal('TOOL_RESOURCE_ACCESS_DENIED')
    }

    const project = await getProject(workspace.projectId)
    const profile = await aiOrchestratorStore.getProfile(run.profileId)
    if (!project || !profile || !profile.enabled) throw toolRefusal('TOOL_RESOURCE_ACCESS_DENIED')

    let canonicalRoot: string
    let canonicalCwd: string
    try {
      canonicalRoot = await fs.realpath(project.rootPath)
      canonicalCwd = await fs.realpath(run.cwd)
    } catch {
      throw toolRefusal('TOOL_RESOURCE_ACCESS_DENIED')
    }
    if (canonicalCwd !== canonicalRoot && relativeInside(canonicalRoot, canonicalCwd) === null) {
      throw toolRefusal('TOOL_RESOURCE_ACCESS_DENIED')
    }

    return {
      conversationId: workspace.conversationId,
      turnId: workspace.turnId,
      runId: run.id,
      projectId: workspace.projectId,
      canonicalRoot,
      profileId: profile.id,
      profileVersion: profile.updatedAt,
      originalPolicy: {
        mode: profile.permissionPolicy.mode,
        allowedPermissions: [...profile.permissionPolicy.allowedPermissions]
      }
    }
  }

  /** Map model paths into the canonical root; anything outside, or a duplicate endpoint, is refused. */
  private async resolveReviewedPaths(
    authority: ReviewedAuthority,
    lexicalCwd: string,
    paths: readonly string[]
  ): Promise<ReviewedPath[]> {
    const canonicalCwd = await fs.realpath(lexicalCwd).catch(() => null)
    if (!canonicalCwd) throw toolRefusal('TOOL_RESOURCE_ACCESS_DENIED')
    const runtimeRoot = await canonicalRuntimeRoot()
    const resolved: ReviewedPath[] = []
    for (const raw of paths) {
      if (typeof raw !== 'string' || !raw) throw toolRefusal('TOOL_INPUT_INVALID')
      let absolute = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(canonicalCwd, raw)
      let relative = relativeInside(authority.canonicalRoot, absolute)
      if (relative === null && path.isAbsolute(raw)) {
        const fromLexicalCwd = path.relative(path.resolve(lexicalCwd), absolute)
        if (
          fromLexicalCwd &&
          !fromLexicalCwd.startsWith('..') &&
          !path.isAbsolute(fromLexicalCwd)
        ) {
          absolute = path.resolve(canonicalCwd, fromLexicalCwd)
          relative = relativeInside(authority.canonicalRoot, absolute)
        }
      }
      if (relative === null) throw toolRefusal('TOOL_RESOURCE_ACCESS_DENIED')
      if (resolved.some((entry) => entry.absolute === absolute))
        throw toolRefusal('TOOL_INPUT_INVALID')
      resolved.push({
        absolute,
        relative,
        sensitive: isCredentialPath(relative, absolute, runtimeRoot)
      })
    }
    return resolved
  }

  private async recordOperation(
    authority: ReviewedAuthority,
    operation: FileReviewOperation,
    targets: readonly ReviewedPath[],
    before: readonly CapturedFileState[],
    after: readonly CapturedFileState[],
    succeeded: boolean
  ): Promise<void> {
    const publicPaths: FileReviewPath[] = []
    const privatePaths: PrivatePath[] = []
    let anyChanged = false
    let anyUnknown = false
    let reversible = true
    let firstReason: FileReviewReason | undefined

    targets.forEach((target, index) => {
      const beforeState = before[index]!
      const afterState = after[index]!
      const beforeSide = publicSide(beforeState)
      const afterSide = publicSide(afterState)
      const changed = didReviewStateChange(sideState(beforeSide), sideState(afterSide))

      let reason: FileReviewReason | undefined = target.sensitive
        ? 'sensitive_content'
        : (beforeState.reason ?? afterState.reason)
      let snapshot: string | undefined
      if (beforeState.exists && !target.sensitive) {
        if (beforeState.content && beforeState.content.byteLength <= REVIEW_MAX_SNAPSHOT_BYTES) {
          const contentReason = classifySnapshotContent(beforeState.content)
          if (contentReason) reason = contentReason
          else snapshot = beforeState.content.toString('base64')
        } else {
          reason ??= 'snapshot_failed'
        }
      }

      let diff: FileReviewDiff | undefined
      if (reason !== 'sensitive_content' && beforeState.preview && afterState.preview) {
        const computed = buildReviewDiff(beforeState.preview, afterState.preview)
        if (
          computed.hunks.some((hunk) =>
            containsCredentialContent(hunk.lines.map((line) => line.text).join('\n'))
          )
        ) {
          reason = 'sensitive_content'
        } else {
          diff = computed
          if (computed.truncated) reason ??= 'diff_limit'
        }
      }

      if (changed === null) {
        anyUnknown = true
        reversible = false
        reason ??= 'capture_failed'
      } else if (changed) {
        anyChanged = true
        if (beforeState.exists && snapshot === undefined) reversible = false
      } else if (afterSide.exists && afterSide.hash === undefined) {
        reversible = false
      }
      if (!reversible) firstReason ??= reason

      const publicPath: FileReviewPath = {
        path: target.relative,
        before: beforeSide,
        after: afterSide
      }
      if (diff) publicPath.diff = diff
      if (reason) publicPath.reason = reason
      publicPaths.push(publicPath)

      const privatePath: PrivatePath = {
        path: target.relative,
        before:
          beforeState.mode === undefined ? beforeSide : { ...beforeSide, mode: beforeState.mode },
        after: afterSide
      }
      if (snapshot !== undefined) privatePath.snapshot = snapshot
      privatePaths.push(privatePath)
    })

    // A failed operation that verifiably changed nothing produced no file change to review.
    if (!succeeded && !anyChanged && !anyUnknown) return

    const supported = reversible && anyChanged
    let status: FileReviewStatus
    let reason: FileReviewReason | undefined
    if (!succeeded) {
      status = supported ? 'partial' : 'unsupported'
      reason = 'operation_failed'
    } else if (supported || !anyChanged) {
      status = 'recorded'
    } else {
      status = 'unsupported'
      reason = firstReason ?? 'snapshot_failed'
    }

    const now = Date.now()
    const publicRecord: FileReviewPublicJson = {
      version: 1,
      readonly: false,
      operation,
      timestamp: now,
      status,
      supported,
      paths: publicPaths
    }
    if (reason) publicRecord.reason = reason
    const privateRecord: WritablePrivateRecord = {
      version: 1,
      readonly: false,
      profileId: authority.profileId,
      profileVersion: authority.profileVersion,
      originalPolicy: authority.originalPolicy,
      canonicalRoot: authority.canonicalRoot,
      paths: privatePaths,
      restoredPaths: []
    }

    const id = randomUUID()
    const inserted = await scheduleDbWrite('conversation.file-review.record', async () => {
      const db = databaseModule.getDb()
      return db.transaction(async (tx) => {
        const [owner] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.id, authority.conversationId))
        if (!owner) return false
        await tx.insert(conversationFileReviews).values({
          id,
          conversationId: authority.conversationId,
          runId: authority.runId,
          turnId: authority.turnId,
          projectId: authority.projectId,
          publicJson: JSON.stringify(publicRecord),
          recordJson: JSON.stringify(privateRecord),
          createdAt: now,
          updatedAt: now
        })
        return true
      })
    })
    if (inserted)
      this.notify({ conversationId: authority.conversationId, reviewId: id, updatedAt: now })
  }

  // -------------------------------------------------------------------------
  // Rollback internals
  // -------------------------------------------------------------------------

  private async loadPrivate(conversationId: string, reviewId: string) {
    const [row] = await databaseModule
      .getDb()
      .select()
      .from(conversationFileReviews)
      .where(
        and(
          eq(conversationFileReviews.id, reviewId),
          eq(conversationFileReviews.conversationId, conversationId)
        )
      )
    if (!row) return null
    const publicRecord = parsePublic(row.publicJson)
    const privateRecord = parsePrivate(row.recordJson)
    if (!publicRecord || !privateRecord) return null
    return { row, publicRecord, privateRecord }
  }

  private async rollbackLocked(
    row: typeof conversationFileReviews.$inferSelect,
    publicRecord: FileReviewPublicJson,
    privateRecord: WritablePrivateRecord,
    review: FileReviewRecord,
    absolutes: readonly string[]
  ): Promise<FileReviewRollbackResult> {
    const refuse = (code: FileReviewRollbackCode): FileReviewRollbackResult => ({
      ok: false,
      code,
      review,
      restoredPaths: []
    })

    // Re-read under the lock: a concurrent rollback of the same record may have finished first.
    const fresh = await this.loadPrivate(row.conversationId, row.id)
    if (!fresh || fresh.privateRecord.readonly || fresh.row.updatedAt !== row.updatedAt) {
      return refuse('REVIEW_UNSUPPORTED')
    }

    // 1. Ownership: conversation still bound to the same project, whose root is still canonical.
    const [conversation] = await databaseModule
      .getDb()
      .select({ projectId: conversations.projectId })
      .from(conversations)
      .where(eq(conversations.id, row.conversationId))
    if (!conversation || conversation.projectId !== row.projectId)
      return refuse('REVIEW_AUTHORITY_CHANGED')
    const project = await getProject(row.projectId)
    const currentRoot = project ? await fs.realpath(project.rootPath).catch(() => null) : null
    if (!currentRoot || currentRoot !== privateRecord.canonicalRoot)
      return refuse('REVIEW_AUTHORITY_CHANGED')

    // 2. Fresh authorization under the lock, before any check that could go stale while waiting.
    const authorize = this.options?.authorizeRollback
    if (!authorize) return refuse('REVIEW_PERMISSION_DENIED')
    let revalidateAuthority: () => Promise<void>
    try {
      revalidateAuthority = await authorize({
        conversationId: row.conversationId,
        reviewId: row.id,
        runId: row.runId,
        turnId: row.turnId,
        projectId: row.projectId,
        profileId: privateRecord.profileId,
        profileVersion: privateRecord.profileVersion,
        canonicalRoot: privateRecord.canonicalRoot,
        operation: publicRecord.operation,
        originalPolicy: privateRecord.originalPolicy,
        relativePaths: privateRecord.paths.map((entry) => entry.path),
        requiredPermissions: inversePermissions(privateRecord.paths)
      })
    } catch (error) {
      return refuse(readRollbackCode(error) ?? 'REVIEW_PERMISSION_DENIED')
    }

    // 3. Preflight every path before any write: confinement, snapshot integrity, current == after.
    const plan: Array<{
      entry: PrivatePath
      absolute: string
      changed: boolean
      content?: Buffer
    }> = []
    for (let index = 0; index < privateRecord.paths.length; index += 1) {
      const entry = privateRecord.paths[index]!
      const absolute = absolutes[index]!
      const confinement = await checkConfinement(privateRecord.canonicalRoot, absolute).catch(
        () => 'outside' as const
      )
      if (confinement === 'outside') return refuse('REVIEW_PATH_OUTSIDE_ROOT')
      if (confinement !== 'ok') return refuse('REVIEW_SYMLINK_CHANGED')

      const changed = didReviewStateChange(sideState(entry.before), sideState(entry.after))
      if (changed === null) return refuse('REVIEW_UNSUPPORTED')
      let content: Buffer | undefined
      if (changed && entry.before.exists) {
        if (entry.snapshot === undefined) return refuse('REVIEW_SNAPSHOT_MISSING')
        content = Buffer.from(entry.snapshot, 'base64')
        const hash = createHash('sha256').update(content).digest('hex')
        if (
          content.byteLength > REVIEW_MAX_SNAPSHOT_BYTES ||
          content.byteLength !== entry.before.size ||
          hash !== entry.before.hash
        ) {
          return refuse('REVIEW_SNAPSHOT_INVALID')
        }
      }
      plan.push(content ? { entry, absolute, changed, content } : { entry, absolute, changed })
    }
    for (const step of plan) {
      const current = await currentFileState(step.absolute)
      if (!isUnchangedSince(sideState(step.entry.after), current))
        return refuse('REVIEW_CONTENT_CONFLICT')
    }

    // 4. Restore. Each step re-checks its own path immediately before the OS write.
    const restoredPaths: string[] = []
    const changedSteps = plan.filter((step) => step.changed)
    for (let index = 0; index < changedSteps.length; index += 1) {
      const step = changedSteps[index]!
      const failure = (code: FileReviewRollbackCode) =>
        this.finishRollback(row, publicRecord, privateRecord, restoredPaths, code)
      const confinement = await checkConfinement(privateRecord.canonicalRoot, step.absolute).catch(
        () => 'outside' as const
      )
      if (confinement !== 'ok') {
        return failure(
          restoredPaths.length > 0
            ? 'REVIEW_ROLLBACK_PARTIAL'
            : confinement === 'outside'
              ? 'REVIEW_PATH_OUTSIDE_ROOT'
              : 'REVIEW_SYMLINK_CHANGED'
        )
      }
      const current = await currentFileState(step.absolute)
      if (!isUnchangedSince(sideState(step.entry.after), current)) {
        return failure(
          restoredPaths.length > 0 ? 'REVIEW_ROLLBACK_PARTIAL' : 'REVIEW_CONTENT_CONFLICT'
        )
      }
      try {
        await revalidateAuthority()
      } catch (error) {
        return failure(
          restoredPaths.length > 0
            ? 'REVIEW_ROLLBACK_PARTIAL'
            : (readRollbackCode(error) ?? 'REVIEW_PERMISSION_DENIED')
        )
      }
      try {
        if (step.content)
          await writeFileAtomically(step.absolute, step.content, step.entry.before.mode)
        else await fs.unlink(step.absolute)
      } catch {
        return failure(
          restoredPaths.length > 0 ? 'REVIEW_ROLLBACK_PARTIAL' : 'REVIEW_ROLLBACK_FAILED'
        )
      }
      restoredPaths.push(step.entry.path)
      if (index < changedSteps.length - 1) {
        // Durable intermediate state: if the process dies here the record reads as a partial rollback.
        try {
          await this.persistRollbackState(
            row,
            publicRecord,
            privateRecord,
            restoredPaths,
            'rollback_failed'
          )
        } catch {
          return {
            ok: false,
            code: 'REVIEW_PERSIST_FAILED',
            review,
            restoredPaths: [...restoredPaths]
          }
        }
      }
    }
    return this.finishRollback(row, publicRecord, privateRecord, restoredPaths, null)
  }

  /** Persist the terminal rollback state; snapshots are dropped so nothing can be replayed. */
  private async finishRollback(
    row: typeof conversationFileReviews.$inferSelect,
    publicRecord: FileReviewPublicJson,
    privateRecord: WritablePrivateRecord,
    restoredPaths: readonly string[],
    failure: FileReviewRollbackCode | null
  ): Promise<FileReviewRollbackResult> {
    const nothingWritten = failure !== null && restoredPaths.length === 0
    if (nothingWritten) {
      // No file was touched: the record keeps its state (a later attempt re-runs full preflight).
      return {
        ok: false,
        code: failure,
        review: projectRecord({ ...row }, true),
        restoredPaths: []
      }
    }
    let updated: FileReviewRecord | null
    try {
      updated = await this.persistRollbackState(
        row,
        publicRecord,
        privateRecord,
        restoredPaths,
        failure ? 'rollback_failed' : 'rolled_back'
      )
    } catch {
      return {
        ok: false,
        code: 'REVIEW_PERSIST_FAILED',
        review: projectRecord(row, true),
        restoredPaths: [...restoredPaths]
      }
    }
    return failure
      ? { ok: false, code: failure, review: updated, restoredPaths: [...restoredPaths] }
      : { ok: true, review: updated, restoredPaths: [...restoredPaths] }
  }

  private async persistRollbackState(
    row: typeof conversationFileReviews.$inferSelect,
    publicRecord: FileReviewPublicJson,
    privateRecord: WritablePrivateRecord,
    restoredPaths: readonly string[],
    status: Extract<FileReviewStatus, 'rolled_back' | 'rollback_failed'>
  ): Promise<FileReviewRecord | null> {
    const now = Date.now()
    const nextPublic: FileReviewPublicJson = { ...publicRecord, status, supported: false }
    if (status === 'rollback_failed') nextPublic.reason = 'partial_failure'
    else delete nextPublic.reason
    const nextPrivate: WritablePrivateRecord = {
      ...privateRecord,
      paths: privateRecord.paths.map(({ snapshot: _snapshot, ...entry }) => entry),
      restoredPaths: [...restoredPaths]
    }
    const publicJson = JSON.stringify(nextPublic)
    await scheduleDbWrite('conversation.file-review.rollback', async () => {
      await databaseModule
        .getDb()
        .update(conversationFileReviews)
        .set({ publicJson, recordJson: JSON.stringify(nextPrivate), updatedAt: now })
        .where(
          and(
            eq(conversationFileReviews.id, row.id),
            eq(conversationFileReviews.conversationId, row.conversationId)
          )
        )
    })
    row.updatedAt = now
    row.publicJson = publicJson
    this.notify({ conversationId: row.conversationId, reviewId: row.id, updatedAt: now })
    return projectRecord({ ...row, publicJson }, true)
  }

  private notify(notification: FileReviewChangeNotification): void {
    const onChanged = this.options?.onChanged
    if (!onChanged) return
    try {
      void Promise.resolve(onChanged(notification)).catch(() => {
        reviewLog.warn('File review change notification failed')
      })
    } catch {
      reviewLog.warn('File review change notification failed')
    }
  }
}

function parsePublic(value: string): FileReviewPublicJson | null {
  try {
    const parsed = publicSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function parsePrivate(value: string): PrivateRecord | null {
  try {
    const parsed = privateSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function projectRecord(
  row: Pick<
    typeof conversationFileReviews.$inferSelect,
    'id' | 'conversationId' | 'runId' | 'turnId' | 'projectId' | 'publicJson'
  >,
  includeDiff: boolean
): FileReviewRecord | null {
  const stored = parsePublic(row.publicJson)
  if (!stored) return null
  const record: FileReviewRecord = {
    id: row.id,
    conversationId: row.conversationId,
    projectId: row.projectId,
    operation: stored.operation,
    timestamp: stored.timestamp,
    status: stored.status,
    supported: stored.supported,
    paths: stored.paths.map(({ diff, ...entry }) =>
      includeDiff && diff ? { ...entry, diff } : entry
    )
  }
  if (!stored.readonly) {
    record.runId = row.runId
    record.turnId = row.turnId
  }
  if (stored.reason) record.reason = stored.reason
  return record
}

export const fileReviewService = new FileReviewService()
