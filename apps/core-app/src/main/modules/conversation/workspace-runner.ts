import type {
  ConversationWorkspaceState,
  WorkspaceContextProjection,
  WorkspaceHostMessage,
  WorkspaceMessageUpdate,
  WorkspaceRunDecisionRequest,
  WorkspaceSubmitRequest,
  WorkspaceSubmitResult
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { FileReviewRollbackAuthority } from './file-review-service'
import type { FileReviewRollbackResult } from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceStreamEvent,
  IntelligenceUsageInfo
} from '@talex-touch/utils/types/intelligence'
import type { PiRuntimeRunEvent } from '../ai/pi-agent-runtime-protocol'
import type { MessageUpdateEvent } from '@talex-touch/pi-desktop-reuse/message-stream'
import type { UiMessage } from '@talex-touch/pi-desktop-reuse/types/message-stream'
import type { WorkspaceAdmittedTurn } from './workspace-service'
import { realpath, stat } from 'node:fs/promises'
import { app } from 'electron'
import { z } from 'zod'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  mergeMessageUpdates,
  STREAM_COALESCE_INTERVAL_MS,
  toWireMessageUpdate
} from '@talex-touch/pi-desktop-reuse/message-stream'
import { ensureIntelligenceConfigLoaded } from '../ai/intelligence-config'
import { getProviderModelOptions } from '../ai/intelligence-provider-model-options'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { applyHomeConversationInjection } from '../ai/home-conversation-injection'
import { intelligenceContextExecutionService } from '../ai/intelligence-context-execution'
import { contextHygieneService } from '../ai/intelligence-context-hygiene'
import { markHomeChatInvoke } from '../ai/intelligence-invoke-purpose'
import { aiCliOrchestrator } from '../ai/ai-cli-orchestrator'
import { aiOrchestratorStore } from '../ai/ai-orchestrator-store'
import { toolRegistry } from '../ai/agents'
import { getProject } from '../project/project-store'
import { toolGatewayModule } from '../tool-gateway'
import { voiceKeptRecordings } from '../voice/voice-kept-recordings'
import { getConversation } from './conversation-store'
import { fileReviewService } from './file-review-service'
import { ConversationWorkspaceService } from './workspace-service'
import { WorkspaceMessageAssembler } from './workspace-message-assembler'

const log = getLogger('conversation-workspace')
const PERSIST_INTERVAL_MS = 250
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
    usageReported: z.boolean(),
    usage: z
      .object({ promptTokens: z.number(), completionTokens: z.number(), totalTokens: z.number() })
      .optional()
  })
  .passthrough()

export interface WorkspaceRunnerOptions {
  onChanged: (state: ConversationWorkspaceState) => void
  onMessageUpdate: (update: WorkspaceMessageUpdate) => void
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
  seq: number
  queuedFrame?: MessageUpdateEvent
  frameTimer?: NodeJS.Timeout
  lastPersist: number
  pendingWrites: Promise<void>
  context: WorkspaceContextProjection
}

/** No new model engine: this controller owns admission and delegates to existing runtimes. */
export class ConversationWorkspaceRunner {
  readonly service: ConversationWorkspaceService
  private readonly slots = new Map<string, ExecutionSlot>()
  private readonly deleting = new Set<string>()
  private readonly rollbacks = new Map<string, Set<Promise<FileReviewRollbackResult>>>()
  private closing = false

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
      resolveVoiceRecording: (recordingId) => voiceKeptRecordings.get(recordingId)?.path ?? null,
      releaseVoiceRecording: (recordingId) => voiceKeptRecordings.discard(recordingId)
    })
  }

  async submit(request: WorkspaceSubmitRequest): Promise<WorkspaceSubmitResult> {
    if (this.closing || this.deleting.has(request.conversationId)) throw new Error('WORKSPACE_BUSY')
    const result = await this.service.enqueue(request)
    if (result.disposition === 'duplicate') return result
    const started = await this.kick(request.conversationId)
    return {
      disposition: started === request.id ? 'started' : 'queued',
      state: (await this.service.get(request.conversationId))!
    }
  }

  private async kick(conversationId: string): Promise<string | undefined> {
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
      slot.turn = turn
      slot.context = turn.context ?? {}
      slot.assembler = new WorkspaceMessageAssembler(turn.assistant, turn.input.id)
      this.snapshot(slot)
      slot.task = this.execute(slot).catch(async () => {
        if (slot.ended || slot.pendingApproval) return
        await this.end(
          slot,
          slot.controller.signal.aborted
            ? 'WORKSPACE_TURN_CANCELLED'
            : 'WORKSPACE_EXECUTION_FAILED',
          slot.controller.signal.aborted ? 'cancelled' : 'failed'
        )
      })
      // Keep a rejection observer even if durable storage itself fails during the
      // error projection; it cannot become an unhandled background rejection.
      void slot.task.catch(() => {
        log.error('Workspace execution state could not be persisted')
      })
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
      await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
      return
    }
    if (slot.turn.input.settings.mode === 'agent') await this.executeAgent(slot)
    else await this.executeChat(slot)
  }

  private wireMessage(slot: ExecutionSlot, full = true): UiMessage {
    const snapshot = slot.assembler!.snapshot()
    const host: WorkspaceHostMessage = {
      ...snapshot,
      parts: Array.isArray(snapshot.meta?.parts) ? snapshot.meta.parts : undefined,
      ...(typeof snapshot.meta?.errorCode === 'string'
        ? { error: { code: snapshot.meta.errorCode, detail: '' } }
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
      ...(full ? { host } : {})
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
    const settled = conversation.messages.filter((message) => message.status === 'complete')
    const firstUser = settled.findIndex((message) => message.role === 'user')
    const lead = settled.slice(0, firstUser < 0 ? settled.length : firstUser)
    const messages: IntelligenceChatPayload['messages'] = settled
      .slice(firstUser < 0 ? settled.length : firstUser)
      .map((message) => ({ role: message.role, content: message.content }))
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
        await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
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
        await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
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
    if (slot.controller.signal.aborted)
      await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
    else {
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
    const root = await realpath(project?.rootPath ?? app.getPath('userData'))
    if (!(await stat(root)).isDirectory()) throw new Error('WORKSPACE_PROJECT_UNAVAILABLE')
    const history = conversation.messages
      .filter((message) => message.status === 'complete' && message.id !== turn.user.id)
      .map((message) => ({
        role: message.role,
        text: message.content,
        createdAt: message.createdAt
      }))
    const allowedToolIds = profile.allowedToolIds.filter((id) => {
      if (project) return true
      const tool = toolRegistry.getTool(id)
      return (
        tool &&
        !(tool.permissions ?? []).some((permission) =>
          ['file:read', 'file:write', 'file:delete', 'system:exec'].includes(String(permission))
        )
      )
    })
    const modelAttachments = await this.service.getModelAttachments(turn.input)
    const prepared = await this.prepareContext(
      slot,
      { messages: [{ role: 'user', content: turn.input.text }] },
      {
        signal: slot.controller.signal
      }
    )
    await aiCliOrchestrator.executeWorkspace(
      {
        objective: prepared.payload.messages.at(-1)!.content,
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
          if (slot.controller.signal.aborted) await aiCliOrchestrator.cancelPersistedRun(run.id)
        },
        onEvent: (event) => this.agentEvent(slot, event),
        onRunResult: async (run) => {
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
          } else if (run.status === 'completed') {
            slot.pendingApproval = false
            slot.assembler!.complete(run.output)
            await this.complete(slot)
          } else {
            await this.end(
              slot,
              run.error ?? 'WORKSPACE_EXECUTION_FAILED',
              run.status === 'cancelled'
                ? 'cancelled'
                : run.status === 'interrupted'
                  ? 'interrupted'
                  : 'failed'
            )
          }
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
          model: response.data.model
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
    }
    if (event.type !== 'message_update') this.snapshot(slot)
    await this.persist(slot, event.type === 'message_end' || event.type === 'tool_execution_end')
  }

  private async complete(slot: ExecutionSlot): Promise<void> {
    if (slot.assembler!.snapshot().status === 'failed') {
      await this.end(slot, 'CONVERSATION_EMPTY_RESPONSE')
      return
    }
    await this.persist(slot, true)
    this.snapshot(slot)
    await this.service.finishTurn(slot.conversationId, slot.turn!.input.id, 'idle')
    slot.ended = true
    this.slots.delete(slot.conversationId)
    void this.kick(slot.conversationId).catch(() => {
      log.warn('Next workspace input could not be admitted')
    })
  }

  private async end(
    slot: ExecutionSlot,
    code: string,
    outcome: 'failed' | 'cancelled' | 'interrupted' = 'failed'
  ): Promise<void> {
    if (slot.ended || !slot.assembler || !slot.turn) return
    slot.assembler.fail(code, outcome)
    await this.persist(slot, true)
    this.snapshot(slot)
    await this.service.finishTurn(slot.conversationId, slot.turn.input.id, outcome)
    slot.ended = true
    this.slots.delete(slot.conversationId)
  }

  async pause(conversationId: string): Promise<ConversationWorkspaceState> {
    const state = await this.service.pause(conversationId)
    const slot = this.slots.get(conversationId)
    slot?.controller.abort()
    if (slot?.runId) await aiCliOrchestrator.cancelPersistedRun(slot.runId)
    if (slot && !slot.pendingApproval) await slot.task
    if (slot && !slot.ended) await this.end(slot, 'WORKSPACE_TURN_CANCELLED', 'cancelled')
    return (await this.service.get(conversationId)) ?? state
  }

  async resume(conversationId: string): Promise<ConversationWorkspaceState> {
    if (this.deleting.has(conversationId)) throw new Error('WORKSPACE_BUSY')
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

  private async validateRollbackAuthority(
    authority: FileReviewRollbackAuthority
  ): Promise<boolean> {
    if (this.deleting.has(authority.conversationId) || this.slots.has(authority.conversationId))
      throw new Error('REVIEW_AUTHORITY_CHANGED')
    const [conversation, profile, run, project] = await Promise.all([
      getConversation(authority.conversationId),
      aiOrchestratorStore.getProfile(authority.profileId),
      aiCliOrchestrator.getRun(authority.runId),
      getProject(authority.projectId)
    ])
    if (
      !conversation ||
      conversation.projectId !== authority.projectId ||
      !profile?.enabled ||
      profile.updatedAt !== authority.profileVersion ||
      !run ||
      run.profileId !== profile.id ||
      run.sessionId !== conversation.id ||
      !project ||
      project.archived ||
      (await realpath(project.rootPath)) !== authority.canonicalRoot ||
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

  async close(): Promise<void> {
    this.closing = true
    await Promise.all([...this.slots.keys()].map((id) => this.pause(id)))
  }
}
