import type { Client } from '@libsql/client'
import type {
  ConversationWorkspaceSettings,
  WorkspaceSubmitRequest
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { MainDatabase } from '../../db/db-write'
import type { StoredWorkspaceAttachment } from './workspace-attachments'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'

let db: MainDatabase
let client: Client
let root: string
let scheduledWrites: Promise<void> = Promise.resolve()

// Same isolated database/scheduler seams as conversation-store.transaction.test.ts.
// The stores, queue, attachment store, and every SQLite transaction remain real.
vi.mock('../database', () => ({ databaseModule: { getDb: () => db } }))
vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: (_name: string, task: () => Promise<unknown>) => {
    const result = scheduledWrites.then(task)
    scheduledWrites = result.then(
      () => {},
      () => {}
    )
    return result
  }
}))
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => root, getAppPath: () => process.cwd() },
  safeStorage: { isEncryptionAvailable: () => false }
}))

import { deleteConversation, getConversation } from './conversation-store'
import { WorkspaceAttachmentStore } from './workspace-attachments'
import { ConversationWorkspaceService } from './workspace-service'

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)
const settings: ConversationWorkspaceSettings = {
  mode: 'chat',
  providerId: 'pi-cli',
  model: 'model-a',
  reasoningEffort: 'high',
  autoContext: false
}
const image = {
  type: 'image' as const,
  name: 'original.png',
  dataUrl: 'data:image/png;base64,aGVsbG8='
}
let attachments: WorkspaceAttachmentStore
let service: ConversationWorkspaceService

function request(id: string, conversationId = 'parent'): WorkspaceSubmitRequest {
  return {
    conversationId,
    id,
    text: `input ${id}`,
    settings: { ...settings },
    create: { projectId: null, title: conversationId }
  }
}

async function rows(table: string, order: string): Promise<Record<string, unknown>[]> {
  const result = await client.execute(`SELECT * FROM ${table} ORDER BY ${order}`)
  return result.rows.map((row) => ({ ...row }))
}

async function snapshot() {
  return {
    conversations: await rows('conversations', 'id'),
    messages: await rows('conversation_messages', 'conversation_id, seq'),
    workspaces: await rows('conversation_workspaces', 'conversation_id'),
    queue: await rows('conversation_queued_inputs', 'conversation_id, position'),
    receipts: await rows('conversation_workspace_receipts', 'conversation_id, id'),
    attachments: await rows('conversation_attachments', 'id'),
    links: await rows(
      'conversation_message_attachments',
      'conversation_id, message_id, attachment_id'
    ),
    sync: await rows('conversation_sync_state', 'conversation_id')
  }
}

async function complete(conversationId: string, turnId: string): Promise<void> {
  await service.mutateMessages(conversationId, turnId, (messages) => {
    const assistant = messages.find((message) => message.meta?.turnId === turnId)!
    assistant.content = `answer ${turnId}`
    assistant.status = 'complete'
  })
  await service.finishTurn(conversationId, turnId, 'idle')
}

async function completedParent(): Promise<void> {
  await service.enqueue({ ...request('first'), attachments: [image] })
  await service.takeNext('parent')
  await service.mutateMessages('parent', 'first', (messages) => {
    const assistant = messages.at(-1)!
    assistant.content = 'literal first/tool-1/user-first must not be rewritten'
    assistant.status = 'complete'
    assistant.meta = {
      ...assistant.meta,
      compactionId: 'compact-1',
      parts: [
        {
          type: 'tool-call',
          id: 'tool-1',
          name: 'read',
          arguments: { text: 'tool-1' },
          runId: 'parent-run',
          requestId: 'approval',
          rollbackToken: 'secret'
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-1',
          turnId: 'first',
          messageId: 'user-first',
          content: 'original result',
          reversible: true,
          rollbackAllowed: true
        }
      ],
      compactions: [
        {
          compactionId: 'compact-1',
          firstKeptMessageId: 'user-first',
          throughMessageId: 'assistant-first'
        }
      ]
    }
  })
  await service.finishTurn('parent', 'first', 'idle')
}

beforeEach(async () => {
  scheduledWrites = Promise.resolve()
  root = await realpath(await mkdtemp(join(tmpdir(), 'workspace-service-stateful-')))
  client = createClient({ url: `file:${join(root, 'test.db')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  await client.execute('PRAGMA foreign_keys = ON')
  attachments = new WorkspaceAttachmentStore(join(root, 'attachments'))
  service = new ConversationWorkspaceService({
    getDb: () => db,
    attachments,
    validateSettings: async () => {}
  })
})

afterEach(async () => {
  await scheduledWrites
  vi.restoreAllMocks()
  client.close()
  await rm(root, { recursive: true, force: true })
})

describe('ConversationWorkspaceService persisted queue authority', () => {
  it('serial concurrent admissions cap pending inputs at eight and rejection leaves no receipt', async () => {
    await service.initialize()
    const results = await Promise.allSettled(
      Array.from({ length: 9 }, (_, index) => service.enqueue(request(`q${index}`)))
    )
    expect(results.map((result) => result.status)).toEqual([
      ...Array(8).fill('fulfilled'),
      'rejected'
    ])
    const rejected = results[8]
    if (rejected.status !== 'rejected') throw new Error('ninth admission unexpectedly succeeded')
    expect(rejected.reason.message).toBe('WORKSPACE_QUEUE_FULL')
    expect((await rows('conversation_queued_inputs', 'position')).map((row) => row.id)).toEqual([
      'q0',
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
      'q6',
      'q7'
    ])
    expect(
      (await rows('conversation_workspace_receipts', 'id')).map((row) => [row.id, row.status])
    ).toEqual(Array.from({ length: 8 }, (_, index) => [`q${index}`, 'queued']))
    expect(await rows('conversation_messages', 'seq')).toEqual([])
    expect((await service.takeNext('parent'))?.input.id).toBe('q0')
    await service.enqueue(request('q8'))
    await expect(service.enqueue(request('q9'))).rejects.toThrow('WORKSPACE_QUEUE_FULL')
    expect((await rows('conversation_queued_inputs', 'position')).map((row) => row.id)).toEqual([
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
      'q6',
      'q7',
      'q8'
    ])
    expect(
      (await rows('conversation_workspace_receipts', 'id')).map((row) => [row.id, row.status])
    ).toEqual([
      ['q0', 'running'],
      ...Array.from({ length: 8 }, (_, index) => [`q${index + 1}`, 'queued'])
    ])
  })

  it('promotion preserves click order, ordinary reorder does not displace promotions, and claims use immutable enqueue settings', async () => {
    const submissions = ['one', 'two', 'three', 'four', 'five'].map((id) => request(id))
    for (const input of submissions) {
      await service.enqueue(input)
      input.settings!.model = 'caller-mutated-after-enqueue'
      input.settings!.reasoningEffort = 'max'
    }
    await service.promoteQueued('parent', 'four')
    await service.promoteQueued('parent', 'two')
    await service.promoteQueued('parent', 'four')
    await service.reorderQueued('parent', 'five', 'up')
    await service.configure('parent', {
      ...settings,
      model: 'model-b',
      reasoningEffort: 'low',
      autoContext: true
    })
    const order = ['four', 'two', 'one', 'five', 'three']
    expect((await service.get('parent'))?.queue.map((input) => input.id)).toEqual(order)

    for (const id of order) {
      const claimed = await service.takeNext('parent')
      expect(claimed?.input.id).toBe(id)
      expect(claimed?.input.settings).toEqual(settings)
      const [workspace] = await rows('conversation_workspaces', 'conversation_id')
      expect(JSON.parse(String(workspace.settings_json))).toEqual(settings)
      await complete('parent', id)
    }
    expect(await service.takeNext('parent')).toBeUndefined()
    expect(
      (await rows('conversation_messages', 'seq'))
        .filter((row) => row.role === 'user')
        .map((row) => row.content)
    ).toEqual(order.map((id) => `input ${id}`))
  })

  it('the same client id executes independently across conversations but retransmission never executes twice', async () => {
    const left = request('shared', 'left')
    const right = request('shared', 'right')
    const submissions = await Promise.all([
      service.enqueue(left),
      service.enqueue(left),
      service.enqueue(right)
    ])
    expect(submissions.map((result) => result.disposition)).toEqual([
      'queued',
      'duplicate',
      'queued'
    ])
    const [leftTurn, rightTurn] = await Promise.all([
      service.takeNext('left'),
      service.takeNext('right')
    ])
    expect([leftTurn?.input.conversationId, rightTurn?.input.conversationId]).toEqual([
      'left',
      'right'
    ])
    expect((await service.enqueue(left)).disposition).toBe('duplicate')
    await complete('left', 'shared')
    await complete('right', 'shared')
    expect((await service.enqueue(left)).disposition).toBe('duplicate')
    await expect(service.enqueue({ ...left, text: 'changed payload' })).rejects.toThrow(
      'WORKSPACE_STALE_TURN'
    )
    expect(await service.takeNext('left')).toBeUndefined()
    expect(await service.takeNext('right')).toBeUndefined()
    expect(
      (await rows('conversation_messages', 'conversation_id, seq')).map((row) => [
        row.conversation_id,
        row.role,
        row.content
      ])
    ).toEqual([
      ['left', 'user', 'input shared'],
      ['left', 'assistant', 'answer shared'],
      ['right', 'user', 'input shared'],
      ['right', 'assistant', 'answer shared']
    ])
    expect(
      (await rows('conversation_workspace_receipts', 'conversation_id')).map((row) => [
        row.conversation_id,
        row.id,
        row.status
      ])
    ).toEqual([
      ['left', 'shared', 'completed'],
      ['right', 'shared', 'completed']
    ])
  })

  it('claim atomically dequeues, inserts both messages and attachment link, sets active authority and advances its receipt', async () => {
    await service.enqueue({ ...request('atomic'), attachments: [image] })
    const before = await snapshot()
    // Fail after messages and workspace authority have been written, at the actual dequeue.
    await client.execute(
      `CREATE TRIGGER reject_claim BEFORE DELETE ON conversation_queued_inputs BEGIN SELECT RAISE(ABORT, 'claim fault'); END`
    )
    await expect(service.takeNext('parent')).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
    expect((await service.get('parent'))?.queue.map((input) => input.id)).toEqual(['atomic'])
    await client.execute('DROP TRIGGER reject_claim')

    const admitted = await service.takeNext('parent')
    expect(admitted?.input.id).toBe('atomic')
    const after = await snapshot()
    expect(after.queue).toEqual([])
    expect(
      after.messages.map((row) => [row.id, row.role, row.status, row.seq, row.content])
    ).toEqual([
      ['user-atomic', 'user', 'complete', 0, 'input atomic'],
      ['assistant-atomic', 'assistant', 'streaming', 1, '']
    ])
    expect(after.workspaces[0]).toMatchObject({ status: 'running', active_turn_id: 'atomic' })
    expect(after.receipts[0]).toMatchObject({ id: 'atomic', status: 'running' })
    expect(after.links).toEqual([
      {
        conversation_id: 'parent',
        message_id: 'user-atomic',
        attachment_id: after.attachments[0].id
      }
    ])
    expect(await service.getModelAttachments(admitted!.input)).toEqual([image])
  })

  it('cold initialization interrupts unfinished authority and holds every restored input until an explicit resume', async () => {
    await service.enqueue(request('unfinished'))
    await service.takeNext('parent')
    await service.patchExecution('parent', 'unfinished', {
      status: 'running',
      runId: 'run-before-crash'
    })
    await service.enqueue(request('pending'))
    await service.enqueue(request('other-pending', 'other'))
    const cold = new ConversationWorkspaceService({
      getDb: () => db,
      attachments,
      validateSettings: async () => {
        throw new Error('cold restore must not admit model work')
      }
    })
    await Promise.all([cold.initialize(), cold.initialize()])
    await cold.initialize()
    const restored = await cold.get('parent')
    expect(restored).toMatchObject({ status: 'interrupted', queueHeld: true })
    expect(restored?.activeTurnId).toBeUndefined()
    expect(restored?.runId).toBeUndefined()
    expect(restored?.queue.map((input) => [input.id, input.text, input.settings])).toEqual([
      ['pending', 'input pending', settings]
    ])
    expect(restored?.messages.map((message) => [message.id, message.status])).toEqual([
      ['user-unfinished', 'complete'],
      ['assistant-unfinished', 'failed']
    ])
    expect(restored?.messages[1].meta).toMatchObject({
      turnId: 'unfinished',
      outcome: 'interrupted',
      errorCode: 'WORKSPACE_TURN_INTERRUPTED'
    })
    expect(await cold.takeNext('parent')).toBeUndefined()
    expect(await cold.takeNext('other')).toBeUndefined()
    expect((await cold.get('other'))?.queueHeld).toBe(true)
    expect(
      (await rows('conversation_workspace_receipts', 'conversation_id, id')).map((row) => [
        row.conversation_id,
        row.id,
        row.status
      ])
    ).toEqual([
      ['other', 'other-pending', 'queued'],
      ['parent', 'pending', 'queued'],
      ['parent', 'unfinished', 'interrupted']
    ])
    expect(
      (await rows('conversation_messages', 'conversation_id, seq')).map((row) => row.id)
    ).toEqual(['user-unfinished', 'assistant-unfinished'])
    const resumed = new ConversationWorkspaceService({ getDb: () => db, attachments })
    await resumed.resume('parent')
    expect((await resumed.takeNext('parent'))?.input.id).toBe('pending')
  })

  it('pause preserves pending bytes while an active turn finishes and resume is the only admission release', async () => {
    await service.enqueue(request('active'))
    await service.takeNext('parent')
    await service.enqueue(request('waiting'))
    const pendingBefore = await rows('conversation_queued_inputs', 'position')
    await service.pause('parent')
    await expect(service.resume('parent')).rejects.toThrow('WORKSPACE_BUSY')
    await complete('parent', 'active')
    expect(await service.takeNext('parent')).toBeUndefined()
    expect(await rows('conversation_queued_inputs', 'position')).toEqual(pendingBefore)
    expect((await service.get('parent'))?.messages.map((message) => message.id)).toEqual([
      'user-active',
      'assistant-active'
    ])
    await service.resume('parent')
    expect((await service.takeNext('parent'))?.input.id).toBe('waiting')
    expect(
      (await rows('conversation_workspace_receipts', 'id')).map((row) => [row.id, row.status])
    ).toEqual([
      ['active', 'completed'],
      ['waiting', 'running']
    ])
  })

  it('a completed turn cannot mutate a newer active turn or create a busy fork child', async () => {
    await service.enqueue(request('old'))
    await service.takeNext('parent')
    await complete('parent', 'old')
    await service.enqueue(request('new'))
    await service.takeNext('parent')
    const before = await snapshot()
    await expect(
      service.mutateMessages('parent', 'old', (messages) => {
        messages.at(-1)!.content = 'stale overwrite'
      })
    ).rejects.toThrow('WORKSPACE_STALE_TURN')
    await expect(service.fork({ conversationId: 'parent' })).rejects.toThrow('WORKSPACE_FORK_BUSY')
    expect(await snapshot()).toEqual(before)
  })
})

describe('ConversationWorkspaceService fork ownership', () => {
  it('remaps messages, tools, turns and attachments coherently; child mutation/deletion never changes its parent or original file', async () => {
    const original = join(root, 'original.png')
    await writeFile(original, 'hello')
    await completedParent()
    await service.enqueue(request('parent-pending'))
    const parentBefore = await getConversation('parent')
    const parentAssets = await rows('conversation_attachments', 'id')
    const child = await service.fork({ conversationId: 'parent', messageId: 'assistant-first' })
    const childUser = child.messages[0]
    const childAssistant = child.messages[1]
    const parts = childAssistant.parts as Array<Record<string, unknown>>
    const childTurn = childAssistant.meta!.turnId as string
    const childCompactions = childAssistant.meta!.compactions as Array<Record<string, unknown>>

    expect(child.conversationId).not.toBe('parent')
    expect(
      child.messages
        .map((message) => message.id)
        .some((id) => parentBefore!.messages.some((message) => message.id === id))
    ).toBe(false)
    expect(childAssistant.content).toBe(parentBefore!.messages[1].content)
    expect(childTurn).not.toBe('first')
    expect(parts[0].id).not.toBe('tool-1')
    expect(parts[0].arguments).toEqual({ text: 'tool-1' })
    expect(parts[1]).toMatchObject({
      toolCallId: parts[0].id,
      turnId: childTurn,
      messageId: childUser.id,
      reversible: false,
      rollbackAllowed: false
    })
    expect(parts[0]).not.toHaveProperty('runId')
    expect(parts[0]).not.toHaveProperty('requestId')
    expect(parts[0]).not.toHaveProperty('rollbackToken')
    expect(childAssistant.meta!.compactionId).not.toBe('compact-1')
    expect(childCompactions).toEqual([
      {
        compactionId: childAssistant.meta!.compactionId,
        firstKeptMessageId: childUser.id,
        throughMessageId: childAssistant.id
      }
    ])
    expect(child.queue).toEqual([])
    expect(childUser.attachments![0].id).not.toBe(parentAssets[0].id)
    const childAsset = (await db.select().from(schema.conversationAttachments)).find(
      (asset) => asset.conversationId === child.conversationId
    )!
    expect(await attachments.toModel(childAsset)).toEqual(image)
    const childFile = join(
      root,
      'attachments',
      createHash('sha256').update(child.conversationId).digest('hex'),
      childAsset.relativePath
    )
    await writeFile(childFile, 'world')
    expect(await attachments.toModel(childAsset)).toEqual({
      ...image,
      dataUrl: 'data:image/png;base64,d29ybGQ='
    })
    const parentAsset = (await db.select().from(schema.conversationAttachments)).find(
      (asset) => asset.conversationId === 'parent'
    )!
    expect(await attachments.toModel(parentAsset)).toEqual(image)

    await service.enqueue(request('child-turn', child.conversationId))
    await service.takeNext(child.conversationId)
    await service.mutateMessages(child.conversationId, 'child-turn', (messages) => {
      messages[1].content = 'child-only edited history'
    })
    expect((await getConversation(child.conversationId))?.messages[1].content).toBe(
      'child-only edited history'
    )
    expect(await getConversation('parent')).toEqual(parentBefore)
    expect((await service.get('parent'))?.queue.map((input) => input.id)).toEqual([
      'parent-pending'
    ])
    await deleteConversation(child.conversationId)
    await service.cleanup(child.conversationId)
    expect(await getConversation(child.conversationId)).toBeNull()
    await expect(readFile(childFile)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await attachments.toModel(parentAsset)).toEqual(image)
    expect(await readFile(original, 'utf8')).toBe('hello')
    expect(await getConversation('parent')).toEqual(parentBefore)
  })

  it('a source revision change during real attachment cloning rolls back all child rows and removes its copied file', async () => {
    await completedParent()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let copy: StoredWorkspaceAttachment | undefined
    class GatedAttachmentStore extends WorkspaceAttachmentStore {
      override async clone(
        record: StoredWorkspaceAttachment,
        childId: string
      ): Promise<StoredWorkspaceAttachment> {
        copy = await super.clone(record, childId)
        entered.resolve()
        await release.promise
        return copy
      }
    }
    const gated = new ConversationWorkspaceService({
      getDb: () => db,
      attachments: new GatedAttachmentStore(join(root, 'attachments'))
    })
    await gated.initialize()
    const before = await snapshot()
    const forking = gated.fork({ conversationId: 'parent' })
    const outcome = forking.then(
      (value) => ({ value, error: undefined }),
      (error) => ({ value: undefined, error })
    )
    await entered.promise
    try {
      await client.execute(
        "UPDATE conversation_workspaces SET revision = revision + 1 WHERE conversation_id = 'parent'"
      )
    } finally {
      release.resolve()
    }
    const result = await outcome
    expect(result.error?.message).toBe('WORKSPACE_FORK_BUSY')
    const after = await snapshot()
    expect(after.conversations).toEqual(before.conversations)
    expect(after.messages).toEqual(before.messages)
    expect(after.attachments).toEqual(before.attachments)
    expect(after.links).toEqual(before.links)
    expect(after.receipts).toEqual(before.receipts)
    expect(after.sync).toEqual(before.sync)
    expect(after.workspaces).toEqual(
      before.workspaces.map((row) => ({ ...row, revision: Number(row.revision) + 1 }))
    )
    const childOwner = join(
      root,
      'attachments',
      createHash('sha256').update(copy!.conversationId).digest('hex')
    )
    expect(await readdir(childOwner)).toEqual([])
    const parentAsset = (await db.select().from(schema.conversationAttachments))[0]
    expect(await attachments.toModel(parentAsset)).toEqual(image)
  })

  it('a Tuff assistant id is not a native anchor: rejects an unmapped pointer fork before any child is created', async () => {
    await completedParent()
    await db.insert(schema.localAiCliSessions).values({
      id: 'native-pointer',
      conversationId: 'parent',
      projectId: null,
      provider: 'pi',
      projectRoot: root,
      nativeSessionId: 'native-parent',
      title: 'native',
      state: 'available',
      origin: 'tuff',
      expectedHeadId: 'native-head',
      createdAt: 1,
      updatedAt: 1,
      lastSeenAt: 1
    })
    const before = await snapshot()
    const pointersBefore = await rows('local_ai_cli_sessions', 'id')
    await expect(
      service.fork({ conversationId: 'parent', messageId: 'assistant-first' })
    ).rejects.toThrow('WORKSPACE_FORK_NATIVE_UNSAFE')
    expect(await snapshot()).toEqual(before)
    expect(await rows('local_ai_cli_sessions', 'id')).toEqual(pointersBefore)
    const parentAsset = (await db.select().from(schema.conversationAttachments))[0]
    expect(await attachments.toModel(parentAsset)).toEqual(image)
  })
})
