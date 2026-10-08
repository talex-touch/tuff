import type {
  ConversationWorkspaceSettings,
  ConversationWorkspaceState,
  ConversationWorkspaceStatus,
  WorkspaceExecutionProjection,
  WorkspaceForkRequest,
  WorkspaceHostMessage,
  WorkspaceQueuedInput,
  WorkspaceSubmitRequest,
  WorkspaceSubmitResult,
  WorkspaceAttachmentRef
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { IntelligenceMessageAttachment } from '@talex-touch/utils/types/intelligence'
import type { MainDatabase } from '../../db/db-write'
import type { StoredConversationMessage } from './conversation-store'
import type { QueueStore } from '@talex-touch/pi-desktop-reuse/ports'
import type { StoredWorkspaceAttachment } from './workspace-attachments'
import { createHash, randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { TurnQueue } from '@talex-touch/pi-desktop-reuse/turn-queue'
import { cloneMessagesForFork } from '@talex-touch/pi-desktop-reuse/session-fork'
import { scheduleDbWrite } from '../../db/db-write'
import {
  conversationAttachments,
  conversationFileReviews,
  conversationMessageAttachments,
  conversationMessages,
  conversationQueuedInputs,
  conversationSyncState,
  conversationWorkspaces,
  conversationWorkspaceReceipts,
  conversations,
  localAiCliSessions
} from '../../db/schema'
import { databaseModule } from '../database'
import { aiOrchestratorStore } from '../ai/ai-orchestrator-store'
import { isContextInputProviderSafe } from '../ai/intelligence-context-hygiene'
import { getProject } from '../project/project-store'
import { getLocalAiCliSessionForConversation } from '../local-ai-cli/session-store'
import { getLocalAiCliWorkspaceRoot } from '../local-ai-cli/workspace-root'
import type { PreparedPiNativeFork } from '../local-ai-cli/pi-native-fork'
import { preparePiNativeFork } from '../local-ai-cli/pi-native-fork'
import { emitConversationMutation, getConversation } from './conversation-store'
import { fileReviewService } from './file-review-service'
import { WorkspaceAttachmentStore } from './workspace-attachments'

const MAX_PENDING = 8
const idSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => !value.includes('\0'))
const settingsSchema = z
  .object({
    mode: z.enum(['chat', 'agent']),
    profileId: z.string().min(1).max(256).optional(),
    providerId: z.string().min(1).max(256).optional(),
    model: z.string().min(1).max(512).optional(),
    reasoningEffort: z.enum(['auto', 'low', 'medium', 'high', 'max']).optional(),
    autoContext: z.boolean().optional()
  })
  .strict()
const refSchema = z
  .object({
    id: idSchema,
    kind: z.literal('image'),
    name: z.string().max(256).optional(),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
  })
  .strict()
const inputSchema = z
  .object({
    id: idSchema,
    conversationId: idSchema,
    text: z
      .string()
      .min(1)
      .max(4 * 1024 * 1024),
    settings: settingsSchema,
    projectId: idSchema.nullable(),
    createdAt: z.number().int().nonnegative(),
    attachments: z.array(refSchema).max(16).optional(),
    lead: z
      .object({ text: z.string().max(64 * 1024), note: z.string().max(128 * 1024) })
      .strict()
      .optional(),
    retryOfMessageId: idSchema.optional(),
    answersToolCallId: idSchema.optional()
  })
  .strict()
const submitSchema = z
  .object({
    conversationId: idSchema,
    id: idSchema,
    text: z
      .string()
      .trim()
      .min(1)
      .max(4 * 1024 * 1024),
    settings: settingsSchema.optional(),
    attachments: z
      .array(
        z
          .object({
            type: z.literal('image'),
            dataUrl: z.string().max(15 * 1024 * 1024),
            name: z.string().max(256).optional()
          })
          .strict()
      )
      .max(16)
      .optional(),
    create: z
      .object({ projectId: idSchema.nullable(), title: z.string().max(512) })
      .strict()
      .optional(),
    lead: z
      .object({ text: z.string().max(64 * 1024), note: z.string().max(128 * 1024) })
      .strict()
      .optional(),
    retryOfMessageId: idSchema.optional(),
    answersToolCallId: idSchema.optional()
  })
  .strict()

export interface WorkspaceAdmittedTurn {
  input: WorkspaceQueuedInput
  user: StoredConversationMessage
  assistant: StoredConversationMessage
  context?: ConversationWorkspaceState['context']
}

export interface WorkspaceServiceOptions {
  getDb?: () => MainDatabase
  attachments?: WorkspaceAttachmentStore
  validateSettings?: (settings: ConversationWorkspaceSettings) => Promise<void>
  onChanged?: (state: ConversationWorkspaceState) => void
}

interface PendingAdmission {
  create?: { title: string; projectId: string | null }
  attachments: StoredWorkspaceAttachment[]
}

interface PendingClaim {
  input: WorkspaceQueuedInput
  user: StoredConversationMessage
  assistant: StoredConversationMessage
}

const DEFAULT_SETTINGS: ConversationWorkspaceSettings = {
  mode: 'chat',
  reasoningEffort: 'auto',
  autoContext: true
}

/** Main SQLite authority; all mutation paths share this conversation's serial admission lane. */
export class ConversationWorkspaceService {
  private initializing: Promise<void> | undefined
  private initialized = false
  private readonly locks = new Map<string, Promise<void>>()
  private readonly queues = new Map<string, TurnQueue>()
  private readonly admissions = new Map<string, PendingAdmission>()
  private readonly claims = new Map<string, PendingClaim>()
  private readonly attachments: WorkspaceAttachmentStore
  private readonly db: () => MainDatabase

  constructor(private readonly options: WorkspaceServiceOptions = {}) {
    this.db = options.getDb ?? (() => databaseModule.getDb())
    this.attachments = options.attachments ?? new WorkspaceAttachmentStore()
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initializing) return this.initializing
    this.initializing = (async () => {
      const db = this.db()
      await scheduleDbWrite('conversation.workspace.restore', async () => {
        await db.transaction(async (tx) => {
          const workspaces = await tx.select().from(conversationWorkspaces)
          for (const workspace of workspaces) {
            const active = workspace.activeTurnId
            const [pending] = await tx
              .select({ id: conversationQueuedInputs.id })
              .from(conversationQueuedInputs)
              .where(eq(conversationQueuedInputs.conversationId, workspace.conversationId))
              .limit(1)
            if (!active && !pending) continue
            await tx
              .update(conversationWorkspaces)
              .set({
                queueHeld: true,
                ...(active
                  ? { status: 'interrupted', activeTurnId: null, runId: null, pendingRunJson: null }
                  : {}),
                revision: workspace.revision + 1,
                updatedAt: Date.now()
              })
              .where(eq(conversationWorkspaces.conversationId, workspace.conversationId))
            if (active) {
              await tx
                .update(conversationWorkspaceReceipts)
                .set({ status: 'interrupted', updatedAt: Date.now() })
                .where(
                  and(
                    eq(conversationWorkspaceReceipts.conversationId, workspace.conversationId),
                    eq(conversationWorkspaceReceipts.id, active)
                  )
                )
              const rows = await tx
                .select()
                .from(conversationMessages)
                .where(
                  and(
                    eq(conversationMessages.conversationId, workspace.conversationId),
                    eq(conversationMessages.status, 'streaming')
                  )
                )
              for (const row of rows) {
                const meta = parseMeta(row.meta)
                await tx
                  .update(conversationMessages)
                  .set({
                    status: 'failed',
                    meta: JSON.stringify({
                      ...meta,
                      outcome: 'interrupted',
                      errorCode: 'WORKSPACE_TURN_INTERRUPTED'
                    })
                  })
                  .where(
                    and(
                      eq(conversationMessages.conversationId, workspace.conversationId),
                      eq(conversationMessages.id, row.id)
                    )
                  )
              }
            }
          }
        })
      })
      this.initialized = true
    })().finally(() => {
      this.initializing = undefined
    })
    return this.initializing
  }

  private async serial<T>(conversationId: string, operation: () => Promise<T>): Promise<T> {
    await this.initialize()
    const previous = this.locks.get(conversationId) ?? Promise.resolve()
    let unlock!: () => void
    const held = new Promise<void>((resolve) => {
      unlock = resolve
    })
    const tail = previous.then(() => held)
    this.locks.set(conversationId, tail)
    await previous
    try {
      return await operation()
    } finally {
      unlock()
      if (this.locks.get(conversationId) === tail) this.locks.delete(conversationId)
    }
  }

  private async validate(
    settings: ConversationWorkspaceSettings,
    projectId: string | null
  ): Promise<void> {
    if (projectId !== null) {
      const project = await getProject(projectId)
      if (!project || project.archived) throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
      const root = await realpath(project.rootPath).catch(() => '')
      if (!root || root !== project.rootPath || !(await stat(root)).isDirectory())
        throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
    }
    if (settings.mode === 'agent') {
      if (!settings.profileId) throw new Error('WORKSPACE_PROFILE_UNAVAILABLE')
      const profile = await aiOrchestratorStore.getProfile(settings.profileId)
      if (!profile?.enabled) throw new Error('WORKSPACE_PROFILE_UNAVAILABLE')
    }
    await this.options.validateSettings?.(settings)
  }

  private async workspaceRow(conversationId: string) {
    const [row] = await this.db()
      .select()
      .from(conversationWorkspaces)
      .where(eq(conversationWorkspaces.conversationId, conversationId))
    return row
  }

  private async queue(conversationId: string): Promise<TurnQueue> {
    const existing = this.queues.get(conversationId)
    if (existing) return existing
    const store: QueueStore = {
      listAll: async () =>
        (
          await this.db()
            .select()
            .from(conversationQueuedInputs)
            .where(eq(conversationQueuedInputs.conversationId, conversationId))
            .orderBy(asc(conversationQueuedInputs.position))
        ).map((row) => ({
          id: row.id,
          sessionId: conversationId,
          content: inputSchema.parse(JSON.parse(row.inputJson)).text,
          inputHash: row.inputHash,
          createdAt: row.createdAt,
          ...(row.priority === null ? {} : { priority: row.priority }),
          payload: inputSchema.parse(JSON.parse(row.inputJson))
        })),
      push: async (record) => {
        const input = inputSchema.parse(record.payload)
        const admission = this.admissions.get(key(conversationId, record.id))
        if (!admission) throw new Error('WORKSPACE_STALE_TURN')
        const db = this.db()
        await scheduleDbWrite('conversation.workspace.enqueue', () =>
          db.transaction(async (tx) => {
            const [conversation] = await tx
              .select()
              .from(conversations)
              .where(eq(conversations.id, conversationId))
            if (!conversation) {
              if (!admission.create) throw new Error('WORKSPACE_NOT_FOUND')
              await tx.insert(conversations).values({
                id: conversationId,
                title: admission.create.title,
                projectId: admission.create.projectId,
                createdAt: Date.now(),
                updatedAt: Date.now()
              })
              await tx.insert(conversationWorkspaces).values({
                conversationId,
                settingsJson: JSON.stringify(input.settings),
                updatedAt: Date.now()
              })
            }
            const pending = await tx
              .select({ id: conversationQueuedInputs.id })
              .from(conversationQueuedInputs)
              .where(eq(conversationQueuedInputs.conversationId, conversationId))
            if (pending.length >= MAX_PENDING) throw new Error('WORKSPACE_QUEUE_FULL')
            const [position] = await tx
              .select({
                value: sql<number>`coalesce(max(${conversationQueuedInputs.position}), -1)`
              })
              .from(conversationQueuedInputs)
              .where(eq(conversationQueuedInputs.conversationId, conversationId))
            for (const attachment of admission.attachments)
              await tx.insert(conversationAttachments).values(attachment)
            await tx.insert(conversationQueuedInputs).values({
              id: input.id,
              conversationId,
              inputJson: JSON.stringify(input),
              inputHash: record.inputHash,
              position: Number(position?.value ?? -1) + 1,
              createdAt: input.createdAt
            })
            await tx.insert(conversationWorkspaceReceipts).values({
              conversationId,
              id: input.id,
              inputHash: record.inputHash,
              status: 'queued',
              createdAt: input.createdAt,
              updatedAt: input.createdAt
            })
            await tx
              .update(conversationWorkspaces)
              .set({ revision: sql`${conversationWorkspaces.revision} + 1`, updatedAt: Date.now() })
              .where(eq(conversationWorkspaces.conversationId, conversationId))
            await tx
              .insert(conversationSyncState)
              .values({ conversationId, dirtyAt: Date.now(), deletedAt: null })
              .onConflictDoUpdate({
                target: conversationSyncState.conversationId,
                set: { dirtyAt: Date.now(), deletedAt: null }
              })
          })
        )
      },
      remove: async (id) => {
        const claim = this.claims.get(key(conversationId, id))
        const db = this.db()
        return scheduleDbWrite('conversation.workspace.dequeue', () =>
          db.transaction(async (tx) => {
            const [row] = await tx
              .select()
              .from(conversationQueuedInputs)
              .where(
                and(
                  eq(conversationQueuedInputs.conversationId, conversationId),
                  eq(conversationQueuedInputs.id, id)
                )
              )
            if (!row) return false
            if (claim) {
              const [workspace] = await tx
                .select()
                .from(conversationWorkspaces)
                .where(eq(conversationWorkspaces.conversationId, conversationId))
              if (!workspace || workspace.queueHeld || workspace.activeTurnId)
                throw new Error('WORKSPACE_BUSY')
              const messages = await tx
                .select()
                .from(conversationMessages)
                .where(eq(conversationMessages.conversationId, conversationId))
                .orderBy(asc(conversationMessages.seq))
              const nextSeq = (messages.at(-1)?.seq ?? -1) + 1
              if (claim.input.retryOfMessageId) {
                const last = messages.at(-1)
                if (
                  !last ||
                  last.id !== claim.input.retryOfMessageId ||
                  last.role !== 'assistant' ||
                  last.status !== 'failed'
                )
                  throw new Error('WORKSPACE_STALE_TURN')
                await tx
                  .delete(conversationMessages)
                  .where(
                    and(
                      eq(conversationMessages.conversationId, conversationId),
                      eq(conversationMessages.id, last.id)
                    )
                  )
                claim.assistant.seq = last.seq
                await tx
                  .insert(conversationMessages)
                  .values(messageRow(conversationId, claim.assistant))
              } else {
                let seq = nextSeq
                if (!messages.length && claim.input.lead) {
                  await tx.insert(conversationMessages).values({
                    conversationId,
                    id: `lead-${id}`,
                    role: 'assistant',
                    content: claim.input.lead.text,
                    status: 'complete',
                    meta: JSON.stringify({ leadNote: claim.input.lead.note }),
                    seq: seq++,
                    createdAt: Date.now()
                  })
                }
                claim.user.seq = seq++
                claim.assistant.seq = seq
                await tx
                  .insert(conversationMessages)
                  .values([
                    messageRow(conversationId, claim.user),
                    messageRow(conversationId, claim.assistant)
                  ])
                for (const attachment of claim.input.attachments ?? []) {
                  await tx.insert(conversationMessageAttachments).values({
                    conversationId,
                    messageId: claim.user.id,
                    attachmentId: attachment.id
                  })
                }
              }
              if (claim.input.answersToolCallId) {
                for (const message of messages) {
                  const meta = parseMeta(message.meta)
                  const parts = Array.isArray(meta?.parts) ? meta.parts : []
                  let changed = false
                  for (const part of parts)
                    if (
                      part &&
                      typeof part === 'object' &&
                      'type' in part &&
                      part.type === 'tool-call' &&
                      'id' in part &&
                      part.id === claim.input.answersToolCallId
                    ) {
                      Object.assign(part, { submitted: true })
                      changed = true
                    }
                  if (changed)
                    await tx
                      .update(conversationMessages)
                      .set({ meta: JSON.stringify(meta) })
                      .where(
                        and(
                          eq(conversationMessages.conversationId, conversationId),
                          eq(conversationMessages.id, message.id)
                        )
                      )
                }
              }
              await tx
                .update(conversationWorkspaces)
                .set({
                  status: 'running',
                  activeTurnId: id,
                  runId: null,
                  pendingRunJson: null,
                  settingsJson: JSON.stringify(claim.input.settings),
                  revision: sql`${conversationWorkspaces.revision} + 1`,
                  updatedAt: Date.now()
                })
                .where(eq(conversationWorkspaces.conversationId, conversationId))
            }
            if (claim)
              await tx
                .insert(conversationSyncState)
                .values({ conversationId, dirtyAt: Date.now(), deletedAt: null })
                .onConflictDoUpdate({
                  target: conversationSyncState.conversationId,
                  set: { dirtyAt: Date.now(), deletedAt: null }
                })
            await tx
              .delete(conversationQueuedInputs)
              .where(
                and(
                  eq(conversationQueuedInputs.conversationId, conversationId),
                  eq(conversationQueuedInputs.id, id)
                )
              )
            await tx
              .update(conversationWorkspaceReceipts)
              .set({ status: claim ? 'running' : 'removed', updatedAt: Date.now() })
              .where(
                and(
                  eq(conversationWorkspaceReceipts.conversationId, conversationId),
                  eq(conversationWorkspaceReceipts.id, id)
                )
              )
            await tx
              .update(conversations)
              .set({ updatedAt: Date.now() })
              .where(eq(conversations.id, conversationId))
            await tx
              .update(conversationWorkspaces)
              .set({ revision: sql`${conversationWorkspaces.revision} + 1`, updatedAt: Date.now() })
              .where(eq(conversationWorkspaces.conversationId, conversationId))
            return true
          })
        )
      },
      prioritize: async (id) => {
        const db = this.db()
        await scheduleDbWrite('conversation.workspace.promote', () =>
          db.transaction(async (tx) => {
            const [maximum] = await tx
              .select({
                value: sql<number>`coalesce(max(${conversationQueuedInputs.priority}), 0)`
              })
              .from(conversationQueuedInputs)
              .where(eq(conversationQueuedInputs.conversationId, conversationId))
            await tx
              .update(conversationQueuedInputs)
              .set({ priority: Number(maximum?.value ?? 0) + 1 })
              .where(
                and(
                  eq(conversationQueuedInputs.conversationId, conversationId),
                  eq(conversationQueuedInputs.id, id),
                  isNull(conversationQueuedInputs.priority)
                )
              )
            await tx
              .update(conversationWorkspaces)
              .set({ revision: sql`${conversationWorkspaces.revision} + 1`, updatedAt: Date.now() })
              .where(eq(conversationWorkspaces.conversationId, conversationId))
          })
        )
      },
      reorder: async (id, direction) => {
        const db = this.db()
        return scheduleDbWrite('conversation.workspace.reorder', () =>
          db.transaction(async (tx) => {
            const rows = await tx
              .select()
              .from(conversationQueuedInputs)
              .where(
                and(
                  eq(conversationQueuedInputs.conversationId, conversationId),
                  isNull(conversationQueuedInputs.priority)
                )
              )
              .orderBy(asc(conversationQueuedInputs.position))
            const index = rows.findIndex((row) => row.id === id)
            const neighbour = rows[index + (direction === 'up' ? -1 : 1)]
            const current = rows[index]
            if (!current || !neighbour) return false
            await tx
              .update(conversationQueuedInputs)
              .set({ position: neighbour.position })
              .where(
                and(
                  eq(conversationQueuedInputs.conversationId, conversationId),
                  eq(conversationQueuedInputs.id, current.id)
                )
              )
            await tx
              .update(conversationQueuedInputs)
              .set({ position: current.position })
              .where(
                and(
                  eq(conversationQueuedInputs.conversationId, conversationId),
                  eq(conversationQueuedInputs.id, neighbour.id)
                )
              )
            await tx
              .update(conversationWorkspaces)
              .set({ revision: sql`${conversationWorkspaces.revision} + 1`, updatedAt: Date.now() })
              .where(eq(conversationWorkspaces.conversationId, conversationId))
            return true
          })
        )
      }
    }
    const queue = new TurnQueue(store, MAX_PENDING)
    await queue.restore()
    const workspace = await this.workspaceRow(conversationId)
    if (!workspace?.queueHeld) queue.resume(conversationId)
    this.queues.set(conversationId, queue)
    return queue
  }

  private async readState(conversationId: string): Promise<ConversationWorkspaceState | null> {
    const conversation = await getConversation(conversationId)
    if (!conversation) return null
    let row = await this.workspaceRow(conversationId)
    if (!row) {
      const last = [...conversation.messages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.meta)
      const settings: ConversationWorkspaceSettings = {
        ...DEFAULT_SETTINGS,
        ...(typeof last?.meta?.provider === 'string' && typeof last.meta.model === 'string'
          ? { providerId: last.meta.provider, model: last.meta.model }
          : {})
      }
      await scheduleDbWrite('conversation.workspace.initialize-legacy', () =>
        this.db()
          .insert(conversationWorkspaces)
          .values({ conversationId, settingsJson: JSON.stringify(settings), updatedAt: Date.now() })
          .onConflictDoNothing()
      )
      row = await this.workspaceRow(conversationId)
    }
    if (!row) throw new Error('WORKSPACE_NOT_FOUND')
    const links = await this.db()
      .select()
      .from(conversationMessageAttachments)
      .where(eq(conversationMessageAttachments.conversationId, conversationId))
    const assets = await this.db()
      .select()
      .from(conversationAttachments)
      .where(eq(conversationAttachments.conversationId, conversationId))
    const publicAssets = new Map<string, WorkspaceAttachmentRef>()
    for (const asset of assets) publicAssets.set(asset.id, await this.attachments.publicRef(asset))
    const messages: WorkspaceHostMessage[] = conversation.messages.map((message) => ({
      ...message,
      ...(Array.isArray(message.meta?.parts) ? { parts: message.meta.parts } : {}),
      ...(typeof message.meta?.errorCode === 'string'
        ? { error: { code: message.meta.errorCode, detail: '' } }
        : {}),
      attachments: links
        .filter((link) => link.messageId === message.id)
        .flatMap((link) => publicAssets.get(link.attachmentId) ?? [])
    }))
    const queue = await this.queue(conversationId)
    const inputs = queue.list(conversationId).map((record) => ({
      ...inputSchema.parse(record.payload),
      ...(record.priority === undefined ? {} : { priority: 'promoted' as const }),
      attachments: inputSchema
        .parse(record.payload)
        .attachments?.map((ref) => publicAssets.get(ref.id) ?? ref)
    }))
    return {
      conversationId,
      projectId: conversation.projectId,
      settings: settingsSchema.parse(JSON.parse(row.settingsJson)),
      status: row.status as ConversationWorkspaceStatus,
      ...(row.activeTurnId ? { activeTurnId: row.activeTurnId } : {}),
      ...(row.runId ? { runId: row.runId } : {}),
      queueHeld: row.queueHeld,
      queue: inputs,
      messages,
      ...(row.contextJson ? { context: JSON.parse(row.contextJson) } : {}),
      ...(row.pendingRunJson ? { pendingRun: JSON.parse(row.pendingRunJson) } : {}),
      revision: row.revision,
      updatedAt: row.updatedAt
    }
  }

  private async changed(
    conversationId: string,
    contentChanged = false
  ): Promise<ConversationWorkspaceState> {
    const state = await this.readState(conversationId)
    if (!state) throw new Error('WORKSPACE_NOT_FOUND')
    if (contentChanged)
      emitConversationMutation({
        type: 'upsert',
        conversationId,
        updatedAt: state.updatedAt,
        source: 'local'
      })
    this.options.onChanged?.(state)
    return state
  }

  async get(conversationId: string): Promise<ConversationWorkspaceState | null> {
    idSchema.parse(conversationId)
    return this.serial(conversationId, () => this.readState(conversationId))
  }

  async configure(
    conversationId: string,
    input: ConversationWorkspaceSettings
  ): Promise<ConversationWorkspaceState> {
    const settings = settingsSchema.parse(input)
    return this.serial(conversationId, async () => {
      const held = await this.readState(conversationId)
      if (!held) throw new Error('WORKSPACE_NOT_FOUND')
      if (settings.mode !== held.settings.mode && held.messages.length)
        throw new Error('WORKSPACE_MODE_REQUIRES_FORK')
      await this.validate(settings, held.projectId)
      await scheduleDbWrite('conversation.workspace.configure', () =>
        this.db()
          .update(conversationWorkspaces)
          .set({
            settingsJson: JSON.stringify(settings),
            revision: sql`${conversationWorkspaces.revision} + 1`,
            updatedAt: Date.now()
          })
          .where(eq(conversationWorkspaces.conversationId, conversationId))
      )
      return this.changed(conversationId)
    })
  }

  async enqueue(raw: WorkspaceSubmitRequest): Promise<WorkspaceSubmitResult> {
    const request = submitSchema.parse(raw)
    if (
      !isContextInputProviderSafe(
        [request.text, request.lead?.text, request.lead?.note].filter(Boolean).join('\n')
      )
    )
      throw new Error('WORKSPACE_INPUT_INVALID')
    return this.serial(request.conversationId, async () => {
      const held = await this.readState(request.conversationId)
      if (!held && !request.create) throw new Error('WORKSPACE_NOT_FOUND')
      const projectId = held?.projectId ?? request.create?.projectId ?? null
      if (held && request.create && held.projectId !== request.create.projectId)
        throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
      const settings = request.settings ?? held?.settings ?? DEFAULT_SETTINGS
      if (held?.messages.length && settings.mode !== held.settings.mode)
        throw new Error('WORKSPACE_MODE_REQUIRES_FORK')
      await this.validate(settings, projectId)
      if (request.retryOfMessageId) {
        const last = held?.messages.at(-1)
        if (
          held?.activeTurnId ||
          !last ||
          last.id !== request.retryOfMessageId ||
          last.role !== 'assistant' ||
          last.status !== 'failed'
        )
          throw new Error('WORKSPACE_STALE_TURN')
      }
      const digest = createHash('sha256')
        .update(
          JSON.stringify({
            ...request,
            attachments: request.attachments?.map((attachment) => ({
              type: attachment.type,
              name: attachment.name,
              digest: createHash('sha256').update(attachment.dataUrl).digest('hex')
            }))
          })
        )
        .digest('hex')
      const [receipt] = await this.db()
        .select()
        .from(conversationWorkspaceReceipts)
        .where(
          and(
            eq(conversationWorkspaceReceipts.conversationId, request.conversationId),
            eq(conversationWorkspaceReceipts.id, request.id)
          )
        )
      if (receipt) {
        if (receipt.inputHash !== digest) throw new Error('WORKSPACE_STALE_TURN')
        return { disposition: 'duplicate', state: (await this.readState(request.conversationId))! }
      }
      const queue = await this.queue(request.conversationId)
      if (queue.size(request.conversationId) >= MAX_PENDING) throw new Error('WORKSPACE_QUEUE_FULL')
      const stored = await this.attachments.persist(
        request.conversationId,
        request.attachments ?? []
      )
      let refs = stored.map((asset) => ({
        id: asset.id,
        kind: 'image' as const,
        mimeType: asset.mimeType,
        size: asset.size,
        ...(asset.name ? { name: asset.name } : {})
      }))
      if (request.retryOfMessageId) {
        const previousUser = [...(held?.messages ?? [])]
          .reverse()
          .find((message) => message.role === 'user')
        refs = previousUser?.attachments?.map(({ previewUrl: _preview, ...ref }) => ref) ?? []
      }
      const input: WorkspaceQueuedInput = {
        id: request.id,
        conversationId: request.conversationId,
        text: request.text,
        settings,
        projectId,
        createdAt: Date.now(),
        ...(refs.length ? { attachments: refs } : {}),
        ...(request.lead ? { lead: request.lead } : {}),
        ...(request.retryOfMessageId ? { retryOfMessageId: request.retryOfMessageId } : {}),
        ...(request.answersToolCallId ? { answersToolCallId: request.answersToolCallId } : {})
      }
      this.admissions.set(key(request.conversationId, request.id), {
        create: held ? undefined : request.create,
        attachments: stored
      })
      try {
        await queue.push({
          id: input.id,
          sessionId: request.conversationId,
          content: input.text,
          inputHash: digest,
          createdAt: input.createdAt,
          payload: input
        })
      } catch (error) {
        await this.attachments.remove(stored)
        throw error
      } finally {
        this.admissions.delete(key(request.conversationId, request.id))
      }
      return { disposition: 'queued', state: await this.changed(request.conversationId, !held) }
    })
  }

  async takeNext(conversationId: string): Promise<WorkspaceAdmittedTurn | undefined> {
    return this.serial(conversationId, async () => {
      const state = await this.readState(conversationId)
      if (!state || state.queueHeld || state.activeTurnId) return undefined
      const queue = await this.queue(conversationId)
      const record = queue.peek(conversationId)
      if (!record) return undefined
      const input = inputSchema.parse(record.payload)
      await this.validate(input.settings, input.projectId)
      if (input.projectId !== state.projectId) throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
      const now = Date.now()
      const previousUser = input.retryOfMessageId
        ? [...state.messages].reverse().find((message) => message.role === 'user')
        : undefined
      const user: StoredConversationMessage = previousUser ?? {
        id: `user-${input.id}`,
        role: 'user',
        content: input.text,
        status: 'complete',
        seq: 0,
        createdAt: now
      }
      const assistant: StoredConversationMessage = {
        id: `assistant-${input.id}`,
        role: 'assistant',
        content: '',
        status: 'streaming',
        meta: { turnId: input.id },
        seq: 0,
        createdAt: now
      }
      this.claims.set(key(conversationId, input.id), { input, user, assistant })
      try {
        await queue.shift(conversationId)
      } finally {
        this.claims.delete(key(conversationId, input.id))
      }
      await this.changed(conversationId, true)
      return { input, user, assistant, context: state.context }
    })
  }

  async patchExecution(
    conversationId: string,
    turnId: string,
    patch: WorkspaceExecutionProjection
  ): Promise<ConversationWorkspaceState> {
    return this.serial(conversationId, async () => {
      const row = await this.workspaceRow(conversationId)
      if (!row || row.activeTurnId !== turnId) throw new Error('WORKSPACE_STALE_TURN')
      await scheduleDbWrite('conversation.workspace.projection', () =>
        this.db()
          .update(conversationWorkspaces)
          .set({
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.runId ? { runId: patch.runId } : {}),
            ...(patch.pendingRun === undefined
              ? {}
              : {
                  pendingRunJson:
                    patch.pendingRun === null ? null : JSON.stringify(patch.pendingRun)
                }),
            ...(patch.context ? { contextJson: JSON.stringify(patch.context) } : {}),
            revision: sql`${conversationWorkspaces.revision} + 1`,
            updatedAt: Date.now()
          })
          .where(eq(conversationWorkspaces.conversationId, conversationId))
      )
      return this.changed(conversationId)
    })
  }

  async mutateMessages(
    conversationId: string,
    turnId: string,
    mutate: (messages: StoredConversationMessage[]) => void
  ): Promise<ConversationWorkspaceState> {
    return this.serial(conversationId, async () => {
      const row = await this.workspaceRow(conversationId)
      const conversation = await getConversation(conversationId)
      if (!row || !conversation || row.activeTurnId !== turnId)
        throw new Error('WORKSPACE_STALE_TURN')
      const originals = new Map(
        conversation.messages.map((message) => [
          message.id,
          {
            content: message.content,
            status: message.status,
            meta: message.meta ? JSON.stringify(message.meta) : null
          }
        ])
      )
      mutate(conversation.messages)
      await scheduleDbWrite('conversation.workspace.messages', () =>
        this.db().transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(conversationWorkspaces)
            .where(eq(conversationWorkspaces.conversationId, conversationId))
          if (!current || current.activeTurnId !== turnId) throw new Error('WORKSPACE_STALE_TURN')
          for (const message of conversation.messages) {
            const meta = message.meta ? JSON.stringify(message.meta) : null
            const original = originals.get(message.id)
            if (
              original?.content === message.content &&
              original.status === message.status &&
              original.meta === meta
            )
              continue
            await tx
              .update(conversationMessages)
              .set({ content: message.content, status: message.status, meta })
              .where(
                and(
                  eq(conversationMessages.conversationId, conversationId),
                  eq(conversationMessages.id, message.id)
                )
              )
          }
          await tx
            .update(conversations)
            .set({ updatedAt: Date.now() })
            .where(eq(conversations.id, conversationId))
          await tx
            .update(conversationWorkspaces)
            .set({ revision: sql`${conversationWorkspaces.revision} + 1`, updatedAt: Date.now() })
            .where(eq(conversationWorkspaces.conversationId, conversationId))
          await tx
            .insert(conversationSyncState)
            .values({ conversationId, dirtyAt: Date.now(), deletedAt: null })
            .onConflictDoUpdate({
              target: conversationSyncState.conversationId,
              set: { dirtyAt: Date.now(), deletedAt: null }
            })
        })
      )
      return this.changed(conversationId, true)
    })
  }

  async finishTurn(
    conversationId: string,
    turnId: string,
    status: ConversationWorkspaceStatus
  ): Promise<ConversationWorkspaceState> {
    return this.serial(conversationId, async () => {
      const row = await this.workspaceRow(conversationId)
      if (!row || row.activeTurnId !== turnId) throw new Error('WORKSPACE_STALE_TURN')
      if (status !== 'idle') (await this.queue(conversationId)).hold(conversationId)
      await scheduleDbWrite('conversation.workspace.finish', () =>
        this.db().transaction(async (tx) => {
          await tx
            .update(conversationWorkspaces)
            .set({
              status,
              activeTurnId: null,
              runId: null,
              pendingRunJson: null,
              queueHeld: status === 'idle' ? row.queueHeld : true,
              revision: sql`${conversationWorkspaces.revision} + 1`,
              updatedAt: Date.now()
            })
            .where(eq(conversationWorkspaces.conversationId, conversationId))
          await tx
            .update(conversationWorkspaceReceipts)
            .set({ status: status === 'idle' ? 'completed' : status, updatedAt: Date.now() })
            .where(
              and(
                eq(conversationWorkspaceReceipts.conversationId, conversationId),
                eq(conversationWorkspaceReceipts.id, turnId)
              )
            )
        })
      )
      return this.changed(conversationId)
    })
  }

  async pause(
    conversationId: string,
    idleStatus: ConversationWorkspaceStatus = 'cancelled'
  ): Promise<ConversationWorkspaceState> {
    return this.serial(conversationId, async () => {
      const row = await this.workspaceRow(conversationId)
      if (!row) throw new Error('WORKSPACE_NOT_FOUND')
      ;(await this.queue(conversationId)).hold(conversationId)
      await scheduleDbWrite('conversation.workspace.pause', () =>
        this.db()
          .update(conversationWorkspaces)
          .set({
            queueHeld: true,
            ...(row.activeTurnId ? {} : { status: idleStatus }),
            revision: sql`${conversationWorkspaces.revision} + 1`,
            updatedAt: Date.now()
          })
          .where(eq(conversationWorkspaces.conversationId, conversationId))
      )
      return this.changed(conversationId)
    })
  }

  async resume(conversationId: string): Promise<ConversationWorkspaceState> {
    return this.serial(conversationId, async () => {
      const row = await this.workspaceRow(conversationId)
      if (!row) throw new Error('WORKSPACE_NOT_FOUND')
      if (row.activeTurnId) throw new Error('WORKSPACE_BUSY')
      await scheduleDbWrite('conversation.workspace.resume', () =>
        this.db()
          .update(conversationWorkspaces)
          .set({
            queueHeld: false,
            status: 'idle',
            revision: sql`${conversationWorkspaces.revision} + 1`,
            updatedAt: Date.now()
          })
          .where(eq(conversationWorkspaces.conversationId, conversationId))
      )
      ;(await this.queue(conversationId)).resume(conversationId)
      return this.changed(conversationId)
    })
  }

  async removeQueued(conversationId: string, queueId: string): Promise<ConversationWorkspaceState> {
    return this.serial(conversationId, async () => {
      await (await this.queue(conversationId)).remove(conversationId, queueId)
      return this.changed(conversationId)
    })
  }
  async reorderQueued(
    conversationId: string,
    queueId: string,
    direction: 'up' | 'down'
  ): Promise<ConversationWorkspaceState> {
    if (direction !== 'up' && direction !== 'down') throw new Error('WORKSPACE_INPUT_INVALID')
    return this.serial(conversationId, async () => {
      await (await this.queue(conversationId)).reorder(conversationId, queueId, direction)
      return this.changed(conversationId)
    })
  }
  async promoteQueued(
    conversationId: string,
    queueId: string
  ): Promise<ConversationWorkspaceState> {
    return this.serial(conversationId, async () => {
      await (await this.queue(conversationId)).promote(conversationId, queueId)
      return this.changed(conversationId)
    })
  }

  async getModelAttachments(input: WorkspaceQueuedInput): Promise<IntelligenceMessageAttachment[]> {
    const refs = input.attachments ?? []
    if (!refs.length) return []
    const records = await this.db()
      .select()
      .from(conversationAttachments)
      .where(
        and(
          eq(conversationAttachments.conversationId, input.conversationId),
          inArray(
            conversationAttachments.id,
            refs.map((ref) => ref.id)
          )
        )
      )
    if (records.length !== refs.length) throw new Error('WORKSPACE_ATTACHMENT_UNSAFE')
    const byId = new Map(records.map((record) => [record.id, record]))
    return Promise.all(refs.map((ref) => this.attachments.toModel(byId.get(ref.id)!)))
  }

  async fork(raw: WorkspaceForkRequest): Promise<ConversationWorkspaceState> {
    const request = z
      .object({
        conversationId: idSchema,
        messageId: idSchema.optional(),
        mode: z.enum(['chat', 'agent']).optional()
      })
      .strict()
      .parse(raw)
    return this.serial(request.conversationId, async () => {
      const source = await getConversation(request.conversationId)
      const state = await this.readState(request.conversationId)
      if (!source || !state) throw new Error('WORKSPACE_NOT_FOUND')
      if (state.activeTurnId) throw new Error('WORKSPACE_FORK_BUSY')
      let prefix = source.messages
      if (request.messageId) {
        const index = prefix.findIndex((message) => message.id === request.messageId)
        const anchor = prefix[index]
        if (!anchor || anchor.role !== 'assistant' || anchor.status !== 'complete')
          throw new Error('WORKSPACE_FORK_ANCHOR_INVALID')
        prefix = prefix.slice(0, index + 1)
      }
      if (prefix.some((message) => message.status === 'streaming'))
        throw new Error('WORKSPACE_FORK_ANCHOR_INVALID')
      const pointer = await getLocalAiCliSessionForConversation(source.id)
      if (pointer && request.messageId) throw new Error('WORKSPACE_FORK_NATIVE_UNSAFE')
      const childId = randomUUID()
      const cloned = cloneMessagesForFork(prefix, randomUUID)
      const settings = { ...state.settings, ...(request.mode ? { mode: request.mode } : {}) }
      const completedTurns = new Set(
        prefix
          .filter((message) => message.role === 'assistant' && message.status === 'complete')
          .flatMap((message) =>
            typeof message.meta?.turnId === 'string' ? [message.meta.turnId] : []
          )
      )
      const evidence = await fileReviewService.buildForkEvidenceRows(
        source.id,
        childId,
        completedTurns
      )
      const links = await this.db()
        .select()
        .from(conversationMessageAttachments)
        .where(eq(conversationMessageAttachments.conversationId, source.id))
      const selectedLinks = links.filter((link) => cloned.messageIds.has(link.messageId))
      const assetIds = [...new Set(selectedLinks.map((link) => link.attachmentId))]
      const sourceAssets = assetIds.length
        ? await this.db()
            .select()
            .from(conversationAttachments)
            .where(
              and(
                eq(conversationAttachments.conversationId, source.id),
                inArray(conversationAttachments.id, assetIds)
              )
            )
        : []
      if (sourceAssets.length !== assetIds.length) throw new Error('WORKSPACE_FORK_ANCHOR_INVALID')
      const copiedAssets: StoredWorkspaceAttachment[] = []
      let native: PreparedPiNativeFork | undefined
      try {
        for (const asset of sourceAssets)
          copiedAssets.push(await this.attachments.clone(asset, childId))
        if (pointer) {
          const root = source.projectId
            ? (await getProject(source.projectId))?.rootPath
            : getLocalAiCliWorkspaceRoot()
          if (!root) throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
          native = await preparePiNativeFork(pointer, await realpath(root))
        }
        const assetMap = new Map(
          sourceAssets.map((asset, index) => [asset.id, copiedAssets[index]!.id])
        )
        const now = Date.now()
        await scheduleDbWrite('conversation.workspace.fork', () =>
          this.db().transaction(async (tx) => {
            const [current] = await tx
              .select()
              .from(conversationWorkspaces)
              .where(eq(conversationWorkspaces.conversationId, source.id))
            if (!current || current.activeTurnId || current.revision !== state.revision)
              throw new Error('WORKSPACE_FORK_BUSY')
            await tx.insert(conversations).values({
              id: childId,
              projectId: source.projectId,
              title: source.title,
              createdAt: now,
              updatedAt: now
            })
            if (cloned.messages.length)
              await tx
                .insert(conversationMessages)
                .values(
                  cloned.messages.map((message, seq) => messageRow(childId, { ...message, seq }))
                )
            await tx.insert(conversationWorkspaces).values({
              conversationId: childId,
              settingsJson: JSON.stringify(settings),
              updatedAt: now
            })
            for (const asset of copiedAssets) await tx.insert(conversationAttachments).values(asset)
            for (const relation of selectedLinks)
              await tx.insert(conversationMessageAttachments).values({
                conversationId: childId,
                messageId: cloned.messageIds.get(relation.messageId)!,
                attachmentId: assetMap.get(relation.attachmentId)!
              })
            if (evidence.length) await tx.insert(conversationFileReviews).values(evidence)
            if (native && pointer)
              await tx.insert(localAiCliSessions).values({
                ...pointer,
                id: randomUUID(),
                conversationId: childId,
                nativeSessionId: native.nativeSessionId,
                expectedHeadId: native.expectedHeadId,
                origin: 'tuff',
                state: 'available',
                createdAt: now,
                updatedAt: now,
                lastSeenAt: now
              })
            await tx
              .insert(conversationSyncState)
              .values({ conversationId: childId, dirtyAt: now, deletedAt: null })
            await native?.verifySource()
          })
        )
        return await this.changed(childId, true)
      } catch (error) {
        await this.attachments.remove(copiedAssets)
        await native?.cleanup()
        throw error
      } finally {
        native?.release()
      }
    })
  }

  async withIdleConversation<T>(conversationId: string, operation: () => Promise<T>): Promise<T> {
    return this.serial(conversationId, async () => {
      const row = await this.workspaceRow(conversationId)
      if (row?.activeTurnId) throw new Error('WORKSPACE_BUSY')
      return operation()
    })
  }

  async cleanup(conversationId: string): Promise<void> {
    await this.serial(conversationId, async () => {
      const [existing] = await this.db()
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
      if (existing) return
      await this.attachments.cleanupOwner(conversationId)
      this.queues.delete(conversationId)
    })
  }
}

function key(conversationId: string, id: string): string {
  return `${conversationId}\0${id}`
}
function parseMeta(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined
  const parsed: unknown = JSON.parse(value)
  return z.record(z.string(), z.unknown()).parse(parsed)
}
function messageRow(conversationId: string, message: StoredConversationMessage) {
  return {
    id: message.id,
    conversationId,
    role: message.role,
    content: message.content,
    status: message.status,
    meta: message.meta ? JSON.stringify(message.meta) : null,
    seq: message.seq,
    createdAt: message.createdAt
  }
}
