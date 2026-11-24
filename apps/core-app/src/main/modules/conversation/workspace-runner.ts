import type {
  ConversationWorkspaceState,
  WorkspaceContextProjection,
  WorkspaceHostMessage,
  WorkspaceMessageUpdate,
  WorkspaceRunDecisionRequest,
  WorkspaceSubmitRequest,
  WorkspaceSubmitResult,
  WorkspaceUpdateQueuedRequest
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { FileReviewRollbackAuthority } from './file-review-service'
import type { FileReviewRollbackResult } from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceMessageAttachment,
  IntelligenceStreamEvent,
  IntelligenceUsageInfo
} from '@talex-touch/utils/types/intelligence'
import type { PiRuntimeRunEvent } from '../ai/pi-agent-runtime-protocol'
import type { MessageUpdateEvent } from '@talex-touch/pi-desktop-reuse/message-stream'
import type { UiMessage } from '@talex-touch/pi-desktop-reuse/types/message-stream'
import type { WorkspaceAdmittedTurn, WorkspaceTurnRecoveryContext } from './workspace-service'
import { realpath, stat } from 'node:fs/promises'
import { z } from 'zod'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  mergeMessageUpdates,
  STREAM_COALESCE_INTERVAL_MS,
  toWireMessageUpdate
} from '@talex-touch/pi-desktop-reuse/message-stream'
import { isAutoResumeOnStartupEnabled } from '../ai/auto-resume-setting'
import { ensureIntelligenceConfigLoaded } from '../ai/intelligence-config'
import { getProviderModelOptions } from '../ai/intelligence-provider-model-options'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { applyHomeConversationInjection } from '../ai/home-conversation-injection'
import { intelligenceContextExecutionService } from '../ai/intelligence-context-execution'
import { contextHygieneService } from '../ai/intelligence-context-hygiene'
import { markHomeChatInvoke } from '../ai/intelligence-invoke-purpose'
import { aiCliOrchestrator } from '../ai/ai-cli-orchestrator'
import { aiOrchestratorStore } from '../ai/ai-orchestrator-store'
import { sanitizeToolOutputForRuntime } from '../ai/pi-agent-runtime-host'
import { resolveConversationWorkspaceRoot } from '../local-ai-cli/workspace-root'
import { getProject } from '../project/project-store'
import { toolGatewayModule } from '../tool-gateway'
import { voiceKeptRecordings } from '../voice/voice-kept-recordings'
import { getConversation } from './conversation-store'
import { fileReviewService } from './file-review-service'
import { ConversationWorkspaceService } from './workspace-service'
import { WorkspaceMessageAssembler } from './workspace-message-assembler'

const log = getLogger('conversation-workspace')
const PERSIST_INTERVAL_MS = 250
const RECOVERY_CONTINUATION_BYTE_LIMIT = 8 * 1024
const RECOVERY_TRUNCATION_NOTICE = '\n[truncated]'

interface SteerHistoryEntry {
  role: 'user' | 'assistant'
  text: string
  createdAt: number
}

/**
 * Expands a completed assistant message that absorbed mid-turn steer parts into chronological
 * assistant/user segments so subsequent turns keep full awareness of mid-turn user guidance.
 */
function expandMessageWithSteers(message: {
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  meta?: Record<string, unknown>
}): SteerHistoryEntry[] {
  if (message.role !== 'assistant' || !Array.isArray(message.meta?.parts)) {
    return [{ role: message.role, text: message.content, createdAt: message.createdAt }]
  }
  const parts = message.meta.parts
  const hasSteer = parts.some(
    (part) =>
      part !== null &&
      typeof part === 'object' &&
      'type' in part &&
      part.type === 'steer' &&
      'text' in part &&
      typeof part.text === 'string' &&
      part.text.length > 0
  )
  if (!hasSteer) {
    return [{ role: 'assistant', text: message.content, createdAt: message.createdAt }]
  }
  const expanded: SteerHistoryEntry[] = []
  let buffer = ''
  const flushAssistant = () => {
    if (buffer.trim()) {
      expanded.push({ role: 'assistant', text: buffer, createdAt: message.createdAt })
    }
    buffer = ''
  }
  for (const part of parts) {
    if (!part || typeof part !== 'object' || !('type' in part)) continue
    if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
      buffer += part.text
    } else if (
      part.type === 'steer' &&
      'text' in part &&
      typeof part.text === 'string' &&
      part.text.trim()
    ) {
      flushAssistant()
      const createdAt =
        'createdAt' in part && typeof part.createdAt === 'number'
          ? part.createdAt
          : message.createdAt
      expanded.push({ role: 'user', text: part.text, createdAt })
    }
  }
  flushAssistant()
  return expanded.length > 0
    ? expanded
    : [{ role: message.role, text: message.content, createdAt: message.createdAt }]
}

/**
 * Extracts only user steer entries that were already consumed during a failed or cancelled
 * assistant turn, so subsequent turns preserve that guidance without replaying failed output.
 */
function extractConsumedSteerEntries(message: {
  role: 'user' | 'assistant'
  createdAt: number
  meta?: Record<string, unknown>
}): SteerHistoryEntry[] {
  if (message.role !== 'assistant' || !Array.isArray(message.meta?.parts)) return []
  const entries: SteerHistoryEntry[] = []
  for (const part of message.meta.parts) {
    if (
      part &&
      typeof part === 'object' &&
      'type' in part &&
      part.type === 'steer' &&
      'text' in part &&
      typeof part.text === 'string' &&
      part.text.trim()
    ) {
      const createdAt =
        'createdAt' in part && typeof part.createdAt === 'number'
          ? part.createdAt
          : message.createdAt
      entries.push({ role: 'user', text: part.text, createdAt })
    }
  }
  return entries
}

const contextSummarySchema = z
  .object({
    tokenBudget: z.number().nonnegative(),
    tokenEstimate: z.number().nonnegative(),
    sourceTypes: z.array(z.string()),
    turnId: z.string(),
    sessionId: z.string().optional(),
    packageId: z.string().optional(),
    scope: z.string().optional(),
    checkpoint: z.object({ id: z.string(), type: z.string() }).optional()
  })
  .passthrough()
const providerResponseSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    reasoningEffort: z.unknown().optional(),
    usageReported: z.boolean(),
    usage: z
      .object({
        promptTokens: z.number(),
        completionTokens: z.number(),
        totalTokens: z.number(),
        cacheReadTokens: z.number().optional()
      })
      .optional()
  })
  .passthrough()

export interface WorkspaceRunnerOptions {
  onChanged: (state: ConversationWorkspaceState) => void
  onMessageUpdate: (update: WorkspaceMessageUpdate) => void
  autoResumeOnStartup?: boolean | (() => boolean)
}

export interface WorkspaceStartupRecoveryResult {
  enabled: boolean
  resumedTurns: string[]
  resumedQueues: string[]
  interruptedTurns: string[]
}

interface ExecutionSlot {
  conversationId: string
  controller: AbortController
  turn?: WorkspaceAdmittedTurn
  assembler?: WorkspaceMessageAssembler
  task?: Promise<void>
  runId?: string
  pendingApproval: boolean
  ended: boolean
  userPaused?: boolean
  shuttingDown?: boolean
  seq: number
  queuedFrame?: MessageUpdateEvent
  frameTimer?: NodeJS.Timeout
  lastPersist: number
  pendingWrites: Promise<void>
  steerSyncGeneration?: number
  context: WorkspaceContextProjection
}

/** No new model engine: this controller owns admission and delegates to existing runtimes. */
export class ConversationWorkspaceRunner {
  readonly service: ConversationWorkspaceService
  private readonly slots = new Map<string, ExecutionSlot>()
  private readonly deleting = new Set<string>()
  private readonly rollbacks = new Map<string, Set<Promise<FileReviewRollbackResult>>>()
  private closing = false
  private recoveryPromise: Promise<WorkspaceStartupRecoveryResult> | undefined

  constructor(private readonly options: WorkspaceRunnerOptions) {
    this.service = new ConversationWorkspaceService({
      validateSettings: async (settings) => {
        ensureIntelligenceConfigLoaded()
        if (!settings.providerId && !settings.model) return
        const provider = getProviderModelOptions().find(
          (option) => option.providerId === settings.providerId
        )
        if (
          !provider ||
          !provider.available ||
          (settings.model && !provider.models.includes(settings.model))
        ) {
          throw new Error('WORKSPACE_PROVIDER_UNAVAILABLE')
        }
      },
      onChanged: (state) => options.onChanged(state),
      autoResumeOnStartup: options.autoResumeOnStartup ?? isAutoResumeOnStartupEnabled,
      resolveVoiceRecording: (recordingId) => voiceKeptRecordings.get(recordingId)?.path ?? null,
      releaseVoiceRecording: (recordingId) => voiceKeptRecordings.discard(recordingId)
    })
  }

  private isAutoResumeEnabled(): boolean {
    const opt = this.options.autoResumeOnStartup
    if (typeof opt === 'function') {
      try {
        return Boolean(opt())
      } catch {
        return true
      }
    }
    if (typeof opt === 'boolean') return opt
    return isAutoResumeOnStartupEnabled()
  }

  private launchSlotExecution(slot: ExecutionSlot): void {
    slot.task = this.execute(slot).catch(async (error) => {
      if (slot.ended || slot.pendingApproval || slot.shuttingDown) return
      const detail = error instanceof Error && error.message ? error.message : String(error)
      log.error('Workspace execution failed', {
        conversationId: slot.conversationId,
        turnId: slot.turn?.input.id,
        error: detail
      })
      await this.end(
        slot,
        slot.controller.signal.aborted ? 'WORKSPACE_TURN_CANCELLED' : 'WORKSPACE_EXECUTION_FAILED',
        slot.controller.signal.aborted ? 'cancelled' : 'failed',
        slot.controller.signal.aborted ? undefined : detail
      )
    })
    // Keep a rejection observer even if durable storage itself fails during the
    // error projection; it cannot become an unhandled background rejection.
    void slot.task.catch(() => {
      log.error('Workspace execution state could not be persisted')
    })
  }

  private async ensureDisabledRecoveryFinalized(): Promise<void> {
    if (this.isAutoResumeEnabled()) return
    await this.service.initialize({ autoResumeOnStartup: false })
    await this.service.finalizeDisabledRecovery()
  }

  async recoverOnStartup(): Promise<WorkspaceStartupRecoveryResult> {
    if (this.recoveryPromise) return this.recoveryPromise
    if (this.closing) {
      return {
        enabled: this.isAutoResumeEnabled(),
        resumedTurns: [],
        resumedQueues: [],
        interruptedTurns: []
      }
    }
    this.recoveryPromise = this.performStartupRecovery()
    return this.recoveryPromise
  }

  private async performStartupRecovery(): Promise<WorkspaceStartupRecoveryResult> {
    const enabled = this.isAutoResumeEnabled()
    await this.service.initialize({ autoResumeOnStartup: enabled })
    if (this.closing) {
      return {
        enabled,
        resumedTurns: [],
        resumedQueues: [],
        interruptedTurns: this.service.listStartupInterruptedConversations()
      }
    }
    if (!enabled) {
      const interruptedTurns = await this.service.finalizeDisabledRecovery()
      return {
        enabled: false,
        resumedTurns: [],
        resumedQueues: [],
        interruptedTurns
      }
    }

    const { activeConversationIds, queuedConversationIds } =
      await this.service.listRecoverableConversations()
    const resumedTurns: string[] = []
    const resumedQueues: string[] = []

    for (const conversationId of activeConversationIds) {
      if (this.closing || this.deleting.has(conversationId) || this.slots.has(conversationId))
        continue
      const slot: ExecutionSlot = {
        conversationId,
        controller: new AbortController(),
        pendingApproval: false,
        ended: false,
        seq: 0,
        lastPersist: 0,
        pendingWrites: Promise.resolve(),
        context: {}
      }
      this.slots.set(conversationId, slot)
      let claimedTurn: WorkspaceAdmittedTurn | undefined
      try {
        const turn = await this.service.claimRecoverableTurn(conversationId, {
          canCommit: () => !this.closing && !slot.shuttingDown && !slot.userPaused
        })
        if (!turn) {
          if (this.slots.get(conversationId) === slot) this.slots.delete(conversationId)
          if (slot.userPaused || slot.controller.signal.aborted) {
            await this.service
              .pause(conversationId, 'cancelled', { cancelUnclaimedActive: true })
              .catch(() => undefined)
          }
          continue
        }
        claimedTurn = turn
        if (slot.userPaused || slot.controller.signal.aborted) {
          slot.ended = true
          if (this.slots.get(conversationId) === slot) this.slots.delete(conversationId)
          await this.service
            .pause(conversationId, 'cancelled', { cancelUnclaimedActive: true })
            .catch(() => undefined)
          continue
        }
        if (this.closing || slot.shuttingDown) {
          slot.ended = true
          if (this.slots.get(conversationId) === slot) this.slots.delete(conversationId)
          await this.service
            .releaseUnstartedRecoveryClaim(
              conversationId,
              turn.input.id,
              Math.max(0, (turn.recovery?.attempt ?? 1) - 1)
            )
            .catch(() => undefined)
          continue
        }
        slot.turn = turn
        slot.context = turn.context ?? {}
        slot.assembler = new WorkspaceMessageAssembler(turn.assistant, turn.input.id, {
          preserveInitial: true
        })
        this.snapshot(slot)
        this.launchSlotExecution(slot)
        resumedTurns.push(conversationId)
      } catch (error) {
        if (claimedTurn) {
          await this.service
            .interruptClaimedTurn(conversationId, claimedTurn.input.id)
            .catch(() => undefined)
        }
        if (this.slots.get(conversationId) === slot) this.slots.delete(conversationId)
        log.warn('Failed to resume interrupted workspace turn on startup', {
          conversationId,
          error
        })
      }
    }

    for (const conversationId of queuedConversationIds) {
      if (this.closing || this.deleting.has(conversationId) || this.slots.has(conversationId))
        continue
      const started = await this.kick(conversationId).catch((error) => {
        log.warn('Queued workspace input could not be resumed on startup', {
          conversationId,
          error
        })
        return undefined
      })
      if (started) resumedQueues.push(conversationId)
    }

    return {
      enabled: true,
      resumedTurns,
      resumedQueues,
      interruptedTurns: this.service.listStartupInterruptedConversations()
    }
  }

  async submit(request: WorkspaceSubmitRequest): Promise<WorkspaceSubmitResult> {
    if (this.closing || this.deleting.has(request.conversationId)) throw new Error('WORKSPACE_BUSY')
    await this.ensureDisabledRecoveryFinalized()
    const canDirect =
      !this.slots.has(request.conversationId) &&
      (await this.service.canStartDirectly(request.conversationId))

    if (canDirect) {
      const slot: ExecutionSlot = {
        conversationId: request.conversationId,
        controller: new AbortController(),
        pendingApproval: false,
        ended: false,
        seq: 0,
        lastPersist: 0,
        pendingWrites: Promise.resolve(),
        context: {}
      }
      this.slots.set(request.conversationId, slot)
      try {
        const result = await this.service.admitDirectly(request)
        if (result.disposition === 'duplicate') {
          this.slots.delete(request.conversationId)
          return result
        }
        if (this.closing || slot.shuttingDown) {
          slot.ended = true
          if (this.slots.get(request.conversationId) === slot)
            this.slots.delete(request.conversationId)
          return {
            disposition: 'started',
            state: result.state
          }
        }
        const { turn } = result
        slot.turn = turn
        slot.context = turn.context ?? {}
        slot.assembler = new WorkspaceMessageAssembler(turn.assistant, turn.input.id)
        this.snapshot(slot)
        this.launchSlotExecution(slot)
        return {
          disposition: 'started',
          state: (await this.service.get(request.conversationId))!
        }
      } catch (error) {
        this.slots.delete(request.conversationId)
        if (error instanceof Error && error.message !== 'WORKSPACE_BUSY') throw error
      }
    }

    const result = await this.service.enqueue(request)
    if (result.disposition === 'duplicate') return result
    const started = await this.kick(request.conversationId)
    if (started !== request.id) {
      await this.syncActiveRunSteers(request.conversationId)
    }
    return {
      disposition: started === request.id ? 'started' : 'queued',
      state: (await this.service.get(request.conversationId))!
    }
  }

  private async syncActiveRunSteers(conversationId: string): Promise<void> {
    const slot = this.slots.get(conversationId)
    if (!slot || slot.ended || slot.shuttingDown || !slot.runId) return
    const runId = slot.runId
    const syncGen = (slot.steerSyncGeneration ?? 0) + 1
    slot.steerSyncGeneration = syncGen

    const state = await this.service.get(conversationId)
    if (
      this.slots.get(conversationId) !== slot ||
      slot.ended ||
      slot.shuttingDown ||
      slot.runId !== runId ||
      slot.steerSyncGeneration !== syncGen
    ) {
      return
    }
    if (!state || state.queueHeld) {
      aiCliOrchestrator.syncRunSteers?.(runId, [])
      return
    }
    const steerInputs = state.queue.filter((item) => item.deliveryMode === 'steer')
    const readySteers: Array<{ id: string; text: string; createdAt: number }> = []
    const attachmentsById = new Map<string, IntelligenceMessageAttachment[]>()
    for (const item of steerInputs) {
      if (item.attachments?.length) {
        try {
          const resolved = await this.service.getModelAttachments(item)
          attachmentsById.set(item.id, resolved)
        } catch (error) {
          // Do not publish an attachment-bearing steer as text-only if its images fail to load;
          // retain it in the queue so it is never silently consumed without its attachments.
          log.warn('Skipping mid-turn steer with unresolved attachments', {
            meta: {
              conversationId,
              steerId: item.id,
              reason: error instanceof Error ? error.message : String(error)
            }
          })
          continue
        }
      } else {
        attachmentsById.set(item.id, [])
      }
      readySteers.push({
        id: item.id,
        text: item.text,
        createdAt: item.createdAt
      })
    }
    if (
      this.slots.get(conversationId) !== slot ||
      slot.ended ||
      slot.shuttingDown ||
      slot.runId !== runId ||
      slot.steerSyncGeneration !== syncGen
    ) {
      return
    }
    aiCliOrchestrator.syncRunSteers?.(runId, readySteers, attachmentsById)
  }

  async removeQueued(conversationId: string, queueId: string): Promise<ConversationWorkspaceState> {
    const state = await this.service.removeQueued(conversationId, queueId)
    await this.syncActiveRunSteers(conversationId)
    return state
  }

  async reorderQueued(
    conversationId: string,
    queueId: string,
    direction: 'up' | 'down'
  ): Promise<ConversationWorkspaceState> {
    const state = await this.service.reorderQueued(conversationId, queueId, direction)
    await this.syncActiveRunSteers(conversationId)
    return state
  }

  async promoteQueued(
    conversationId: string,
    queueId: string
  ): Promise<ConversationWorkspaceState> {
    const state = await this.service.promoteQueued(conversationId, queueId)
    await this.syncActiveRunSteers(conversationId)
    return state
  }

  async updateQueued(request: WorkspaceUpdateQueuedRequest): Promise<ConversationWorkspaceState> {
    const state = await this.service.updateQueued(request)
    await this.syncActiveRunSteers(request.conversationId)
    return state
  }

  private async kick(conversationId: string): Promise<string | undefined> {
    if (this.closing || this.deleting.has(conversationId) || this.slots.has(conversationId))
      return undefined
    await this.ensureDisabledRecoveryFinalized()
    if (this.closing || this.deleting.has(conversationId) || this.slots.has(conversationId))
      return undefined
    const slot: ExecutionSlot = {
      conversationId,
      controller: new AbortController(),
      pendingApproval: false,
      ended: false,
      seq: 0,
      lastPersist: 0,
      pendingWrites: Promise.resolve(),
      context: {}
    }
    this.slots.set(conversationId, slot)
    try {
      const turn = await this.service.takeNext(conversationId)
      if (!turn) {
        this.slots.delete(conversationId)
        return undefined
      }
      if (this.closing || slot.shuttingDown) {
        slot.ended = true
        if (this.slots.get(conversationId) === slot) this.slots.delete(conversationId)
        return turn.input.id
      }
      slot.turn = turn
      slot.context = turn.context ?? {}
      slot.assembler = new WorkspaceMessageAssembler(turn.assistant, turn.input.id)
      this.snapshot(slot)
      this.launchSlotExecution(slot)
      return turn.input.id
    } catch (error) {
      this.slots.delete(conversationId)
      await this.service.pause(conversationId, 'failed')
      throw error
    }
  }

  private async execute(slot: ExecutionSlot): Promise<void> {
    if (!slot.turn || !slot.assembler) throw new Error('WORKSPACE_STALE_TURN')
    if (slot.controller.signal.aborted) {
      if (!slot.shuttingDown) await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
      return
    }
    if (slot.turn.input.settings.mode === 'agent') await this.executeAgent(slot)
    else await this.executeChat(slot)
  }

  private wireMessage(slot: ExecutionSlot, full = true): UiMessage {
    const snapshot = slot.assembler!.snapshot()
    const errorDetail =
      typeof snapshot.meta?.errorDetail === 'string' ? snapshot.meta.errorDetail : ''
    const host: WorkspaceHostMessage = {
      ...snapshot,
      parts: Array.isArray(snapshot.meta?.parts) ? snapshot.meta.parts : undefined,
      ...(typeof snapshot.meta?.errorCode === 'string'
        ? { error: { code: snapshot.meta.errorCode, detail: errorDetail } }
        : {})
    }
    return {
      id: snapshot.id,
      role: snapshot.role,
      content: full ? snapshot.content : '',
      createdAt: new Date(snapshot.createdAt).toISOString(),
      status: snapshot.status === 'failed' ? 'error' : snapshot.status,
      ...(typeof snapshot.meta?.provider === 'string'
        ? { providerId: snapshot.meta.provider }
        : {}),
      ...(typeof snapshot.meta?.model === 'string' ? { modelId: snapshot.meta.model } : {}),
      ...(full ? { host } : {}),
      ...(typeof snapshot.meta?.errorCode === 'string'
        ? { error: { code: snapshot.meta.errorCode, detail: errorDetail } }
        : {})
    }
  }

  private emit(slot: ExecutionSlot, update: MessageUpdateEvent): void {
    if (!slot.turn || slot.ended) return
    this.options.onMessageUpdate({
      conversationId: slot.conversationId,
      turnId: slot.turn.input.id,
      seq: ++slot.seq,
      update
    })
  }

  private flushFrame(slot: ExecutionSlot): void {
    clearTimeout(slot.frameTimer)
    slot.frameTimer = undefined
    const update = slot.queuedFrame
    slot.queuedFrame = undefined
    if (update) this.emit(slot, update)
  }

  private delta(slot: ExecutionSlot, text?: string, thinking?: string): void {
    const update = toWireMessageUpdate({
      type: 'message_update',
      message: this.wireMessage(slot, false),
      ...(text ? { deltaText: text } : {}),
      ...(thinking ? { deltaThinking: thinking } : {})
    })
    slot.queuedFrame = slot.queuedFrame ? mergeMessageUpdates(slot.queuedFrame, update) : update
    if (!slot.frameTimer)
      slot.frameTimer = setTimeout(() => this.flushFrame(slot), STREAM_COALESCE_INTERVAL_MS)
  }

  private snapshot(slot: ExecutionSlot): void {
    this.flushFrame(slot)
    this.emit(slot, { type: 'message_update', message: this.wireMessage(slot) })
  }

  private async persist(slot: ExecutionSlot, force = false): Promise<void> {
    if (!slot.turn || !slot.assembler || slot.ended) return
    const now = Date.now()
    if (!force && now - slot.lastPersist < PERSIST_INTERVAL_MS) return
    slot.lastPersist = now
    const snapshot = slot.assembler.snapshot()
    const turnId = slot.turn.input.id
    slot.pendingWrites = slot.pendingWrites.then(async () => {
      await this.service.mutateMessages(slot.conversationId, turnId, (messages) => {
        const index = messages.findIndex((message) => message.id === snapshot.id)
        if (index < 0) throw new Error('WORKSPACE_STALE_TURN')
        messages[index] = snapshot
      })
    })
    await slot.pendingWrites
  }

  private async projectContext(
    slot: ExecutionSlot,
    event: IntelligenceStreamEvent<string>
  ): Promise<void> {
    const summary = contextSummarySchema.safeParse(event.metadata?.contextExecution)
    if (summary.success) {
      slot.context.package = {
        tokenBudget: summary.data.tokenBudget,
        tokenEstimate: summary.data.tokenEstimate,
        sourceTypes: summary.data.sourceTypes,
        sessionId: summary.data.sessionId,
        packageId: summary.data.packageId,
        scope: summary.data.scope,
        preparedAt: Date.now(),
        turnId: slot.turn!.input.id
      }
      if (
        summary.data.checkpoint &&
        !slot.context.checkpoints?.some((item) => item.id === summary.data.checkpoint!.id)
      )
        slot.context.checkpoints = [
          ...(slot.context.checkpoints ?? []),
          { id: summary.data.checkpoint.id, type: summary.data.checkpoint.type }
        ].slice(-100)
    }
    const part = event.partEvent
    if (part?.kind === 'compaction-start' || part?.kind === 'compaction-end') {
      slot.context.compactions = [
        ...(slot.context.compactions ?? []),
        {
          turnId: slot.turn!.input.id,
          phase: part.kind === 'compaction-start' ? ('start' as const) : ('end' as const),
          at: Date.now(),
          ...(part.kind === 'compaction-start' && part.reason ? { reason: part.reason } : {})
        }
      ].slice(-100)
    }
    if (summary.success || part?.kind === 'compaction-start' || part?.kind === 'compaction-end') {
      await this.service.patchExecution(slot.conversationId, slot.turn!.input.id, {
        context: slot.context
      })
    }
  }

  private async prepareContext(
    slot: ExecutionSlot,
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions & { signal?: AbortSignal }
  ) {
    const prepared = await intelligenceContextExecutionService.prepareWorkspaceTurn(
      payload,
      options,
      {
        conversationId: slot.conversationId,
        turnId: slot.turn!.input.id,
        sessionId: slot.context.package?.sessionId
      }
    )
    await this.projectContext(slot, {
      type: 'start',
      capabilityId: 'text.chat',
      metadata: { contextExecution: prepared.summary }
    })
    return prepared
  }

  private async executeChat(slot: ExecutionSlot): Promise<void> {
    const turn = slot.turn!
    const conversation = await getConversation(slot.conversationId)
    if (!conversation || conversation.projectId !== turn.input.projectId)
      throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
    const relevant = conversation.messages.filter(
      (message) =>
        message.status === 'complete' ||
        (message.status === 'failed' && message.role === 'assistant')
    )
    const firstUser = relevant.findIndex(
      (message) => message.status === 'complete' && message.role === 'user'
    )
    const lead = relevant
      .slice(0, firstUser < 0 ? relevant.length : firstUser)
      .filter((message) => message.status === 'complete')
    const messages: IntelligenceChatPayload['messages'] = relevant
      .slice(firstUser < 0 ? relevant.length : firstUser)
      .flatMap((message) =>
        (message.status === 'complete'
          ? expandMessageWithSteers(message)
          : extractConsumedSteerEntries(message)
        ).map((entry) => ({
          role: entry.role,
          content: entry.text
        }))
      )
    if (lead.length) {
      const note = lead
        .map((message) =>
          typeof message.meta?.leadNote === 'string'
            ? message.meta.leadNote
            : `At the start of this conversation you said to the user: "${message.content}"`
        )
        .join('\n\n')
      messages.unshift({ role: 'system', content: note })
    }
    const attachments = await this.service.getModelAttachments(turn.input)
    const lastUser = messages.findLast((message) => message.role === 'user')
    if (lastUser && attachments.length) lastUser.attachments = attachments
    const continuationNote = turn.recovery
      ? buildRecoveryContinuationPrompt(turn.recovery, false)
      : null
    if (continuationNote) {
      const insertAt = messages.findIndex((message) => message.role !== 'system')
      messages.splice(insertAt < 0 ? messages.length : insertAt, 0, {
        role: 'system',
        content: continuationNote
      })
    }
    const options: IntelligenceInvokeOptions & { signal: AbortSignal } = markHomeChatInvoke(
      {
        ...(turn.input.settings.providerId
          ? { preferredProviderId: turn.input.settings.providerId }
          : {}),
        ...(turn.input.settings.model ? { modelPreference: [turn.input.settings.model] } : {}),
        ...(turn.input.settings.reasoningEffort && turn.input.settings.reasoningEffort !== 'auto'
          ? { reasoningEffort: turn.input.settings.reasoningEffort }
          : {}),
        metadata: {
          surface: 'home-conversation',
          operation: 'home-conversation',
          conversationId: slot.conversationId,
          projectId: turn.input.projectId,
          requestId: turn.input.id,
          autoContext: turn.input.settings.autoContext !== false
        },
        signal: slot.controller.signal
      },
      { conversationId: slot.conversationId, turnId: turn.input.id }
    )
    ensureIntelligenceConfigLoaded()
    const payload = await applyHomeConversationInjection({ messages }, options, false)
    const prepared = await this.prepareContext(slot, payload, options)
    let nativeStarted = false
    try {
      for await (const event of tuffIntelligence.stream<string>(
        'text.chat',
        prepared.payload,
        prepared.options
      )) {
        if (slot.controller.signal.aborted) break
        if (event.type === 'start' && event.provider === 'pi-cli') nativeStarted = true
        slot.assembler!.applyStream(event)
        await this.projectContext(slot, event)
        if (event.type === 'delta' && event.delta) this.delta(slot, event.delta)
        else if (event.type === 'part' && event.partEvent?.kind === 'reasoning-delta')
          this.delta(slot, undefined, event.partEvent.delta)
        else this.snapshot(slot)
        await this.persist(slot, event.partEvent?.kind === 'message-commit')
      }
    } catch (error) {
      if (slot.controller.signal.aborted) {
        if (!slot.shuttingDown) await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
        return
      }
      // Preserve the existing no-activity fallback, never a second billable request
      // after a native session, text, tool or usage has already been observed.
      if (nativeStarted || slot.assembler!.hasProviderActivity) throw error
      const result = await tuffIntelligence.invoke<string>(
        'text.chat',
        prepared.payload,
        prepared.options
      )
      if (slot.controller.signal.aborted) {
        if (!slot.shuttingDown) await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
        return
      }
      slot.assembler!.applyStream({
        type: 'start',
        capabilityId: 'text.chat',
        provider: result.provider,
        model: result.model,
        reasoningEffort: result.reasoningEffort
      })
      if (result.usageReported && result.usage) slot.assembler!.recordUsage(result.usage)
      slot.assembler!.complete(result.result)
    }
    if (slot.controller.signal.aborted) {
      if (!slot.shuttingDown) await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
    } else {
      slot.assembler!.complete()
      await this.complete(slot)
    }
  }

  private async executeAgent(slot: ExecutionSlot): Promise<void> {
    const turn = slot.turn!
    const conversation = await getConversation(slot.conversationId)
    if (!conversation || conversation.projectId !== turn.input.projectId)
      throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
    const profile = await aiOrchestratorStore.getProfile(turn.input.settings.profileId!)
    if (!profile?.enabled) throw new Error('WORKSPACE_PROFILE_UNAVAILABLE')
    const project = turn.input.projectId ? await getProject(turn.input.projectId) : null
    if (turn.input.projectId && (!project || project.archived))
      throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
    const defaultRoot =
      project?.rootPath ?? (await resolveConversationWorkspaceRoot(conversation.id))
    const root = await realpath(defaultRoot)
    if (!(await stat(root)).isDirectory()) throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
    const history = conversation.messages
      .filter(
        (message) =>
          message.id !== turn.user.id &&
          (message.status === 'complete' ||
            (message.status === 'failed' && message.role === 'assistant'))
      )
      .flatMap((message) =>
        message.status === 'complete'
          ? expandMessageWithSteers(message)
          : extractConsumedSteerEntries(message)
      )
    const allowedToolIds = [...profile.allowedToolIds]
    const modelAttachments = await this.service.getModelAttachments(turn.input)
    const prepared = await this.prepareContext(
      slot,
      { messages: [{ role: 'user', content: turn.input.text }] },
      {
        signal: slot.controller.signal
      }
    )
    const continuationBlock = turn.recovery
      ? buildRecoveryContinuationPrompt(turn.recovery, true)
      : null
    const baseObjective = prepared.payload.messages.at(-1)!.content
    const objective = continuationBlock ? `${baseObjective}\n\n${continuationBlock}` : baseObjective
    await aiCliOrchestrator.executeWorkspace(
      {
        objective,
        profileId: profile.id,
        sessionId: slot.conversationId,
        cwd: root,
        allowedToolIds
      },
      {
        conversationId: slot.conversationId,
        turnId: turn.input.id,
        projectId: turn.input.projectId,
        providerId: turn.input.settings.providerId,
        model: turn.input.settings.model,
        ...(turn.input.settings.reasoningEffort && turn.input.settings.reasoningEffort !== 'auto'
          ? { reasoningEffort: turn.input.settings.reasoningEffort }
          : {}),
        history,
        modelAttachments,
        assertAuthority: async () => {
          const current = await getConversation(slot.conversationId)
          const currentProfile = await aiOrchestratorStore.getProfile(profile.id)
          if (
            !current ||
            current.projectId !== turn.input.projectId ||
            !currentProfile?.enabled ||
            currentProfile.updatedAt !== profile.updatedAt
          ) {
            throw new Error('WORKSPACE_PROFILE_UNAVAILABLE')
          }
          if (project) {
            const currentProject = await getProject(project.id)
            if (
              !currentProject ||
              currentProject.archived ||
              (await realpath(currentProject.rootPath)) !== root
            )
              throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
          }
          if (slot.controller.signal.aborted) throw new Error('WORKSPACE_TURN_CANCELLED')
        },
        onRunCreated: async (run) => {
          slot.runId = run.id
          await this.service.patchExecution(slot.conversationId, turn.input.id, {
            runId: run.id,
            status: 'running'
          })
          if (slot.controller.signal.aborted) {
            if (slot.shuttingDown) {
              try {
                aiCliOrchestrator.cancel?.(run.id)
              } catch {
                // Best-effort cancellation during graceful shutdown.
              }
            } else {
              await aiCliOrchestrator.cancelPersistedRun(run.id)
            }
          }
        },
        onRunActive: async (runId) => {
          slot.runId = runId
          await this.syncActiveRunSteers(slot.conversationId)
        },
        onEvent: (event) => this.agentEvent(slot, event),
        onRunResult: async (run, failureDetail) => {
          if (slot.ended) return
          if (run.status === 'pending_approval') {
            slot.pendingApproval = true
            await this.persist(slot, true)
            await this.service.patchExecution(slot.conversationId, turn.input.id, {
              status: 'pending_approval',
              runId: run.id,
              pendingRun: {
                runId: run.id,
                profileId: run.profileId,
                approvalReason: run.approvalReason,
                requestedAt: run.updatedAt
              }
            })
            return
          }
          if (run.status === 'completed') {
            slot.pendingApproval = false
            slot.assembler!.complete(run.output)
            await this.complete(slot)
            return
          }
          if (slot.shuttingDown) return
          await this.end(
            slot,
            run.error ?? 'WORKSPACE_EXECUTION_FAILED',
            run.status === 'cancelled'
              ? 'cancelled'
              : run.status === 'interrupted'
                ? 'interrupted'
                : 'failed',
            run.status === 'failed' ? failureDetail : undefined
          )
        }
      }
    )
  }

  private async agentEvent(slot: ExecutionSlot, event: PiRuntimeRunEvent): Promise<void> {
    if (!slot.turn || !slot.assembler || slot.ended) return
    const payload = event.payload ?? {}
    const readString = (key: string): string | undefined =>
      typeof payload[key] === 'string' ? payload[key] : undefined
    if (event.type === 'provider_response') {
      const response = providerResponseSchema.safeParse(payload)
      if (response.success) {
        slot.assembler.applyStream({
          type: 'start',
          capabilityId: 'text.chat',
          provider: response.data.provider,
          model: response.data.model,
          ...(response.data.reasoningEffort
            ? {
                reasoningEffort: response.data
                  .reasoningEffort as IntelligenceStreamEvent<string>['reasoningEffort']
              }
            : {})
        })
        if (response.data.usageReported && response.data.usage)
          slot.assembler.recordUsage(response.data.usage as IntelligenceUsageInfo)
      }
    } else if (event.type === 'message_update') {
      const update = payload.assistantMessageEvent
      if (
        update &&
        typeof update === 'object' &&
        'type' in update &&
        'delta' in update &&
        typeof update.delta === 'string'
      ) {
        if (update.type === 'text_delta') {
          slot.assembler.delta(update.delta)
          this.delta(slot, update.delta)
        } else if (update.type === 'thinking_delta') {
          slot.assembler.part({ kind: 'reasoning-delta', delta: update.delta })
          this.delta(slot, undefined, update.delta)
        }
      }
    } else if (event.type === 'text' && typeof payload.delta === 'string') {
      slot.assembler.delta(payload.delta)
      this.delta(slot, payload.delta)
    } else if (event.type === 'reasoning' && typeof payload.delta === 'string') {
      slot.assembler.part({ kind: 'reasoning-delta', delta: payload.delta })
      this.delta(slot, undefined, payload.delta)
    } else if (event.type === 'message_end') {
      const message = payload.message
      if (
        message &&
        typeof message === 'object' &&
        'role' in message &&
        message.role === 'assistant' &&
        'stopReason' in message &&
        ['stop', 'length', 'toolUse'].includes(String(message.stopReason))
      )
        slot.assembler.part({ kind: 'message-commit' })
    } else if (event.type === 'tool_execution_start') {
      const id = readString('toolCallId'),
        name = readString('toolName')
      if (id && name) {
        slot.assembler.part({ kind: 'tool-start', callId: id, name })
        slot.assembler.part({ kind: 'tool-input-end', callId: id, input: payload.args })
      }
    } else if (event.type === 'tool_execution_end') {
      const id = readString('toolCallId'),
        name = readString('toolName')
      if (id && name) {
        const output =
          payload.result &&
          typeof payload.result === 'object' &&
          'content' in payload.result &&
          Array.isArray(payload.result.content)
            ? payload.result.content
                .flatMap((block) =>
                  block &&
                  typeof block === 'object' &&
                  'type' in block &&
                  block.type === 'text' &&
                  'text' in block &&
                  typeof block.text === 'string'
                    ? [block.text]
                    : []
                )
                .join('\n')
            : ''
        slot.assembler.part({
          kind: 'tool-result',
          callId: id,
          name,
          output,
          isError: payload.isError === true
        })
      }
    } else if (event.type === 'steer_consumed') {
      const steerId = readString('steerId')
      const text = readString('text')
      const createdAt = typeof payload.createdAt === 'number' ? payload.createdAt : Date.now()
      if (steerId && text) {
        slot.assembler.part({ kind: 'steer-injected', steerId, text, createdAt })
        await slot.pendingWrites
        const snapshot = slot.assembler.snapshot()
        await this.service.consumeSteer(slot.conversationId, slot.turn.input.id, steerId, snapshot)
        slot.lastPersist = Date.now()
      }
      this.snapshot(slot)
      return
    }
    if (event.type !== 'message_update' && event.type !== 'text' && event.type !== 'reasoning')
      this.snapshot(slot)
    await this.persist(slot, event.type === 'message_end' || event.type === 'tool_execution_end')
  }

  private async complete(slot: ExecutionSlot): Promise<void> {
    if (slot.assembler!.snapshot().status === 'failed') {
      await this.end(slot, 'CONVERSATION_EMPTY_RESPONSE', 'failed', undefined, true)
      return
    }
    await this.persist(slot, true)
    this.snapshot(slot)
    await this.service.finishTurn(slot.conversationId, slot.turn!.input.id, 'idle')
    slot.ended = true
    this.slots.delete(slot.conversationId)
    if (!this.closing && !slot.shuttingDown) {
      void this.kick(slot.conversationId).catch(() => {
        log.warn('Next workspace input could not be admitted')
      })
    }
  }

  private async end(
    slot: ExecutionSlot,
    code: string,
    outcome: 'failed' | 'cancelled' | 'interrupted' = 'failed',
    detail?: string,
    allowDuringShutdown = false
  ): Promise<void> {
    if (slot.ended || (!allowDuringShutdown && slot.shuttingDown) || !slot.assembler || !slot.turn)
      return
    slot.assembler.fail(code, outcome, detail)
    await this.persist(slot, true)
    this.snapshot(slot)
    await this.service.finishTurn(slot.conversationId, slot.turn.input.id, outcome)
    slot.ended = true
    this.slots.delete(slot.conversationId)
  }

  async pause(conversationId: string): Promise<ConversationWorkspaceState> {
    const slot = this.slots.get(conversationId)
    if (slot) {
      slot.userPaused = true
      slot.shuttingDown = false
      const state = await this.service.pause(conversationId)
      if (slot.runId) aiCliOrchestrator.syncRunSteers?.(slot.runId, [])
      slot.controller.abort()
      if (slot.runId) await aiCliOrchestrator.cancelPersistedRun(slot.runId)
      if (!slot.pendingApproval) await slot.task
      if (!slot.ended) await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
      return (await this.service.get(conversationId)) ?? state
    }
    return this.service.pause(conversationId, 'cancelled', { cancelUnclaimedActive: true })
  }

  async resume(conversationId: string): Promise<ConversationWorkspaceState> {
    if (this.deleting.has(conversationId)) throw new Error('WORKSPACE_BUSY')
    await this.ensureDisabledRecoveryFinalized()
    await this.service.resume(conversationId)
    await this.kick(conversationId)
    return (await this.service.get(conversationId))!
  }

  async decideRun(
    request: WorkspaceRunDecisionRequest,
    approved: boolean
  ): Promise<ConversationWorkspaceState> {
    const state = await this.service.get(request.conversationId)
    const slot = this.slots.get(request.conversationId)
    const run = await aiCliOrchestrator.getRun(request.runId)
    if (
      !slot ||
      !state ||
      state.pendingRun?.runId !== request.runId ||
      slot.runId !== request.runId ||
      !run ||
      run.sessionId !== request.conversationId ||
      run.status !== 'pending_approval'
    )
      throw new Error('WORKSPACE_RUN_NOT_PENDING')
    if (!approved) return this.pause(request.conversationId)
    slot.pendingApproval = false
    await this.service.patchExecution(request.conversationId, slot.turn!.input.id, {
      status: 'running',
      pendingRun: null
    })
    slot.task = aiCliOrchestrator.approveRun(run.id).then(() => undefined)
    await slot.task
    return (await this.service.get(request.conversationId))!
  }

  async rollback(conversationId: string, reviewId: string): Promise<FileReviewRollbackResult> {
    if (this.deleting.has(conversationId) || this.slots.has(conversationId))
      return { ok: false, code: 'REVIEW_AUTHORITY_CHANGED', review: null, restoredPaths: [] }
    const operation = fileReviewService.rollback(conversationId, reviewId)
    const active =
      this.rollbacks.get(conversationId) ?? new Set<Promise<FileReviewRollbackResult>>()
    active.add(operation)
    this.rollbacks.set(conversationId, active)
    try {
      return await operation
    } finally {
      active.delete(operation)
      if (!active.size) this.rollbacks.delete(conversationId)
    }
  }

  private async reviewedRoot(authority: FileReviewRollbackAuthority): Promise<string | null> {
    if (!authority.projectId)
      return realpath(await resolveConversationWorkspaceRoot(authority.conversationId))
    const project = await getProject(authority.projectId)
    return project && !project.archived ? realpath(project.rootPath) : null
  }

  private async validateRollbackAuthority(
    authority: FileReviewRollbackAuthority
  ): Promise<boolean> {
    if (this.deleting.has(authority.conversationId) || this.slots.has(authority.conversationId))
      throw new Error('REVIEW_AUTHORITY_CHANGED')
    const [conversation, profile, run] = await Promise.all([
      getConversation(authority.conversationId),
      aiOrchestratorStore.getProfile(authority.profileId),
      aiCliOrchestrator.getRun(authority.runId)
    ])
    if (
      !conversation ||
      conversation.projectId !== authority.projectId ||
      !profile?.enabled ||
      profile.updatedAt !== authority.profileVersion ||
      !run ||
      run.profileId !== profile.id ||
      run.sessionId !== conversation.id ||
      (await this.reviewedRoot(authority)) !== authority.canonicalRoot ||
      (await realpath(run.cwd)) !== authority.canonicalRoot ||
      !profile.allowedToolIds.includes(`file.${authority.operation}`)
    )
      throw new Error('REVIEW_AUTHORITY_CHANGED')
    if (
      authority.originalPolicy.mode === 'preauthorized' &&
      authority.requiredPermissions.some(
        (permission) => !authority.originalPolicy.allowedPermissions.includes(permission)
      )
    )
      throw new Error('REVIEW_PERMISSION_DENIED')
    if (
      profile.permissionPolicy.mode === 'preauthorized' &&
      authority.requiredPermissions.some(
        (permission) => !profile.permissionPolicy.allowedPermissions.includes(permission)
      )
    )
      throw new Error('REVIEW_PERMISSION_DENIED')
    if (this.deleting.has(authority.conversationId) || this.slots.has(authority.conversationId))
      throw new Error('REVIEW_AUTHORITY_CHANGED')
    return authority.originalPolicy.mode === 'manual' || profile.permissionPolicy.mode === 'manual'
  }

  async authorizeRollback(authority: FileReviewRollbackAuthority): Promise<() => Promise<void>> {
    const requiresApproval = await this.validateRollbackAuthority(authority)
    if (requiresApproval) {
      const decision = await toolGatewayModule.requestConfirmation(
        {
          tool: 'file.rollback',
          risk: 'write',
          summary: `Restore ${authority.relativePaths.join(', ')}`,
          input: JSON.stringify({ reviewId: authority.reviewId, paths: authority.relativePaths }),
          origin: { conversationId: authority.conversationId, turnId: authority.turnId }
        },
        new AbortController().signal
      )
      if (!decision.approved) throw new Error('REVIEW_PERMISSION_DENIED')
      // A decision is not a lease on the profile/project while its card is open.
      await this.validateRollbackAuthority(authority)
    }
    return async () => {
      await this.validateRollbackAuthority(authority)
    }
  }

  async writeFence(conversationId: string, operation: () => Promise<void>): Promise<void> {
    if (this.deleting.has(conversationId)) throw new Error('WORKSPACE_BUSY')
    await this.service.withIdleConversation(conversationId, operation)
  }

  async deleteFence(conversationId: string, operation: () => Promise<void>): Promise<void> {
    this.deleting.add(conversationId)
    try {
      if (await this.service.get(conversationId)) await this.pause(conversationId)
      await Promise.all(this.rollbacks.get(conversationId) ?? [])
      await this.service.withIdleConversation(conversationId, operation)
      await this.service.cleanup(conversationId)
      await contextHygieneService.cleanupWorkspaceConversation(conversationId)
    } finally {
      this.deleting.delete(conversationId)
    }
  }

  beginShutdown(): void {
    this.closing = true
    for (const slot of this.slots.values()) {
      if (!slot.userPaused) {
        slot.shuttingDown = true
      }
    }
  }

  async close(): Promise<void> {
    this.beginShutdown()
    const entries = [...this.slots.entries()]
    await Promise.all(
      entries.map(async ([conversationId, slot]) => {
        if (slot.userPaused) {
          if (!slot.pendingApproval) await slot.task?.catch(() => undefined)
          if (!slot.ended) {
            await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled').catch(() => undefined)
          }
          return
        }
        slot.shuttingDown = true
        clearTimeout(slot.frameTimer)
        slot.frameTimer = undefined
        await this.persist(slot, true).catch(() => undefined)
        slot.controller.abort()
        if (slot.runId) {
          try {
            aiCliOrchestrator.syncRunSteers?.(slot.runId, [])
            aiCliOrchestrator.cancel?.(slot.runId)
          } catch {
            // Best-effort cancellation of live subprocess during graceful shutdown.
          }
        }
        if (slot.task && !slot.pendingApproval) {
          await slot.task.catch(() => undefined)
        }
        if (!slot.ended) {
          await this.persist(slot, true).catch(() => undefined)
          slot.ended = true
        }
        clearTimeout(slot.frameTimer)
        slot.frameTimer = undefined
        if (this.slots.get(conversationId) === slot) {
          this.slots.delete(conversationId)
        }
      })
    )
  }
}

function boundedUtf8Text(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  const noticeBytes = Buffer.byteLength(RECOVERY_TRUNCATION_NOTICE, 'utf8')
  const budget = Math.max(0, maxBytes - noticeBytes)
  let end = 0
  let bytes = 0
  while (end < value.length) {
    const point = value.codePointAt(end)!
    const width = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
    if (bytes + width > budget) break
    bytes += width
    end += point > 0xffff ? 2 : 1
  }
  return value.slice(0, end) + RECOVERY_TRUNCATION_NOTICE
}

function sanitizeRecoveryText(value: string, sanitize: boolean): string {
  if (!sanitize) return value
  const safe = sanitizeToolOutputForRuntime(value)
  return typeof safe === 'string' ? safe : JSON.stringify(safe ?? '')
}

function summarizePriorToolCalls(priorParts: unknown[] | undefined, sanitize: boolean): string[] {
  if (!Array.isArray(priorParts) || priorParts.length === 0) return []
  const summaries: string[] = []
  for (const part of priorParts) {
    if (!part || typeof part !== 'object' || !('type' in part)) continue
    const record = part as Record<string, unknown>
    if (record.type !== 'tool-call') continue
    const name = typeof record.name === 'string' ? record.name : 'unknown'
    const rawStatus = typeof record.status === 'string' ? record.status : 'unknown'
    const status = rawStatus === 'running' || rawStatus === 'pending' ? 'interrupted' : rawStatus
    const detailSource =
      typeof record.output === 'string' && record.output.trim()
        ? record.output.trim()
        : typeof record.error === 'string' && record.error.trim()
          ? record.error.trim()
          : ''
    const detail = detailSource
      ? `: ${boundedUtf8Text(sanitizeRecoveryText(detailSource, sanitize), 512)}`
      : ''
    summaries.push(`- ${name} (${status})${detail}`)
  }
  return summaries
}

const RECOVERY_TOOL_SUMMARY_BYTE_LIMIT = 2_048
const RECOVERY_TAIL_TRUNCATION_PREFIX = '…[earlier output truncated]\n'

function boundedUtf8Tail(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  const prefixBytes = Buffer.byteLength(RECOVERY_TAIL_TRUNCATION_PREFIX, 'utf8')
  const budget = Math.max(0, maxBytes - prefixBytes)
  if (budget === 0) return boundedUtf8Text(RECOVERY_TAIL_TRUNCATION_PREFIX, maxBytes)
  const chars = Array.from(value)
  let start = chars.length
  let bytes = 0
  while (start > 0) {
    const ch = chars[start - 1]!
    const width = Buffer.byteLength(ch, 'utf8')
    if (bytes + width > budget) break
    bytes += width
    start -= 1
  }
  return RECOVERY_TAIL_TRUNCATION_PREFIX + chars.slice(start).join('')
}

function buildRecoveryContinuationPrompt(
  recovery: WorkspaceTurnRecoveryContext,
  sanitize: boolean
): string | null {
  const priorText = recovery.priorContent.trim()
  const toolSummaries = summarizePriorToolCalls(recovery.priorParts, sanitize)
  if (!priorText && toolSummaries.length === 0) return null

  const header = [
    '[Recovery Continuation]',
    'This turn was interrupted by an application restart or crash before completion. Continue seamlessly from where the response stopped without repeating already-shown output or redoing completed side effects.'
  ].join('\n\n')

  const sections: string[] = [header]
  if (toolSummaries.length > 0) {
    const toolHeader = 'Prior tool calls:\n'
    const toolBodyBudget = Math.max(
      0,
      RECOVERY_TOOL_SUMMARY_BYTE_LIMIT - Buffer.byteLength(toolHeader, 'utf8')
    )
    const boundedTools = boundedUtf8Tail(toolSummaries.join('\n'), toolBodyBudget)
    sections.push(`${toolHeader}${boundedTools}`)
  }
  if (priorText) {
    const textHeader = 'Already-shown partial assistant output:\n'
    const usedBytes =
      Buffer.byteLength(sections.join('\n\n'), 'utf8') +
      Buffer.byteLength('\n\n', 'utf8') +
      Buffer.byteLength(textHeader, 'utf8')
    const remainingBudget = Math.max(0, RECOVERY_CONTINUATION_BYTE_LIMIT - usedBytes)
    const sanitizedTail = boundedUtf8Tail(
      sanitizeRecoveryText(priorText, sanitize),
      remainingBudget
    )
    sections.push(`${textHeader}${sanitizedTail}`)
  }
  return boundedUtf8Text(sections.join('\n\n'), RECOVERY_CONTINUATION_BYTE_LIMIT)
}
