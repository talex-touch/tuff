import type {
  AiAutomationDefinition,
  AiAutomationRunRecord,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AiAutomationScheduler, cronMatches } from './ai-automation-scheduler'

interface SchedulerStoreState {
  definitions: Map<string, AiAutomationDefinition>
  runs: Map<string, AiAutomationRunRecord>
}

const schedulerStoreMocks = vi.hoisted(() => {
  const state: SchedulerStoreState = {
    definitions: new Map(),
    runs: new Map()
  }
  return {
    state,
    listAutomations: vi.fn(async () => Array.from(state.definitions.values())),
    saveAutomation: vi.fn(async (definition: AiAutomationDefinition) => {
      state.definitions.set(definition.id, definition)
      return definition
    }),
    deleteAutomation: vi.fn(async (automationId: string) => state.definitions.delete(automationId)),
    getAutomation: vi.fn(async (automationId: string) => state.definitions.get(automationId)),
    createAutomationRun: vi.fn(async (run: AiAutomationRunRecord) => {
      state.runs.set(run.id, { ...run })
    }),
    getAutomationRun: vi.fn(async (runId: string) => schedulerStoreMocks.state.runs.get(runId)),
    updateAutomationRun: vi.fn(async (runId: string, update: Partial<AiAutomationRunRecord>) => {
      const current = state.runs.get(runId)
      if (!current) throw new Error(`Unknown test automation run ${runId}`)
      const next = { ...current, ...update, updatedAt: Date.now() }
      state.runs.set(runId, next)
      return next
    }),
    countAutomationRunsSince: vi.fn(async () => 0),
    listRecoverableAutomationRuns: vi.fn(async () => [])
  }
})

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
  })
}))

vi.mock('./ai-orchestrator-store', () => ({
  aiOrchestratorStore: schedulerStoreMocks
}))

function automation(overrides: Partial<AiAutomationDefinition> = {}): AiAutomationDefinition {
  return {
    id: 'automation-release',
    name: 'Release review',
    description: 'Review the release readiness.',
    enabled: true,
    objective: 'Review the release readiness.',
    profileId: 'profile-reviewer',
    trigger: { type: 'startup' },
    approvalMode: 'manual',
    policy: {
      version: 1,
      allowedToolIds: ['tool.inspect'],
      allowedMcpServerIds: ['mcp.release'],
      allowedAgentProfileIds: ['profile-reviewer'],
      allowedPaths: ['/workspace'],
      allowedNetworkTargets: ['registry.example.test'],
      budget: { maxSteps: 12, maxChildRuns: 2, maxConcurrency: 1 },
      timeoutMs: 30_000,
      maxRunsPerWindow: 5,
      windowMs: 60_000
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  }
}

function completedOrchestratorRun(): AiOrchestratorRunRecord {
  return {
    id: 'orchestrator-run-1',
    sessionId: 'session-1',
    objective: 'Review the release readiness.',
    profileId: 'profile-reviewer',
    runtimeProvider: 'pi-core',
    cwd: '/workspace',
    status: 'completed',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

async function settleAsyncWork(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

describe('aiAutomationScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 9, 15, 0))
    vi.clearAllMocks()
    schedulerStoreMocks.state.definitions.clear()
    schedulerStoreMocks.state.runs.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('matches valid cron fields at their boundaries and rejects invalid definitions before persistence', async () => {
    const matchingMonday = new Date(2026, 0, 5, 9, 15, 0)
    const outsideMinute = new Date(2026, 0, 5, 9, 16, 0)

    expect(cronMatches('*/15 9-17 1-31 1-12 1-5', matchingMonday)).toBe(true)
    expect(cronMatches('*/15 9-17 1-31 1-12 1-5', outsideMinute)).toBe(false)
    expect(cronMatches('61 * * * *', matchingMonday)).toBe(false)

    const scheduler = new AiAutomationScheduler()
    scheduler.setExecutor(vi.fn(async () => completedOrchestratorRun()))

    await expect(
      scheduler.save(automation({ trigger: { type: 'cron', expression: '*/0 * * * *' } }))
    ).rejects.toThrow('Automation cron expression must contain five valid fields')
    expect(schedulerStoreMocks.saveAutomation).not.toHaveBeenCalled()
  })

  it('persists a manual run as pending approval and does not execute it until approved', async () => {
    const definition = automation()
    schedulerStoreMocks.state.definitions.set(definition.id, definition)
    const executor = vi.fn(async () => completedOrchestratorRun())
    const scheduler = new AiAutomationScheduler()
    scheduler.setExecutor(executor)

    const pending = await scheduler.runNow(definition.id, false, { source: 'user-click' })

    expect(pending).toMatchObject({
      automationId: definition.id,
      status: 'pending_approval',
      approved: false,
      payload: { source: 'user-click' }
    })
    expect(executor).not.toHaveBeenCalled()

    await scheduler.approve(pending.id)
    await settleAsyncWork()

    expect(executor).toHaveBeenCalledOnce()
    expect(schedulerStoreMocks.state.runs.get(pending.id)).toMatchObject({
      status: 'completed',
      approved: true,
      orchestratorRunId: 'orchestrator-run-1'
    })
  })
  it('executes an approved manual run under its persisted base policy', async () => {
    const definition = automation({
      policy: {
        version: 4,
        allowedToolIds: ['tool.inspect'],
        allowedMcpServerIds: ['mcp.release'],
        allowedAgentProfileIds: ['profile-reviewer'],
        allowedPaths: ['/workspace'],
        allowedNetworkTargets: ['registry.example.test'],
        budget: { maxSteps: 9, maxToolCalls: 4, maxChildRuns: 1, maxConcurrency: 1 },
        timeoutMs: 9_000,
        maxRunsPerWindow: 3,
        windowMs: 60_000
      }
    })
    schedulerStoreMocks.state.definitions.set(definition.id, definition)
    const executor = vi.fn(async () => completedOrchestratorRun())
    const scheduler = new AiAutomationScheduler()
    scheduler.setExecutor(executor)

    const pending = await scheduler.runNow(definition.id, false)
    await scheduler.approve(pending.id)
    await settleAsyncWork()

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        approved: true,
        allowedToolIds: ['tool.inspect'],
        budget: { maxSteps: 9, maxToolCalls: 4, maxChildRuns: 1, maxConcurrency: 1 },
        metadata: expect.objectContaining({
          automationPolicy: expect.objectContaining({
            version: 4,
            allowedMcpServerIds: ['mcp.release'],
            allowedAgentProfileIds: ['profile-reviewer'],
            budget: { maxSteps: 9, maxToolCalls: 4, maxChildRuns: 1, maxConcurrency: 1 }
          })
        })
      }),
      definition.id
    )
  })
  it('passes a bounded, deduplicated preauthorization policy to the orchestrator', async () => {
    const definition = automation({
      approvalMode: 'preauthorized',
      timeoutMs: 5_000,
      policy: {
        version: 0,
        allowedToolIds: ['tool.inspect', 'tool.inspect', ''],
        allowedMcpServerIds: ['mcp.release', 'mcp.release'],
        allowedAgentProfileIds: ['profile-reviewer', 'profile-reviewer'],
        allowedPaths: ['/workspace/../workspace'],
        allowedNetworkTargets: ['API.EXAMPLE.TEST', 'API.EXAMPLE.TEST'],
        budget: {
          maxSteps: 500,
          maxToolCalls: 500,
          maxCost: -1,
          maxChildRuns: 50,
          maxConcurrency: 50
        },
        timeoutMs: 100,
        maxRunsPerWindow: 50_000,
        windowMs: 1
      }
    })
    schedulerStoreMocks.state.definitions.set(definition.id, definition)
    const executor = vi.fn(async () => completedOrchestratorRun())
    const scheduler = new AiAutomationScheduler()
    scheduler.setExecutor(executor)

    await scheduler.runNow(definition.id, true)
    await settleAsyncWork()

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 1_000,
        allowedToolIds: ['tool.inspect'],
        budget: { maxSteps: 100, maxToolCalls: 100, maxChildRuns: 32, maxConcurrency: 16 },
        metadata: expect.objectContaining({
          automationPolicy: expect.objectContaining({
            version: 1,
            allowedMcpServerIds: ['mcp.release'],
            allowedPaths: ['/workspace'],
            allowedNetworkTargets: ['api.example.test'],
            maxRunsPerWindow: 10_000,
            windowMs: 60_000
          })
        })
      }),
      definition.id
    )
  })

  it('coalesces overlapping triggers into the active run instead of executing concurrently', async () => {
    const definition = automation({ approvalMode: 'preauthorized' })
    schedulerStoreMocks.state.definitions.set(definition.id, definition)
    let resolveExecution: (value: AiOrchestratorRunRecord) => void = () => undefined
    const executor = vi.fn(
      () =>
        new Promise<AiOrchestratorRunRecord>((resolve) => {
          resolveExecution = resolve
        })
    )
    const scheduler = new AiAutomationScheduler()
    scheduler.setExecutor(executor)

    const active = await scheduler.runNow(definition.id, true)
    await settleAsyncWork()
    const coalesced = await scheduler.runNow(definition.id, true, { revision: 'latest' })

    expect(executor).toHaveBeenCalledOnce()
    expect(coalesced.id).toBe(active.id)
    expect(schedulerStoreMocks.state.runs.get(active.id)).toMatchObject({
      status: 'running',
      missedCount: 1
    })

    resolveExecution(completedOrchestratorRun())
    await settleAsyncWork()

    expect(schedulerStoreMocks.state.runs.get(active.id)).toMatchObject({
      status: 'completed',
      missedCount: 1
    })
    expect(executor).toHaveBeenCalledOnce()
  })

  it('records executor failures as the stable failed terminal status', async () => {
    const definition = automation({ approvalMode: 'preauthorized' })
    schedulerStoreMocks.state.definitions.set(definition.id, definition)
    const scheduler = new AiAutomationScheduler()
    scheduler.setExecutor(vi.fn(async () => Promise.reject(new Error('provider disconnected'))))

    const run = await scheduler.runNow(definition.id, true)
    await settleAsyncWork()

    expect(schedulerStoreMocks.state.runs.get(run.id)).toMatchObject({
      status: 'failed',
      error: 'provider disconnected'
    })
  })
})
