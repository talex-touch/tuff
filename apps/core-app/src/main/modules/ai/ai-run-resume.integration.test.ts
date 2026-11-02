import type {
  PiRuntimeRunRecord,
  PiRuntimeRunResult,
  PiRuntimeStartPayload
} from './pi-agent-runtime-protocol'
import type { UsageLimitRefusalFixture } from './usage-ledger/usage-limit-refusal.test-harness'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A run the app stopped under, picked up again by the next start:
 *
 * - the real orchestrator (a second instance stands for the restarted app), the real orchestrator
 *   store on a migrated libSQL file, and the real encrypted vault holding the run's input;
 * - only the Pi runtime's `execute` is replaced, so what reaches the runtime can be read: nothing
 *   here could contact a model.
 *
 * Nothing waits on a clock. A run is "running" once the runtime has been handed it, and a resumed
 * run is finished once the orchestrator's `shutdown()` - which drains every execution - returns.
 */

let fixture: UsageLimitRefusalFixture | undefined
const vault = vi.hoisted(() => ({ root: '' }))

vi.mock('electron', () => {
  const app = {
    commandLine: { appendSwitch: vi.fn() },
    getAppPath: vi.fn(() => '/tmp/app'),
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false,
    isReady: vi.fn(() => true),
    on: vi.fn(),
    once: vi.fn(),
    setAppLogsPath: vi.fn(),
    setPath: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined)
  }
  const electron = {
    app,
    utilityProcess: { fork: vi.fn() },
    screen: { getPrimaryDisplay: vi.fn() },
    crashReporter: { start: vi.fn() },
    BrowserWindow: class BrowserWindow {},
    Tray: class Tray {},
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn() },
    ['ipc' + 'Main']: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
    powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
    MessageChannelMain: class MessageChannelMain {}
  }
  return { ...electron, default: electron }
})
vi.mock('../../utils/app-root-path', () => ({ resolveRuntimeRootPath: () => vault.root }))
vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true, macOS: false, windows: false, linux: true }
}))
vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))
vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn(),
  getCurrentScope: vi.fn(() => ({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() })),
  flush: vi.fn(async () => true)
}))
vi.mock('../../core/precore', () => ({
  rootPath: '/tmp/tuff-test',
  innerRootPath: '/tmp/tuff-test'
}))
vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => undefined),
  saveMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn(),
  isMainStorageReady: vi.fn(() => false)
}))
vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => fixture?.db,
    getClient: () => fixture?.client
  }
}))
vi.mock('../sentry/sentry-service', () => ({
  SentryServiceModule: class {},
  getSentryService: vi.fn(() => ({
    isTelemetryEnabled: vi.fn(() => false),
    isEnabled: vi.fn(() => false),
    queueNexusTelemetry: vi.fn()
  })),
  setSentryServiceInstance: vi.fn()
}))
vi.mock('./ai-automation-scheduler', () => ({
  aiAutomationScheduler: {
    setExecutor: vi.fn(),
    initialize: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined)
  }
}))

import { AiCliOrchestrator } from './ai-cli-orchestrator'
import { aiOrchestratorStore } from './ai-orchestrator-store'
import { discardRunInput, loadRunInput, saveRunInput } from './ai-run-input-vault'
import { buildObjectivePrompt } from './pi-agent-run-log'
import { PiAgentRuntimeHost } from './pi-agent-runtime-host'
import {
  closeUsageLimitRefusalDatabase,
  openUsageLimitRefusalDatabase
} from './usage-ledger/usage-limit-refusal.test-harness'

const SECRET_TASK = 'reconcile the ACME-CANARY-7731 ledger'
const NO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

const hostExecute = vi.spyOn(PiAgentRuntimeHost.prototype, 'execute')

async function eventTypes(runId: string): Promise<string[]> {
  const rows = await fixture!.client.execute({
    sql: 'SELECT type FROM ai_orchestrator_events WHERE run_id = ? ORDER BY seq',
    args: [runId]
  })
  return rows.rows.map((row) => String(row.type))
}

/**
 * The app as it was when it stopped: a run the runtime was handed and never finished. The first
 * instance is left holding it - a stopped process cannot settle anything - and the test starts the
 * next one. Resolves once the runtime has the run, i.e. the row says `running`.
 */
async function startRunThenStop(input: unknown): Promise<string> {
  const handedOver = Promise.withResolvers<string>()
  hostExecute.mockImplementationOnce((payload: PiRuntimeStartPayload) => {
    handedOver.resolve(payload.run.id)
    return new Promise<PiRuntimeRunResult>(() => undefined)
  })
  const stopped = new AiCliOrchestrator()
  await stopped.initialize()
  void stopped.execute({ objective: 'Reconcile the ledger.', input })
  return await handedOver.promise
}

/**
 * Starts the next process. `resumedWith` settles with what the runtime was handed for a resumed
 * run; it never settles when nothing was resumed, so callers await it only when one should be.
 */
async function restart(): Promise<{
  next: AiCliOrchestrator
  resumedWith: Promise<PiRuntimeStartPayload>
}> {
  const handedOver = Promise.withResolvers<PiStartPayload>()
  hostExecute.mockImplementationOnce(async (payload: PiRuntimeStartPayload) => {
    handedOver.resolve(payload)
    return {
      runId: payload.run.id,
      output: `answered ${payload.run.id}`,
      usage: NO_USAGE
    }
  })
  const next = new AiCliOrchestrator()
  await next.initialize()
  return { next, resumedWith: handedOver.promise }
}

type PiStartPayload = PiRuntimeStartPayload

beforeAll(async () => {
  vault.root = await mkdtemp(path.join(tmpdir(), 'tuff-run-resume-'))
  fixture = await openUsageLimitRefusalDatabase()
}, 60_000)

/**
 * Every test leaves its stopped run behind as the previous process's, and `restart()` leaves a
 * one-shot runtime answer queued when nothing was resumed. Both are cleared here: a leftover run
 * would be "the run that was running" in the next test, and a leftover answer would be handed to
 * its `startRunThenStop` in place of its own.
 */
beforeEach(async () => {
  await fixture!.client.execute(
    "UPDATE ai_orchestrator_runs SET status = 'interrupted' WHERE status IN ('queued', 'running')"
  )
  hostExecute.mockReset()
})

afterAll(async () => {
  hostExecute.mockRestore()
  await closeUsageLimitRefusalDatabase(fixture)
}, 60_000)

describe('a run the app stopped under', () => {
  it('resumes with the input it was given, finishes, and leaves nothing in the vault', async () => {
    const runId = await startRunThenStop({ task: SECRET_TASK })
    await expect(loadRunInput(runId)).resolves.toEqual({ input: { task: SECRET_TASK } })

    const { next, resumedWith } = await restart()
    const payload = await resumedWith
    expect(payload.run.id).toBe(runId)
    expect(payload.request.input).toEqual({ task: SECRET_TASK })
    await next.shutdown()

    const finished = await aiOrchestratorStore.getOrchestratorRun(runId)
    expect(finished).toMatchObject({ status: 'completed', output: `answered ${runId}` })
    expect(await eventTypes(runId)).toEqual(
      expect.arrayContaining(['run.started', 'run.resumed', 'run.completed'])
    )
    // The run row keeps the digest of the input, never the input.
    expect(JSON.stringify(finished?.metadata)).not.toContain('ACME-CANARY-7731')
    expect(finished?.metadata).toMatchObject({ requestInputPresent: true })
    // Whatever ends a run clears the in-memory input and the stored one together.
    await expect(loadRunInput(runId)).resolves.toBeNull()
  })

  it('is interrupted, as it always was, when its input is no longer there', async () => {
    const runId = await startRunThenStop({ task: SECRET_TASK })
    await discardRunInput(runId)

    const { next } = await restart()
    await next.shutdown()

    await expect(aiOrchestratorStore.getOrchestratorRun(runId)).resolves.toMatchObject({
      status: 'interrupted',
      error: 'Run was interrupted by application restart while running'
    })
    const events = await eventTypes(runId)
    expect(events).toContain('run.interrupted')
    expect(events).not.toContain('run.resumed')
  })

  it('is interrupted, never run, when the stored input is not the one it was given', async () => {
    const runId = await startRunThenStop({ task: SECRET_TASK })
    await saveRunInput(runId, { task: 'transfer the funds somewhere else' })

    const { next } = await restart()
    await next.shutdown()

    // The vault now holds something the run was never given. The recorded digest is what refuses
    // it - so nothing reaches the runtime, resumed or not.
    expect((await aiOrchestratorStore.getOrchestratorRun(runId))?.status).toBe('interrupted')
    expect(await eventTypes(runId)).not.toContain('run.resumed')
    const runtimeInputs = hostExecute.mock.calls.map(([payload]) => payload.request.input)
    expect(runtimeInputs).not.toContainEqual({ task: 'transfer the funds somewhere else' })
  })

  it('does not resume a run that is not its own to resume', async () => {
    const runId = await startRunThenStop({ task: SECRET_TASK })
    await fixture!.client.execute({
      sql: 'UPDATE ai_orchestrator_runs SET parent_run_id = ? WHERE id = ?',
      args: ['some-parent', runId]
    })

    const { next } = await restart()
    await next.shutdown()

    // `run.resumed` is written the moment a run is picked up, whether or not the runtime answers.
    expect((await aiOrchestratorStore.getOrchestratorRun(runId))?.status).toBe('interrupted')
    expect(await eventTypes(runId)).not.toContain('run.resumed')
    expect(await eventTypes(runId)).toContain('run.interrupted')
  })
})

describe('a run the app stopped under after it had logged messages', () => {
  const OBJECTIVE = 'Reconcile the ledger.'
  const INPUT = { task: SECRET_TASK }
  const usage = (totalTokens: number) => ({
    promptTokens: totalTokens,
    completionTokens: 0,
    totalTokens,
    cost: 0.001
  })

  const userRecord = (): PiRuntimeRunRecord => ({
    message: {
      role: 'user',
      content: [{ type: 'text', text: buildObjectivePrompt(OBJECTIVE, INPUT) }]
    },
    modelSteps: 0,
    toolCalls: 0,
    usage: usage(0),
    costKnown: true
  })
  const turnRecord = (): PiRuntimeRunRecord => ({
    message: {
      role: 'assistant',
      stopReason: 'toolUse',
      content: [{ type: 'toolCall', id: 'call_1', name: 'file.read', arguments: {} }]
    },
    modelSteps: 1,
    toolCalls: 0,
    usage: usage(15),
    costKnown: true
  })
  const resultRecord = (): PiRuntimeRunRecord => ({
    message: {
      role: 'toolResult',
      toolCallId: 'call_1',
      content: [{ type: 'text', text: `the file says ${SECRET_TASK}` }]
    },
    modelSteps: 1,
    toolCalls: 1,
    usage: usage(15),
    costKnown: true
  })

  /**
   * The app as it was when it stopped, having logged `records`: they are handed to the very
   * callback the runtime host uses for the worker's records, so they are sealed and stored exactly
   * as a real run's are.
   */
  async function startLoggedRunThenStop(records: PiRuntimeRunRecord[]): Promise<string> {
    const handedOver = Promise.withResolvers<string>()
    hostExecute.mockImplementationOnce(async function (
      this: { onRecord?: (runId: string, record: PiRuntimeRunRecord) => Promise<void> },
      payload: PiRuntimeStartPayload
    ) {
      for (const record of records) await this.onRecord?.(payload.run.id, record)
      handedOver.resolve(payload.run.id)
      return await new Promise<PiRuntimeRunResult>(() => undefined)
    })
    const stopped = new AiCliOrchestrator()
    await stopped.initialize()
    void stopped.execute({ objective: OBJECTIVE, input: INPUT })
    return await handedOver.promise
  }

  async function storedRows(runId: string): Promise<Array<{ seq: number; envelope: string }>> {
    return await aiOrchestratorStore.listRunMessages(runId)
  }

  it('resumes from its last tool result, and keeps nothing in the log once it finishes', async () => {
    const runId = await startLoggedRunThenStop([userRecord(), turnRecord(), resultRecord()])
    const rows = await storedRows(runId)
    expect(rows.map((row) => row.seq)).toEqual([1, 2, 3])
    // What a tool returned is in the log, and the table only ever holds ciphertext.
    expect(rows.map((row) => row.envelope).join('')).not.toContain('ACME-CANARY-7731')

    const { next, resumedWith } = await restart()
    const payload = await resumedWith
    expect(payload.resume?.replay).toBeUndefined()
    expect(payload.resume?.messages).toHaveLength(3)
    expect(JSON.stringify(payload.resume?.messages)).toContain('ACME-CANARY-7731')
    expect(payload.resume?.counters).toMatchObject({ modelSteps: 1, toolCalls: 1 })
    await next.shutdown()

    expect((await aiOrchestratorStore.getOrchestratorRun(runId))?.status).toBe('completed')
    expect(await storedRows(runId)).toEqual([])
  })

  it('replays the turn it stopped on and cuts the log back to just before it', async () => {
    const runId = await startLoggedRunThenStop([userRecord(), turnRecord()])

    const { next, resumedWith } = await restart()
    const payload = await resumedWith
    expect(payload.resume?.messages).toHaveLength(1)
    expect(payload.resume?.replay).toMatchObject({ role: 'assistant', stopReason: 'toolUse' })
    expect(payload.resume?.counters).toMatchObject({ modelSteps: 0 })
    // What the resumed run appends goes after the records it kept, not after the turn it replays.
    expect((await storedRows(runId)).map((row) => row.seq)).toEqual([1])
    await next.shutdown()
  })

  it('starts over, never from a log that was spliced together, when an envelope was moved', async () => {
    const runId = await startLoggedRunThenStop([userRecord(), turnRecord(), resultRecord()])
    // Two records swap places: each is a genuine envelope, but not for the position it now holds.
    await fixture!.client.execute({
      sql: `UPDATE ai_orchestrator_run_messages
            SET envelope = CASE seq
              WHEN 2 THEN (SELECT envelope FROM ai_orchestrator_run_messages WHERE run_id = ? AND seq = 3)
              WHEN 3 THEN (SELECT envelope FROM ai_orchestrator_run_messages WHERE run_id = ? AND seq = 2)
            END
            WHERE run_id = ? AND seq IN (2, 3)`,
      args: [runId, runId, runId]
    })

    const { next, resumedWith } = await restart()
    const payload = await resumedWith
    expect(payload.resume).toBeUndefined()
    await next.shutdown()
  })

  it('starts over when the log was made for another input', async () => {
    const other = userRecord()
    ;(other.message as { content: Array<{ text: string }> }).content[0].text = buildObjectivePrompt(
      OBJECTIVE,
      { task: 'something else' }
    )
    await startLoggedRunThenStop([other, turnRecord(), resultRecord()])

    const { next, resumedWith } = await restart()
    const payload = await resumedWith
    expect(payload.resume).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain('something else')
    await next.shutdown()
  })

  it('is not resumed from a log when its input is no longer there', async () => {
    const runId = await startLoggedRunThenStop([userRecord(), turnRecord(), resultRecord()])
    await discardRunInput(runId)

    const { next } = await restart()
    await next.shutdown()

    expect((await aiOrchestratorStore.getOrchestratorRun(runId))?.status).toBe('interrupted')
    expect(await eventTypes(runId)).not.toContain('run.resumed')
    // Its log goes with it.
    expect(await storedRows(runId)).toEqual([])
  })
})
