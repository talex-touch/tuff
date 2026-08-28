import type {
  AiAgentProfile,
  AiAutomationDefinition,
  AiAutomationPolicy,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface RegisteredTool {
  handler: (input: unknown, context: { taskId: string }) => Promise<unknown>
}

interface RuntimeHostCallbacks {
  onEvent: (event: {
    runId: string
    type: string
    level?: 'debug' | 'error' | 'info' | 'warn'
    payload?: Record<string, unknown>
  }) => Promise<void>
  beginToolCall: (
    runId: string,
    toolCallId: string,
    toolId: string,
    input: unknown
  ) => Promise<'execute' | 'interrupted'>
  loadToolCallResult: (
    runId: string,
    toolCallId: string,
    toolId: string
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
  const automations = new Map<string, AiAutomationDefinition>()
  const runs = new Map<string, AiOrchestratorRunRecord>()
  const tools = new Map<string, RegisteredTool>()
  return {
    profiles,
    automations,
    runs,
    tools,
    initialize: vi.fn(async () => undefined),
    getProfile: vi.fn(async (profileId: string) => profiles.get(profileId) ?? null),
    getAutomation: vi.fn(async (automationId: string) => automations.get(automationId) ?? null),
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
    appendOrchestratorEvent: vi.fn(
      async (
        _runId: string,
        _type: string,
        _payload?: Record<string, unknown>,
        _level?: 'debug' | 'error' | 'info' | 'warn'
      ) => undefined
    ),
    listSessionHistory: vi.fn(async () => []),
    listOrchestratorRuns: vi.fn(async () => Array.from(runs.values())),
    getAgent: vi.fn(),
    hasTool: vi.fn((toolId: string) => tools.has(toolId)),
    registerTool: vi.fn((tool: { id: string }, handler: RegisteredTool['handler']) => {
      tools.set(tool.id, { handler })
    }),
    runtimeStart: vi.fn(async () => undefined),
    runtimeStop: vi.fn(async () => undefined),
    runtimeExecute: vi.fn(),
    runtimeCancel: vi.fn(() => false),
    runtimeIsRunActive: vi.fn((_runId?: string) => false),
    hostOptions: [] as RuntimeHostCallbacks[]
  }
})

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
  })
}))

vi.mock('./agents', () => ({
  agentManager: { getAgent: orchestratorMocks.getAgent },
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
    getAutomation: orchestratorMocks.getAutomation,
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

vi.mock('./pi-agent-runtime-host', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pi-agent-runtime-host')>()
  return {
    ...actual,
    PiAgentRuntimeHost: class {
      constructor(options: RuntimeHostCallbacks) {
        orchestratorMocks.hostOptions.push(options)
      }

      start = orchestratorMocks.runtimeStart
      stop = orchestratorMocks.runtimeStop
      isReady = vi.fn(() => true)
      isRunActive = orchestratorMocks.runtimeIsRunActive
      execute = orchestratorMocks.runtimeExecute
      cancel = orchestratorMocks.runtimeCancel
    },
    resolvePiRuntimeToolSpecs: vi.fn(() => [])
  }
})

import { AiCliOrchestrator } from './ai-cli-orchestrator'
import {
  createApprovalRequiredError,
  createInterruptedToolCallError,
  createRunCancelledError,
  createRunInterruptedError
} from './pi-agent-runtime-control-error'

const parentRunId = 'parent-run-release'
const CANARY = 'sk-live-token@/Users/private/native-stack.ts:42'
const AUTHORITY_VERSION = 1_700_000_000_000

function opaqueRuntimeReference(namespace: 'pi-call' | 'pi-tool', value: string): string {
  return `${namespace}:${createHash('sha256')
    .update(`${namespace}\0${value}`)
    .digest('hex')
    .slice(0, 32)}`
}

function digestStructuredValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function profileAuthorityDigest(profile: AiAgentProfile): string {
  return digestStructuredValue({
    id: profile.id,
    runtimeProvider: profile.runtimeProvider,
    enabled: profile.enabled,
    allowedToolIds: profile.allowedToolIds,
    enabledSkillIds: profile.enabledSkillIds,
    permissionPolicy: profile.permissionPolicy,
    timeoutMs: profile.timeoutMs,
    updatedAt: profile.updatedAt
  })
}

function normalizeTestAutomationPolicy(value: Record<string, unknown>): AiAutomationPolicy {
  const budget = (value.budget ?? {}) as Partial<AiAutomationPolicy['budget']>
  return {
    version: typeof value.version === 'number' ? value.version : 1,
    allowedToolIds: Array.isArray(value.allowedToolIds)
      ? value.allowedToolIds.filter((item): item is string => typeof item === 'string')
      : [],
    allowedMcpServerIds: Array.isArray(value.allowedMcpServerIds)
      ? value.allowedMcpServerIds.filter((item): item is string => typeof item === 'string')
      : [],
    allowedAgentProfileIds: Array.isArray(value.allowedAgentProfileIds)
      ? value.allowedAgentProfileIds.filter((item): item is string => typeof item === 'string')
      : ['profile-parent'],
    allowedPaths: Array.isArray(value.allowedPaths)
      ? value.allowedPaths.filter((item): item is string => typeof item === 'string')
      : ['/workspace/release'],
    allowedNetworkTargets: Array.isArray(value.allowedNetworkTargets)
      ? value.allowedNetworkTargets
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.toLowerCase())
      : [],
    budget: {
      maxSteps: budget.maxSteps ?? 20,
      maxToolCalls: budget.maxToolCalls ?? 20,
      ...(budget.maxCost === undefined ? {} : { maxCost: budget.maxCost }),
      maxChildRuns: budget.maxChildRuns ?? 2,
      maxConcurrency: budget.maxConcurrency ?? 2
    },
    timeoutMs: typeof value.timeoutMs === 'number' ? value.timeoutMs : 10 * 60 * 1000,
    maxRunsPerWindow: typeof value.maxRunsPerWindow === 'number' ? value.maxRunsPerWindow : 60,
    windowMs: typeof value.windowMs === 'number' ? value.windowMs : 60 * 60 * 1000
  }
}

function parentRun(metadata: Record<string, unknown> = {}): AiOrchestratorRunRecord {
  const profile = enabledProfile('profile-parent', ['tool.safe', 'tool.restricted'])
  const requestedToolIds = Array.isArray(metadata.allowedToolIds)
    ? metadata.allowedToolIds.filter((value): value is string => typeof value === 'string')
    : profile.allowedToolIds
  const automationPolicy =
    metadata.automationPolicy && typeof metadata.automationPolicy === 'object'
      ? normalizeTestAutomationPolicy(metadata.automationPolicy as Record<string, unknown>)
      : undefined
  const automationId = automationPolicy ? 'automation-parent' : undefined
  if (automationPolicy) {
    orchestratorMocks.automations.set('automation-parent', {
      id: 'automation-parent',
      name: 'Parent automation',
      description: 'Exercises delegated authority.',
      enabled: true,
      objective: 'Coordinate the release review.',
      profileId: profile.id,
      trigger: { type: 'startup' },
      approvalMode: 'preauthorized',
      cwd: '/workspace/release',
      createdAt: AUTHORITY_VERSION,
      policy: automationPolicy,
      updatedAt: AUTHORITY_VERSION
    })
  }
  const executionBudget = {
    maxSteps: 5,
    maxCost: 2,
    maxChildRuns: 2,
    maxConcurrency: 2,
    ...((metadata.executionBudget ?? {}) as Record<string, unknown>)
  }
  return {
    id: parentRunId,
    automationId,
    sessionId: 'session-release',
    objective: 'Coordinate the release review.',
    profileId: 'profile-parent',
    runtimeProvider: 'pi-core',
    cwd: '/workspace/release',
    status: 'running',
    metadata: {
      schemaVersion: 1,
      executionBudget,
      allowedToolRefs: requestedToolIds
        .map((toolId) => opaqueRuntimeReference('pi-tool', toolId))
        .sort(),
      requestInputPresent: false,
      profileAuthorityVersion: profile.updatedAt,
      profileAuthorityDigest: profileAuthorityDigest(profile),
      ...(automationPolicy
        ? {
            automationPolicyVersion: automationPolicy.version,
            automationPolicyDigest: digestStructuredValue(automationPolicy),
            automationAuthorityVersion: AUTHORITY_VERSION
          }
        : {}),
      ...(typeof metadata.approvalGrantFingerprint === 'string'
        ? { approvalGrantFingerprint: metadata.approvalGrantFingerprint }
        : {})
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
    createdAt: AUTHORITY_VERSION,
    updatedAt: AUTHORITY_VERSION
  }
}

let orchestrator: AiCliOrchestrator
describe('AiCliOrchestrator delegation boundary', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    orchestratorMocks.profiles.clear()
    orchestratorMocks.automations.clear()
    orchestratorMocks.runs.clear()
    orchestratorMocks.tools.clear()
    orchestratorMocks.hostOptions.length = 0
    orchestratorMocks.runtimeExecute.mockReset()
    orchestratorMocks.runtimeStop.mockReset()
    orchestratorMocks.runtimeStop.mockResolvedValue(undefined)
    orchestratorMocks.getAgent.mockReset()
    orchestratorMocks.runtimeCancel.mockReset()
    orchestratorMocks.runtimeCancel.mockReturnValue(false)
    orchestratorMocks.runtimeIsRunActive.mockReset()
    orchestratorMocks.runtimeIsRunActive.mockReturnValue(false)
    orchestrator = new AiCliOrchestrator()
    await orchestrator.initialize()
    orchestratorMocks.profiles.set(
      'profile-parent',
      enabledProfile('profile-parent', ['tool.safe', 'tool.restricted'])
    )
    orchestratorMocks.runs.set(parentRunId, parentRun())
  })

  it('records an unapproved interactive delegation plan without starting child runs', async () => {
    orchestratorMocks.runs.set(parentRunId, parentRun({ approvalGranted: false }))

    await expect(
      delegationTool()({ nodes: [node()], maxConcurrency: 2 }, { taskId: parentRunId })
    ).rejects.toThrow('Agent delegation requires user approval.')

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
      plan: node({ requestedTools: ['tool.restricted'] })
    },
    {
      name: 'an MCP server outside automation preauthorization',
      plan: node({ requestedMcpServers: ['mcp-private'] })
    }
  ])('pauses rather than escalating for $name', async ({ plan }) => {
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
      'Agent delegation requires user approval.'
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
    ).rejects.toThrow('Agent delegation requires user approval.')

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
      const approval = JSON.parse(message.slice('APPROVAL_REQUIRED:'.length)) as Record<
        string,
        unknown
      >
      fingerprint = approval.fingerprint as string
      expect(approval).toEqual({
        kind: 'delegation',
        fingerprint,
        reason: 'Agent delegation requires user approval.'
      })
      expect(message).not.toContain('Review the release artifacts.')
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
    const queued = parentRun()
    orchestratorMocks.runs.set(parentRunId, {
      ...queued,
      status: 'queued',
      metadata: {
        ...queued.metadata,
        arbitraryCallerField: CANARY,
        requestInput: { credential: CANARY },
        allowedToolIds: ['tool.safe']
      }
    })
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
    expect(orchestratorMocks.runs.get(parentRunId)?.metadata).not.toHaveProperty(
      'arbitraryCallerField'
    )
    expect(orchestratorMocks.runs.get(parentRunId)?.metadata).not.toHaveProperty('requestInput')
    expect(orchestratorMocks.runs.get(parentRunId)?.metadata).not.toHaveProperty('allowedToolIds')
    expect(JSON.stringify(orchestratorMocks.runs.get(parentRunId)?.metadata)).not.toContain(CANARY)
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

  it('closes admission and drains a pre-runtime execution before shutdown resolves', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    let signalProfileLookup!: () => void
    let releaseProfileLookup!: () => void
    const profileLookupStarted = new Promise<void>((resolve) => {
      signalProfileLookup = resolve
    })
    const profileLookupGate = new Promise<void>((resolve) => {
      releaseProfileLookup = resolve
    })
    orchestratorMocks.getProfile.mockImplementationOnce(async (profileId) => {
      signalProfileLookup()
      await profileLookupGate
      return orchestratorMocks.profiles.get(profileId) ?? null
    })

    const originalUpdate = orchestratorMocks.updateOrchestratorRun.getMockImplementation()
    if (!originalUpdate) throw new Error('Expected the store update mock implementation')
    let signalTerminalWrite!: () => void
    let releaseTerminalWrite!: () => void
    const terminalWriteStarted = new Promise<void>((resolve) => {
      signalTerminalWrite = resolve
    })
    const terminalWriteGate = new Promise<void>((resolve) => {
      releaseTerminalWrite = resolve
    })
    orchestratorMocks.updateOrchestratorRun.mockImplementation(async (runId, update) => {
      const result = await originalUpdate(runId, update)
      if (update.status === 'interrupted') {
        signalTerminalWrite()
        await terminalWriteGate
      }
      return result
    })

    const execution = orchestrator.execute({
      objective: 'Drain this admitted run during shutdown.',
      profileId: 'profile-autonomous'
    })
    let shutdown: Promise<void> | undefined
    try {
      await profileLookupStarted
      shutdown = orchestrator.shutdown()
      await vi.waitFor(() => expect(orchestratorMocks.runtimeStop).toHaveBeenCalledOnce())

      await expect(
        orchestrator.execute({
          objective: 'Reject admission after shutdown starts.',
          profileId: 'profile-autonomous'
        })
      ).rejects.toThrow('AI CLI orchestrator is shutting down')

      releaseProfileLookup()
      await terminalWriteStarted
      const shutdownSettled = vi.fn()
      void shutdown.then(shutdownSettled, shutdownSettled)
      await Promise.resolve()
      expect(shutdownSettled).not.toHaveBeenCalled()
      expect(orchestratorMocks.runtimeExecute).not.toHaveBeenCalled()

      releaseTerminalWrite()
      await expect(execution).resolves.toMatchObject({
        status: 'interrupted',
        error: 'AI_RUN_INTERRUPTED: AI run was interrupted.'
      })
      await expect(shutdown).resolves.toBeUndefined()
      expect(orchestratorMocks.runtimeExecute).not.toHaveBeenCalled()
    } finally {
      releaseProfileLookup()
      releaseTerminalWrite()
      orchestratorMocks.updateOrchestratorRun.mockImplementation(originalUpdate)
      await Promise.allSettled([execution, ...(shutdown ? [shutdown] : [])])
    }
  })

  it('persists an exact pending approval fingerprint and consumes its grant only once', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    const approvalFingerprint = 'a'.repeat(64)
    orchestratorMocks.runtimeExecute.mockRejectedValueOnce(
      createApprovalRequiredError('tool', approvalFingerprint)
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
      status: 'pending_approval',
      approvalReason: 'Tool access requires user approval.',
      error: 'Tool access requires user approval.'
    })
    expect(pending.id).toMatch(/^run_[a-f0-9]{32}$/)
    expect(pending.id).not.toBe('approval-run')
    expect(orchestratorMocks.runs.get(pending.id)?.metadata).toMatchObject({
      pendingApprovalFingerprint: approvalFingerprint,
      pendingApprovalKind: 'tool',
      pendingApprovalReason: 'Tool access requires user approval.'
    })
    expect(JSON.stringify(orchestratorMocks.runs.get(pending.id))).not.toContain(CANARY)

    const approved = await orchestrator.approveRun(pending.id)

    expect(approved.status).toBe('completed')
    expect(orchestratorMocks.runs.get(pending.id)?.metadata).not.toHaveProperty(
      'pendingApprovalFingerprint'
    )
    expect(orchestratorMocks.runs.get(pending.id)?.metadata).not.toHaveProperty(
      'approvalGrantFingerprint'
    )
    await expect(
      latestHostCallbacks().onApprovalConsumed(pending.id, approvalFingerprint)
    ).rejects.toThrow('Approval grant does not match the requested operation')
  })

  it('persists only the explicit run metadata schema and keeps raw input in process memory', async () => {
    orchestratorMocks.profiles.set(
      'profile-autonomous',
      enabledProfile('profile-autonomous', ['tool.safe'])
    )
    const rawInput = { credential: 'ghp_abcdefghijklmnopqrstuvwxyz123456', safe: true }
    orchestratorMocks.runtimeExecute.mockResolvedValue({
      runId: 'metadata-hygiene-run',
      output: 'Completed.',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    })

    const completed = await orchestrator.execute({
      objective: 'Verify metadata hygiene.',
      input: rawInput,
      profileId: 'profile-autonomous',
      allowedToolIds: ['tool.safe'],
      metadata: {
        orchestratorRunId: 'metadata-hygiene-run',
        arbitraryCallerField: CANARY,
        automationPolicy: { allowedToolIds: ['tool.restricted'] }
      }
    })

    expect(completed.id).toMatch(/^run_[a-f0-9]{32}$/)
    expect(completed.id).not.toBe('metadata-hygiene-run')
    expect(orchestratorMocks.runs.has('metadata-hygiene-run')).toBe(false)
    const metadata = orchestratorMocks.runs.get(completed.id)?.metadata
    expect(metadata).toMatchObject({
      schemaVersion: 1,
      requestInputPresent: true,
      allowedToolRefs: [opaqueRuntimeReference('pi-tool', 'tool.safe')]
    })
    expect(metadata).not.toHaveProperty('requestInput')
    expect(metadata).not.toHaveProperty('allowedToolIds')
    expect(metadata).not.toHaveProperty('arbitraryCallerField')
    expect(metadata).not.toHaveProperty('automationPolicy')
    expect(JSON.stringify(metadata)).not.toContain(rawInput.credential)
    expect(JSON.stringify(metadata)).not.toContain('tool.safe')
    expect(orchestratorMocks.runtimeExecute).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ input: rawInput }) })
    )
  })

  it('generates a fresh main-owned run ID for repeated caller aliases', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    orchestratorMocks.runtimeExecute.mockImplementation(async (request) => ({
      runId: request.run.id,
      output: 'Completed.',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    }))
    const callerAlias = '/private/run id/\u4efb\u52a1'

    const first = await orchestrator.execute({
      objective: 'First run.',
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: callerAlias }
    })
    const second = await orchestrator.execute({
      objective: 'Second run.',
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: callerAlias }
    })

    expect(first.id).toMatch(/^run_[a-f0-9]{32}$/)
    expect(second.id).toMatch(/^run_[a-f0-9]{32}$/)
    expect(first.id).not.toBe(second.id)
    expect(orchestratorMocks.runs.has(callerAlias)).toBe(false)
    expect(JSON.stringify([first.metadata, second.metadata])).not.toContain(callerAlias)
  })

  it('restores a pending run input only from verified in-process memory', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    const rawInput = { releaseToken: 'ghp_abcdefghijklmnopqrstuvwxyz123456' }
    const approvalFingerprint = 'd'.repeat(64)
    orchestratorMocks.runtimeExecute
      .mockRejectedValueOnce(createApprovalRequiredError('tool', approvalFingerprint))
      .mockResolvedValueOnce({
        runId: 'volatile-input-run',
        output: 'Approved.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })

    const pending = await orchestrator.execute({
      objective: 'Resume with the original input.',
      input: rawInput,
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: 'volatile-input-run' }
    })
    expect(pending.status).toBe('pending_approval')
    expect(JSON.stringify(orchestratorMocks.runs.get(pending.id)?.metadata)).not.toContain(
      rawInput.releaseToken
    )

    const approved = await orchestrator.approveRun(pending.id)

    expect(approved.status).toBe('completed')
    expect(orchestratorMocks.runtimeExecute.mock.calls[1]?.[0].request.input).toEqual(rawInput)
  })

  it('interrupts approval with a stable error when raw input is unavailable after restart', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    orchestratorMocks.runtimeExecute.mockRejectedValueOnce(
      createApprovalRequiredError('tool', 'e'.repeat(64))
    )
    const pending = await orchestrator.execute({
      objective: 'Require approval across restart.',
      input: { credential: 'AKIA1234567890ABCDEF' },
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: 'restart-input-run' }
    })
    expect(pending.status).toBe('pending_approval')

    const restarted = new AiCliOrchestrator()
    await restarted.initialize()
    const interrupted = await restarted.approveRun(pending.id)

    expect(interrupted).toMatchObject({
      status: 'interrupted',
      error: 'AI_RUN_INPUT_UNAVAILABLE: AI run input is no longer available.'
    })
    expect(orchestratorMocks.runtimeExecute).toHaveBeenCalledTimes(1)
  })

  it('rebuilds automation input and policy from the authoritative definition after restart', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    const policy = normalizeTestAutomationPolicy({
      version: 4,
      allowedToolIds: ['tool.safe'],
      allowedAgentProfileIds: ['profile-autonomous'],
      budget: { maxSteps: 5, maxToolCalls: 5, maxChildRuns: 0, maxConcurrency: 1 }
    })
    const authoritativeInput = { credential: 'AKIA1234567890ABCDEF' }
    orchestratorMocks.automations.set('automation-authority', {
      id: 'automation-authority',
      name: 'Authority automation',
      description: 'Uses only persisted automation authority.',
      enabled: true,
      objective: 'Execute the authoritative automation.',
      input: authoritativeInput,
      profileId: 'profile-autonomous',
      trigger: { type: 'startup' },
      approvalMode: 'preauthorized',
      cwd: '/workspace/release',
      createdAt: AUTHORITY_VERSION,
      policy,
      updatedAt: AUTHORITY_VERSION
    })
    orchestratorMocks.runtimeExecute
      .mockRejectedValueOnce(createApprovalRequiredError('tool', '1'.repeat(64)))
      .mockResolvedValueOnce({
        runId: 'automation-authority-run',
        output: 'Approved automation.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })

    const pending = await orchestrator.execute(
      {
        objective: 'Forged objective.',
        input: { forged: CANARY },
        profileId: 'profile-missing',
        metadata: {
          orchestratorRunId: 'automation-authority-run',
          automationPolicy: { allowedToolIds: ['tool.restricted'] }
        }
      },
      'automation-authority'
    )
    expect(pending.status).toBe('pending_approval')
    expect(orchestratorMocks.runtimeExecute.mock.calls[0]?.[0].request).toMatchObject({
      objective: 'Execute the authoritative automation.',
      input: authoritativeInput,
      profileId: 'profile-autonomous',
      metadata: { automationPolicy: policy }
    })
    expect(JSON.stringify(orchestratorMocks.runs.get(pending.id)?.metadata)).not.toContain(
      authoritativeInput.credential
    )
    expect(JSON.stringify(orchestratorMocks.runs.get(pending.id)?.metadata)).not.toContain(CANARY)

    const restarted = new AiCliOrchestrator()
    await restarted.initialize()
    const approved = await restarted.approveRun(pending.id)

    expect(approved.status).toBe('completed')
    expect(orchestratorMocks.runtimeExecute.mock.calls[1]?.[0].request).toMatchObject({
      input: authoritativeInput,
      metadata: {
        automationPolicy: policy,
        approvalGrantFingerprint: '1'.repeat(64)
      }
    })
  })

  it.each([
    {
      name: 'unknown ref',
      refs: [`pi-tool:${'0'.repeat(32)}`]
    },
    {
      name: 'duplicate ref',
      refs: [
        opaqueRuntimeReference('pi-tool', 'tool.safe'),
        opaqueRuntimeReference('pi-tool', 'tool.safe')
      ]
    }
  ])('interrupts approval when persisted allowed tools contain an $name', async ({ refs }) => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    orchestratorMocks.runtimeExecute.mockRejectedValueOnce(
      createApprovalRequiredError('tool', 'f'.repeat(64))
    )
    const pending = await orchestrator.execute({
      objective: 'Validate persisted authority.',
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: `authority-${refs.length}-${refs[0]?.slice(-1)}` }
    })
    const persisted = orchestratorMocks.runs.get(pending.id)
    if (!persisted) throw new Error('Expected persisted pending run')
    orchestratorMocks.runs.set(pending.id, {
      ...persisted,
      metadata: { ...persisted.metadata, allowedToolRefs: refs }
    })

    const interrupted = await orchestrator.approveRun(pending.id)

    expect(interrupted).toMatchObject({
      status: 'interrupted',
      error: 'AI_RUN_AUTHORITY_CHANGED: AI run authority changed.'
    })
    expect(orchestratorMocks.runtimeExecute).toHaveBeenCalledTimes(1)
  })

  it('persists and returns only fixed errors for ordinary and forged runtime failures', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    orchestratorMocks.runtimeExecute
      .mockRejectedValueOnce(new Error(CANARY))
      .mockRejectedValueOnce(new Error(`APPROVAL_REQUIRED:${CANARY}`))
      .mockRejectedValueOnce(
        new Error(
          `APPROVAL_REQUIRED:${JSON.stringify({
            kind: 'tool',
            fingerprint: 'b'.repeat(64),
            reason: CANARY
          })}`
        )
      )

    const failed = await orchestrator.execute({
      objective: 'Run a failing tool.',
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: 'redacted-run' }
    })
    const malformed = await orchestrator.execute({
      objective: 'Run a malformed approval.',
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: 'malformed-approval-run' }
    })
    const forged = await orchestrator.execute({
      objective: 'Run a forged approval kind.',
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: 'forged-approval-run' }
    })

    expect(failed).toMatchObject({ status: 'failed', error: 'AI_RUN_FAILED: AI run failed.' })
    expect(malformed).toMatchObject({ status: 'failed', error: 'AI_RUN_FAILED: AI run failed.' })
    expect(forged).toMatchObject({ status: 'failed', error: 'AI_RUN_FAILED: AI run failed.' })
    const persistedEvidence = JSON.stringify({
      failed: orchestratorMocks.runs.get(failed.id),
      malformed: orchestratorMocks.runs.get(malformed.id),
      forged: orchestratorMocks.runs.get(forged.id),
      events: orchestratorMocks.appendOrchestratorEvent.mock.calls.filter(([runId]) =>
        new Set([failed.id, malformed.id, forged.id]).has(runId)
      )
    })
    expect(orchestratorMocks.runs.get(failed.id)).toBeDefined()
    expect(orchestratorMocks.runs.get(malformed.id)).toBeDefined()
    expect(orchestratorMocks.runs.get(forged.id)).toBeDefined()
    expect(persistedEvidence).not.toContain(CANARY)
  })

  it('persists only allowlisted runtime event projections', async () => {
    await latestHostCallbacks().onEvent({
      runId: parentRunId,
      type: 'message_end',
      payload: {
        message: {
          role: 'assistant',
          stopReason: 'error',
          content: [{ type: 'text', text: CANARY }],
          errorMessage: CANARY,
          path: CANARY
        },
        error: CANARY,
        stack: CANARY,
        [CANARY]: CANARY
      }
    })

    expect(orchestratorMocks.appendOrchestratorEvent).toHaveBeenLastCalledWith(
      parentRunId,
      'message_end',
      {
        role: 'assistant',
        stopReason: 'error',
        contentBlockCount: 1,
        hasError: true
      },
      'info'
    )

    await latestHostCallbacks().onEvent({
      runId: parentRunId,
      type: 'tool_execution_end',
      level: 'error',
      payload: {
        toolCallId: CANARY,
        toolName: CANARY,
        result: { path: CANARY },
        isError: false
      }
    })
    expect(orchestratorMocks.appendOrchestratorEvent).toHaveBeenLastCalledWith(
      parentRunId,
      'tool_execution_end',
      {
        toolCallRef: opaqueRuntimeReference('pi-call', CANARY),
        toolRef: opaqueRuntimeReference('pi-tool', CANARY),
        isError: false
      },
      'info'
    )

    const persistedEventCount = orchestratorMocks.appendOrchestratorEvent.mock.calls.length
    await latestHostCallbacks().onEvent({
      runId: parentRunId,
      type: CANARY,
      level: 'error',
      payload: { [CANARY]: CANARY }
    })
    expect(orchestratorMocks.appendOrchestratorEvent).toHaveBeenCalledTimes(persistedEventCount)
    expect(JSON.stringify(orchestratorMocks.appendOrchestratorEvent.mock.calls)).not.toContain(
      CANARY
    )
  })

  it('serializes Privacy deletion fences against active runs, metadata mutations, and late writes', async () => {
    orchestratorMocks.runtimeIsRunActive.mockReturnValue(true)
    expect(orchestrator.isPrivacyRunProtected(parentRunId)).toBe(true)
    expect(orchestrator.acquirePrivacyRunDeletionFence(parentRunId)).toBeNull()
    orchestratorMocks.runtimeIsRunActive.mockReturnValue(false)

    let resolveRunLookup!: (run: AiOrchestratorRunRecord | null) => void
    const runLookup = new Promise<AiOrchestratorRunRecord | null>((resolve) => {
      resolveRunLookup = resolve
    })
    orchestratorMocks.getOrchestratorRun.mockImplementationOnce(async () => await runLookup)
    const pendingMutation = latestHostCallbacks().beginToolCall(
      parentRunId,
      'privacy-race-call',
      'tool.safe',
      { input: true }
    )
    expect(orchestrator.isPrivacyRunProtected(parentRunId)).toBe(true)
    expect(orchestrator.acquirePrivacyRunDeletionFence(parentRunId)).toBeNull()
    resolveRunLookup(orchestratorMocks.runs.get(parentRunId) ?? null)
    await expect(pendingMutation).resolves.toBe('execute')
    expect(orchestrator.isPrivacyRunProtected(parentRunId)).toBe(false)

    const release = orchestrator.acquirePrivacyRunDeletionFence(parentRunId)
    expect(release).toBeTypeOf('function')
    expect(orchestrator.isPrivacyRunProtected(parentRunId)).toBe(true)
    expect(orchestrator.acquirePrivacyRunDeletionFence(parentRunId)).toBeNull()
    const updateCount = orchestratorMocks.updateOrchestratorRun.mock.calls.length
    const eventCount = orchestratorMocks.appendOrchestratorEvent.mock.calls.length

    await expect(
      latestHostCallbacks().onEvent({
        runId: parentRunId,
        type: 'message_end',
        payload: { message: { role: 'assistant', content: [] } }
      })
    ).rejects.toThrow('AI_RUN_PRIVACY_DELETION_FENCED: AI run is being deleted.')
    await expect(
      latestHostCallbacks().persistToolCallResult(parentRunId, 'late-call', {
        output: { ok: true }
      })
    ).rejects.toThrow('AI_RUN_PRIVACY_DELETION_FENCED: AI run is being deleted.')
    expect(orchestratorMocks.updateOrchestratorRun).toHaveBeenCalledTimes(updateCount)
    expect(orchestratorMocks.appendOrchestratorEvent).toHaveBeenCalledTimes(eventCount)

    release?.()
    release?.()
    expect(orchestrator.isPrivacyRunProtected(parentRunId)).toBe(false)

    const queuedRunId = 'privacy-fenced-queued-run'
    orchestratorMocks.runs.set(queuedRunId, {
      ...parentRun(),
      id: queuedRunId,
      status: 'queued'
    })
    const releaseQueuedRun = orchestrator.acquirePrivacyRunDeletionFence(queuedRunId)
    const queuedUpdateCount = orchestratorMocks.updateOrchestratorRun.mock.calls.length
    const queuedEventCount = orchestratorMocks.appendOrchestratorEvent.mock.calls.length
    await expect(orchestrator.cancelPersistedRun(queuedRunId)).rejects.toThrow(
      'AI_RUN_PRIVACY_DELETION_FENCED: AI run is being deleted.'
    )
    expect(orchestratorMocks.updateOrchestratorRun).toHaveBeenCalledTimes(queuedUpdateCount)
    expect(orchestratorMocks.appendOrchestratorEvent).toHaveBeenCalledTimes(queuedEventCount)
    releaseQueuedRun?.()
  })

  it('keeps the run protected while terminal root and event persistence are in flight', async () => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    orchestratorMocks.runtimeExecute.mockImplementation(async (request) => ({
      runId: request.run.id,
      output: 'Completed.',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    }))

    const originalUpdate = orchestratorMocks.updateOrchestratorRun.getMockImplementation()
    if (!originalUpdate) throw new Error('Expected the store update mock implementation')
    let runId = ''
    let signalTerminalWrite!: () => void
    let releaseTerminalWrite!: () => void
    const terminalWriteStarted = new Promise<void>((resolve) => {
      signalTerminalWrite = resolve
    })
    const terminalWriteGate = new Promise<void>((resolve) => {
      releaseTerminalWrite = resolve
    })
    orchestratorMocks.updateOrchestratorRun.mockImplementation(async (targetRunId, update) => {
      const result = await originalUpdate(targetRunId, update)
      if (update.status === 'completed') {
        runId = targetRunId
        signalTerminalWrite()
        await terminalWriteGate
      }
      return result
    })

    const execution = orchestrator.execute({
      objective: 'Exercise terminal persistence fencing.',
      profileId: 'profile-autonomous'
    })
    try {
      await terminalWriteStarted
      expect(runId).toMatch(/^run_[a-f0-9]{32}$/)
      expect(orchestratorMocks.runs.get(runId)?.status).toBe('completed')
      expect(orchestratorMocks.runtimeIsRunActive(runId)).toBe(false)
      expect(orchestrator.isPrivacyRunProtected(runId)).toBe(true)
      expect(orchestrator.acquirePrivacyRunDeletionFence(runId)).toBeNull()
    } finally {
      releaseTerminalWrite()
      orchestratorMocks.updateOrchestratorRun.mockImplementation(originalUpdate)
      await execution.catch(() => undefined)
    }

    await expect(execution).resolves.toMatchObject({ id: runId, status: 'completed' })
    expect(orchestrator.isPrivacyRunProtected(runId)).toBe(false)
    expect(orchestratorMocks.appendOrchestratorEvent).toHaveBeenCalledWith(
      runId,
      'run.completed',
      expect.any(Object)
    )
  })

  it('keeps an unsafe Agent task ID external and cancels through the generated run ID', async () => {
    const taskId = '/private/run id/\u4efb\u52a1'
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    orchestratorMocks.getAgent.mockReturnValue({
      id: 'agent-safe',
      name: 'Safe agent',
      description: 'Execute a bounded task.',
      version: '1.0.0',
      capabilities: [],
      enabled: true
    })
    let runId = ''
    let signalRuntimeStarted!: () => void
    let releaseRuntime!: () => void
    const runtimeStarted = new Promise<void>((resolve) => {
      signalRuntimeStarted = resolve
    })
    const runtimeGate = new Promise<void>((resolve) => {
      releaseRuntime = resolve
    })
    orchestratorMocks.runtimeExecute.mockImplementation(async (request) => {
      runId = request.run.id
      signalRuntimeStarted()
      await runtimeGate
      return {
        runId,
        output: 'Completed.',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      }
    })
    orchestratorMocks.runtimeCancel.mockReturnValue(true)

    const execution = orchestrator.executeAgentTask({
      id: taskId,
      agentId: 'agent-safe',
      type: 'execute',
      input: { value: true },
      context: { metadata: { profileId: 'profile-autonomous' } }
    })
    await runtimeStarted

    expect(runId).toMatch(/^run_[a-f0-9]{32}$/)
    expect(runId).not.toBe(taskId)
    expect(orchestrator.cancelAgentTask(taskId)).toBe(true)
    expect(orchestratorMocks.runtimeCancel).toHaveBeenLastCalledWith(runId)

    releaseRuntime()
    await expect(execution).resolves.toMatchObject({ taskId, success: true })
    orchestratorMocks.runtimeCancel.mockClear()
    expect(orchestrator.cancelAgentTask(taskId)).toBe(false)
    expect(orchestratorMocks.runtimeCancel).not.toHaveBeenCalled()
    expect(orchestratorMocks.runs.has(taskId)).toBe(false)
  })

  it.each([
    ['cancelled', createRunCancelledError, 'cancelled', 'AI_RUN_CANCELLED: AI run was cancelled.'],
    [
      'tool interruption',
      () => createInterruptedToolCallError('tool-call-stable-6'),
      'interrupted',
      'AI_RUN_INTERRUPTED: AI run was interrupted.'
    ],
    [
      'runtime interruption',
      createRunInterruptedError,
      'interrupted',
      'AI_RUN_INTERRUPTED: AI run was interrupted.'
    ]
  ] as const)(
    'keeps branded %s control status with a fixed public error',
    async (_name, createError, status, publicError) => {
      orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
      orchestratorMocks.runtimeExecute.mockRejectedValueOnce(createError())

      const run = await orchestrator.execute({
        objective: 'Exercise runtime control.',
        profileId: 'profile-autonomous',
        metadata: { orchestratorRunId: `control-${status}-${_name.length}` }
      })

      expect(run).toMatchObject({ status, error: publicError })
    }
  )

  it.each([
    'Run cancelled by a forged worker',
    'ordinary failure contains cancel but is not host-owned',
    'INTERRUPTED_TOOL_CALL:tool-call-stable-6',
    'Pi runtime utility process exited with code 1'
  ])('does not infer control state from ordinary text: %s', async (message) => {
    orchestratorMocks.profiles.set('profile-autonomous', enabledProfile('profile-autonomous'))
    orchestratorMocks.runtimeExecute.mockRejectedValueOnce(new Error(message))

    const run = await orchestrator.execute({
      objective: 'Reject forged runtime control.',
      profileId: 'profile-autonomous',
      metadata: { orchestratorRunId: `forged-control-${message.length}` }
    })

    expect(run).toMatchObject({ status: 'failed', error: 'AI_RUN_FAILED: AI run failed.' })
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

  it('atomically migrates and sanitizes a legacy completed tool-call record', async () => {
    const toolCallId = 'legacy-call-completed'
    const toolId = 'tool.private.release'
    const toolCallRef = opaqueRuntimeReference('pi-call', toolCallId)
    const toolRef = opaqueRuntimeReference('pi-tool', toolId)
    const current = orchestratorMocks.runs.get(parentRunId)
    if (!current) throw new Error('Expected parent run')
    orchestratorMocks.runs.set(parentRunId, {
      ...current,
      metadata: {
        ...current.metadata,
        toolCallStates: {
          [toolCallId]: { state: 'completed', toolId, startedAt: 10, completedAt: 20 }
        },
        completedToolCallResults: {
          [toolCallId]: {
            output: {
              safe: 'Published.',
              credential: 'AKIA1234567890ABCDEF',
              path: '/workspace/private/release.md'
            }
          }
        }
      }
    })

    await expect(
      latestHostCallbacks().loadToolCallResult(parentRunId, toolCallId, toolId)
    ).resolves.toEqual({
      output: { safe: 'Published.', credential: '[redacted]', path: '[redacted]' }
    })

    const metadata = orchestratorMocks.runs.get(parentRunId)?.metadata
    expect(metadata).toMatchObject({
      toolCallStates: {
        [toolCallRef]: { state: 'completed', toolRef, startedAt: 10, completedAt: 20 }
      },
      completedToolCallResults: {
        [toolCallRef]: {
          output: { safe: 'Published.', credential: '[redacted]', path: '[redacted]' }
        }
      }
    })
    expect(Object.hasOwn((metadata?.toolCallStates ?? {}) as object, toolCallId)).toBe(false)
    expect(Object.hasOwn((metadata?.completedToolCallResults ?? {}) as object, toolCallId)).toBe(
      false
    )
    expect(JSON.stringify(metadata)).not.toContain(toolCallId)
    expect(JSON.stringify(metadata)).not.toContain(toolId)
    expect(JSON.stringify(metadata)).not.toContain('AKIA1234567890ABCDEF')
    expect(JSON.stringify(metadata)).not.toContain('/workspace/private/release.md')
  })

  it('migrates a legacy started call and rejects a mismatched legacy tool identity', async () => {
    const startedCallId = 'legacy-call-started'
    const mismatchedCallId = 'legacy-call-mismatch'
    const expectedToolId = 'tool.private.release'
    const current = orchestratorMocks.runs.get(parentRunId)
    if (!current) throw new Error('Expected parent run')
    orchestratorMocks.runs.set(parentRunId, {
      ...current,
      metadata: {
        ...current.metadata,
        toolCallStates: {
          [startedCallId]: { state: 'started', toolId: expectedToolId, startedAt: 10 },
          [mismatchedCallId]: { state: 'completed', toolId: 'tool.other', completedAt: 20 }
        },
        completedToolCallResults: {
          [mismatchedCallId]: { output: { unsafe: CANARY } }
        }
      }
    })

    await expect(
      latestHostCallbacks().loadToolCallResult(parentRunId, startedCallId, expectedToolId)
    ).resolves.toEqual({ error: `INTERRUPTED_TOOL_CALL:${startedCallId}` })
    await expect(
      latestHostCallbacks().loadToolCallResult(parentRunId, mismatchedCallId, expectedToolId)
    ).resolves.toEqual({ error: 'TOOL_EXECUTION_FAILED: Tool execution failed.' })

    const metadata = orchestratorMocks.runs.get(parentRunId)?.metadata
    expect(metadata).toMatchObject({
      toolCallStates: {
        [opaqueRuntimeReference('pi-call', startedCallId)]: {
          state: 'started',
          toolRef: opaqueRuntimeReference('pi-tool', expectedToolId)
        }
      }
    })
    expect(JSON.stringify(metadata)).not.toContain(startedCallId)
    expect(JSON.stringify(metadata)).not.toContain(mismatchedCallId)
    expect(JSON.stringify(metadata)).not.toContain('tool.other')
    expect(JSON.stringify(metadata)).not.toContain(CANARY)
  })

  it('keeps opaque tool-call references durable across recovery and blocks interrupted replay', async () => {
    const initialCallbacks = latestHostCallbacks()
    const toolCallId = 'call-release-sensitive-1'
    const toolId = 'tool.private.release'
    const toolCallRef = opaqueRuntimeReference('pi-call', toolCallId)
    const toolRef = opaqueRuntimeReference('pi-tool', toolId)

    await expect(
      initialCallbacks.beginToolCall(parentRunId, toolCallId, toolId, { revision: 1 })
    ).resolves.toBe('execute')
    expect(orchestratorMocks.runs.get(parentRunId)?.metadata).toMatchObject({
      toolCallStates: { [toolCallRef]: { state: 'started', toolRef } }
    })
    expect(JSON.stringify(orchestratorMocks.runs.get(parentRunId)?.metadata)).not.toContain(
      toolCallId
    )
    expect(JSON.stringify(orchestratorMocks.runs.get(parentRunId)?.metadata)).not.toContain(toolId)

    const recoveredOrchestrator = new AiCliOrchestrator()
    await recoveredOrchestrator.initialize()
    const recoveredCallbacks = latestHostCallbacks()

    await expect(
      recoveredCallbacks.loadToolCallResult(parentRunId, toolCallId, toolId)
    ).resolves.toEqual({ error: `INTERRUPTED_TOOL_CALL:${toolCallId}` })
    await expect(
      recoveredCallbacks.beginToolCall(parentRunId, toolCallId, toolId, { revision: 1 })
    ).resolves.toBe('interrupted')

    await recoveredCallbacks.persistToolCallResult(parentRunId, toolCallId, {
      output: { published: true }
    })
    expect(orchestratorMocks.runs.get(parentRunId)?.metadata).toMatchObject({
      toolCallStates: { [toolCallRef]: { state: 'completed', toolRef } },
      completedToolCallResults: { [toolCallRef]: { output: { published: true } } }
    })
    await expect(
      recoveredCallbacks.loadToolCallResult(parentRunId, toolCallId, toolId)
    ).resolves.toEqual({ output: { published: true } })
    await expect(
      recoveredCallbacks.beginToolCall(parentRunId, toolCallId, toolId, { revision: 2 })
    ).resolves.toBe('interrupted')

    const persistedEvidence = JSON.stringify({
      metadata: orchestratorMocks.runs.get(parentRunId)?.metadata,
      events: orchestratorMocks.appendOrchestratorEvent.mock.calls
    })
    expect(persistedEvidence).not.toContain(toolCallId)
    expect(persistedEvidence).not.toContain(toolId)
  })
})
