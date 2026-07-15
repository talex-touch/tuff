import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { IntelligenceModule } from './intelligence-module'

type PermissionHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

interface CapturedRegistration {
  handler: PermissionHandler
}

interface AutonomousChannelRegistrar {
  registerOrchestrationChannels: (registerHostOnlySafe: unknown) => void
  registerWorkflowChannels: (registerHostOnlySafe: unknown) => void
  waitForAgentRuntime: () => Promise<void>
}

const runtimeMocks = vi.hoisted(() => ({
  runAgentGraph: vi.fn(),
  startSession: vi.fn(),
  getSessionState: vi.fn()
}))

const workflowServiceMocks = vi.hoisted(() => ({
  runWorkflow: vi.fn()
}))

vi.mock('./tuff-intelligence-runtime', () => ({
  tuffIntelligenceRuntime: runtimeMocks
}))

vi.mock('./intelligence-workflow-service', () => ({
  intelligenceWorkflowService: workflowServiceMocks
}))
vi.mock('@talex-touch/utils/transport/events/types', () => ({
  isIntelligenceErrorCode: vi.fn(() => false)
}))

vi.mock('../sentry/sentry-service', () => {
  class SentryServiceModule {
    isTelemetryEnabled = vi.fn(() => false)
    isEnabled = vi.fn(() => false)
    queueNexusTelemetry = vi.fn()
  }

  const service = new SentryServiceModule()
  return {
    SentryServiceModule,
    getSentryService: vi.fn(() => service),
    setSentryServiceInstance: vi.fn()
  }
})

function captureAutonomousHandlers() {
  const registrations = new Map<string, CapturedRegistration>()
  const registerHostOnlySafe = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      handler: PermissionHandler
    ) => {
      registrations.set(event.toEventName(), {
        handler: async (payload, context) => {
          if (context.plugin) {
            throw new Error('INTELLIGENCE_HOST_ONLY_CAPABILITY')
          }
          return await handler(payload, context)
        }
      })
    }
  )
  const module = new IntelligenceModule() as unknown as AutonomousChannelRegistrar
  const waitForAgentRuntime = vi.fn(async () => undefined)
  module.waitForAgentRuntime = waitForAgentRuntime
  module.registerOrchestrationChannels(registerHostOnlySafe)
  module.registerWorkflowChannels(registerHostOnlySafe)

  const sessionStart = registrations.get('intelligence:agent:session:start')
  const workflowRun = registrations.get('intelligence:workflow:run')
  if (!sessionStart || !workflowRun) {
    throw new Error('Autonomous intelligence handlers were not registered')
  }

  return { sessionStart, workflowRun, waitForAgentRuntime }
}

describe('intelligenceModule autonomous permission boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeMocks.startSession.mockResolvedValue({ id: 'inert-session' })
    runtimeMocks.runAgentGraph.mockResolvedValue(undefined)
    runtimeMocks.getSessionState.mockResolvedValue(null)
    workflowServiceMocks.runWorkflow.mockResolvedValue({ id: 'workflow-run-host' })
  })

  it('rejects plugin session starts as host-only before agent runtime access', async () => {
    const { sessionStart } = captureAutonomousHandlers()
    const pluginContext = {
      plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
    } as HandlerContext

    await expect(
      sessionStart.handler({ autoRunGraph: true, objective: 'run tools' }, pluginContext)
    ).rejects.toThrow('INTELLIGENCE_HOST_ONLY_CAPABILITY')
    expect(runtimeMocks.startSession).not.toHaveBeenCalled()
    expect(runtimeMocks.runAgentGraph).not.toHaveBeenCalled()
    expect(runtimeMocks.getSessionState).not.toHaveBeenCalled()
  })

  it('registers direct workflow runs as host-only and blocks plugins before agent runtime', async () => {
    const { workflowRun, waitForAgentRuntime } = captureAutonomousHandlers()
    const pluginContext = {
      plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
    } as HandlerContext

    await expect(workflowRun.handler({ workflowId: 'workflow-1' }, pluginContext)).rejects.toThrow(
      'INTELLIGENCE_HOST_ONLY_CAPABILITY'
    )
    expect(waitForAgentRuntime).not.toHaveBeenCalled()
    expect(workflowServiceMocks.runWorkflow).not.toHaveBeenCalled()
  })

  it('preserves the supplied host session metadata object and caller', async () => {
    const { sessionStart } = captureAutonomousHandlers()
    const metadata = Object.freeze({ caller: 'host:corebox', traceId: 'host-session-trace' })
    const session = Object.freeze({
      sessionId: 'host-session',
      objective: '  run the host graph  ',
      context: { surface: 'host-session' },
      metadata,
      autoRunGraph: true,
      maxSteps: 3,
      toolBudget: 6,
      continueOnError: true,
      reflectNotes: 'retain host session metadata'
    })

    await expect(sessionStart.handler(session, {} as HandlerContext)).resolves.toEqual({
      id: 'inert-session'
    })

    const [receivedSession] = runtimeMocks.startSession.mock.calls[0] ?? []
    expect(receivedSession).toBe(session)
    const [agentGraphRequest] = runtimeMocks.runAgentGraph.mock.calls[0] ?? []
    if (
      !agentGraphRequest ||
      typeof agentGraphRequest !== 'object' ||
      !('metadata' in agentGraphRequest)
    ) {
      throw new Error('Agent graph request must include metadata')
    }
    expect(agentGraphRequest.metadata).toBe(metadata)
  })

  it('preserves the supplied host workflow metadata object and caller', async () => {
    const { workflowRun, waitForAgentRuntime } = captureAutonomousHandlers()
    const metadata = Object.freeze({ caller: 'host:automation', traceId: 'host-workflow-trace' })
    const workflow = Object.freeze({
      workflowId: 'host-workflow',
      runId: 'host-workflow-run',
      inputs: { source: 'host', operation: 'workflow-run' },
      sessionId: 'host-session',
      triggerType: 'manual',
      continueOnError: true,
      metadata
    })

    await expect(workflowRun.handler(workflow, {} as HandlerContext)).resolves.toEqual({
      id: 'workflow-run-host'
    })
    expect(waitForAgentRuntime).toHaveBeenCalledOnce()
    expect(workflowServiceMocks.runWorkflow).toHaveBeenCalledOnce()
    const [receivedWorkflow] = workflowServiceMocks.runWorkflow.mock.calls[0] ?? []
    expect(receivedWorkflow).toBe(workflow)
  })
})
