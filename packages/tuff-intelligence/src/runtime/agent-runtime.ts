import type { AgentEngineAdapter, DecisionAdapter } from '../adapters/engine'
import type { AgentDecision } from '../protocol/decision'
import type { AgentEnvelope } from '../protocol/envelope'
import type { ApprovalInput, SessionSnapshot, TurnState, UserMessageAttachment, UserMessageInput, ViewEventInput } from '../protocol/session'
import type { StoreAdapter, TraceRecord } from '../store/store-adapter'
import type { ConversationAgentPort } from './conversation-agent-port'
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

export interface AgentRuntimeDeps {
  engine: AgentEngineAdapter
  decision: DecisionAdapter
  dispatcher: DecisionDispatcher
  store: StoreAdapter
}

export abstract class AbstractAgentRuntime implements ConversationAgentPort {
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

    await this.deps.store.runtime.completeSession(state.sessionId, 'completed')
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

  protected async persistEvent(state: TurnState, event: AgentEnvelope): Promise<number> {
    let targetSeq = Math.max(
      1,
      Number.isFinite(state.seq) ? Math.floor(state.seq) : 1,
    )

    let trace: TraceRecord
    try {
      trace = await this.deps.store.runtime.appendTrace({
        sessionId: state.sessionId,
        seq: targetSeq,
        type: event.type,
        payload: event.payload as Record<string, unknown>,
      })
    }
    catch (error) {
      if (!isTraceSeqConflict(error)) {
        throw error
      }

      const latestSession = await this.deps.store.runtime.getSession(state.sessionId)
      const latestSeq = Number(latestSession?.lastSeq || 0)
      targetSeq = Math.max(latestSeq + 1, targetSeq + 1)

      trace = await this.deps.store.runtime.appendTrace({
        sessionId: state.sessionId,
        seq: targetSeq,
        type: event.type,
        payload: event.payload as Record<string, unknown>,
      })
    }

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

    return trace.seq
  }

  protected async advanceState(state: TurnState, decision: AgentDecision): Promise<TurnState> {
    if (decision.done) {
      return { ...state, done: true }
    }
    return state
  }
}
