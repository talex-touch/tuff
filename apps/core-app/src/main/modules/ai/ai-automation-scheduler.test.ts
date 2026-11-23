import type {
  AiAutomationDefinition,
  AiAutomationRunRecord,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AiAutomationScheduler, cronMatches } from './ai-automation-scheduler'
import { setAutoResumeOnStartupReader } from './auto-resume-setting'
import { createRunInterruptedError } from './pi-agent-runtime-control-error'

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
    listRecoverableAutomationRuns: vi.fn(async (): Promise<AiAutomationRunRecord[]> => [])
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
    setAutoResumeOnStartupReader(null)
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

  it('接受 7 作为周日的标准写法', async () => {
    const sunday = new Date(2026, 0, 4, 9, 0, 0) // 2026-01-04 is a Sunday
    const monday = new Date(2026, 0, 5, 9, 0, 0)

    expect(cronMatches('0 9 * * 7', sunday)).toBe(true)
    expect(cronMatches('0 9 * * 7', monday)).toBe(false)
    // 0 keeps working: 7 is an alias, not a replacement.
    expect(cronMatches('0 9 * * 0', sunday)).toBe(true)

    const scheduler = new AiAutomationScheduler()
    scheduler.setExecutor(vi.fn(async () => completedOrchestratorRun()))
    await expect(
      scheduler.save(automation({ trigger: { type: 'cron', expression: '0 9 * * 7' } }))
    ).resolves.toBeDefined()
  })

  it('两个日期字段都受限时取并集,而不是交集', async () => {
    // '0 9 1 * 1' = the 1st, and every Monday.
    const firstOfMonth = new Date(2026, 3, 1, 9, 0, 0) // 2026-04-01, a Wednesday
    const anyMonday = new Date(2026, 3, 6, 9, 0, 0) // 2026-04-06, a Monday
    const plainTuesday = new Date(2026, 3, 7, 9, 0, 0)

    expect(cronMatches('0 9 1 * 1', firstOfMonth)).toBe(true)
    expect(cronMatches('0 9 1 * 1', anyMonday)).toBe(true)
    expect(cronMatches('0 9 1 * 1', plainTuesday)).toBe(false)
  })

  it('只有一个日期字段受限时仍然是交集', async () => {
    const monday = new Date(2026, 3, 6, 9, 0, 0)
    const tuesday = new Date(2026, 3, 7, 9, 0, 0)

    // day-of-month is '*', so day-of-week alone decides.
    expect(cronMatches('0 9 * * 1', monday)).toBe(true)
    expect(cronMatches('0 9 * * 1', tuesday)).toBe(false)

    // day-of-week is '*', so day-of-month alone decides.
    expect(cronMatches('0 9 6 * *', monday)).toBe(true)
    expect(cronMatches('0 9 6 * *', tuesday)).toBe(false)
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

  it('gates interrupted automation recovery on autoResumeOnStartup, skips settled rows, and enforces crash-loop cap', async () => {
    const definition = automation({
      approvalMode: 'preauthorized',
      trigger: { type: 'interval', intervalMs: 60_000 }
    })
    schedulerStoreMocks.state.definitions.set(definition.id, definition)

    const now = Date.now()
    const recoverableRun: AiAutomationRunRecord = {
      id: 'auto-run-recoverable',
      automationId: definition.id,
      triggerType: 'interval',
      status: 'interrupted',
      approved: true,
      missedCount: 0,
      policyVersion: definition.policy.version,
      createdAt: now,
      updatedAt: now
    }
    const alreadySettledRun: AiAutomationRunRecord = {
      id: 'auto-run-settled',
      automationId: definition.id,
      triggerType: 'interval',
      status: 'interrupted',
      approved: true,
      missedCount: 0,
      policyVersion: definition.policy.version,
      createdAt: now,
      updatedAt: now,
      completedAt: now
    }
    const cappedRun: AiAutomationRunRecord = {
      id: 'auto-run-capped',
      automationId: definition.id,
      triggerType: 'recovery',
      status: 'interrupted',
      approved: true,
      missedCount: 0,
      policyVersion: definition.policy.version,
      payload: { recovery: { attempts: 1, recoveredAt: now - 1_000 } },
      createdAt: now,
      updatedAt: now
    }
    const legacyRecoveryRun: AiAutomationRunRecord = {
      id: 'auto-run-legacy-recovery',
      automationId: definition.id,
      triggerType: 'recovery',
      status: 'interrupted',
      approved: true,
      missedCount: 0,
      policyVersion: definition.policy.version,
      createdAt: now,
      updatedAt: now
    }

    for (const run of [recoverableRun, alreadySettledRun, cappedRun, legacyRecoveryRun]) {
      schedulerStoreMocks.state.runs.set(run.id, { ...run })
    }
    schedulerStoreMocks.listRecoverableAutomationRuns.mockImplementation(async () =>
      Array.from(schedulerStoreMocks.state.runs.values()).filter(
        (run) => run.status === 'queued' || run.status === 'running' || run.status === 'interrupted'
      )
    )

    // 1. Disabled auto-resume marks unsettled runs interrupted with completedAt and executes nothing
    setAutoResumeOnStartupReader(() => false)
    const disabledExecutor = vi.fn(async () => completedOrchestratorRun())
    const disabledScheduler = new AiAutomationScheduler()
    disabledScheduler.setExecutor(disabledExecutor)
    await disabledScheduler.initialize()
    await settleAsyncWork()
    await disabledScheduler.stop()

    expect(disabledExecutor).not.toHaveBeenCalled()
    expect(schedulerStoreMocks.state.runs.get(recoverableRun.id)).toMatchObject({
      status: 'interrupted',
      error: 'Auto-resume on startup is disabled'
    })
    expect(schedulerStoreMocks.state.runs.get(recoverableRun.id)?.completedAt).toBeDefined()
    expect(schedulerStoreMocks.state.runs.get(alreadySettledRun.id)?.error).toBeUndefined()

    // 2. Enabled auto-resume recovers unsettled run once, skips settled & capped/legacy-recovery runs
    setAutoResumeOnStartupReader(() => true)
    schedulerStoreMocks.state.runs.set(recoverableRun.id, { ...recoverableRun })
    schedulerStoreMocks.state.runs.set(cappedRun.id, { ...cappedRun })
    schedulerStoreMocks.state.runs.set(legacyRecoveryRun.id, { ...legacyRecoveryRun })

    const enabledExecutor = vi.fn(async () => completedOrchestratorRun())
    const enabledScheduler = new AiAutomationScheduler()
    enabledScheduler.setExecutor(enabledExecutor)
    await enabledScheduler.initialize()
    await settleAsyncWork()
    await enabledScheduler.stop()

    expect(enabledExecutor).toHaveBeenCalledOnce()
    expect(schedulerStoreMocks.state.runs.get(recoverableRun.id)).toMatchObject({
      status: 'completed',
      triggerType: 'recovery',
      payload: expect.objectContaining({
        recovery: expect.objectContaining({ attempts: 1 })
      })
    })
    expect(schedulerStoreMocks.state.runs.get(cappedRun.id)).toMatchObject({
      status: 'interrupted',
      error: 'Automation recovery limit reached'
    })
    expect(schedulerStoreMocks.state.runs.get(cappedRun.id)?.completedAt).toBeDefined()
    expect(schedulerStoreMocks.state.runs.get(legacyRecoveryRun.id)).toMatchObject({
      status: 'interrupted',
      error: 'Automation recovery limit reached'
    })
    expect(schedulerStoreMocks.state.runs.get(legacyRecoveryRun.id)?.completedAt).toBeDefined()
  })

  it('leaves automation run unsettled on graceful shutdown so next boot auto-resumes once, then stops on repeat interruption', async () => {
    const definition = automation({
      approvalMode: 'preauthorized',
      trigger: { type: 'interval', intervalMs: 60_000 }
    })
    schedulerStoreMocks.state.definitions.set(definition.id, definition)
    schedulerStoreMocks.listRecoverableAutomationRuns.mockImplementation(async () =>
      Array.from(schedulerStoreMocks.state.runs.values()).filter(
        (run) => run.status === 'queued' || run.status === 'running' || run.status === 'interrupted'
      )
    )

    // First boot: run is interrupted during graceful shutdown via orchestrator returning status='interrupted'
    let resolveFirst!: (run: AiOrchestratorRunRecord) => void
    const firstScheduler = new AiAutomationScheduler()
    firstScheduler.setExecutor(
      vi.fn(
        () =>
          new Promise<AiOrchestratorRunRecord>((resolve) => {
            resolveFirst = resolve
          })
      )
    )
    await firstScheduler.initialize()
    const created = await firstScheduler.runNow(definition.id, true)
    await settleAsyncWork()

    firstScheduler.stopTriggers()
    resolveFirst({
      ...completedOrchestratorRun(),
      status: 'interrupted',
      error: 'AI_RUN_INTERRUPTED'
    })
    await firstScheduler.stop()

    const afterFirstShutdown = schedulerStoreMocks.state.runs.get(created.id)
    expect(afterFirstShutdown?.status).toBe('interrupted')
    expect(afterFirstShutdown?.completedAt).toBeUndefined()

    // Second boot: auto-resumes once, then gets interrupted again by rejected RunInterruptedError during shutdown
    let rejectSecond!: (error: unknown) => void
    const secondExecutor = vi.fn(
      () =>
        new Promise<AiOrchestratorRunRecord>((_resolve, reject) => {
          rejectSecond = reject
        })
    )
    const secondScheduler = new AiAutomationScheduler()
    secondScheduler.setExecutor(secondExecutor)
    await secondScheduler.initialize()
    await settleAsyncWork()

    expect(secondExecutor).toHaveBeenCalledOnce()
    secondScheduler.stopTriggers()
    rejectSecond(createRunInterruptedError())
    await secondScheduler.stop()

    const afterSecondShutdown = schedulerStoreMocks.state.runs.get(created.id)
    expect(afterSecondShutdown?.status).toBe('interrupted')
    expect(afterSecondShutdown?.completedAt).toBeUndefined()
    expect(afterSecondShutdown?.payload).toMatchObject({
      recovery: expect.objectContaining({ attempts: 1 })
    })

    // Third boot: hits crash-loop cap (attempts === 1) and settles with completedAt without executing
    const thirdExecutor = vi.fn(async () => completedOrchestratorRun())
    const thirdScheduler = new AiAutomationScheduler()
    thirdScheduler.setExecutor(thirdExecutor)
    await thirdScheduler.initialize()
    await settleAsyncWork()
    await thirdScheduler.stop()

    expect(thirdExecutor).not.toHaveBeenCalled()
    const afterThirdBoot = schedulerStoreMocks.state.runs.get(created.id)
    expect(afterThirdBoot?.status).toBe('interrupted')
    expect(afterThirdBoot?.error).toBe('Automation recovery limit reached')
    expect(afterThirdBoot?.completedAt).toBeDefined()
  })

  it('initializes recovery.attempts=0 on coalesced follow-up runs triggered during recovery so they remain recoverable once', async () => {
    const definition = automation({
      approvalMode: 'preauthorized',
      trigger: { type: 'interval', intervalMs: 60_000 }
    })
    schedulerStoreMocks.state.definitions.set(definition.id, definition)
    const now = Date.now()
    const seedRun: AiAutomationRunRecord = {
      id: 'auto-run-seed-coalesce',
      automationId: definition.id,
      triggerType: 'interval',
      status: 'interrupted',
      approved: true,
      missedCount: 0,
      policyVersion: definition.policy.version,
      createdAt: now,
      updatedAt: now
    }
    schedulerStoreMocks.state.runs.set(seedRun.id, { ...seedRun })
    schedulerStoreMocks.listRecoverableAutomationRuns.mockImplementation(async () =>
      Array.from(schedulerStoreMocks.state.runs.values()).filter(
        (run) => run.status === 'queued' || run.status === 'running' || run.status === 'interrupted'
      )
    )

    let resolveFirst!: (run: AiOrchestratorRunRecord) => void
    let resolveFollowUp!: (run: AiOrchestratorRunRecord) => void
    let execCount = 0
    const firstScheduler = new AiAutomationScheduler()
    firstScheduler.setExecutor(
      vi.fn(() => {
        execCount += 1
        if (execCount === 1) {
          return new Promise<AiOrchestratorRunRecord>((resolve) => {
            resolveFirst = resolve
          })
        }
        return new Promise<AiOrchestratorRunRecord>((resolve) => {
          resolveFollowUp = resolve
        })
      })
    )
    await firstScheduler.initialize()
    await settleAsyncWork()
    expect(execCount).toBe(1)

    // Coalesce a trigger while the recovered run is active
    await firstScheduler.runNow(definition.id, true, { source: 'coalesced-trigger' })
    resolveFirst(completedOrchestratorRun())
    await settleAsyncWork()
    expect(execCount).toBe(2)

    // Interrupt the newly created coalesced follow-up run during graceful shutdown
    firstScheduler.stopTriggers()
    resolveFollowUp({
      ...completedOrchestratorRun(),
      status: 'interrupted',
      error: 'AI_RUN_INTERRUPTED'
    })
    await firstScheduler.stop()

    const followUp = Array.from(schedulerStoreMocks.state.runs.values()).find(
      (run) => run.id !== seedRun.id
    )!
    expect(followUp.triggerType).toBe('recovery')
    expect(followUp.status).toBe('interrupted')
    expect(followUp.payload).toMatchObject({ recovery: { attempts: 0 } })

    // Next boot recovers the coalesced follow-up run once instead of treating it as exhausted
    const secondExecutor = vi.fn(async () => completedOrchestratorRun())
    const secondScheduler = new AiAutomationScheduler()
    secondScheduler.setExecutor(secondExecutor)
    await secondScheduler.initialize()
    await settleAsyncWork()
    await secondScheduler.stop()

    expect(secondExecutor).toHaveBeenCalledOnce()
    expect(schedulerStoreMocks.state.runs.get(followUp.id)?.status).toBe('completed')
  })
})
