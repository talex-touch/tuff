import type { AgentEngineAdapter, DecisionAdapter } from '../adapters/engine'
import type { AgentDecision } from '../protocol/decision'
import type { AgentEnvelope } from '../protocol/envelope'
import type { ApprovalInput, SessionSnapshot, TurnState, UserMessageAttachment, UserMessageInput, ViewEventInput } from '../protocol/session'
import type { StoreAdapter, TraceRecord } from '../store/store-adapter'
import type { ConversationAgentPort, RuntimePersistMetricsSnapshot } from './conversation-agent-port'
import type { DecisionDispatcher } from './decision-dispatcher'

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeTurnAttachments(attachments: UserMessageInput['attachments']): UserMessageAttachment[] {
  if (!Array.isArray(attachments)) {
    return []
  }

  const list: UserMessageAttachment[] = []
  for (const item of attachments) {
    const id = String(item?.id || '').trim()
    const ref = String(item?.ref || '').trim()
    if (!id || !ref) {
      continue
    }

    const type = item?.type === 'image' ? 'image' : 'file'
    list.push({
      id,
      type,
      ref,
      name: typeof item?.name === 'string' ? item.name : undefined,
      mimeType: typeof item?.mimeType === 'string' ? item.mimeType : undefined,
      previewUrl: typeof item?.previewUrl === 'string' ? item.previewUrl : undefined,
      size: Number.isFinite(item?.size) ? Number(item?.size) : undefined,
      dataUrl: typeof item?.dataUrl === 'string' ? item.dataUrl : undefined,
    })
  }

  return list
}

function toPersistableAttachments(attachments: UserMessageAttachment[]): UserMessageAttachment[] {
  return attachments.map(item => ({
    id: item.id,
    type: item.type,
    ref: item.ref,
    name: item.name,
    mimeType: item.mimeType,
    previewUrl: item.previewUrl,
    size: item.size,
  }))
}

function isTraceSeqConflict(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : String(error || '')
  const normalized = message.toLowerCase()
  return normalized.includes('unique') && normalized.includes('seq')
}

const ASSISTANT_DELTA_PERSIST_MAX_CHARS = 320
const ASSISTANT_DELTA_PERSIST_MAX_MS = 160

interface AssistantDeltaPersistBuffer {
  text: string
  startedAt: number
}

interface RuntimePersistMetricsState {
  deltaPersistBatchCount: number
  deltaPersistChars: number
  runtimeTracePersistCount: number
}

export interface AgentRuntimeDeps {
  engine: AgentEngineAdapter
  decision: DecisionAdapter
  dispatcher: DecisionDispatcher
  store: StoreAdapter
}

export abstract class AbstractAgentRuntime implements ConversationAgentPort {
  private readonly persistedSeqBySession = new Map<string, number>()
  private readonly assistantDeltaBufferBySession = new Map<string, AssistantDeltaPersistBuffer>()
  private readonly runtimeMetricsBySession = new Map<string, RuntimePersistMetricsState>()

  constructor(protected readonly deps: AgentRuntimeDeps) {}

  protected createInitialState(
    sessionId: string,
    input: UserMessageInput,
    history: TurnState['messages'] = [],
    initialSeq = 0,
  ): TurnState {
    const normalizedSeq = Number.isFinite(initialSeq)
      ? Math.max(0, Math.floor(initialSeq))
      : 0
    const attachments = normalizeTurnAttachments(input.attachments)

    return {
      sessionId,
      turnId: makeId('turn'),
      done: false,
      seq: normalizedSeq,
      messages: [...history, { role: 'user', content: input.message }],
      events: [],
      attachments: attachments.length > 0 ? attachments : undefined,
      metadata: input.metadata,
    }
  }

  protected async reduceState(state: TurnState, event: AgentEnvelope): Promise<TurnState> {
    const next: TurnState = {
      ...state,
      seq: state.seq + 1,
      events: [...state.events, event],
    }
    if (event.type === 'assistant.delta' || event.type === 'assistant.final') {
      const text = String((event.payload as Record<string, unknown>)?.text || '')
      if (text) {
        next.messages = [...next.messages, { role: 'assistant', content: text }]
      }
    }
    return next
  }

  async *onMessage(input: UserMessageInput): AsyncIterable<AgentEnvelope> {
    const session = input.sessionId
      ? await this.deps.store.runtime.getSession(input.sessionId)
      : null
    const created = session ?? await this.deps.store.runtime.createSession(input)
    const history = (await this.deps.store.runtime.listMessages(created.sessionId)).map(message => ({
      role: message.role,
      content: message.content,
    }))

    let state = this.createInitialState(created.sessionId, input, history, created.lastSeq)
    await this.deps.store.runtime.completeSession(created.sessionId, 'executing')
    const persistedAttachments = toPersistableAttachments(normalizeTurnAttachments(input.attachments))
    const messageMetadata: Record<string, unknown> = {
      ...(input.metadata || {}),
    }
    if (persistedAttachments.length > 0) {
      messageMetadata.attachments = persistedAttachments
    }
    const normalizedMessageMetadata = Object.keys(messageMetadata).length > 0
      ? messageMetadata
      : undefined
    await this.deps.store.runtime.saveMessage({
      id: makeId('msg'),
      sessionId: created.sessionId,
      role: 'user',
      content: input.message,
      createdAt: new Date().toISOString(),
      metadata: normalizedMessageMetadata,
    })

    this.persistedSeqBySession.set(created.sessionId, Math.max(0, Number(created.lastSeq || 0)))
    this.assistantDeltaBufferBySession.delete(created.sessionId)
    this.runtimeMetricsBySession.set(created.sessionId, {
      deltaPersistBatchCount: 0,
      deltaPersistChars: 0,
      runtimeTracePersistCount: 0,
    })

    try {
      if (typeof this.deps.engine.runStream === 'function') {
        let streamed = false
        for await (const raw of this.deps.engine.runStream(state)) {
          streamed = true
          const decision = await this.deps.decision.normalize(raw, state)
          for await (const event of this.deps.dispatcher.dispatch(decision, state)) {
            const reduced = await this.reduceState(state, event)
            state = reduced
            const persistedSeq = await this.persistEvent(state, event)
            state = {
              ...state,
              seq: persistedSeq,
            }
            yield event
          }
          state = await this.advanceState(state, decision)
          if (state.done) {
            break
          }
        }

        if (!streamed) {
          while (!state.done) {
            const raw = await this.deps.engine.run(state)
            const decision = await this.deps.decision.normalize(raw, state)
            for await (const event of this.deps.dispatcher.dispatch(decision, state)) {
              const reduced = await this.reduceState(state, event)
              state = reduced
              const persistedSeq = await this.persistEvent(state, event)
              state = {
                ...state,
                seq: persistedSeq,
              }
              yield event
            }
            state = await this.advanceState(state, decision)
          }
        }
        else if (!state.done) {
          state = { ...state, done: true }
        }
      }
      else {
        while (!state.done) {
          const raw = await this.deps.engine.run(state)
          const decision = await this.deps.decision.normalize(raw, state)
          for await (const event of this.deps.dispatcher.dispatch(decision, state)) {
            const reduced = await this.reduceState(state, event)
            state = reduced
            const persistedSeq = await this.persistEvent(state, event)
            state = {
              ...state,
              seq: persistedSeq,
            }
            yield event
          }
          state = await this.advanceState(state, decision)
        }
      }

      const flushedSeq = await this.flushAssistantDeltaBuffer(state)
      state = {
        ...state,
        seq: flushedSeq,
      }

      await this.deps.store.runtime.completeSession(state.sessionId, 'completed')
    }
    finally {
      this.assistantDeltaBufferBySession.delete(created.sessionId)
      this.persistedSeqBySession.delete(created.sessionId)
    }
  }

  async *onViewEvent(_input: ViewEventInput): AsyncIterable<AgentEnvelope> {}

  async *onApproval(_input: ApprovalInput): AsyncIterable<AgentEnvelope> {}

  async resume(sessionId: string): Promise<SessionSnapshot> {
    const session = await this.deps.store.runtime.getSession(sessionId)
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`)
    }
    return {
      sessionId: session.sessionId,
      status: session.status,
      messages: (await this.deps.store.runtime.listMessages(sessionId)).map(message => ({
        role: message.role,
        content: message.content,
      })),
      lastTurnId: undefined,
      lastSeq: session.lastSeq,
      updatedAt: session.updatedAt,
    }
  }

  getAndResetRuntimePersistMetrics(sessionId: string): RuntimePersistMetricsSnapshot | null {
    const current = this.runtimeMetricsBySession.get(sessionId)
    this.runtimeMetricsBySession.delete(sessionId)
    if (!current) {
      return null
    }

    const avg = current.deltaPersistBatchCount > 0
      ? current.deltaPersistChars / current.deltaPersistBatchCount
      : 0

    return {
      deltaPersistBatchCount: current.deltaPersistBatchCount,
      deltaPersistChars: current.deltaPersistChars,
      deltaPersistAvgChars: Number(avg.toFixed(2)),
      runtimeTracePersistCount: current.runtimeTracePersistCount,
    }
  }

  protected async persistEvent(state: TurnState, event: AgentEnvelope): Promise<number> {
    const sessionId = state.sessionId
    const currentPersistedSeq = this.getSessionPersistedSeq(sessionId, Math.max(0, Math.floor(Number(state.seq || 0))))

    if (event.type === 'assistant.delta') {
      const text = String((event.payload as Record<string, unknown>)?.text || '')
      if (!text) {
        return currentPersistedSeq
      }

      const now = Date.now()
      const pending = this.assistantDeltaBufferBySession.get(sessionId)
      if (!pending) {
        this.assistantDeltaBufferBySession.set(sessionId, {
          text,
          startedAt: now,
        })
      }
      else {
        pending.text += text
      }

      const nextPending = this.assistantDeltaBufferBySession.get(sessionId)
      if (!nextPending) {
        return currentPersistedSeq
      }

      const shouldFlush = nextPending.text.length >= ASSISTANT_DELTA_PERSIST_MAX_CHARS
        || (now - nextPending.startedAt) >= ASSISTANT_DELTA_PERSIST_MAX_MS
      if (!shouldFlush) {
        return currentPersistedSeq
      }

      return await this.flushAssistantDeltaBuffer(state)
    }

    await this.flushAssistantDeltaBuffer(state)
    const trace = await this.appendTraceWithRetry(state, event)
    await this.afterTracePersisted(state, event, trace)
    return trace.seq
  }

  private getSessionPersistedSeq(sessionId: string, fallback = 0): number {
    const current = this.persistedSeqBySession.get(sessionId)
    if (typeof current === 'number' && Number.isFinite(current)) {
      return current
    }

    const normalized = Number.isFinite(fallback) ? Math.max(0, Math.floor(fallback)) : 0
    this.persistedSeqBySession.set(sessionId, normalized)
    return normalized
  }

  private setSessionPersistedSeq(sessionId: string, seq: number): void {
    if (!Number.isFinite(seq)) {
      return
    }
    this.persistedSeqBySession.set(sessionId, Math.max(0, Math.floor(seq)))
  }

  private async appendTraceWithRetry(state: TurnState, event: AgentEnvelope): Promise<TraceRecord> {
    const sessionId = state.sessionId
    let targetSeq = this.getSessionPersistedSeq(sessionId, Math.max(0, Math.floor(Number(state.seq || 0)))) + 1

    let trace: TraceRecord
    try {
      trace = await this.deps.store.runtime.appendTrace({
        sessionId,
        seq: targetSeq,
        type: event.type,
        payload: event.payload as Record<string, unknown>,
      })
    }
    catch (error) {
      if (!isTraceSeqConflict(error)) {
        throw error
      }

      const latestSession = await this.deps.store.runtime.getSession(sessionId)
      const latestSeq = Number(latestSession?.lastSeq || 0)
      targetSeq = Math.max(latestSeq + 1, targetSeq + 1)

      trace = await this.deps.store.runtime.appendTrace({
        sessionId,
        seq: targetSeq,
        type: event.type,
        payload: event.payload as Record<string, unknown>,
      })
    }

    this.setSessionPersistedSeq(sessionId, trace.seq)
    return trace
  }

  private async afterTracePersisted(state: TurnState, event: AgentEnvelope, trace: TraceRecord): Promise<void> {
    this.trackRuntimeTracePersisted(state.sessionId)

    await this.deps.store.emit?.({
      ...event,
      id: trace.id,
      meta: {
        ...(event.meta || {}),
        traceId: trace.id,
        seq: trace.seq,
      },
    })

    if (event.type === 'assistant.final') {
      const text = String((event.payload as Record<string, unknown>)?.text || '')
      if (text) {
        await this.deps.store.runtime.saveMessage({
          id: makeId('msg'),
          sessionId: state.sessionId,
          role: 'assistant',
          content: text,
          createdAt: new Date().toISOString(),
        })
      }
    }

    if (trace.seq % 4 === 0) {
      await this.deps.store.runtime.saveCheckpoint(state.sessionId, {
        ...state,
        seq: trace.seq,
      })
    }
  }

  private async flushAssistantDeltaBuffer(state: TurnState): Promise<number> {
    const sessionId = state.sessionId
    const pending = this.assistantDeltaBufferBySession.get(sessionId)
    if (!pending || !pending.text) {
      return this.getSessionPersistedSeq(sessionId, Math.max(0, Math.floor(Number(state.seq || 0))))
    }

    this.assistantDeltaBufferBySession.delete(sessionId)
    this.trackDeltaBatchPersisted(sessionId, pending.text.length)
    const bufferedEvent: AgentEnvelope = {
      version: 'aep/1',
      id: makeId('evt'),
      sessionId,
      turnId: state.turnId,
      source: 'assistant',
      type: 'assistant.delta',
      ts: new Date().toISOString(),
      payload: {
        text: pending.text,
      },
    }

    const trace = await this.appendTraceWithRetry(state, bufferedEvent)
    await this.afterTracePersisted(state, bufferedEvent, trace)
    return trace.seq
  }

  private trackDeltaBatchPersisted(sessionId: string, chars: number): void {
    const metrics = this.runtimeMetricsBySession.get(sessionId)
    if (!metrics) {
      return
    }

    metrics.deltaPersistBatchCount += 1
    metrics.deltaPersistChars += Math.max(0, Math.floor(Number(chars || 0)))
  }

  private trackRuntimeTracePersisted(sessionId: string): void {
    const metrics = this.runtimeMetricsBySession.get(sessionId)
    if (!metrics) {
      return
    }

    metrics.runtimeTracePersistCount += 1
  }

  protected async advanceState(state: TurnState, decision: AgentDecision): Promise<TurnState> {
    if (decision.done) {
      return { ...state, done: true }
    }
    return state
  }
}
