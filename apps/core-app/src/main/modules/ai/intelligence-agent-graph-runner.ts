import type {
  TuffIntelligenceAgentSession,
  TuffIntelligenceStateSnapshot,
  TuffIntelligenceTurn
} from '@talex-touch/utils'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

export interface CoreAgentGraphRuntime {
  startSession: (payload: {
    sessionId?: string
    objective?: string
    context?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<TuffIntelligenceAgentSession>
  plan: (payload: {
    sessionId: string
    objective: string
    context?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<TuffIntelligenceTurn>
  execute: (payload: {
    sessionId: string
    turnId?: string
    maxSteps?: number
    toolBudget?: number
    continueOnError?: boolean
    metadata?: Record<string, unknown>
  }) => Promise<TuffIntelligenceTurn>
  reflect: (payload: {
    sessionId: string
    turnId: string
    notes?: string
  }) => Promise<TuffIntelligenceTurn>
  getSessionState: (sessionId: string) => Promise<TuffIntelligenceStateSnapshot | null>
}

export interface RunCoreAgentGraphPayload {
  sessionId?: string
  objective: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
  maxSteps?: number
  toolBudget?: number
  continueOnError?: boolean
  reflectNotes?: string
}

interface CoreAgentGraphState {
  runtime: CoreAgentGraphRuntime
  payload: RunCoreAgentGraphPayload
  sessionId: string
  turnId?: string
  latestTurn?: TuffIntelligenceTurn
  snapshot?: TuffIntelligenceStateSnapshot | null
}

type GraphInvokePayload = { state: CoreAgentGraphState }

interface GraphBuilderLike {
  addNode: (
    id: string,
    handler: (state: GraphInvokePayload) => Promise<GraphInvokePayload> | GraphInvokePayload
  ) => void
  addEdge: (from: string, to: string) => void
  compile: () => {
    invoke: (input: GraphInvokePayload) => Promise<GraphInvokePayload>
  }
}

function canReflect(turn?: TuffIntelligenceTurn): boolean {
  if (!turn) return false
  if (turn.status === 'waiting_approval') return false
  if (turn.status === 'cancelled') return false
  return true
}

export async function runCoreIntelligenceAgentGraph(
  runtime: CoreAgentGraphRuntime,
  payload: RunCoreAgentGraphPayload
): Promise<TuffIntelligenceStateSnapshot | null> {
  const objective = String(payload.objective || '').trim()
  if (!objective) {
    throw new Error('objective is required')
  }

  const GraphAnnotation = Annotation.Root({
    state: Annotation<CoreAgentGraphState>
  })

  const graphBuilder = new StateGraph(
    GraphAnnotation as unknown as never
  ) as unknown as GraphBuilderLike

  graphBuilder.addNode('session.start', async (graphState: typeof GraphAnnotation.State) => {
    const state = graphState.state
    const session = await state.runtime.startSession({
      sessionId: state.payload.sessionId,
      objective,
      context: state.payload.context,
      metadata: state.payload.metadata
    })

    return {
      state: {
        ...state,
        sessionId: session.id
      }
    }
  })

  graphBuilder.addNode('plan', async (graphState: typeof GraphAnnotation.State) => {
    const state = graphState.state
    const turn = await state.runtime.plan({
      sessionId: state.sessionId,
      objective,
      context: state.payload.context,
      metadata: state.payload.metadata
    })

    return {
      state: {
        ...state,
        turnId: turn.id,
        latestTurn: turn
      }
    }
  })

  graphBuilder.addNode('execute', async (graphState: typeof GraphAnnotation.State) => {
    const state = graphState.state
    const turn = await state.runtime.execute({
      sessionId: state.sessionId,
      turnId: state.turnId,
      maxSteps: state.payload.maxSteps,
      toolBudget: state.payload.toolBudget,
      continueOnError: state.payload.continueOnError,
      metadata: state.payload.metadata
    })

    return {
      state: {
        ...state,
        turnId: turn.id,
        latestTurn: turn
      }
    }
  })

  graphBuilder.addNode('reflect', async (graphState: typeof GraphAnnotation.State) => {
    const state = graphState.state
    if (!canReflect(state.latestTurn) || !state.turnId) {
      return { state }
    }

    const turn = await state.runtime.reflect({
      sessionId: state.sessionId,
      turnId: state.turnId,
      notes: state.payload.reflectNotes
    })

    return {
      state: {
        ...state,
        turnId: turn.id,
        latestTurn: turn
      }
    }
  })

  graphBuilder.addNode('finalize', async (graphState: typeof GraphAnnotation.State) => {
    const state = graphState.state
    const snapshot = await state.runtime.getSessionState(state.sessionId)
    return {
      state: {
        ...state,
        snapshot
      }
    }
  })

  graphBuilder.addEdge(START, 'session.start')
  graphBuilder.addEdge('session.start', 'plan')
  graphBuilder.addEdge('plan', 'execute')
  graphBuilder.addEdge('execute', 'reflect')
  graphBuilder.addEdge('reflect', 'finalize')
  graphBuilder.addEdge('finalize', END)

  const compiled = graphBuilder.compile()
  const result = await compiled.invoke({
    state: {
      runtime,
      payload,
      sessionId: payload.sessionId || ''
    }
  })

  return (result as { state: CoreAgentGraphState }).state.snapshot ?? null
}
