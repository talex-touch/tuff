import type { AgentEngineAdapter, DecisionAdapter } from '../adapters/engine'
import type { AgentDecision } from '../protocol/decision'
import type { AgentEnvelope } from '../protocol/envelope'
import type { ApprovalInput, SessionSnapshot, TurnState, UserMessageInput, ViewEventInput } from '../protocol/session'
import type { StoreAdapter } from '../store/store-adapter'
import type { ConversationAgentPort } from './conversation-agent-port'
import type { DecisionDispatcher } from './decision-dispatcher'

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export interface AgentRuntimeDeps {
  engine: AgentEngineAdapter
  decision: DecisionAdapter
  dispatcher: DecisionDispatcher
  store: StoreAdapter
}

export abstract class AbstractAgentRuntime implements ConversationAgentPort {
  constructor(protected readonly deps: AgentRuntimeDeps) {}

  protected createInitialState(sessionId: string, input: UserMessageInput): TurnState {
    return {
      sessionId,
      turnId: makeId('turn'),
      done: false,
      seq: 0,
      messages: [{ role: 'user', content: input.message }],
      events: [],
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
    await this.deps.store.runtime.ensureSchema()
    const session = input.sessionId
      ? await this.deps.store.runtime.getSession(input.sessionId)
      : null
    const created = session ?? await this.deps.store.runtime.createSession(input)

    let state = this.createInitialState(created.sessionId, input)
    await this.deps.store.runtime.saveMessage({
      id: makeId('msg'),
      sessionId: created.sessionId,
      role: 'user',
      content: input.message,
      createdAt: new Date().toISOString(),
      metadata: input.metadata,
    })

    while (!state.done) {
      const raw = await this.deps.engine.run(state)
      const decision = await this.deps.decision.normalize(raw, state)
      for await (const event of this.deps.dispatcher.dispatch(decision, state)) {
        const reduced = await this.reduceState(state, event)
        state = reduced
        await this.persistEvent(state, event)
        yield event
      }
      state = await this.advanceState(state, decision)
    }

    await this.deps.store.runtime.completeSession(state.sessionId, 'completed')
  }

  async *onViewEvent(_input: ViewEventInput): AsyncIterable<AgentEnvelope> {
    
  }

  async *onApproval(_input: ApprovalInput): AsyncIterable<AgentEnvelope> {
    
  }

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

  protected async persistEvent(state: TurnState, event: AgentEnvelope) {
    const trace = await this.deps.store.runtime.appendTrace({
      sessionId: state.sessionId,
      seq: state.seq,
      type: event.type,
      payload: event.payload as Record<string, unknown>,
    })

    await this.deps.store.emit?.({
      ...event,
      id: trace.id,
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

    if (state.seq % 4 === 0) {
      await this.deps.store.runtime.saveCheckpoint(state.sessionId, state)
    }
  }

  protected async advanceState(state: TurnState, decision: AgentDecision): Promise<TurnState> {
    if (decision.done) {
      return { ...state, done: true }
    }
    return state
  }
}
