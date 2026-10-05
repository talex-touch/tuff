import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { TouchChannel } from '@talex-touch/utils/renderer/hooks/use-channel'
import type { AgentToolConfirmRequest } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type {
  FileReviewChangeNotification,
  FileReviewRollbackResult
} from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_TOOL_CONFIRMATION_TIMEOUT_MS,
  AgentToolEvents,
  createAgentToolsSdk
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import {
  ConversationReviewEvents,
  createConversationReviewSdk
} from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import { TuffMainTransport } from '@talex-touch/utils/transport/sdk/main-transport'
import { TuffRendererTransport } from '@talex-touch/utils/transport/sdk/renderer-transport'
import { RAW_MAIN_PROCESS_CHANNEL } from '../../../shared/ipc/raw-channel'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import {
  aiAgentProfiles,
  aiOrchestratorRuns,
  conversationFileReviews,
  conversations,
  projects
} from '../../db/schema'
import { FileReviewService } from './file-review-service'
import { aiOrchestratorStore } from '../ai/ai-orchestrator-store'
import { getProject } from '../project/project-store'
import { getConversation } from './conversation-store'

let db: LibSQLDatabase

// File-local host boundaries, as in the neighboring libsql consumer tests. Neither transport,
// the channel timer/reply correlator, review service, write scheduler nor filesystem is mocked.
vi.mock('../database', () => ({ databaseModule: { getDb: () => db } }))
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/tuff-review-transport-no-profile', isReady: () => true },
  ipcMain: { handle: () => {}, removeHandler: () => {} },
  MessageChannelMain: class MessageChannelMain {}
}))

interface WireEnvelope {
  name: string
  header: { status: 'request' | 'reply'; type: 'main' | 'plugin' }
  sync?: { id: string; timeStamp: number; timeout: number }
  code: number
  data?: unknown
}

type BridgeHandler = (envelope: WireEnvelope) => unknown

/** Electron wire only: request deadlines and reply deduplication belong to the REAL TouchChannel. */
class ReviewIpcWire {
  private readonly listeners = new Set<(event: unknown, envelope: WireEnvelope) => void>()
  private readonly handlers = new Map<string, Set<BridgeHandler>>()
  private readonly tasks = new Set<Promise<void>>()
  holdRollbackReplies = true
  heldReply = Promise.withResolvers<WireEnvelope>()
  private bufferedReply: WireEnvelope | undefined

  readonly ipcRenderer = {
    on: (channel: string, listener: (event: unknown, envelope: WireEnvelope) => void) => {
      if (channel !== RAW_MAIN_PROCESS_CHANNEL)
        throw new Error(`Unexpected IPC channel: ${channel}`)
      this.listeners.add(listener)
    },
    send: (channel: string, envelope: WireEnvelope) => {
      if (channel !== RAW_MAIN_PROCESS_CHANNEL)
        throw new Error(`Unexpected IPC channel: ${channel}`)
      if (envelope.header.status === 'reply') return
      // IPC is asynchronous: the real channel must register its pending reply before delivery.
      const task = Promise.resolve()
        .then(async () => {
          const handlers = this.handlers.get(`${envelope.header.type}:${envelope.name}`)
          if (!handlers?.size) throw new Error(`No Main handler: ${envelope.name}`)
          let result: unknown
          for (const handler of handlers) result = await handler(structuredClone(envelope))
          const reply: WireEnvelope = {
            ...envelope,
            header: { ...envelope.header, status: 'reply' },
            code: 200,
            data: structuredClone(result)
          }
          if (
            this.holdRollbackReplies &&
            envelope.name === ConversationReviewEvents.rollback.toEventName()
          ) {
            this.bufferedReply = reply
            this.heldReply.resolve(reply)
          } else {
            this.deliver(reply)
          }
        })
        .catch((error) => {
          this.deliver({
            ...envelope,
            header: { ...envelope.header, status: 'reply' },
            code: 100,
            data: { message: error instanceof Error ? error.message : String(error) }
          })
        })
      this.tasks.add(task)
      void task.then(() => this.tasks.delete(task))
    }
  }

  readonly bridge = {
    regChannel: (type: 'main' | 'plugin', eventName: string, handler: BridgeHandler) => {
      const key = `${type}:${eventName}`
      const handlers = this.handlers.get(key) ?? new Set<BridgeHandler>()
      handlers.add(handler)
      this.handlers.set(key, handlers)
      return () => {
        handlers.delete(handler)
        if (!handlers.size) this.handlers.delete(key)
      }
    },
    broadcast: (type: 'main' | 'plugin', name: string, data?: unknown) => {
      this.deliver({ name, header: { type, status: 'request' }, code: 200, data })
    },
    sendTo: () => {
      throw new Error('Window requests are outside this fixture')
    },
    sendPlugin: () => {
      throw new Error('Plugin requests are outside this fixture')
    },
    broadcastTo: () => {
      throw new Error('Window broadcasts are outside this fixture')
    },
    broadcastPlugin: () => {
      throw new Error('Plugin broadcasts are outside this fixture')
    }
  }

  deliver(envelope: WireEnvelope): void {
    for (const listener of this.listeners) listener({}, structuredClone(envelope))
  }

  releaseReply(): void {
    if (!this.bufferedReply) return
    const reply = this.bufferedReply
    this.bufferedReply = undefined
    this.deliver(reply)
  }

  async drain(): Promise<void> {
    while (this.tasks.size) await Promise.all([...this.tasks])
  }

  reset(): void {
    this.holdRollbackReplies = true
    this.bufferedReply = undefined
    this.heldReply = Promise.withResolvers<WireEnvelope>()
  }
}

const wire = new ReviewIpcWire()
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)
const beforeBytes = 'original project content\n'
const afterBytes = 'agent edited project content\n'
const identity = { conversationId: 'thread', reviewId: 'review' }
const side = (value: string) => ({
  exists: true,
  hash: createHash('sha256').update(value).digest('hex'),
  size: Buffer.byteLength(value)
})
let mainTransport: TuffMainTransport
let rendererTransport: TuffRendererTransport | undefined
let service: FileReviewService
let client: Client | undefined
let directory: string | undefined
let file: string
let disposeService: (() => void) | undefined
let disposers: Array<() => void>
let answer: PromiseWithResolvers<boolean>
let observedRollback: Promise<void> | undefined

beforeAll(async () => {
  // TouchChannel installs a non-configurable bootstrap getter, so give it an OWNED window rather
  // than altering a real/jsdom window. Restore both globals at suite teardown.
  vi.stubGlobal('window', { electron: { ipcRenderer: wire.ipcRenderer } })
  // Runtime-only loading keeps renderer aliases out of Main's type graph. Module evaluation
  // reads window.electron and installs the bootstrap getter, so the owned window must exist first.
  const { touchChannel } = await vi.importActual<{ touchChannel: TouchChannel }>(
    '../../../renderer/src/modules/channel/channel-core'
  )
  vi.stubGlobal('touchChannel', touchChannel)
  mainTransport = new TuffMainTransport(wire.bridge, {
    requestKey: () => {
      throw new Error('Plugin activation is outside this fixture')
    },
    revokeKey: () => false,
    resolveKey: () => undefined,
    isValidKey: () => false
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
  // Do not leave host module replacements registered when another suite shares the worker.
  vi.doUnmock('../database')
  vi.doUnmock('electron')
})

beforeEach(async () => {
  wire.reset()
  disposers = []
  answer = Promise.withResolvers<boolean>()
  observedRollback = undefined
  directory = await fs.mkdtemp(join(tmpdir(), 'review-delayed-approval-'))
  const root = await fs.realpath(
    await fs.mkdir(join(directory, 'project')).then(() => join(directory!, 'project'))
  )
  file = join(root, 'report.txt')
  client = createClient({ url: `file:${join(directory, 'test.db')}` })
  db = drizzle(client)
  await migrate(db, { migrationsFolder })
  // Build-state fixture DDL only; never creates or changes a migration asset.
  await client.execute(`CREATE TABLE IF NOT EXISTS conversation_file_reviews (
    id TEXT PRIMARY KEY NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL, turn_id TEXT NOT NULL, project_id TEXT NOT NULL,
    public_json TEXT NOT NULL, record_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`)
  await db.insert(projects).values({
    id: 'project',
    rootPath: root,
    name: 'fixture',
    pinned: false,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1
  })
  await db.insert(conversations).values({
    id: 'thread',
    projectId: 'project',
    title: 'fixture',
    createdAt: 1,
    updatedAt: 1
  })
  await db.insert(aiAgentProfiles).values({
    id: 'profile',
    name: 'fixture',
    description: '',
    runtimeProvider: 'pi-core',
    enabled: true,
    modelPreference: '[]',
    allowedToolIds: '["file.write"]',
    enabledSkillIds: '[]',
    permissionPolicy: JSON.stringify({
      mode: 'manual',
      allowedPermissions: ['file:read', 'file:write']
    }),
    timeoutMs: 1000,
    createdAt: 1,
    updatedAt: 17
  })
  await db.insert(aiOrchestratorRuns).values({
    id: 'run',
    sessionId: 'thread',
    objective: 'fixture',
    profileId: 'profile',
    runtimeProvider: 'pi-core',
    cwd: root,
    status: 'completed',
    createdAt: 1,
    updatedAt: 1
  })
  // A persisted completed write, not a canned rollback response. Actual rollback must validate
  // its snapshot/hash, restore the disk file and update this real libsql row.
  await fs.writeFile(file, afterBytes)
  await db.insert(conversationFileReviews).values({
    id: 'review',
    conversationId: 'thread',
    runId: 'run',
    turnId: 'turn',
    projectId: 'project',
    createdAt: 1,
    updatedAt: 1,
    publicJson: JSON.stringify({
      version: 1,
      readonly: false,
      operation: 'write',
      timestamp: 1,
      status: 'recorded',
      supported: true,
      paths: [{ path: 'report.txt', before: side(beforeBytes), after: side(afterBytes) }]
    }),
    recordJson: JSON.stringify({
      version: 1,
      readonly: false,
      profileId: 'profile',
      profileVersion: 17,
      originalPolicy: { mode: 'manual', allowedPermissions: ['file:read', 'file:write'] },
      canonicalRoot: root,
      restoredPaths: [],
      paths: [
        {
          path: 'report.txt',
          before: side(beforeBytes),
          after: side(afterBytes),
          snapshot: Buffer.from(beforeBytes).toString('base64')
        }
      ]
    })
  })
  service = new FileReviewService()
  rendererTransport = new TuffRendererTransport()
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-10-04T00:00:00Z'))
})

afterEach(async () => {
  // Also unwinds a failed pre-approval assertion: deny, drain Main, release any buffered reply,
  // then close the DB/files only after the real operation and its caller have settled.
  answer?.resolve(false)
  wire.holdRollbackReplies = false
  wire.releaseReply()
  await wire.drain()
  wire.releaseReply()
  await observedRollback
  disposeService?.()
  disposeService = undefined
  for (const dispose of disposers) dispose()
  rendererTransport?.destroy()
  rendererTransport = undefined
  await dbWriteScheduler.drain()
  vi.useRealTimers()
  vi.restoreAllMocks()
  client?.close()
  client = undefined
  if (directory) await fs.rm(directory, { recursive: true, force: true })
  directory = undefined
})

describe('file-review rollback over the production typed transport', () => {
  it.each([
    { name: 'approval restores the file and delivers the durable Undone result', approved: true },
    { name: 'denial leaves the file and durable review unchanged', approved: false }
  ])(
    '$name after a delayed confirmation, without an early timeout or duplicate outcome',
    async ({ approved }) => {
      const reviewSdk = createConversationReviewSdk(rendererTransport!)
      const agentSdk = createAgentToolsSdk(rendererTransport!)
      const prompt = Promise.withResolvers<AgentToolConfirmRequest>()
      const changes: FileReviewChangeNotification[] = []
      const fulfilled: FileReviewRollbackResult[] = []
      const rejected: unknown[] = []
      const originalReview = await service.get(identity.conversationId, identity.reviewId)
      let pendingRequestId: string | undefined

      disposers.push(
        rendererTransport!.on(AgentToolEvents.confirmRequest, (request) => {
          prompt.resolve(request)
        }),
        reviewSdk.onChanged((change) => {
          changes.push(change)
        }),
        mainTransport.on(ConversationReviewEvents.get, (request) =>
          service.get(request.conversationId, request.reviewId)
        ),
        mainTransport.on(ConversationReviewEvents.rollback, (request) =>
          service.rollback(request.conversationId, request.reviewId)
        ),
        mainTransport.on(AgentToolEvents.confirmDecision, (decision) => {
          if (decision.requestId !== pendingRequestId) return { accepted: false }
          pendingRequestId = undefined
          answer.resolve(decision.approved)
          return { accepted: true }
        })
      )
      // Only the human decision is fake. The service's PUBLIC authorization boundary waits for it;
      // every response asserted below is produced by the real service, not by the bridge or SDK fake.
      disposeService = service.initialize({
        authorizeRollback: async (authority) => {
          pendingRequestId = 'confirmation-for-review'
          mainTransport.broadcast(AgentToolEvents.confirmRequest, {
            requestId: pendingRequestId,
            tool: 'file.review.rollback',
            risk: 'write',
            summary: 'Restore report.txt',
            input: JSON.stringify(identity),
            origin: { conversationId: authority.conversationId, turnId: authority.turnId }
          })
          if (!(await answer.promise)) throw new Error('REVIEW_PERMISSION_DENIED')
          const revalidate = async () => {
            const [conversation, profile, run, project] = await Promise.all([
              getConversation(authority.conversationId),
              aiOrchestratorStore.getProfile(authority.profileId),
              aiOrchestratorStore.getOrchestratorRun(authority.runId),
              getProject(authority.projectId)
            ])
            if (
              !conversation ||
              conversation.projectId !== authority.projectId ||
              !profile?.enabled ||
              profile.updatedAt !== authority.profileVersion ||
              !run ||
              run.sessionId !== conversation.id ||
              run.profileId !== profile.id ||
              !project ||
              project.archived ||
              (await fs.realpath(project.rootPath)) !== authority.canonicalRoot ||
              (await fs.realpath(run.cwd)) !== authority.canonicalRoot ||
              !profile.allowedToolIds.includes(`file.${authority.operation}`)
            )
              throw new Error('REVIEW_AUTHORITY_CHANGED')
            if (
              authority.requiredPermissions.some(
                (permission) => !profile.permissionPolicy.allowedPermissions.includes(permission)
              )
            )
              throw new Error('REVIEW_PERMISSION_DENIED')
          }
          await revalidate()
          return revalidate
        },
        onChanged: (change) => mainTransport.broadcast(ConversationReviewEvents.changed, change)
      })
      observedRollback = reviewSdk.rollback(identity.conversationId, identity.reviewId).then(
        (result) => {
          fulfilled.push(result)
        },
        (error) => {
          rejected.push(error)
        }
      )
      const request = await prompt.promise

      // Historical regression: the UI reported failure after ten seconds while Main still waited.
      await vi.advanceTimersByTimeAsync(11_000)
      expect({ fulfilled, rejected, changes }).toEqual({ fulfilled: [], rejected: [], changes: [] })
      expect(await fs.readFile(file, 'utf8')).toBe(afterBytes)
      expect(await reviewSdk.get(identity.conversationId, identity.reviewId)).toEqual(
        originalReview
      )

      // Near the end of the actual confirmation window, still no execution or caller settlement.
      await vi.advanceTimersByTimeAsync(AGENT_TOOL_CONFIRMATION_TIMEOUT_MS - 1_000 - 11_000)
      expect({ fulfilled, rejected, changes }).toEqual({ fulfilled: [], rejected: [], changes: [] })
      expect(await fs.readFile(file, 'utf8')).toBe(afterBytes)
      expect(await reviewSdk.get(identity.conversationId, identity.reviewId)).toEqual(
        originalReview
      )

      await agentSdk.decide({ requestId: request.requestId, approved, remember: false })
      const reply = await wire.heldReply.promise
      const durableReview = await new FileReviewService().get(
        identity.conversationId,
        identity.reviewId
      )
      expect(await fs.readFile(file, 'utf8')).toBe(approved ? beforeBytes : afterBytes)
      if (approved) {
        expect(durableReview).toMatchObject({
          id: 'review',
          status: 'rolled_back',
          supported: false
        })
        expect(changes).toEqual([
          {
            conversationId: 'thread',
            reviewId: 'review',
            updatedAt: Date.now()
          }
        ])
      } else {
        expect(durableReview).toEqual(originalReview)
        expect(changes).toEqual([])
      }

      // Deliver the real result during the response grace period, not just the confirmation budget.
      // Removing the SDK timeout override loses this reply; allowing only the gate budget does too.
      await vi.advanceTimersByTimeAsync(15_000)
      expect({ fulfilled, rejected }).toEqual({ fulfilled: [], rejected: [] })
      wire.releaseReply()
      await observedRollback
      const expectedResult: FileReviewRollbackResult = approved
        ? { ok: true, restoredPaths: ['report.txt'], review: durableReview }
        : { ok: false, code: 'REVIEW_PERMISSION_DENIED', restoredPaths: [], review: durableReview }
      expect({ fulfilled, rejected }).toEqual({ fulfilled: [expectedResult], rejected: [] })

      // Replayed IPC replies cannot publish a second consumer outcome or a second durable change.
      wire.deliver(reply)
      await vi.advanceTimersByTimeAsync(AGENT_TOOL_CONFIRMATION_TIMEOUT_MS + 15_000)
      expect({ fulfilled, rejected }).toEqual({ fulfilled: [expectedResult], rejected: [] })
      expect(changes).toHaveLength(approved ? 1 : 0)
      expect(await fs.readFile(file, 'utf8')).toBe(approved ? beforeBytes : afterBytes)
      expect(await reviewSdk.get(identity.conversationId, identity.reviewId)).toEqual(durableReview)
    }
  )
})
