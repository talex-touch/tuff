import type {
  AiAgentProfile,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface RegisteredTool {
  handler: (input: unknown, context: { taskId: string }) => Promise<unknown>
}

interface RuntimeHostCallbacks {
  beginToolCall: (
    runId: string,
    toolCallId: string,
    toolId: string,
    input: unknown
  ) => Promise<'execute' | 'interrupted'>
  loadToolCallResult: (
    runId: string,
    toolCallId: string
  ) => Promise<{ error?: string; output?: unknown } | undefined>
  persistToolCallResult: (
    runId: string,
    toolCallId: string,
    result: { error?: string; output?: unknown }
  ) => Promise<void>
  onApprovalConsumed: (runId: string, fingerprint: string) => Promise<void>
}

const orchestratorMocks = vi.hoisted(() => {
  const profiles = new Map<string, AiAgentProfile>()
  const runs = new Map<string, AiOrchestratorRunRecord>()
  const tools = new Map<string, RegisteredTool>()
  return {
    profiles,
    runs,
    tools,
    initialize: vi.fn(async () => undefined),
    getProfile: vi.fn(async (profileId: string) => profiles.get(profileId) ?? null),
    createOrchestratorRun: vi.fn(async (run: AiOrchestratorRunRecord) => {
      runs.set(run.id, { ...run })
    }),
    getOrchestratorRun: vi.fn(async (runId: string) => runs.get(runId) ?? null),
    updateOrchestratorRun: vi.fn(
      async (runId: string, update: Partial<AiOrchestratorRunRecord>) => {
        const current = runs.get(runId)
        if (!current) throw new Error(`Unknown test run ${runId}`)
        const next = { ...current, ...update, updatedAt: Date.now() }
        runs.set(runId, next)
        return next
      }
    ),
    appendOrchestratorEvent: vi.fn(async () => undefined),
    listSessionHistory: vi.fn(async () => []),
    listOrchestratorRuns: vi.fn(async () => Array.from(runs.values())),
    hasTool: vi.fn((toolId: string) => tools.has(toolId)),
    registerTool: vi.fn((tool: { id: string }, handler: RegisteredTool['handler']) => {
      tools.set(tool.id, { handler })
    }),
    runtimeStart: vi.fn(async () => undefined),
    runtimeExecute: vi.fn(),
    runtimeCancel: vi.fn(() => false),
    hostOptions: [] as RuntimeHostCallbacks[]
  }
})

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
  })
}))

vi.mock('./agents', () => ({
  agentManager: { getAgent: vi.fn() },
  toolRegistry: {
    hasTool: orchestratorMocks.hasTool,
    registerTool: orchestratorMocks.registerTool
  }
}))

vi.mock('./ai-orchestrator-store', () => ({
  DEFAULT_PROFILE_ID: 'profile-default',
  aiOrchestratorStore: {
    initialize: orchestratorMocks.initialize,
    getProfile: orchestratorMocks.getProfile,
    createOrchestratorRun: orchestratorMocks.createOrchestratorRun,
    getOrchestratorRun: orchestratorMocks.getOrchestratorRun,
    updateOrchestratorRun: orchestratorMocks.updateOrchestratorRun,
    appendOrchestratorEvent: orchestratorMocks.appendOrchestratorEvent,
    listSessionHistory: orchestratorMocks.listSessionHistory,
    listOrchestratorRuns: orchestratorMocks.listOrchestratorRuns
  }
}))

vi.mock('./ai-automation-scheduler', () => ({
  aiAutomationScheduler: {
    setExecutor: vi.fn(),
    initialize: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined)
  }
}))

vi.mock('./ai-cli-import-service', () => ({
  aiCliImportService: { preview: vi.fn(), apply: vi.fn() }
}))

vi.mock('./ai-imported-config-runtime', () => ({
  aiImportedConfigRuntime: {
    initialize: vi.fn(async () => undefined),
    buildSystemPrompt: vi.fn(async () => ''),
    assertAgentProfileVisible: vi.fn(async () => undefined)
  }
}))

vi.mock('./intelligence-mcp-registry', () => ({
  intelligenceMcpRegistry: { listStructuredTools: vi.fn(), callTool: vi.fn() }
}))

vi.mock('./pi-agent-runtime-host', () => ({
  PiAgentRuntimeHost: class {
    constructor(options: RuntimeHostCallbacks) {
      orchestratorMocks.hostOptions.push(options)
    }

    start = orchestratorMocks.runtimeStart
    stop = vi.fn(async () => undefined)
    isReady = vi.fn(() => true)
    execute = orchestratorMocks.runtimeExecute
    cancel = orchestratorMocks.runtimeCancel
  },
  resolvePiRuntimeToolSpecs: vi.fn(() => [])
}))

import { AiCliOrchestrator } from './ai-cli-orchestrator'

const parentRunId = 'parent-run-release'

function parentRun(metadata: Record<string, unknown> = {}): AiOrchestratorRunRecord {
  return {
    id: parentRunId,
    sessionId: 'session-release',
    objective: 'Coordinate the release review.',
    profileId: 'profile-parent',
    runtimeProvider: 'pi-core',
    cwd: '/workspace/release',
    status: 'running',
    metadata: {
      approvalGranted: true,
      allowedToolIds: ['tool.safe', 'tool.restricted'],
      executionBudget: {
        maxSteps: 5,
        maxCost: 2,
        maxChildRuns: 2,
        maxConcurrency: 2
      },
      ...metadata
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

function node(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nodeId: 'review',
    profileId: 'profile-reviewer',
    objective: 'Review the release artifacts.',
    dependsOn: [],
    requestedTools: ['tool.safe'],
    requestedMcpServers: [],
    budget: { maxSteps: 5, maxCost: 2, maxChildRuns: 0, maxConcurrency: 1 },
    ...overrides
  }
}

function delegationTool(): RegisteredTool['handler'] {
  const tool = orchestratorMocks.tools.get('agent.delegate')
  if (!tool) throw new Error('Delegation tool was not registered')
  return tool.handler
}

function latestHostCallbacks(): RuntimeHostCallbacks {
  const callbacks = orchestratorMocks.hostOptions.at(-1)
  if (!callbacks) throw new Error('Pi runtime host callbacks were not captured')
  return callbacks
}

function enabledProfile(profileId: string, allowedToolIds = ['tool.safe']): AiAgentProfile {
  return {
    id: profileId,
    name: profileId,
    description: 'Executes governed work.',
    runtimeProvider: 'pi-core',
    enabled: true,
    modelPreference: [],
    allowedToolIds,
    enabledSkillIds: [],
    permissionPolicy: { mode: 'manual', allowedPermissions: [] },
    timeoutMs: 30_000,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

let orchestrator: AiCliOrchestrator
describe('AiCliOrchestrator delegation boundary', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    orchestratorMocks.profiles.clear()
    orchestratorMocks.runs.clear()
    orchestratorMocks.tools.clear()
    orchestratorMocks.hostOptions.length = 0
    orchestratorMocks.runtimeExecute.mockReset()
    orchestratorMocks.runtimeCancel.mockReset()
    orchestratorMocks.runtimeCancel.mockReturnValue(false)
    orchestrator = new AiCliOrchestrator()
    await orchestrator.initialize()
    orchestratorMocks.runs.set(parentRunId, parentRun())
  })

  it('records an unapproved interactive delegation plan without starting child runs', async () => {
    orchestratorMocks.runs.set(parentRunId, parentRun({ approvalGranted: false }))

    await expect(
      delegationTool()({ nodes: [node()], maxConcurrency: 2 }, { taskId: parentRunId })
    ).rejects.toThrow('Interactive delegation plan requires user approval')

    expect(orchestratorMocks.runs.get(parentRunId)?.delegationPlan).toMatchObject({
      status: 'pending_approval',
      maxConcurrency: 2,
      nodes: [{ nodeId: 'review', profileId: 'profile-reviewer' }]
    })
    expect(orchestratorMocks.runtimeExecute).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'a tool outside automation preauthorization',
      plan: node({ requestedTools: ['tool.restricted'] }),
      reason: 'Tool tool.restricted is not preauthorized for delegation'
    },
    {
      name: 'an MCP server outside automation preauthorization',
      plan: node({ requestedMcpServers: ['mcp-private'] }),
      reason: 'MCP server mcp-private is not preauthorized for delegation'
    }
  ])('pauses rather than escalating for $name', async ({ plan, reason }) => {
    orchestratorMocks.runs.set(
      parentRunId,
      parentRun({
        automationPolicy: {
          allowedAgentProfileIds: ['profile-reviewer'],
          allowedToolIds: ['tool.safe'],
          allowedMcpServerIds: ['mcp-safe']
        }
      })
    )

    await expect(delegationTool()({ nodes: [plan] }, { taskId: parentRunId })).rejects.toThrow(
      reason
    )

    expect(orchestratorMocks.runs.get(parentRunId)?.delegationPlan).toMatchObject({
      status: 'pending_approval',
      nodes: [{ nodeId: 'review' }]
    })
    expect(orchestratorMocks.runtimeExecute).not.toHaveBeenCalled()
  })

  it('rejects malformed plans before persisting a plan or creating a child run', async () => {
    const delegate = delegationTool()

    await expect(
      delegate({ nodes: [node({ dependsOn: ['missing'] })] }, { taskId: parentRunId })
    ).rejects.toThrow('Delegation node review has unknown dependencies')
    await expect(
      delegate({ nodes: [node({ dependsOn: ['review'] })] }, { taskId: parentRunId })
    ).rejects.toThrow('Delegation node review cannot depend on itself')
    await expect(
      delegate({ nodes: [node({ budget: { maxSteps: 6 } })] }, { taskId: parentRunId })
    ).rejects.toThrow('Delegation node review exceeds the parent execution budget')
    orchestratorMocks.runs.set(
      parentRunId,
      parentRun({
        executionBudget: { maxSteps: 5, maxCost: 2, maxChildRuns: 1, maxConcurrency: 2 }
      })
    )
    await expect(
      delegate({ nodes: [node(), node({ nodeId: 'second' })] }, { taskId: parentRunId })
    ).rejects.toThrow('Delegation plan exceeds maxChildRuns=1')

    expect(orchestratorMocks.runs.get(parentRunId)?.delegationPlan).toBeUndefined()
    expect(orchestratorMocks.runtimeExecute).not.toHaveBeenCalled()
  })

  it('rejects dependency cycles and caps an approved plan at the parent concurrency limit', async () => {
    const delegate = delegationTool()

    await expect(
      delegate(
        {
          nodes: [
            node({ nodeId: 'first', dependsOn: ['second'] }),
            node({ nodeId: 'second', dependsOn: ['first'] })
          ]
        },
        { taskId: parentRunId }
      )
    ).rejects.toThrow('Delegation plan contains a dependency cycle')

    orchestratorMocks.runs.set(
      parentRunId,
      parentRun({
        approvalGranted: false,
        executionBudget: { maxSteps: 5, maxCost: 2, maxChildRuns: 2, maxConcurrency: 1 }
      })
    )
    await expect(
      delegate({ nodes: [node()], maxConcurrency: 99 }, { taskId: parentRunId })
    ).rejects.toThrow('Interactive delegation plan requires user approval')

    expect(orchestratorMocks.runs.get(parentRunId)?.delegationPlan).toMatchObject({
      maxConcurrency: 1,
      status: 'pending_approval'
    })
    expect(orchestratorMocks.runtimeExecute).not.toHaveBeenCalled()
  })

  it('fails an approved plan when its referenced child profile has disappeared', async () => {
    let fingerprint = ''
    try {
      await delegationTool()({ nodes: [node()] }, { taskId: parentRunId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      fingerprint = JSON.parse(message.slice('APPROVAL_REQUIRED:'.length)).fingerprint as string
    }
    const current = orchestratorMocks.runs.get(parentRunId)
    if (!current) throw new Error('Expected parent run')
    orchestratorMocks.runs.set(parentRunId, {
      ...current,
      metadata: { ...current.metadata, approvalGrantFingerprint: fingerprint }
    })

    await expect(delegationTool()({ nodes: [node()] }, { taskId: parentRunId })).rejects.toThrow(
      'Delegation profile profile-reviewer is unavailable'
    )

    expect(orchestratorMocks.runs.get(parentRunId)?.delegationPlan).toMatchObject({
      status: 'failed',
      nodes: [{ profileId: 'profile-reviewer' }]
    })
    expect(orchestratorMocks.runtimeExecute).not.toHaveBeenCalled()
  })

  it('forwards explicit session step and tool limits to the Pi runtime budget', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', {
      id: 'profile-autonomous',
      name: 'Autonomous profile',
      description: 'Executes governed session work.',
      runtimeProvider: 'pi-core',
      enabled: true,
      modelPreference: [],
      allowedToolIds: [],
      enabledSkillIds: [],
      permissionPolicy: { mode: 'manual', allowedPermissions: [] },
      timeoutMs: 30_000,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    orchestratorMocks.runtimeExecute.mockResolvedValue({
      runId: 'session-budget-run',
      output: 'Budget accepted.',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    })

    await orchestrator.execute({
      objective: 'Run the governed session.',
      profileId: 'profile-autonomous',
      approved: false,
      budget: { maxSteps: 7, maxToolCalls: 3 }
    })

    expect(orchestratorMocks.runtimeExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        budget: expect.objectContaining({ maxSteps: 7, maxToolCalls: 3 })
      })
    )
  })

  it('normalizes non-finite execution limits before the runtime boundary', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    orchestratorMocks.runtimeExecute.mockResolvedValue({
      runId: 'finite-budget-run',
      output: 'Budget normalized.',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    })

    const run = await orchestrator.execute({
      objective: 'Run with hostile limits.',
      profileId: 'profile-autonomous',
      budget: {
        maxSteps: Number.NaN,
        maxToolCalls: Number.NaN,
        maxCost: Number.NaN,
        maxChildRuns: Number.NaN,
        maxConcurrency: Number.NaN
      }
    })

    expect(run.status).toBe('completed')
    const payload = orchestratorMocks.runtimeExecute.mock.calls[0]?.[0]
    expect(payload?.budget).toMatchObject({
      maxSteps: 20,
      maxToolCalls: 20,
      maxChildRuns: 8,
      maxConcurrency: 4
    })
    expect(payload?.budget.maxCost).toBeUndefined()
  })

  it('marks persisted queued and running runs interrupted during initialization recovery', async () => {
    orchestratorMocks.runs.set(parentRunId, { ...parentRun(), status: 'queued' })
    orchestratorMocks.runs.set('running-recovery-run', {
      ...parentRun(),
      id: 'running-recovery-run',
      status: 'running'
    })

    const recoveredOrchestrator = new AiCliOrchestrator()
    await recoveredOrchestrator.initialize()

    expect(orchestratorMocks.runs.get(parentRunId)).toMatchObject({
      status: 'interrupted',
      error: 'Run was interrupted by application restart while queued'
    })
    expect(orchestratorMocks.runs.get('running-recovery-run')).toMatchObject({
      status: 'interrupted',
      error: 'Run was interrupted by application restart while running'
    })
    expect(orchestratorMocks.appendOrchestratorEvent).toHaveBeenCalledWith(
      parentRunId,
      'run.interrupted',
      { reason: 'application_restart', previousStatus: 'queued' }
    )
    expect(orchestratorMocks.appendOrchestratorEvent).toHaveBeenCalledWith(
      'running-recovery-run',
      'run.interrupted',
      { reason: 'application_restart', previousStatus: 'running' }
    )
  })

  it('persists an exact pending approval fingerprint and consumes its grant only once', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    orchestratorMocks.runtimeExecute.mockRejectedValueOnce(
      new Error(
        'APPROVAL_REQUIRED:{"kind":"tool","fingerprint":"tool:release-notes","reason":"Publishing needs approval"}'
      )
    )
    orchestratorMocks.runtimeExecute.mockResolvedValueOnce({
      runId: 'approval-run',
      output: 'Published.',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    })

    const pending = await orchestrator.execute({
      objective: 'Publish release notes.',
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: 'approval-run' }
    })

    expect(pending).toMatchObject({
      id: 'approval-run',
      status: 'pending_approval',
      approvalReason: 'Publishing needs approval'
    })
    expect(orchestratorMocks.runs.get('approval-run')?.metadata).toMatchObject({
      pendingApprovalFingerprint: 'tool:release-notes',
      pendingApprovalKind: 'tool',
      pendingApprovalReason: 'Publishing needs approval'
    })

    const approved = await orchestrator.approveRun('approval-run')

    expect(approved.status).toBe('completed')
    expect(orchestratorMocks.runs.get('approval-run')?.metadata).not.toHaveProperty(
      'pendingApprovalFingerprint'
    )
    expect(orchestratorMocks.runs.get('approval-run')?.metadata).not.toHaveProperty(
      'approvalGrantFingerprint'
    )
    await expect(
      latestHostCallbacks().onApprovalConsumed('approval-run', 'tool:release-notes')
    ).rejects.toThrow('Approval grant does not match the requested operation')
  })

  it('counts completed children against the cumulative delegation budget', async () => {
    orchestratorMocks.runs.set('existing-child', {
      ...parentRun(),
      id: 'existing-child',
      parentRunId,
      status: 'completed'
    })

    await expect(
      delegationTool()({ nodes: [node(), node({ nodeId: 'second' })] }, { taskId: parentRunId })
    ).rejects.toThrow('Delegation plan exceeds maxChildRuns=2 (remaining=1, existingChildren=1)')
  })

  it('executes child runs with a policy narrowed to the approved delegation node', async () => {
    orchestratorMocks.profiles.set('profile-reviewer', enabledProfile('profile-reviewer'))
    orchestratorMocks.runs.set(
      parentRunId,
      parentRun({
        automationPolicy: {
          version: 3,
          allowedToolIds: ['tool.safe', 'tool.restricted'],
          allowedMcpServerIds: ['mcp-safe', 'mcp-private'],
          allowedAgentProfileIds: ['profile-reviewer'],
          allowedPaths: ['/workspace/release'],
          allowedNetworkTargets: ['registry.example.test'],
          budget: { maxSteps: 5, maxToolCalls: 5, maxCost: 2, maxChildRuns: 2, maxConcurrency: 2 },
          timeoutMs: 30_000,
          maxRunsPerWindow: 5,
          windowMs: 60_000
        }
      })
    )
    const requestedNode = node({
      requestedMcpServers: ['mcp-safe'],
      budget: { maxSteps: 5, maxToolCalls: 5, maxCost: 2, maxChildRuns: 0, maxConcurrency: 1 }
    })
    let fingerprint = ''
    try {
      await delegationTool()({ nodes: [requestedNode] }, { taskId: parentRunId })
    } catch (error) {
      const prefix = 'APPROVAL_REQUIRED:'
      const message = error instanceof Error ? error.message : String(error)
      fingerprint = JSON.parse(message.slice(prefix.length)).fingerprint as string
    }
    expect(fingerprint).toMatch(/^delegation:/)
    const current = orchestratorMocks.runs.get(parentRunId)
    if (!current) throw new Error('Expected parent run')
    orchestratorMocks.runs.set(parentRunId, {
      ...current,
      metadata: { ...current.metadata, approvalGrantFingerprint: fingerprint }
    })
    orchestratorMocks.runtimeExecute.mockResolvedValue({
      runId: 'child-run',
      output: 'Reviewed.',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    })

    await delegationTool()({ nodes: [requestedNode] }, { taskId: parentRunId })

    expect(orchestratorMocks.runtimeExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          metadata: expect.objectContaining({
            automationPolicy: expect.objectContaining({
              allowedToolIds: ['tool.safe'],
              allowedMcpServerIds: ['mcp-safe'],
              allowedAgentProfileIds: ['profile-reviewer'],
              budget: expect.objectContaining({ maxToolCalls: 5, maxChildRuns: 0 })
            })
          })
        })
      })
    )
    expect(orchestratorMocks.runs.get(parentRunId)?.metadata).not.toHaveProperty(
      'approvalGrantFingerprint'
    )
  })

  it('cancels queued and pending descendants with their parent run', async () => {
    const child = {
      ...parentRun(),
      id: 'child-run',
      parentRunId,
      status: 'queued' as const
    }
    const grandchild = {
      ...parentRun(),
      id: 'grandchild-run',
      parentRunId: child.id,
      status: 'pending_approval' as const
    }
    orchestratorMocks.runs.set(parentRunId, { ...parentRun(), status: 'pending_approval' })
    orchestratorMocks.runs.set(child.id, child)
    orchestratorMocks.runs.set(grandchild.id, grandchild)

    await expect(orchestrator.cancelPersistedRun(parentRunId)).resolves.toBe(true)
    expect(orchestratorMocks.runs.get(parentRunId)?.status).toBe('cancelled')
    expect(orchestratorMocks.runs.get(child.id)?.status).toBe('cancelled')
    expect(orchestratorMocks.runs.get(grandchild.id)?.status).toBe('cancelled')
  })

  it('keeps stable tool-call IDs durable across recovery and blocks interrupted replay', async () => {
    const initialCallbacks = latestHostCallbacks()

    await expect(
      initialCallbacks.beginToolCall(parentRunId, 'call-release-1', 'tool.safe', { revision: 1 })
    ).resolves.toBe('execute')
    expect(orchestratorMocks.runs.get(parentRunId)?.metadata).toMatchObject({
      toolCallStates: { 'call-release-1': { state: 'started', toolId: 'tool.safe' } }
    })

    const recoveredOrchestrator = new AiCliOrchestrator()
    await recoveredOrchestrator.initialize()
    const recoveredCallbacks = latestHostCallbacks()

    await expect(
      recoveredCallbacks.loadToolCallResult(parentRunId, 'call-release-1')
    ).resolves.toEqual({
      error: 'INTERRUPTED_TOOL_CALL:call-release-1'
    })
    await expect(
      recoveredCallbacks.beginToolCall(parentRunId, 'call-release-1', 'tool.safe', { revision: 1 })
    ).resolves.toBe('interrupted')

    await recoveredCallbacks.persistToolCallResult(parentRunId, 'call-release-1', {
      output: { published: true }
    })
    expect(orchestratorMocks.runs.get(parentRunId)?.metadata).toMatchObject({
      toolCallStates: { 'call-release-1': { state: 'completed', toolId: 'tool.safe' } },
      completedToolCallResults: { 'call-release-1': { output: { published: true } } }
    })
    await expect(
      recoveredCallbacks.loadToolCallResult(parentRunId, 'call-release-1')
    ).resolves.toEqual({
      output: { published: true }
    })
    await expect(
      recoveredCallbacks.beginToolCall(parentRunId, 'call-release-1', 'tool.safe', { revision: 2 })
    ).resolves.toBe('interrupted')
  })
})
