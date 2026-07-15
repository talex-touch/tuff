import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { IntelligenceModule } from './intelligence-module'

interface PermissionOptions {
  permissionId: string
  failClosedForPlugin?: boolean
  unavailableCode?: string
}

type PermissionHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

interface CapturedRegistration {
  permissionId: string
  handler: PermissionHandler
}

interface AutonomousChannelRegistrar {
  registerOrchestrationChannels: (registerProtectedSafe: unknown, registerSafe: unknown) => void
  registerWorkflowChannels: (registerProtectedSafe: unknown) => void
  waitForAgentRuntime: () => Promise<void>
}

const permissionMocks = vi.hoisted(() => ({
  runtimeAvailable: false,
  withPermission: vi.fn(
    (options: PermissionOptions, callback: PermissionHandler): PermissionHandler => {
      return async (payload, context) => {
        if (
          context.plugin &&
          options.permissionId === 'intelligence.agents' &&
          options.failClosedForPlugin &&
          !permissionMocks.runtimeAvailable
        ) {
          const error = new Error(
            `Permission runtime is unavailable for '${options.permissionId}'`
          ) as Error & { code?: string }
          error.code = options.unavailableCode
          throw error
        }
        return await callback(payload, context)
      }
    }
  )
}))

const runtimeMocks = vi.hoisted(() => ({
  runAgentGraph: vi.fn(),
  startSession: vi.fn()
}))

const workflowServiceMocks = vi.hoisted(() => ({
  runWorkflow: vi.fn()
}))

vi.mock('../permission/channel-guard', () => ({
  withPermission: permissionMocks.withPermission
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
  const registerProtectedSafe = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      permissionId: string,
      handler: PermissionHandler
    ) => {
      registrations.set(event.toEventName(), { permissionId, handler })
    }
  )
  const module = new IntelligenceModule() as unknown as AutonomousChannelRegistrar
  const waitForAgentRuntime = vi.fn(async () => undefined)
  module.waitForAgentRuntime = waitForAgentRuntime
  module.registerOrchestrationChannels(registerProtectedSafe, vi.fn())
  module.registerWorkflowChannels(registerProtectedSafe)

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
    permissionMocks.runtimeAvailable = false
    runtimeMocks.startSession.mockResolvedValue({ id: 'inert-session' })
    runtimeMocks.runAgentGraph.mockResolvedValue(undefined)
    workflowServiceMocks.runWorkflow.mockResolvedValue({ id: 'workflow-run-host' })
  })

  it('keeps inert session starts basic while fail-closing plugin graph autoruns', async () => {
    const { sessionStart } = captureAutonomousHandlers()
    const pluginContext = {
      plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
    } as HandlerContext

    expect(sessionStart.permissionId).toBe('intelligence.basic')
    await expect(
      sessionStart.handler({ autoRunGraph: true, objective: 'run tools' }, pluginContext)
    ).rejects.toMatchObject({ code: 'INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE' })
    expect(runtimeMocks.runAgentGraph).not.toHaveBeenCalled()

    await expect(sessionStart.handler({ objective: 'draft only' }, pluginContext)).resolves.toEqual(
      {
        id: 'inert-session'
      }
    )
    expect(runtimeMocks.runAgentGraph).not.toHaveBeenCalled()
  })

  it('registers workflow runs as agents-only and blocks plugins before agent runtime', async () => {
    const { workflowRun, waitForAgentRuntime } = captureAutonomousHandlers()
    const pluginContext = {
      plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
    } as HandlerContext

    expect(workflowRun.permissionId).toBe('intelligence.agents')
    await expect(
      workflowRun.handler({ workflowId: 'workflow-1' }, pluginContext)
    ).rejects.toMatchObject({
      code: 'INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE'
    })
    expect(waitForAgentRuntime).not.toHaveBeenCalled()
    expect(workflowServiceMocks.runWorkflow).not.toHaveBeenCalled()
  })

  it('allows host workflow runs to reach the workflow service', async () => {
    const { workflowRun, waitForAgentRuntime } = captureAutonomousHandlers()
    const workflow = { workflowId: 'workflow-1' }

    await expect(workflowRun.handler(workflow, {} as HandlerContext)).resolves.toEqual({
      id: 'workflow-run-host'
    })
    expect(waitForAgentRuntime).toHaveBeenCalledOnce()
    expect(workflowServiceMocks.runWorkflow).toHaveBeenCalledOnce()
  })
})
