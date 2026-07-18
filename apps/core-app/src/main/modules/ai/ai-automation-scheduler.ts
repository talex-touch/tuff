import type {
  AiAutomationDefinition,
  AiAutomationRunRecord,
  AiOrchestratorExecuteRequest,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import type { FSWatcher } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { watch } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createLogger } from '../../utils/logger'
import { aiOrchestratorStore } from './ai-orchestrator-store'
import { normalizeAutomationPolicy } from './ai-automation-policy'

export type AiAutomationExecutor = (
  request: AiOrchestratorExecuteRequest,
  automationId: string
) => Promise<AiOrchestratorRunRecord>

interface ActiveAutomationRun {
  runId: string
  promise: Promise<void>
}

interface CoalescedAutomationTrigger {
  count: number
  payload?: Record<string, unknown>
  firstTriggeredAt: number
  lastTriggeredAt: number
}

const schedulerLog = createLogger('Intelligence').child('AiAutomationScheduler')
const CRON_POLL_INTERVAL_MS = 30_000

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function matchesCronField(value: number, expression: string, min: number, max: number): boolean {
  return expression.split(',').some((part) => {
    const trimmed = part.trim()
    if (!trimmed) return false
    const [rangeExpression, stepExpression] = trimmed.split('/')
    const step = stepExpression ? Number.parseInt(stepExpression, 10) : 1
    if (!Number.isFinite(step) || step <= 0) return false

    let start = min
    let end = max
    if (rangeExpression !== '*') {
      const [startExpression, endExpression] = rangeExpression!.split('-')
      start = Number.parseInt(startExpression!, 10)
      end = endExpression ? Number.parseInt(endExpression, 10) : start
    }
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < min ||
      end > max ||
      start > end
    ) {
      return false
    }
    return value >= start && value <= end && (value - start) % step === 0
  })
}

function isValidCronField(expression: string, min: number, max: number): boolean {
  const parts = expression.split(',')
  if (parts.length === 0) return false
  return parts.every((part) => {
    const trimmed = part.trim()
    if (!trimmed) return false
    const segments = trimmed.split('/')
    if (segments.length > 2) return false
    const [rangeExpression, stepExpression] = segments
    if (stepExpression !== undefined) {
      if (!/^\d+$/.test(stepExpression)) return false
      const step = Number.parseInt(stepExpression, 10)
      if (step <= 0) return false
    }
    if (rangeExpression === '*') return true
    const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(rangeExpression || '')
    if (!rangeMatch) return false
    const start = Number.parseInt(rangeMatch[1]!, 10)
    const end = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : start
    return start >= min && end <= max && start <= end
  })
}

function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  return (
    fields.length === 5 &&
    isValidCronField(fields[0]!, 0, 59) &&
    isValidCronField(fields[1]!, 0, 23) &&
    isValidCronField(fields[2]!, 1, 31) &&
    isValidCronField(fields[3]!, 1, 12) &&
    isValidCronField(fields[4]!, 0, 6)
  )
}

export function cronMatches(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  return (
    matchesCronField(date.getMinutes(), fields[0]!, 0, 59) &&
    matchesCronField(date.getHours(), fields[1]!, 0, 23) &&
    matchesCronField(date.getDate(), fields[2]!, 1, 31) &&
    matchesCronField(date.getMonth() + 1, fields[3]!, 1, 12) &&
    matchesCronField(date.getDay(), fields[4]!, 0, 6)
  )
}

function validateDefinition(definition: AiAutomationDefinition): void {
  if (!definition.id || !definition.name.trim() || !definition.objective.trim()) {
    throw new Error('Automation id, name, and objective are required')
  }
  if (definition.trigger.type === 'interval' && definition.trigger.intervalMs < 1_000) {
    throw new Error('Automation interval must be at least 1000ms')
  }
  if (definition.trigger.type === 'cron' && !isValidCronExpression(definition.trigger.expression)) {
    throw new Error('Automation cron expression must contain five valid fields')
  }
  if (definition.trigger.type === 'file_event' && !definition.trigger.path.trim()) {
    throw new Error('File-event automation requires a path')
  }
  const policy = normalizeAutomationPolicy(definition, definition.policy)
  if (
    definition.approvalMode === 'preauthorized' &&
    !policy.allowedAgentProfileIds.includes(definition.profileId)
  ) {
    throw new Error('Preauthorized automation policy must allow its primary agent profile')
  }
}

export class AiAutomationScheduler {
  private executor: AiAutomationExecutor | null = null
  private initialized = false
  private readonly triggerCleanup = new Map<string, () => void>()
  private readonly activeRuns = new Map<string, ActiveAutomationRun>()
  private readonly missedTriggers = new Map<string, CoalescedAutomationTrigger>()
  private readonly lastCronMinute = new Map<string, string>()

  setExecutor(executor: AiAutomationExecutor): void {
    this.executor = executor
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (!this.executor) throw new Error('AI automation executor is not configured')
    this.initialized = true
    const definitions = await aiOrchestratorStore.listAutomations()
    for (const definition of definitions) this.installTrigger(definition)
    await this.recoverInterruptedRuns()
  }

  async stop(): Promise<void> {
    this.initialized = false
    for (const cleanup of this.triggerCleanup.values()) cleanup()
    this.triggerCleanup.clear()
    this.lastCronMinute.clear()
    this.missedTriggers.clear()
    await Promise.allSettled(Array.from(this.activeRuns.values()).map((run) => run.promise))
    this.activeRuns.clear()
  }

  async list(): Promise<AiAutomationDefinition[]> {
    return await aiOrchestratorStore.listAutomations()
  }

  async save(definition: AiAutomationDefinition): Promise<AiAutomationDefinition> {
    validateDefinition(definition)
    const saved = await aiOrchestratorStore.saveAutomation(definition)
    this.uninstallTrigger(saved.id)
    if (this.initialized) this.installTrigger(saved)
    return saved
  }

  async delete(automationId: string): Promise<boolean> {
    this.uninstallTrigger(automationId)
    return await aiOrchestratorStore.deleteAutomation(automationId)
  }

  async runNow(
    automationId: string,
    approved = true,
    payload?: Record<string, unknown>
  ): Promise<AiAutomationRunRecord> {
    const definition = await aiOrchestratorStore.getAutomation(automationId)
    if (!definition) throw new Error(`Automation ${automationId} not found`)
    return await this.enqueue(definition, 'manual', approved, payload)
  }

  async approve(runId: string): Promise<AiAutomationRunRecord> {
    const run = await aiOrchestratorStore.getAutomationRun(runId)
    if (!run) throw new Error(`Automation run ${runId} not found`)
    if (run.status !== 'pending_approval') {
      throw new Error(`Automation run ${runId} is not pending approval`)
    }
    const definition = await aiOrchestratorStore.getAutomation(run.automationId)
    if (!definition) throw new Error(`Automation ${run.automationId} not found`)
    if (run.policyVersion !== definition.policy.version) {
      await aiOrchestratorStore.updateAutomationRun(run.id, {
        status: 'cancelled',
        error: 'Automation policy changed while approval was pending',
        completedAt: Date.now()
      })
      throw new Error('Automation policy changed; create a new run for approval')
    }
    await aiOrchestratorStore.updateAutomationRun(run.id, {
      status: 'queued',
      approved: true,
      payload: run.payload,
      error: '',
      approvalReason: ''
    })
    const approvedRun = {
      ...run,
      status: 'queued' as const,
      approved: true,
      payload: run.payload,
      approvalReason: undefined,
      updatedAt: Date.now()
    }
    this.executeExisting(definition, approvedRun)
    return approvedRun
  }

  private installTrigger(definition: AiAutomationDefinition): void {
    if (!definition.enabled) return
    const trigger = definition.trigger
    if (trigger.type === 'startup') {
      const timer = setTimeout(() => {
        void this.enqueue(definition, 'startup', definition.approvalMode === 'preauthorized').catch(
          (error) => schedulerLog.error(`Startup automation ${definition.id} failed`, { error })
        )
      }, 0)
      this.triggerCleanup.set(definition.id, () => clearTimeout(timer))
      return
    }
    if (trigger.type === 'interval') {
      const timer = setInterval(() => {
        void this.enqueue(
          definition,
          'interval',
          definition.approvalMode === 'preauthorized'
        ).catch((error) =>
          schedulerLog.error(`Interval automation ${definition.id} failed`, { error })
        )
      }, trigger.intervalMs)
      timer.unref?.()
      this.triggerCleanup.set(definition.id, () => clearInterval(timer))
      return
    }
    if (trigger.type === 'cron') {
      const timer = setInterval(() => {
        const now = new Date()
        const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
        if (this.lastCronMinute.get(definition.id) === minuteKey) return
        if (!cronMatches(trigger.expression, now)) return
        this.lastCronMinute.set(definition.id, minuteKey)
        void this.enqueue(definition, 'cron', definition.approvalMode === 'preauthorized').catch(
          (error) => schedulerLog.error(`Cron automation ${definition.id} failed`, { error })
        )
      }, CRON_POLL_INTERVAL_MS)
      timer.unref?.()
      this.triggerCleanup.set(definition.id, () => clearInterval(timer))
      return
    }

    const debounceMs = Math.max(50, trigger.debounceMs ?? 300)
    let debounceTimer: NodeJS.Timeout | null = null
    const watchedPath = resolve(definition.cwd || process.cwd(), trigger.path)
    let watcher: FSWatcher
    try {
      watcher = watch(watchedPath, (eventType, filename) => {
        const acceptedEvents = trigger.events ?? ['change', 'rename']
        if (!acceptedEvents.includes(eventType)) return
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          debounceTimer = null
          void this.enqueue(definition, 'file_event', definition.approvalMode === 'preauthorized', {
            eventType,
            filename: filename?.toString(),
            watchedPath
          }).catch((error) =>
            schedulerLog.error(`File automation ${definition.id} failed`, { error })
          )
        }, debounceMs)
      })
      watcher.on('error', (error) => {
        schedulerLog.warn(`File automation watcher ${definition.id} failed`, { error })
      })
    } catch (error) {
      schedulerLog.warn(`Unable to watch ${watchedPath} for automation ${definition.id}`, { error })
      return
    }
    this.triggerCleanup.set(definition.id, () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      watcher.close()
    })
  }

  private uninstallTrigger(automationId: string): void {
    this.triggerCleanup.get(automationId)?.()
    this.triggerCleanup.delete(automationId)
    this.lastCronMinute.delete(automationId)
  }

  private async enqueue(
    definition: AiAutomationDefinition,
    triggerType: AiAutomationRunRecord['triggerType'],
    approved: boolean,
    payload?: Record<string, unknown>,
    initialMissedCount = 0
  ): Promise<AiAutomationRunRecord> {
    const active = this.activeRuns.get(definition.id)
    if (active) {
      const now = Date.now()
      const previous = this.missedTriggers.get(definition.id)
      const missed: CoalescedAutomationTrigger = {
        count: (previous?.count ?? 0) + 1,
        payload,
        firstTriggeredAt: previous?.firstTriggeredAt ?? now,
        lastTriggeredAt: now
      }
      this.missedTriggers.set(definition.id, missed)
      await aiOrchestratorStore.updateAutomationRun(active.runId, {
        missedCount: missed.count,
        payload: {
          ...(payload ?? {}),
          coalesced: {
            missedCount: missed.count,
            firstTriggeredAt: missed.firstTriggeredAt,
            lastTriggeredAt: missed.lastTriggeredAt
          }
        }
      })
      const current = await aiOrchestratorStore.getAutomationRun(active.runId)
      if (!current) throw new Error(`Active automation run ${active.runId} not found`)
      return current
    }

    const now = Date.now()
    const policy = normalizeAutomationPolicy(definition, definition.policy)
    const runsInWindow = await aiOrchestratorStore.countAutomationRunsSince(
      definition.id,
      now - policy.windowMs
    )
    const explicitApproval = triggerType === 'manual' && approved
    const approvalReason =
      !explicitApproval && definition.approvalMode === 'manual'
        ? 'Automation requires manual approval'
        : !explicitApproval && !policy.allowedAgentProfileIds.includes(definition.profileId)
          ? `Agent profile ${definition.profileId} is outside the automation policy`
          : !explicitApproval && runsInWindow >= policy.maxRunsPerWindow
            ? `Automation exceeded ${policy.maxRunsPerWindow} runs per policy window`
            : undefined
    const requiresApproval = Boolean(approvalReason)
    const run: AiAutomationRunRecord = {
      id: randomUUID(),
      automationId: definition.id,
      triggerType,
      status: requiresApproval ? 'pending_approval' : 'queued',
      approved: approved && !requiresApproval,
      missedCount: initialMissedCount,
      payload,
      approvalReason,
      policyVersion: policy.version,
      createdAt: now,
      updatedAt: now
    }
    await aiOrchestratorStore.createAutomationRun(run)
    if (!requiresApproval) this.executeExisting(definition, run)
    return run
  }

  private executeExisting(definition: AiAutomationDefinition, run: AiAutomationRunRecord): void {
    if (!this.executor) throw new Error('AI automation executor is not configured')
    const promise = this.executeRun(definition, run).finally(() => {
      this.activeRuns.delete(definition.id)
      const missed = this.missedTriggers.get(definition.id)
      this.missedTriggers.delete(definition.id)
      if (missed && this.initialized) {
        void this.enqueue(
          definition,
          run.triggerType,
          run.approved,
          {
            ...(missed.payload ?? {}),
            coalesced: {
              missedCount: missed.count,
              firstTriggeredAt: missed.firstTriggeredAt,
              lastTriggeredAt: missed.lastTriggeredAt
            }
          },
          missed.count
        ).catch((error) =>
          schedulerLog.error(`Coalesced automation ${definition.id} failed`, { error })
        )
      }
    })
    this.activeRuns.set(definition.id, { runId: run.id, promise })
  }

  private async executeRun(
    definition: AiAutomationDefinition,
    run: AiAutomationRunRecord
  ): Promise<void> {
    if (!this.executor) return
    const startedAt = Date.now()
    await aiOrchestratorStore.updateAutomationRun(run.id, {
      status: 'running',
      startedAt
    })
    try {
      const policy = normalizeAutomationPolicy(definition, definition.policy)
      const orchestratorRun = await this.executor(
        {
          objective: definition.objective,
          input: definition.input,
          profileId: definition.profileId,
          cwd: definition.cwd,
          timeoutMs: Math.min(definition.timeoutMs ?? policy.timeoutMs, policy.timeoutMs),
          approved: run.approved,
          allowedToolIds: policy.allowedToolIds,
          budget: policy.budget,
          metadata: {
            ...(definition.metadata ?? {}),
            automationRunId: run.id,
            triggerType: run.triggerType,
            triggerPayload: run.payload,
            automationPolicy: policy
          }
        },
        definition.id
      )
      await aiOrchestratorStore.updateAutomationRun(run.id, {
        orchestratorRunId: orchestratorRun.id,
        status: orchestratorRun.status,
        error: orchestratorRun.error ?? '',
        completedAt: Date.now()
      })
    } catch (error) {
      await aiOrchestratorStore.updateAutomationRun(run.id, {
        status: 'failed',
        error: toErrorMessage(error),
        completedAt: Date.now()
      })
    }
  }

  private async recoverInterruptedRuns(): Promise<void> {
    const runs = await aiOrchestratorStore.listRecoverableAutomationRuns()
    for (const run of runs) {
      const definition = await aiOrchestratorStore.getAutomation(run.automationId)
      if (!definition || !definition.enabled) {
        await aiOrchestratorStore.updateAutomationRun(run.id, {
          status: 'cancelled',
          error: 'Automation was removed or disabled before recovery',
          completedAt: Date.now()
        })
        continue
      }
      if (run.policyVersion !== definition.policy.version) {
        await aiOrchestratorStore.updateAutomationRun(run.id, {
          status: 'cancelled',
          error: 'Automation policy changed before recovery',
          completedAt: Date.now()
        })
        continue
      }
      if (definition.approvalMode === 'manual' && !run.approved) {
        await aiOrchestratorStore.updateAutomationRun(run.id, {
          status: 'pending_approval',
          triggerType: 'recovery'
        })
        continue
      }
      await aiOrchestratorStore.updateAutomationRun(run.id, {
        status: 'queued',
        triggerType: 'recovery',
        error: ''
      })
      this.executeExisting(definition, {
        ...run,
        triggerType: 'recovery',
        status: 'queued',
        updatedAt: Date.now()
      })
    }
  }
}

export const aiAutomationScheduler = new AiAutomationScheduler()
