import type { UsageLimitRefusalFixture } from './usage-ledger/usage-limit-refusal.test-harness'
import { Buffer } from 'node:buffer'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const storeMocks = vi.hoisted(() => ({
  fixture: undefined as UsageLimitRefusalFixture | undefined
}))

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

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => storeMocks.fixture?.db,
    getClient: () => storeMocks.fixture?.client
  }
}))

import { AiOrchestratorStore } from './ai-orchestrator-store'
import {
  closeUsageLimitRefusalDatabase,
  openUsageLimitRefusalDatabase
} from './usage-ledger/usage-limit-refusal.test-harness'

async function seedRun(id: string, status: string, updatedAt = 1_000): Promise<void> {
  const fixture = storeMocks.fixture
  if (!fixture) throw new Error('run-message database fixture is not open')
  await fixture.client.execute({
    sql: `INSERT INTO ai_orchestrator_runs (
      id, automation_id, session_id, objective, profile_id, runtime_provider, cwd, status,
      output, error, usage, metadata, parent_run_id, delegation_plan, approval_reason,
      created_at, started_at, completed_at, updated_at
    ) VALUES (?, NULL, ?, ?, 'profile', 'pi-core', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      `session-${id}`,
      `OBJECTIVE_${id}`,
      `/private/${id}`,
      status,
      `OUTPUT_${id}`,
      null,
      '{"tokens":1}',
      `{"run":"${id}"}`,
      `{"delegation":"${id}"}`,
      `APPROVAL_${id}`,
      updatedAt - 100,
      updatedAt - 50,
      status === 'running' ? null : updatedAt,
      updatedAt
    ]
  })
}

async function countMessages(runId: string): Promise<number> {
  const fixture = storeMocks.fixture
  if (!fixture) throw new Error('run-message database fixture is not open')
  const result = await fixture.client.execute({
    sql: 'SELECT COUNT(*) AS count FROM ai_orchestrator_run_messages WHERE run_id = ?',
    args: [runId]
  })
  return Number(result.rows[0]?.count ?? 0)
}

beforeAll(async () => {
  storeMocks.fixture = await openUsageLimitRefusalDatabase()
  await storeMocks.fixture.client.execute('PRAGMA foreign_keys = ON')
})

afterAll(async () => {
  await closeUsageLimitRefusalDatabase(storeMocks.fixture)
  storeMocks.fixture = undefined
})

describe('AiOrchestratorStore run messages', () => {
  it('assigns independent sequences and returns opaque envelopes in ascending order', async () => {
    const store = new AiOrchestratorStore()
    const firstRun = 'run-messages-independent-a'
    const secondRun = 'run-messages-independent-b'
    await seedRun(firstRun, 'running')
    await seedRun(secondRun, 'running')

    const firstEnvelope = 'opaque UTF-8: 雪🧪\nnot-json'
    const secondEnvelope = '{"role":"assistant","content":"kept verbatim"}'
    const otherFirstEnvelope = '[] trailing text — é'
    const otherSecondEnvelope = 'plain text / no parser involved'

    await expect(store.appendRunMessage(firstRun, firstEnvelope)).resolves.toBe(1)
    await expect(store.appendRunMessage(secondRun, otherFirstEnvelope)).resolves.toBe(1)
    await expect(store.appendRunMessage(firstRun, secondEnvelope)).resolves.toBe(2)
    await expect(store.appendRunMessage(secondRun, otherSecondEnvelope)).resolves.toBe(2)

    await expect(store.listRunMessages(firstRun)).resolves.toEqual([
      { seq: 1, envelope: firstEnvelope },
      { seq: 2, envelope: secondEnvelope }
    ])
    await expect(store.listRunMessages(secondRun)).resolves.toEqual([
      { seq: 1, envelope: otherFirstEnvelope },
      { seq: 2, envelope: otherSecondEnvelope }
    ])
  })

  it('rejects appending a message whose run does not exist', async () => {
    const store = new AiOrchestratorStore()

    await expect(store.appendRunMessage('run-messages-missing-parent', 'opaque')).rejects.toThrow()
  })

  it('deletes only the selected run messages and tolerates deleting none', async () => {
    const store = new AiOrchestratorStore()
    const deletedRun = 'run-messages-delete-a'
    const retainedRun = 'run-messages-delete-b'
    await seedRun(deletedRun, 'running')
    await seedRun(retainedRun, 'running')
    await store.appendRunMessage(deletedRun, 'to delete')
    await store.appendRunMessage(retainedRun, 'must remain')

    await expect(store.deleteRunMessages(deletedRun)).resolves.toBeUndefined()
    await expect(store.listRunMessages(deletedRun)).resolves.toEqual([])
    await expect(store.listRunMessages(retainedRun)).resolves.toEqual([
      { seq: 1, envelope: 'must remain' }
    ])
    await expect(store.deleteRunMessages(deletedRun)).resolves.toBeUndefined()
    await expect(store.deleteRunMessages('run-messages-delete-missing')).resolves.toBeUndefined()
    await expect(store.listRunMessages(retainedRun)).resolves.toEqual([
      { seq: 1, envelope: 'must remain' }
    ])
  })

  it('truncates a run to a kept prefix without touching another run', async () => {
    const store = new AiOrchestratorStore()
    const truncatedRun = 'run-messages-truncate-a'
    const retainedRun = 'run-messages-truncate-b'
    await seedRun(truncatedRun, 'running')
    await seedRun(retainedRun, 'running')
    await store.appendRunMessage(truncatedRun, 'keep one')
    await store.appendRunMessage(truncatedRun, 'keep two')
    await store.appendRunMessage(truncatedRun, 'remove three')
    await store.appendRunMessage(retainedRun, 'other run')

    await store.truncateRunMessages(truncatedRun, 2)
    await expect(store.listRunMessages(truncatedRun)).resolves.toEqual([
      { seq: 1, envelope: 'keep one' },
      { seq: 2, envelope: 'keep two' }
    ])
    await expect(store.listRunMessages(retainedRun)).resolves.toEqual([
      { seq: 1, envelope: 'other run' }
    ])
    await expect(store.appendRunMessage(truncatedRun, 'next after prefix')).resolves.toBe(3)

    await store.truncateRunMessages(truncatedRun, 0)
    await expect(store.listRunMessages(truncatedRun)).resolves.toEqual([])
    await expect(store.truncateRunMessages(truncatedRun, 0)).resolves.toBeUndefined()
  })

  it('cascades run-message deletion when privacy deletes a terminal run', async () => {
    const store = new AiOrchestratorStore()
    const deletedRun = 'run-messages-cascade-terminal'
    const retainedRun = 'run-messages-cascade-retained'
    await seedRun(deletedRun, 'completed')
    await seedRun(retainedRun, 'completed')
    await store.appendRunMessage(deletedRun, 'cascade me')
    await store.appendRunMessage(retainedRun, 'keep me')

    const snapshot = await store.getOrchestratorRunPrivacySnapshot(deletedRun)
    expect(snapshot).toMatchObject({ runId: deletedRun, status: 'completed', eventCount: 0 })
    const deletion = await store.deleteOrchestratorRunForPrivacy(deletedRun, snapshot!.revision)

    expect(deletion).toEqual({ disposition: 'deleted', deletedEventCount: 0 })
    await expect(store.listRunMessages(deletedRun)).resolves.toEqual([])
    await expect(store.listRunMessages(retainedRun)).resolves.toEqual([
      { seq: 1, envelope: 'keep me' }
    ])
    await expect(countMessages(deletedRun)).resolves.toBe(0)
    await expect(countMessages(retainedRun)).resolves.toBe(1)
  })

  it('counts an envelope by its UTF-8 bytes in retention accounting', async () => {
    const store = new AiOrchestratorStore()
    const runId = 'run-messages-retention-utf8'
    await seedRun(runId, 'completed')

    const before = await store.listOrchestratorRunRetentionCandidates(10_000, undefined, 20)
    const beforeCandidate = before.candidates.find((candidate) => candidate.runId === runId)
    if (!beforeCandidate) throw new Error(`missing retention candidate for ${runId}`)

    const envelope = 'opaque UTF-8 雪🧪 — not JSON'
    await store.appendRunMessage(runId, envelope)

    const after = await store.listOrchestratorRunRetentionCandidates(10_000, undefined, 20)
    const afterCandidate = after.candidates.find((candidate) => candidate.runId === runId)
    if (!afterCandidate) throw new Error(`missing retention candidate for ${runId}`)
    expect(afterCandidate.byteCount - beforeCandidate.byteCount).toBe(Buffer.byteLength(envelope, 'utf8'))
  })
})
