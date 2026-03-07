import type { ViewRendererAdapter } from '../adapters/view'
import type { CapabilityRegistry } from '../registry/capability-registry'
import type { AgentDecision } from '../protocol/decision'
import type { AgentEnvelope } from '../protocol/envelope'
import type { TurnState } from '../protocol/session'

function makeEventId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export interface DecisionDispatcherDeps {
  capabilityRegistry: CapabilityRegistry
  viewRenderer?: ViewRendererAdapter
}

export class DecisionDispatcher {
  constructor(private readonly deps: DecisionDispatcherDeps) {}

  async *dispatch(decision: AgentDecision, state: TurnState): AsyncIterable<AgentEnvelope> {
    if (decision.text && decision.text.trim()) {
      yield {
        version: 'aep/1',
        id: makeEventId('evt'),
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: 'assistant',
        type: decision.done ? 'assistant.final' : 'assistant.delta',
        ts: new Date().toISOString(),
        payload: { text: decision.text },
      }
    }

    for (const call of decision.capabilityCalls ?? []) {
      yield {
        version: 'aep/1',
        id: makeEventId('evt'),
        sessionId: state.sessionId,
        turnId: state.turnId,
        correlationId: call.id,
        source: 'runtime',
        type: 'capability.call',
        ts: new Date().toISOString(),
        payload: call,
      }

      const capability = this.deps.capabilityRegistry.get(call.capabilityId)
      if (!capability || capability.enabled === false) {
        yield {
          version: 'aep/1',
          id: makeEventId('evt'),
          sessionId: state.sessionId,
          turnId: state.turnId,
          correlationId: call.id,
          source: 'runtime',
          type: 'error',
          ts: new Date().toISOString(),
          payload: {
            code: 'CAPABILITY_NOT_AVAILABLE',
            message: `Capability "${call.capabilityId}" is not available.`,
          },
        }
        continue
      }

      const output = await capability.invoke(call.input, {
        sessionId: state.sessionId,
        turnId: state.turnId,
      })

      yield {
        version: 'aep/1',
        id: makeEventId('evt'),
        sessionId: state.sessionId,
        turnId: state.turnId,
        correlationId: call.id,
        source: 'capability',
        type: 'capability.result',
        ts: new Date().toISOString(),
        payload: {
          capabilityId: call.capabilityId,
          output,
        },
      }
    }

    for (const intent of decision.viewIntents ?? []) {
      if (!this.deps.viewRenderer) {
        continue
      }

      if (intent.type === 'render') {
        await this.deps.viewRenderer.render(intent)
      } else if (intent.type === 'patch') {
        await this.deps.viewRenderer.patch(intent)
      } else if (intent.type === 'dispose' && intent.viewId) {
        await this.deps.viewRenderer.dispose(intent.viewId)
      }

      yield {
        version: 'aep/1',
        id: makeEventId('evt'),
        sessionId: state.sessionId,
        turnId: state.turnId,
        correlationId: intent.id,
        source: 'view',
        type: intent.type === 'render'
          ? 'view.render'
          : intent.type === 'patch'
            ? 'view.patch'
            : 'view.dispose',
        ts: new Date().toISOString(),
        payload: intent,
      }
    }
  }
}
