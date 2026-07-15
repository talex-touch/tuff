import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { IntelligenceModule } from './intelligence-module'

const workflowServiceMocks = vi.hoisted(() => ({
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  saveWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  runWorkflow: vi.fn(),
  listHistory: vi.fn(),
  updateReviewQueueItem: vi.fn()
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

type EventDefinition = { toEventName: () => string }
type ApiResponse = { ok: boolean; result?: unknown; error?: string }
type WorkflowHandler = (payload: unknown, context: HandlerContext) => Promise<ApiResponse>

interface TransportCapture {
  on: (event: EventDefinition, handler: WorkflowHandler) => void
}

interface WorkflowChannelRegistrar {
  createChannelRegistrars: (transport: TransportCapture) => { registerHostOnlySafe: unknown }
  registerWorkflowChannels: (registerHostOnlySafe: unknown) => void
  waitForAgentRuntime: () => Promise<void>
}

function pluginContext(): HandlerContext {
  return {
    plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
  } as HandlerContext
}

function captureWorkflowHandlers() {
  const handlers = new Map<string, WorkflowHandler>()
  const transport: TransportCapture = {
    on: (event, handler) => handlers.set(event.toEventName(), handler)
  }
  const module = new IntelligenceModule() as unknown as WorkflowChannelRegistrar
  const waitForAgentRuntime = vi.fn(async () => undefined)
  module.waitForAgentRuntime = waitForAgentRuntime
  const { registerHostOnlySafe } = module.createChannelRegistrars(transport)
  module.registerWorkflowChannels(registerHostOnlySafe)

  return { handlers, waitForAgentRuntime }
}

function getHandler(handlers: Map<string, WorkflowHandler>, eventName: string): WorkflowHandler {
  const handler = handlers.get(eventName)
  if (!handler) {
    throw new Error(`Intelligence workflow handler ${eventName} was not registered`)
  }
  return handler
}

function expectWorkflowServiceUntouched(): void {
  expect(workflowServiceMocks.listWorkflows).not.toHaveBeenCalled()
  expect(workflowServiceMocks.getWorkflow).not.toHaveBeenCalled()
  expect(workflowServiceMocks.saveWorkflow).not.toHaveBeenCalled()
  expect(workflowServiceMocks.deleteWorkflow).not.toHaveBeenCalled()
  expect(workflowServiceMocks.runWorkflow).not.toHaveBeenCalled()
  expect(workflowServiceMocks.listHistory).not.toHaveBeenCalled()
  expect(workflowServiceMocks.updateReviewQueueItem).not.toHaveBeenCalled()
}

describe('intelligenceModule workflow control-plane host boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workflowServiceMocks.listWorkflows.mockResolvedValue([{ id: 'host-workflow' }])
    workflowServiceMocks.getWorkflow.mockResolvedValue({ id: 'host-workflow' })
    workflowServiceMocks.deleteWorkflow.mockResolvedValue({ deleted: true })
    workflowServiceMocks.runWorkflow.mockResolvedValue({ id: 'host-workflow-run' })
    workflowServiceMocks.listHistory.mockResolvedValue([{ id: 'host-workflow-run' }])
    workflowServiceMocks.updateReviewQueueItem.mockResolvedValue({ id: 'host-workflow-run' })
  })

  it.each([
    {
      name: 'workflow registry listing',
      eventName: 'intelligence:workflow:list',
      payload: { includeTemplates: true }
    },
    {
      name: 'workflow registry lookup',
      eventName: 'intelligence:workflow:get',
      payload: { workflowId: 'plugin-workflow' }
    },
    {
      name: 'workflow registry save',
      eventName: 'intelligence:workflow:save',
      payload: {
        id: 'plugin-workflow',
        name: 'Plugin-owned workflow attempt',
        triggers: [],
        contextSources: [],
        toolSources: [],
        steps: []
      }
    },
    {
      name: 'workflow registry deletion',
      eventName: 'intelligence:workflow:delete',
      payload: { workflowId: 'host-workflow' }
    },
    {
      name: 'direct workflow run',
      eventName: 'intelligence:workflow:run',
      payload: { workflowId: 'host-workflow', sessionId: 'plugin-session' }
    },
    {
      name: 'workflow run history',
      eventName: 'intelligence:workflow:history',
      payload: { workflowId: 'host-workflow', limit: 10 }
    },
    {
      name: 'workflow review mutation',
      eventName: 'intelligence:workflow:review:update',
      payload: { runId: 'host-workflow-run', itemId: 'host-workflow-run:step', status: 'copied' }
    }
  ] as const)(
    'rejects raw plugin $name before workflow service or runtime access',
    async ({ eventName, payload }) => {
      const { handlers, waitForAgentRuntime } = captureWorkflowHandlers()

      await expect(getHandler(handlers, eventName)(payload, pluginContext())).resolves.toEqual({
        ok: false,
        error: 'INTELLIGENCE_HOST_ONLY_CAPABILITY'
      })
      expect(waitForAgentRuntime).not.toHaveBeenCalled()
      expectWorkflowServiceUntouched()
    }
  )

  it('keeps host list, save, and direct runs supported without cloning workflow metadata', async () => {
    const { handlers, waitForAgentRuntime } = captureWorkflowHandlers()
    const listOptions = Object.freeze({ includeTemplates: true })
    const metadata = Object.freeze({ caller: 'host:automation', traceId: 'workflow-host-trace' })
    const workflow = Object.freeze({
      id: 'host-workflow',
      name: 'Host workflow',
      triggers: [],
      contextSources: [],
      toolSources: [],
      steps: [],
      metadata
    })
    const run = Object.freeze({
      workflowId: workflow.id,
      runId: 'host-workflow-run',
      sessionId: 'host-session',
      metadata
    })
    const runResult = { id: run.runId }

    workflowServiceMocks.listWorkflows.mockResolvedValue([workflow])
    workflowServiceMocks.saveWorkflow.mockResolvedValue(workflow)
    workflowServiceMocks.runWorkflow.mockResolvedValue(runResult)

    await expect(
      getHandler(handlers, 'intelligence:workflow:list')(listOptions, {} as HandlerContext)
    ).resolves.toEqual({ ok: true, result: [workflow] })
    await expect(
      getHandler(handlers, 'intelligence:workflow:save')(workflow, {} as HandlerContext)
    ).resolves.toEqual({ ok: true, result: workflow })
    await expect(
      getHandler(handlers, 'intelligence:workflow:run')(run, {} as HandlerContext)
    ).resolves.toEqual({ ok: true, result: runResult })

    expect(workflowServiceMocks.listWorkflows).toHaveBeenCalledWith(listOptions)
    const [savedWorkflow] = workflowServiceMocks.saveWorkflow.mock.calls[0] ?? []
    expect(savedWorkflow).toBe(workflow)
    expect(savedWorkflow.metadata).toBe(metadata)
    expect(waitForAgentRuntime).toHaveBeenCalledOnce()
    const [receivedRun] = workflowServiceMocks.runWorkflow.mock.calls[0] ?? []
    expect(receivedRun).toBe(run)
    expect(receivedRun.metadata).toBe(metadata)
  })
})
