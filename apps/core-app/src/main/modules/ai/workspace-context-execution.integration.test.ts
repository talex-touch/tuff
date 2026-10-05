import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type {
  ContextPackageLog,
  IntelligenceChatPayload,
  IntelligenceContextExecutionSummary
} from '@talex-touch/utils/types/intelligence'
import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'
import { scheduleDbWrite } from '../../db/db-write'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import './intelligence-test-harness'
import {
  ContextMessageAssembler,
  IntelligenceContextExecutionService
} from './intelligence-context-execution'
import { ContextHygieneService } from './intelligence-context-hygiene'

const boundary = vi.hoisted(() => ({
  client: undefined as Client | undefined,
  db: undefined as LibSQLDatabase<typeof schema> | undefined,
  modelRequests: [] as unknown[]
}))

// Only the database handle is substituted; hygiene SQL, package construction,
// privacy policy, migrations, foreign keys and the shared writer are real.
vi.mock('../database', () => ({
  databaseModule: {
    getClient: () => boundary.client,
    getDb: () => boundary.db
  }
}))

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: {
    async invoke(_capabilityId: string, payload: unknown) {
      boundary.modelRequests.push(payload)
      throw new Error('Workspace context preparation must not invoke a model')
    },
    async *stream(_capabilityId: string, payload: unknown) {
      boundary.modelRequests.push(payload)
      throw new Error('Workspace context preparation must not stream a model')
    }
  }
}))

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)
const imageDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII='

let client: Client
let db: LibSQLDatabase<typeof schema>
let testDirectory: string
let hygiene: ContextHygieneService
let execution: IntelligenceContextExecutionService

function deferred() {
  let resolvePromise!: () => void
  const promise = new Promise<void>((resolvePromiseValue) => {
    resolvePromise = resolvePromiseValue
  })
  return { promise, resolve: resolvePromise }
}

function payload(content: string): IntelligenceChatPayload {
  return { messages: [{ role: 'user', content }] }
}

async function durableContext() {
  return {
    sessions: await db
      .select()
      .from(schema.intelligenceContextSessions)
      .orderBy(schema.intelligenceContextSessions.id),
    turns: await db
      .select()
      .from(schema.intelligenceContextTurns)
      .orderBy(schema.intelligenceContextTurns.id),
    checkpoints: await db
      .select()
      .from(schema.intelligenceContextCheckpoints)
      .orderBy(schema.intelligenceContextCheckpoints.id),
    packages: await db
      .select()
      .from(schema.intelligenceContextPackageLogs)
      .orderBy(schema.intelligenceContextPackageLogs.id),
    snapshots: await db
      .select()
      .from(schema.intelligenceCompressionSnapshots)
      .orderBy(schema.intelligenceCompressionSnapshots.id)
  }
}

async function assertDurableCurrentInput(
  summary: IntelligenceContextExecutionSummary,
  content: string,
  traceId: string
) {
  const sessions = await db
    .select()
    .from(schema.intelligenceContextSessions)
    .where(eq(schema.intelligenceContextSessions.id, summary.sessionId!))
  expect(sessions).toMatchObject([
    {
      id: summary.sessionId,
      owner: 'assistant',
      status: 'active'
    }
  ])

  const turns = await db
    .select()
    .from(schema.intelligenceContextTurns)
    .where(eq(schema.intelligenceContextTurns.id, summary.turnId!))
  expect(turns).toMatchObject([
    {
      id: summary.turnId,
      sessionId: summary.sessionId,
      role: 'user',
      content,
      privacyLevel: 'normal'
    }
  ])

  const packages = await db
    .select()
    .from(schema.intelligenceContextPackageLogs)
    .where(eq(schema.intelligenceContextPackageLogs.id, summary.packageId!))
  expect(packages).toMatchObject([
    {
      id: summary.packageId,
      sessionId: summary.sessionId,
      traceId,
      scope: 'light'
    }
  ])
  const durablePackage = packages[0]!
  const items = JSON.parse(durablePackage.items) as ContextPackageLog['items']
  expect(items).toEqual([
    {
      sourceType: 'current_input',
      sourceId: turns[0]!.id,
      reason: 'current user input',
      tokenEstimate: turns[0]!.tokenEstimate
    }
  ])
  expect(summary).toMatchObject({
    scope: durablePackage.scope,
    traceId: durablePackage.traceId,
    tokenBudget: durablePackage.tokenBudget,
    tokenEstimate: durablePackage.tokenEstimate,
    itemCount: items.length,
    sourceTypes: ['current_input'],
    retrievalItemCount: 0,
    citationCount: 0
  })
  expect(durablePackage.tokenEstimate).toBe(
    items.reduce((total, item) => total + item.tokenEstimate, 0)
  )
  expect(durablePackage.tokenEstimate).toBe(turns[0]!.tokenEstimate)
  // Independently check this all-CJK fixture: it is not the native history's estimate.
  expect(durablePackage.tokenEstimate).toBe(content.length)

  if (summary.checkpoint) {
    const checkpoints = await db
      .select()
      .from(schema.intelligenceContextCheckpoints)
      .where(eq(schema.intelligenceContextCheckpoints.id, summary.checkpoint.id))
    expect(checkpoints).toMatchObject([
      {
        id: summary.checkpoint.id,
        sessionId: summary.sessionId,
        type: summary.checkpoint.type,
        reason: summary.checkpoint.reason,
        contextScope: durablePackage.scope
      }
    ])
  }
  return durablePackage
}

async function createSnapshot(sessionId: string, turnId: string) {
  const [session] = await db
    .select()
    .from(schema.intelligenceContextSessions)
    .where(eq(schema.intelligenceContextSessions.id, sessionId))
  const result = await hygiene.createCompressionSnapshot({
    sessionId,
    expectedSessionUpdatedAt: session!.updatedAt,
    snapshot: {
      currentState: 'The conversation has an admitted turn',
      sourceTurnFrom: turnId,
      sourceTurnTo: turnId,
      metadata: { privacyLevel: 'normal', factState: 'confirmed', confidence: 1 }
    }
  })
  expect(result.status).toBe('created')
}

beforeEach(async () => {
  boundary.modelRequests.length = 0
  testDirectory = await mkdtemp(join(tmpdir(), 'tuff-workspace-context-'))
  client = createClient({ url: `file:${join(testDirectory, 'context.sqlite')}` })
  db = drizzle(client, { schema })
  boundary.client = client
  boundary.db = db
  await migrate(db, { migrationsFolder })
  await client.execute('PRAGMA foreign_keys = ON')
  hygiene = new ContextHygieneService()
  execution = new IntelligenceContextExecutionService(hygiene, {
    async invoke(_capabilityId: string, modelPayload: unknown): Promise<never> {
      boundary.modelRequests.push(modelPayload)
      throw new Error('Workspace context preparation must not invoke a model')
    },
    async *stream(_capabilityId: string, modelPayload: unknown) {
      boundary.modelRequests.push(modelPayload)
      throw new Error('Workspace context preparation must not stream a model')
    }
  })
}, 60_000)

afterEach(async () => {
  try {
    // A request here is a consumer-visible model side effect, not a mock echo.
    expect(boundary.modelRequests).toEqual([])
  } finally {
    await dbWriteScheduler.drain()
    vi.restoreAllMocks()
    boundary.client = undefined
    boundary.db = undefined
    client?.close()
    if (testDirectory) await rm(testDirectory, { recursive: true, force: true })
  }
}, 60_000)

describe('Workspace context execution with the shipped database', () => {
  it('preserves Main history, system order and images while reporting only durable current-input evidence', async () => {
    const current = '请描述这张图片'
    const supplied: IntelligenceChatPayload = {
      messages: [
        { role: 'system', content: '  Keep this system whitespace.\n', name: 'main' },
        {
          role: 'user',
          content: 'An earlier image',
          attachments: [{ type: 'image', dataUrl: imageDataUrl, name: 'earlier.png' }]
        },
        { role: 'assistant', content: 'Earlier native context. '.repeat(1_000) },
        { role: 'system', content: 'Follow the admitted workspace instructions.' },
        {
          role: 'user',
          content: current,
          name: 'current-user',
          metadata: { attachmentIds: ['current-image'] },
          attachments: [{ type: 'image', dataUrl: imageDataUrl, name: 'current.png' }]
        },
        { role: 'system', content: 'A Main-owned instruction after the current input.' }
      ]
    }
    const prepared = await execution.prepareWorkspaceTurn(
      supplied,
      {},
      {
        conversationId: 'conversation-a',
        turnId: 'native-turn-a'
      }
    )

    expect(prepared.payload).toEqual(supplied)
    const durablePackage = await assertDurableCurrentInput(
      prepared.summary,
      current,
      'native-turn-a'
    )
    // New work must advertise its actual checkpoint, not omit it or invent an id.
    const { checkpoints } = await hygiene.listCheckpoints({
      sessionId: prepared.summary.sessionId!
    })
    expect(checkpoints.map(({ id, type, reason }) => ({ id, type, reason }))).toEqual([
      prepared.summary.checkpoint
    ])
    expect(prepared.options.metadata?.contextExecution).toEqual(prepared.summary)
    expect(durablePackage.tokenEstimate).toBeLessThan(durablePackage.tokenBudget)
    expect(supplied.messages[2]!.content.length / 4).toBeGreaterThan(durablePackage.tokenBudget)
    const [session] = await db
      .select()
      .from(schema.intelligenceContextSessions)
      .where(eq(schema.intelligenceContextSessions.id, prepared.summary.sessionId!))
    expect(JSON.parse(session!.metadata!)).toMatchObject({
      contextActorId: 'workspace:conversation-a',
      workspaceConversationId: 'conversation-a'
    })
  })

  it('continues each conversation in its own session without importing or duplicating stored turns', async () => {
    const firstA = await execution.prepareWorkspaceTurn(
      payload('甲的首条消息'),
      {},
      {
        conversationId: 'conversation-a',
        turnId: 'a-first'
      }
    )
    const firstB = await execution.prepareWorkspaceTurn(
      payload('乙的首条消息'),
      {},
      {
        conversationId: 'conversation-b',
        turnId: 'b-first'
      }
    )
    expect(firstA.summary.sessionId).not.toBe(firstB.summary.sessionId)
    await hygiene.appendAssistantTurn({
      sessionId: firstA.summary.sessionId!,
      content: 'Stored A-only answer'
    })
    await hygiene.appendAssistantTurn({
      sessionId: firstB.summary.sessionId!,
      content: 'Stored B-only answer'
    })
    const nextInput: IntelligenceChatPayload = {
      messages: [
        { role: 'system', content: 'Main supplied B history' },
        { role: 'user', content: '乙的首条消息' },
        { role: 'assistant', content: 'Stored B-only answer' },
        { role: 'user', content: '乙的后续消息' }
      ]
    }
    const nextB = await execution.prepareWorkspaceTurn(
      nextInput,
      {},
      {
        conversationId: 'conversation-b',
        turnId: 'b-next',
        sessionId: firstB.summary.sessionId
      }
    )

    expect(nextB.summary.sessionId).toBe(firstB.summary.sessionId)
    expect(nextB.payload).toEqual(nextInput)
    await assertDurableCurrentInput(nextB.summary, '乙的后续消息', 'b-next')
    const aTurns = await db
      .select()
      .from(schema.intelligenceContextTurns)
      .where(eq(schema.intelligenceContextTurns.sessionId, firstA.summary.sessionId!))
    const bTurns = await db
      .select()
      .from(schema.intelligenceContextTurns)
      .where(eq(schema.intelligenceContextTurns.sessionId, firstB.summary.sessionId!))
    expect(aTurns.map((turn) => turn.content).sort()).toEqual(
      ['Stored A-only answer', '甲的首条消息'].sort()
    )
    expect(bTurns.map((turn) => turn.content).sort()).toEqual(
      ['Stored B-only answer', '乙的首条消息', '乙的后续消息'].sort()
    )
  })

  it('refuses another conversation context session before admitting or persisting a native turn', async () => {
    const a = await execution.prepareWorkspaceTurn(
      payload('甲的当前消息'),
      {},
      {
        conversationId: 'conversation-a',
        turnId: 'a-current'
      }
    )
    const before = await durableContext()

    await expect(
      execution.prepareWorkspaceTurn(
        payload('乙不应进入甲的会话'),
        {},
        {
          conversationId: 'conversation-b',
          turnId: 'b-cross-scope',
          sessionId: a.summary.sessionId
        }
      )
    ).rejects.toThrow('CONTEXT_SESSION_SCOPE_MISMATCH')
    expect(await durableContext()).toEqual(before)
  })

  it('cleans matching parent and continuation evidence but preserves other owners and partial metadata matches', async () => {
    const parent = await execution.prepareWorkspaceTurn(
      payload('甲的原始消息'),
      {},
      {
        conversationId: 'conversation-a',
        turnId: 'a-parent'
      }
    )
    await createSnapshot(parent.summary.sessionId!, parent.summary.turnId!)
    expect(await hygiene.archiveSession(parent.summary.sessionId!)).toBe(true)
    const child = await execution.prepareWorkspaceTurn(
      payload('甲的继续消息'),
      {},
      {
        conversationId: 'conversation-a',
        turnId: 'a-child',
        sessionId: parent.summary.sessionId
      }
    )
    expect(child.summary.sessionId).not.toBe(parent.summary.sessionId)
    await createSnapshot(child.summary.sessionId!, child.summary.turnId!)
    const [childSession] = await db
      .select()
      .from(schema.intelligenceContextSessions)
      .where(eq(schema.intelligenceContextSessions.id, child.summary.sessionId!))
    expect(JSON.parse(childSession!.metadata!)).toMatchObject({
      continuedFromSessionId: parent.summary.sessionId,
      workspaceConversationId: 'conversation-a',
      contextActorId: 'workspace:conversation-a'
    })

    const b = await execution.prepareWorkspaceTurn(
      payload('乙的保留消息'),
      {},
      {
        conversationId: 'conversation-b',
        turnId: 'b-retained'
      }
    )
    await createSnapshot(b.summary.sessionId!, b.summary.turnId!)
    const decoys = [
      {
        owner: 'corebox' as const,
        workspaceConversationId: 'conversation-a',
        contextActorId: 'workspace:conversation-a'
      },
      {
        owner: 'assistant' as const,
        workspaceConversationId: 'conversation-a',
        contextActorId: 'workspace:conversation-b'
      },
      {
        owner: 'assistant' as const,
        workspaceConversationId: 'conversation-b',
        contextActorId: 'workspace:conversation-a'
      },
      { owner: 'assistant' as const, contextActorId: 'workspace:conversation-a' },
      { owner: 'assistant' as const, workspaceConversationId: 'conversation-a' },
      { owner: 'assistant' as const }
    ]
    for (const { owner, ...metadata } of decoys) {
      const admitted = await hygiene.prepareTurn({
        owner,
        input: 'Keep this nonmatching context evidence',
        explicitScope: 'light',
        startNewSession: true,
        tokenBudget: 256,
        metadata: { ...metadata, noHistory: true }
      })
      await createSnapshot(admitted.session.id, admitted.turn.id)
    }
    const before = await durableContext()
    const deletedIds = new Set([parent.summary.sessionId!, child.summary.sessionId!])
    const retained = {
      sessions: before.sessions.filter((row) => !deletedIds.has(row.id)),
      turns: before.turns.filter((row) => !deletedIds.has(row.sessionId)),
      checkpoints: before.checkpoints.filter((row) => !deletedIds.has(row.sessionId)),
      packages: before.packages.filter((row) => !deletedIds.has(row.sessionId)),
      snapshots: before.snapshots.filter((row) => !deletedIds.has(row.sessionId))
    }
    await hygiene.cleanupWorkspaceConversation('conversation-a')

    expect(await durableContext()).toEqual(retained)
    await hygiene.cleanupWorkspaceConversation('conversation-b')
    expect(await durableContext()).toEqual({
      sessions: retained.sessions.filter((row) => row.id !== b.summary.sessionId),
      turns: retained.turns.filter((row) => row.sessionId !== b.summary.sessionId),
      checkpoints: retained.checkpoints.filter((row) => row.sessionId !== b.summary.sessionId),
      packages: retained.packages.filter((row) => row.sessionId !== b.summary.sessionId),
      snapshots: retained.snapshots.filter((row) => row.sessionId !== b.summary.sessionId)
    })
    expect(await client.execute('PRAGMA foreign_key_check')).toMatchObject({ rows: [] })
  })

  it('rejects an already-aborted preparation without creating evidence or returning a request', async () => {
    const controller = new AbortController()
    controller.abort()
    const before = await durableContext()

    await expect(
      execution.prepareWorkspaceTurn(
        payload('不应发送的消息'),
        {
          signal: controller.signal
        },
        { conversationId: 'conversation-a', turnId: 'a-aborted' }
      )
    ).rejects.toMatchObject({ code: 'INTELLIGENCE_OPERATION_CANCELLED' })
    expect(await durableContext()).toEqual(before)
  })

  it('cannot return a model-ready request after cancellation while the real writer is pending', async () => {
    const controller = new AbortController()
    const reachedWriter = deferred()
    const releaseWriter = deferred()
    const holdingWrite = scheduleDbWrite('workspace-context.test.writer-barrier', async () => {
      reachedWriter.resolve()
      await releaseWriter.promise
    })
    await reachedWriter.promise
    const pending = execution.prepareWorkspaceTurn(
      payload('准备中取消的消息'),
      {
        signal: controller.signal
      },
      { conversationId: 'conversation-a', turnId: 'a-cancelled-during-prepare' }
    )
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'INTELLIGENCE_OPERATION_CANCELLED'
    })
    try {
      controller.abort()
    } finally {
      releaseWriter.resolve()
    }
    await holdingWrite
    await rejection
  })

  it.each([
    {
      name: 'Bearer credential in the latest user message',
      input: 'Authorization: Bearer synthetic_workspace_credential.0123456789',
      forbidden: 'synthetic_workspace_credential.0123456789'
    },
    {
      name: 'credential nested in JSON current input',
      input: JSON.stringify({ settings: { apiKey: 'workspace-private-credential-value' } }),
      forbidden: 'workspace-private-credential-value'
    }
  ])('blocks $name without persisting or returning its contents', async ({ input, forbidden }) => {
    const supplied: IntelligenceChatPayload = {
      messages: [
        { role: 'system', content: 'Main instructions' },
        { role: 'user', content: 'Safe historical input' },
        { role: 'assistant', content: 'Safe historical answer' },
        { role: 'user', content: input, attachments: [{ type: 'image', dataUrl: imageDataUrl }] },
        { role: 'system', content: 'Main trailing policy' }
      ]
    }
    await expect(
      execution.prepareWorkspaceTurn(
        supplied,
        {},
        {
          conversationId: 'conversation-private',
          turnId: 'private-native-turn'
        }
      )
    ).rejects.toThrow('CONTEXT_CURRENT_INPUT_POLICY_BLOCKED')

    const durable = await durableContext()
    expect(durable.turns.map(({ content, privacyLevel }) => ({ content, privacyLevel }))).toEqual([
      { content: '[redacted:private-context-turn]', privacyLevel: 'secret' }
    ])
    expect(durable.packages.map((row) => JSON.parse(row.items))).toEqual([[]])
    expect(durable.packages.map((row) => JSON.parse(row.metadata!).excluded)).toEqual([
      [
        expect.objectContaining({
          sourceType: 'current_input',
          sourceId: durable.turns[0]!.id,
          reason: 'secret-policy-blocked'
        })
      ]
    ])
    expect(JSON.stringify(durable)).not.toContain(forbidden)
  })

  // Workspace preparation has no explicit privacyLevel input. Exercise the actual
  // hygiene/assembler boundary rather than pretending that workspace supports it.
  it.each(['sensitive', 'secret'] as const)(
    'redacts an explicitly %s current turn and refuses provider assembly from its real package',
    async (privacyLevel) => {
      const privateInput = 'This unmarked personal account detail is private'
      const prepared = await hygiene.prepareTurn({
        owner: 'assistant',
        input: privateInput,
        privacyLevel,
        explicitScope: 'light',
        startNewSession: true,
        tokenBudget: 256,
        metadata: {
          contextActorId: 'workspace:conversation-private',
          workspaceConversationId: 'conversation-private',
          noHistory: true
        }
      })
      expect(prepared.package.items).toEqual([])
      expect(JSON.stringify(prepared.package)).not.toContain(privateInput)
      expect(() =>
        new ContextMessageAssembler().assemble(prepared.package, payload(privateInput))
      ).toThrow('CONTEXT_CURRENT_INPUT_POLICY_BLOCKED')
      const durable = await durableContext()
      expect(
        durable.turns.map(({ content, privacyLevel: storedPrivacy }) => ({
          content,
          privacyLevel: storedPrivacy
        }))
      ).toEqual([{ content: '[redacted:private-context-turn]', privacyLevel }])
      expect(durable.packages.map((row) => JSON.parse(row.items))).toEqual([[]])
      expect(JSON.stringify(durable)).not.toContain(privateInput)
    }
  )
})
