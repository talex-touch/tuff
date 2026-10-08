import type { Client } from '@libsql/client'
import type { MainDatabase } from '../../db/db-write'
import type { ToolExecutionContext } from '../ai/agents/tool-registry'
import type { FileReviewOperation } from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import type { FileReviewRollbackAuthority } from './file-review-service'
import type { ConfirmationDecision } from '../tool-gateway/gateway-server'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions
} from '@talex-touch/utils/types/intelligence'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { AgentPermission } from '@talex-touch/utils'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiAgentProfiles, aiOrchestratorRuns, conversations, projects } from '../../db/schema'
import * as schema from '../../db/schema'
import { aiOrchestratorStore } from '../ai/ai-orchestrator-store'
import { deleteConversation, getConversation } from './conversation-store'
import { fileReviewService } from './file-review-service'
import { ConversationWorkspaceRunner } from './workspace-runner'

let db: MainDatabase
let client: Client
let directory: string
let root: string
let runner: ConversationWorkspaceRunner
let disposeReview: (() => void) | undefined
let confirmation: PromiseWithResolvers<ConfirmationDecision>
let confirmationEntered: PromiseWithResolvers<void>
let streamEntered: PromiseWithResolvers<void>
let approvalRequests: number
const releases: Array<() => void> = []
const operations: Promise<unknown>[] = []

// Same isolated libsql/filesystem seams as file-review-service.consumer.test.ts. The production
// runner, workspace service, review service and profile/run/project/conversation repositories stay
// real. Only Electron, human confirmation and model/subprocess execution are outside this fixture.
vi.mock('../database', () => ({ databaseModule: { getDb: () => db, getClient: () => client } }))
vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: (_name: string, task: () => Promise<unknown>) => task()
}))
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    isReady: () => true,
    getPath: () => directory,
    getAppPath: () => process.cwd()
  },
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('../../utils/secure-store', () => ({
  getSecureStoreValue: () => {
    throw new Error('Secrets are outside rollback authority')
  },
  setSecureStoreValue: () => {
    throw new Error('Secrets are outside rollback authority')
  }
}))
vi.mock('../tool-gateway', () => ({
  toolGatewayModule: {
    requestConfirmation: async () => {
      approvalRequests += 1
      confirmationEntered.resolve()
      // A second prompt is a consumer-visible defect, not another decision this test supplies.
      if (approvalRequests > 1) return { approved: false, remember: false }
      return confirmation.promise
    }
  }
}))
vi.mock('../ai/ai-cli-orchestrator', () => {
  return {
    aiCliOrchestrator: {
      // The subprocess facade is not started; its authoritative run lookup is the REAL repository.
      getRun: (id: string) => aiOrchestratorStore.getOrchestratorRun(id),
      executeWorkspace: async () => {
        throw new Error('Subprocess execution is outside rollback authority')
      },
      cancelPersistedRun: async () => {
        throw new Error('No subprocess run was started')
      }
    }
  }
})
vi.mock('../ai/intelligence-config', () => ({ ensureIntelligenceConfigLoaded: () => {} }))
vi.mock('../ai/intelligence-provider-model-options', () => ({
  getProviderModelOptions: () => [
    { providerId: 'provider-chat', available: true, models: ['chat-model'] }
  ]
}))
vi.mock('../ai/home-conversation-injection', () => ({
  applyHomeConversationInjection: async (payload: IntelligenceChatPayload) => payload
}))
vi.mock('../ai/agents', () => ({
  toolRegistry: {
    getTool: () => {
      throw new Error('Agent execution is outside this fixture')
    }
  }
}))
vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    stream: async function* (
      _capability: string,
      _payload: IntelligenceChatPayload,
      options: IntelligenceInvokeOptions & { signal: AbortSignal }
    ) {
      streamEntered.resolve()
      // No sleeps or provider traffic: a real runner slot lives until its public pause aborts it.
      if (!options.signal.aborted)
        await new Promise<void>((resolve) => {
          options.signal.addEventListener('abort', () => resolve(), { once: true })
        })
      yield { type: 'end', capabilityId: 'text.chat' }
    }
  }
}))

afterAll(() => {
  for (const module of [
    '../database',
    '../../db/db-write',
    'electron',
    '../../utils/secure-store',
    '../tool-gateway',
    '../ai/ai-cli-orchestrator',
    '../ai/intelligence-config',
    '../ai/intelligence-provider-model-options',
    '../ai/home-conversation-injection',
    '../ai/agents',
    '../ai/intelligence-sdk'
  ])
    vi.doUnmock(module)
})

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)
beforeEach(async () => {
  operations.length = 0
  releases.length = 0
  approvalRequests = 0
  confirmation = Promise.withResolvers<ConfirmationDecision>()
  confirmationEntered = Promise.withResolvers<void>()
  streamEntered = Promise.withResolvers<void>()
  directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'rollback-authority-')))
  root = join(directory, 'project')
  await fs.mkdir(root)
  client = createClient({ url: `file:${join(directory, 'test.db')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  // Feature-local fixture DDL, identical to the neighboring review consumers; no migration writes.
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
  await db
    .insert(conversations)
    .values({ id: 'thread', projectId: 'project', title: 'fixture', createdAt: 1, updatedAt: 1 })
  await db.insert(aiAgentProfiles).values({
    id: 'profile',
    name: 'fixture',
    description: '',
    runtimeProvider: 'pi-core',
    enabled: true,
    modelPreference: '[]',
    allowedToolIds: '["file.write","file.delete","file.copy","file.move"]',
    enabledSkillIds: '[]',
    permissionPolicy: JSON.stringify({
      mode: 'manual',
      allowedPermissions: ['file:read', 'file:write', 'file:delete']
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
    status: 'running',
    metadata: JSON.stringify({ workspaceExecution: true }),
    createdAt: 1,
    updatedAt: 1
  })
  runner = new ConversationWorkspaceRunner({ onChanged: () => {}, onMessageUpdate: () => {} })
  disposeReview = fileReviewService.initialize({
    authorizeRollback: (authority) => runner.authorizeRollback(authority)
  })
})
afterEach(async () => {
  confirmation.resolve({ approved: false, remember: false })
  for (const release of releases.splice(0)) release()
  await runner.close()
  await Promise.allSettled(operations)
  disposeReview?.()
  disposeReview = undefined
  vi.restoreAllMocks()
  client.close()
  await fs.rm(directory, { recursive: true, force: true })
})

async function recorded(operation: FileReviewOperation = 'write') {
  await fs.writeFile(join(root, 'source.txt'), 'source before\n')
  await fs.writeFile(join(root, 'destination.txt'), 'destination before\n')
  const context: ToolExecutionContext = {
    taskId: 'run',
    agentId: 'agent',
    workingDirectory: root,
    workspace: {
      conversationId: 'thread',
      turnId: 'turn',
      projectId: 'project',
      history: [],
      assertAuthority: async () => {
        const profile = await aiOrchestratorStore.getProfile('profile')
        const conversation = await getConversation('thread')
        if (!profile?.enabled || profile.updatedAt !== 17 || conversation?.projectId !== 'project')
          throw new Error('WORKSPACE_PROFILE_UNAVAILABLE')
      }
    }
  }
  await fileReviewService.executeFileOperation(
    context,
    operation,
    operation === 'move' ? ['source.txt', 'destination.txt'] : ['source.txt'],
    async ([source, destination]) => {
      if (operation === 'move') await fs.rename(source!, destination!)
      else await fs.writeFile(source!, 'agent after\n')
      return { success: true }
    }
  )
  const reviews = await fileReviewService.list('thread')
  expect(reviews).toHaveLength(1)
  const review = (await fileReviewService.get('thread', reviews[0].id))!
  expect(review).toMatchObject({ status: 'recorded', supported: true })
  await db
    .update(aiOrchestratorRuns)
    .set({ status: 'completed' })
    .where(eq(aiOrchestratorRuns.id, 'run'))
  return review
}
function trackOperation<T>(pending: Promise<T>): Promise<T> {
  operations.push(pending)
  // Observe immediately; consumers still await the original promise and assert its outcome.
  void pending.catch(() => {})
  return pending
}
function rollback(reviewId: string) {
  return trackOperation(runner.rollback('thread', reviewId))
}
async function startNewSlot() {
  await runner.submit({
    conversationId: 'thread',
    id: 'new-active-turn',
    text: 'new turn',
    settings: {
      mode: 'chat',
      providerId: 'provider-chat',
      model: 'chat-model',
      reasoningEffort: 'low',
      autoContext: false
    }
  })
  await streamEntered.promise
}
function startDeletion() {
  return trackOperation(
    runner.deleteFence('thread', () => deleteConversation('thread').then(() => undefined))
  )
}
async function sourceBytes() {
  return fs.readFile(join(root, 'source.txt'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
}

const changes = [
  {
    name: 'disabled profile',
    action: async () => {
      await db
        .update(aiAgentProfiles)
        .set({ enabled: false })
        .where(eq(aiAgentProfiles.id, 'profile'))
    }
  },
  {
    name: 'new profile version',
    action: async () => {
      await db
        .update(aiAgentProfiles)
        .set({ updatedAt: 18 })
        .where(eq(aiAgentProfiles.id, 'profile'))
    }
  },
  {
    name: 'archived project',
    action: async () => {
      await db.update(projects).set({ archived: true }).where(eq(projects.id, 'project'))
    }
  },
  {
    name: 'relocated project root',
    action: async () => {
      const next = join(directory, 'replacement-root')
      await fs.mkdir(next)
      await fs.writeFile(join(next, 'source.txt'), 'replacement project bytes\n')
      await db.update(projects).set({ rootPath: next }).where(eq(projects.id, 'project'))
    }
  },
  { name: 'new active slot', action: startNewSlot },
  {
    name: 'conversation deletion fence',
    action: async () => {
      startDeletion()
    }
  }
]

describe('production workspace rollback authority is not leased by a manual decision', () => {
  it('approval after profile revocation rejects the authorization itself, before handing back a write capability', async () => {
    const review = await recorded()
    const authority: FileReviewRollbackAuthority = {
      conversationId: 'thread',
      reviewId: review.id,
      runId: 'run',
      turnId: 'turn',
      projectId: 'project',
      profileId: 'profile',
      profileVersion: 17,
      canonicalRoot: root,
      operation: 'write',
      relativePaths: ['source.txt'],
      requiredPermissions: [AgentPermission.FILE_READ, AgentPermission.FILE_WRITE],
      originalPolicy: {
        mode: 'manual',
        allowedPermissions: ['file:read', 'file:write', 'file:delete']
      }
    }
    const authorization = trackOperation(runner.authorizeRollback(authority))
    await confirmationEntered.promise
    await db
      .update(aiAgentProfiles)
      .set({ enabled: false })
      .where(eq(aiAgentProfiles.id, 'profile'))
    confirmation.resolve({ approved: true, remember: false })
    await expect(authorization).rejects.toThrow('REVIEW_AUTHORITY_CHANGED')
    expect(await sourceBytes()).toBe('agent after\n')
    expect((await fileReviewService.get('thread', review.id))!.status).toBe('recorded')
    expect(approvalRequests).toBe(1)
  })

  it.each(changes)(
    '$name while approval is pending refuses without touching project bytes',
    async ({ name, action }) => {
      const review = await recorded()
      const pending = rollback(review.id)
      await confirmationEntered.promise
      await action()
      confirmation.resolve({ approved: true, remember: false })
      expect(await pending).toMatchObject({
        ok: false,
        code: 'REVIEW_AUTHORITY_CHANGED',
        restoredPaths: []
      })
      expect(await sourceBytes()).toBe('agent after\n')
      expect(await fs.readFile(join(root, 'destination.txt'), 'utf8')).toBe('destination before\n')
      if (name !== 'conversation deletion fence')
        expect((await fileReviewService.get('thread', review.id))!.status).toBe('recorded')
      if (name === 'relocated project root')
        expect(await fs.readFile(join(directory, 'replacement-root/source.txt'), 'utf8')).toBe(
          'replacement project bytes\n'
        )
      if (name === 'conversation deletion fence') {
        await Promise.all(operations)
        expect(await getConversation('thread')).toBeNull()
      }
      expect(approvalRequests).toBe(1)
    }
  )

  it('unchanged authority restores both endpoints with one approval and durable Undone evidence', async () => {
    const review = await recorded('move')
    const pending = rollback(review.id)
    await confirmationEntered.promise
    expect(await sourceBytes()).toBeNull()
    expect(await fs.readFile(join(root, 'destination.txt'), 'utf8')).toBe('source before\n')
    confirmation.resolve({ approved: true, remember: false })
    expect(await pending).toMatchObject({
      ok: true,
      restoredPaths: ['source.txt', 'destination.txt'],
      review: { status: 'rolled_back', supported: false }
    })
    expect(await sourceBytes()).toBe('source before\n')
    expect(await fs.readFile(join(root, 'destination.txt'), 'utf8')).toBe('destination before\n')
    expect((await fileReviewService.get('thread', review.id))!.status).toBe('rolled_back')
    expect(approvalRequests).toBe(1)
  })

  it.each(['new active slot', 'conversation deletion fence'])(
    '%s during the post-approval repository read cannot reach an inverse write',
    async (change) => {
      const review = await recorded()
      const pending = rollback(review.id)
      await confirmationEntered.promise
      const entered = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      releases.push(() => release.resolve())
      const readProfile = aiOrchestratorStore.getProfile.bind(aiOrchestratorStore)
      vi.spyOn(aiOrchestratorStore, 'getProfile').mockImplementationOnce(async (id) => {
        const profile = await readProfile(id)
        entered.resolve()
        await release.promise
        return profile
      })
      confirmation.resolve({ approved: true, remember: false })
      await entered.promise
      const deletion = change === 'conversation deletion fence' ? startDeletion() : undefined
      if (change === 'new active slot') await startNewSlot()
      release.resolve()
      expect(await pending).toMatchObject({
        ok: false,
        code: 'REVIEW_AUTHORITY_CHANGED',
        restoredPaths: []
      })
      expect(await sourceBytes()).toBe('agent after\n')
      expect(approvalRequests).toBe(1)
      if (deletion) {
        await deletion
        expect(await getConversation('thread')).toBeNull()
      }
    }
  )

  it('profile revocation during second-endpoint preflight prevents every inverse write and a false success', async () => {
    const review = await recorded('move')
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    releases.push(() => release.resolve())
    const open = fs.open.bind(fs)
    let held = false
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args)
      if (!held && args[0] === join(root, 'destination.txt') && args[1] === 'r') {
        held = true
        entered.resolve()
        await release.promise
      }
      return handle
    })
    const pending = rollback(review.id)
    await confirmationEntered.promise
    confirmation.resolve({ approved: true, remember: false })
    await entered.promise
    await db
      .update(aiAgentProfiles)
      .set({ enabled: false })
      .where(eq(aiAgentProfiles.id, 'profile'))
    release.resolve()
    expect(await pending).toMatchObject({
      ok: false,
      code: 'REVIEW_AUTHORITY_CHANGED',
      restoredPaths: []
    })
    expect(await sourceBytes()).toBeNull()
    expect(await fs.readFile(join(root, 'destination.txt'), 'utf8')).toBe('source before\n')
    expect((await fileReviewService.get('thread', review.id))!.status).toBe('recorded')
    expect(approvalRequests).toBe(1)
  })

  it('revocation after one inverse write stops the next endpoint and persists only the actual partial restore', async () => {
    const review = await recorded('move')
    const written = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    releases.push(() => release.resolve())
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to)
      if (to === join(root, 'source.txt')) {
        written.resolve()
        await release.promise
      }
    })
    const pending = rollback(review.id)
    await confirmationEntered.promise
    confirmation.resolve({ approved: true, remember: false })
    await written.promise
    await db
      .update(aiAgentProfiles)
      .set({ enabled: false })
      .where(eq(aiAgentProfiles.id, 'profile'))
    release.resolve()
    expect(await pending).toMatchObject({
      ok: false,
      code: 'REVIEW_ROLLBACK_PARTIAL',
      restoredPaths: ['source.txt'],
      review: { status: 'rollback_failed', supported: false, reason: 'partial_failure' }
    })
    expect(await sourceBytes()).toBe('source before\n')
    expect(await fs.readFile(join(root, 'destination.txt'), 'utf8')).toBe('source before\n')
    expect((await fileReviewService.get('thread', review.id))!.status).toBe('rollback_failed')
    expect(approvalRequests).toBe(1)
  })
})
