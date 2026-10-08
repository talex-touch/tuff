import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { ToolExecutionContext } from '../ai/agents/tool-registry'
import type { FileReviewOperation } from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import type { FileReviewRollbackAuthority } from './file-review-service'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REVIEW_MAX_SNAPSHOT_BYTES } from '@talex-touch/pi-desktop-reuse/review'
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

// Same isolated DB boundary as the neighboring transaction tests. The service, project/run/profile
// reads, filesystem capture, diff and libsql transactions stay real. No queue/fork writer is tested.
let db: LibSQLDatabase
let client: Client
let directory: string
let root: string
let service: FileReviewService
let ctx: ToolExecutionContext
let dispose: (() => void) | undefined
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)
vi.mock('../database', () => ({ databaseModule: { getDb: () => db } }))
vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: (_name: string, task: () => Promise<unknown>) => task()
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/tuff-review-no-runtime', isReady: () => true }
}))
vi.mock('../../utils/secure-store', () => ({
  getSecureStoreValue: () => {
    throw new Error('Secure store is outside file review')
  },
  setSecureStoreValue: () => {
    throw new Error('Secure store is outside file review')
  }
}))

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const missing = { exists: false }
const side = (value: string | Buffer) => ({
  exists: true,
  hash: hash(value),
  size: Buffer.byteLength(value)
})

async function readBytes(relative: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(join(root, relative))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
async function record() {
  const listed = await service.list('thread')
  expect(listed).toHaveLength(1)
  const full = await service.get('thread', listed[0]!.id)
  expect(full).not.toBeNull()
  return full!
}
async function validateStoredAuthority(authority: FileReviewRollbackAuthority): Promise<void> {
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
    run.profileId !== profile.id ||
    run.sessionId !== conversation.id ||
    !project ||
    project.archived ||
    (await fs.realpath(project.rootPath)) !== authority.canonicalRoot ||
    (await fs.realpath(run.cwd)) !== authority.canonicalRoot ||
    !profile.allowedToolIds.includes(`file.${authority.operation}`)
  )
    throw new Error('REVIEW_AUTHORITY_CHANGED')
  for (const policy of [profile.permissionPolicy, authority.originalPolicy]) {
    if (
      policy.mode !== 'preauthorized' ||
      authority.requiredPermissions.some(
        (permission) => !policy.allowedPermissions.includes(permission)
      )
    )
      throw new Error('REVIEW_PERMISSION_DENIED')
  }
}
function authorize(validate?: (authority: FileReviewRollbackAuthority) => Promise<void>) {
  dispose?.()
  dispose = service.initialize({
    authorizeRollback: async (authority) => {
      const revalidate = async () => {
        await validateStoredAuthority(authority)
        await validate?.(authority)
      }
      await revalidate()
      return revalidate
    }
  })
}
async function mutate(operation: FileReviewOperation, paths = ['source.txt', 'destination.txt']) {
  return service.executeFileOperation(ctx, operation, paths, async ([source, destination]) => {
    if (operation === 'write') await fs.writeFile(source!, 'new\n')
    if (operation === 'delete') await fs.unlink(source!)
    if (operation === 'copy') await fs.copyFile(source!, destination!)
    if (operation === 'move') await fs.rename(source!, destination!)
    return { success: true, operation, result: 'executor receipt' }
  })
}

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), 'file-review-consumer-'))
  root = await fs.realpath(
    await fs.mkdir(join(directory, 'project')).then(() => join(directory, 'project'))
  )
  client = createClient({ url: `file:${join(directory, 'test.db')}` })
  db = drizzle(client)
  await migrate(db, { migrationsFolder })
  // Build-state review schema is not a migration asset; fixture DDL permits testing the actual rows
  // without generating, changing or depending on a migration for this in-progress feature.
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
      mode: 'preauthorized',
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
  service = new FileReviewService()
  ctx = {
    taskId: 'run',
    agentId: 'agent',
    workingDirectory: root,
    workspace: {
      conversationId: 'thread',
      turnId: 'turn',
      projectId: 'project',
      history: [],
      assertAuthority: async () => {}
    }
  }
  authorize()
})
afterEach(async () => {
  dispose?.()
  dispose = undefined
  vi.restoreAllMocks()
  client?.close()
  if (directory) await fs.rm(directory, { recursive: true, force: true })
})

describe('FileReviewService consumer evidence and inverse operations', () => {
  it.each(['missing', 'corrupt'])(
    'a %s second-endpoint snapshot refuses the entire inverse before any restore',
    async (kind) => {
      await fs.writeFile(join(root, 'source.txt'), 'old\n')
      await fs.writeFile(join(root, 'destination.txt'), 'destination before\n')
      await mutate('move')
      const review = await record()
      const [row] = await db.select().from(conversationFileReviews)
      const payload = JSON.parse(row!.recordJson)
      if (kind === 'missing') delete payload.paths[1].snapshot
      else payload.paths[1].snapshot = Buffer.from('tampered snapshot\n').toString('base64')
      await client.execute({
        sql: 'UPDATE conversation_file_reviews SET record_json = ? WHERE id = ?',
        args: [JSON.stringify(payload), review.id]
      })
      expect(await service.rollback('thread', review.id)).toMatchObject({
        ok: false,
        code: kind === 'missing' ? 'REVIEW_SNAPSHOT_MISSING' : 'REVIEW_SNAPSHOT_INVALID',
        restoredPaths: []
      })
      expect(await readBytes('source.txt')).toBeNull()
      expect(await readBytes('destination.txt')).toEqual(Buffer.from('old\n'))
    }
  )

  it('public evidence remains readable when the private rollback payload is invalid; rollback fails closed', async () => {
    await fs.writeFile(join(root, 'source.txt'), 'old\n')
    await mutate('write', ['source.txt'])
    const review = await record()
    const listed = await service.list('thread')
    await client.execute({
      sql: 'UPDATE conversation_file_reviews SET record_json = ? WHERE id = ?',
      args: ['{invalid private json', review.id]
    })
    expect(await service.get('thread', review.id)).toEqual(review)
    expect(await service.list('thread')).toEqual(listed)
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: false,
      restoredPaths: []
    })
    expect(await readBytes('source.txt')).toEqual(Buffer.from('new\n'))
  })

  it('restores an originally empty file as empty, not as a missing snapshot', async () => {
    await fs.writeFile(join(root, 'source.txt'), '')
    await mutate('write', ['source.txt'])
    const review = await record()
    expect(review).toMatchObject({
      supported: true,
      paths: [{ before: side(''), after: side('new\n') }]
    })
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: true,
      restoredPaths: ['source.txt']
    })
    expect(await readBytes('source.txt')).toEqual(Buffer.alloc(0))
  })

  it('restoring a deleted file requires a fresh write grant, not its completed delete grant', async () => {
    await fs.writeFile(join(root, 'source.txt'), 'old\n')
    await mutate('delete', ['source.txt'])
    const review = await record()
    const grants = new Set(['file:read', 'file:delete'])
    authorize(async (authority) => {
      if (authority.requiredPermissions.some((permission) => !grants.has(permission)))
        throw new Error('denied')
    })
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: false,
      code: 'REVIEW_PERMISSION_DENIED',
      restoredPaths: []
    })
    expect(await readBytes('source.txt')).toBeNull()
    grants.add('file:write')
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: true,
      restoredPaths: ['source.txt']
    })
    expect(await readBytes('source.txt')).toEqual(Buffer.from('old\n'))
  })

  it.each(['write', 'delete', 'copy', 'move'] as const)(
    '%s records real bytes, hashes and diff; restores every changed endpoint',
    async (operation) => {
      await fs.writeFile(join(root, 'source.txt'), 'old\n')
      await fs.writeFile(join(root, 'destination.txt'), 'destination before\n')
      const paths =
        operation === 'copy' || operation === 'move'
          ? ['source.txt', 'destination.txt']
          : ['source.txt']
      expect(await mutate(operation, paths)).toEqual({
        success: true,
        operation,
        result: 'executor receipt'
      })
      const review = await record()
      const sourceAfter =
        operation === 'write'
          ? 'new\n'
          : operation === 'delete' || operation === 'move'
            ? null
            : 'old\n'
      expect(await readBytes('source.txt')).toEqual(
        sourceAfter === null ? null : Buffer.from(sourceAfter)
      )
      expect(review).toMatchObject({
        operation,
        status: 'recorded',
        supported: true,
        runId: 'run',
        turnId: 'turn'
      })
      expect(review.paths[0]).toMatchObject({
        path: 'source.txt',
        before: side('old\n'),
        after: sourceAfter === null ? missing : side(sourceAfter)
      })
      const sourceDiff = review.paths[0]!.diff!
      expect(sourceDiff.additions).toBe(operation === 'write' ? 1 : 0)
      expect(sourceDiff.deletions).toBe(operation === 'copy' ? 0 : 1)
      if (operation !== 'copy')
        expect(sourceDiff.hunks.flatMap((hunk) => hunk.lines)).toContainEqual({
          type: 'del',
          text: 'old'
        })
      if (paths.length === 2) {
        expect(await readBytes('destination.txt')).toEqual(Buffer.from('old\n'))
        expect(review.paths[1]).toMatchObject({
          path: 'destination.txt',
          before: side('destination before\n'),
          after: side('old\n'),
          diff: { additions: 1, deletions: 1 }
        })
        expect(review.paths[1]!.diff!.hunks.flatMap((hunk) => hunk.lines)).toEqual([
          { type: 'del', text: 'destination before' },
          { type: 'add', text: 'old' }
        ])
      }
      const [row] = await db.select().from(conversationFileReviews)
      const privatePayload = JSON.parse(row!.recordJson)
      expect(privatePayload.paths[0].snapshot).toBe(Buffer.from('old\n').toString('base64'))
      const publicPayload = JSON.parse(row!.publicJson)
      for (const projection of [publicPayload, review, ...(await service.list('thread'))]) {
        expect(projection).not.toHaveProperty('canonicalRoot')
        expect(projection).not.toHaveProperty('originalPolicy')
        expect(
          projection.paths.every((entry: Record<string, unknown>) => !('snapshot' in entry))
        ).toBe(true)
      }
      expect(
        (await service.list('thread'))[0]!.paths.every((entry) => entry.diff === undefined)
      ).toBe(true)
      const rolled = await service.rollback('thread', review.id)
      expect(rolled).toMatchObject({
        ok: true,
        restoredPaths: operation === 'copy' ? ['destination.txt'] : paths,
        review: { status: 'rolled_back', supported: false }
      })
      expect(await readBytes('source.txt')).toEqual(Buffer.from('old\n'))
      expect(await readBytes('destination.txt')).toEqual(Buffer.from('destination before\n'))
      expect(await service.rollback('thread', review.id)).toMatchObject({
        ok: false,
        code: 'REVIEW_UNSUPPORTED',
        restoredPaths: []
      })
    }
  )

  it.each(['source.txt', 'destination.txt'])(
    'preflights %s drift before restoring ANY endpoint of a move',
    async (drifted) => {
      await fs.writeFile(join(root, 'source.txt'), 'old\n')
      await fs.writeFile(join(root, 'destination.txt'), 'destination before\n')
      await mutate('move')
      const review = await record()
      await fs.writeFile(join(root, drifted), 'user edit\n')
      expect(await service.rollback('thread', review.id)).toMatchObject({
        ok: false,
        code: 'REVIEW_CONTENT_CONFLICT',
        restoredPaths: []
      })
      expect(await readBytes('source.txt')).toEqual(
        drifted === 'source.txt' ? Buffer.from('user edit\n') : null
      )
      expect(await readBytes('destination.txt')).toEqual(
        Buffer.from(drifted === 'destination.txt' ? 'user edit\n' : 'old\n')
      )
      expect((await service.get('thread', review.id))!.status).toBe('recorded')
    }
  )

  it('an unchanged copy source is still checked before removing a created destination', async () => {
    await fs.writeFile(join(root, 'source.txt'), 'old\n')
    await mutate('copy')
    const review = await record()
    await fs.writeFile(join(root, 'source.txt'), 'user source\n')
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: false,
      code: 'REVIEW_CONTENT_CONFLICT',
      restoredPaths: []
    })
    expect(await readBytes('source.txt')).toEqual(Buffer.from('user source\n'))
    expect(await readBytes('destination.txt')).toEqual(Buffer.from('old\n'))
  })

  it.each(['leaf', 'ancestor'])(
    'rejects a %s symlink escape before the original callback can mutate outside',
    async (kind) => {
      const outside = join(directory, 'outside.txt')
      await fs.writeFile(outside, 'user outside\n')
      const link = join(root, kind === 'leaf' ? 'link.txt' : 'linked')
      await fs.symlink(kind === 'leaf' ? outside : directory, link)
      await expect(
        service.executeFileOperation(
          ctx,
          'write',
          [kind === 'leaf' ? 'link.txt' : 'linked/outside.txt'],
          async ([target]) => {
            await fs.writeFile(target!, 'unsafe overwrite\n')
            return 'unsafe receipt'
          }
        )
      ).rejects.toMatchObject({ code: 'TOOL_RESOURCE_ACCESS_DENIED' })
      expect(await fs.readFile(outside, 'utf8')).toBe('user outside\n')
      expect(await service.list('thread')).toEqual([])
    }
  )

  it('a symlink substituted after capture cannot be followed during rollback', async () => {
    await fs.writeFile(join(root, 'source.txt'), 'old\n')
    await mutate('write', ['source.txt'])
    const review = await record()
    const outside = join(directory, 'outside.txt')
    await fs.writeFile(outside, 'user outside\n')
    await fs.unlink(join(root, 'source.txt'))
    await fs.symlink(outside, join(root, 'source.txt'))
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: false,
      code: 'REVIEW_SYMLINK_CHANGED',
      restoredPaths: []
    })
    expect(await fs.readFile(outside, 'utf8')).toBe('user outside\n')
  })

  it('inverse creation requires delete authorization, not merely the original write grant', async () => {
    await mutate('write', ['source.txt'])
    const review = await record()
    const grants = new Set(['file:read', 'file:write'])
    authorize(async (authority) => {
      if (authority.requiredPermissions.some((permission) => !grants.has(permission)))
        throw new Error('denied')
    })
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: false,
      code: 'REVIEW_PERMISSION_DENIED',
      restoredPaths: []
    })
    expect(await readBytes('source.txt')).toEqual(Buffer.from('new\n'))
    grants.add('file:delete')
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: true,
      restoredPaths: ['source.txt']
    })
    expect(await readBytes('source.txt')).toBeNull()
  })

  it.each([
    { name: 'uninstalled authorizer', refusal: null, code: 'REVIEW_PERMISSION_DENIED' },
    {
      name: 'unexpected authorizer error',
      refusal: new Error('offline gate'),
      code: 'REVIEW_PERMISSION_DENIED'
    },
    {
      name: 'fresh approval required',
      refusal: new Error('REVIEW_APPROVAL_REQUIRED'),
      code: 'REVIEW_APPROVAL_REQUIRED'
    }
  ])('$name fails closed even after the forward operation succeeded', async ({ refusal, code }) => {
    await fs.writeFile(join(root, 'source.txt'), 'old\n')
    await mutate('write', ['source.txt'])
    const review = await record()
    if (refusal)
      authorize(async () => {
        throw refusal
      })
    else {
      dispose?.()
      dispose = undefined
    }
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: false,
      code,
      restoredPaths: []
    })
    expect(await readBytes('source.txt')).toEqual(Buffer.from('new\n'))
  })

  it.each([
    { name: 'binary', filename: 'source.txt', bytes: Buffer.from([0, 255, 1]), reason: 'binary' },
    {
      name: 'oversized',
      filename: 'source.txt',
      bytes: Buffer.alloc(REVIEW_MAX_SNAPSHOT_BYTES + 1, 97),
      reason: 'too_large'
    },
    {
      name: 'sensitive path',
      filename: '.env.local',
      bytes: Buffer.from('ordinary text\n'),
      reason: 'sensitive_content'
    },
    {
      name: 'credential in text',
      filename: 'source.txt',
      bytes: Buffer.from('Authorization: Bearer synthetic-credential-canary\n'),
      reason: 'sensitive_content'
    }
  ])(
    '$name evidence never claims rollback support or retains an unsafe snapshot',
    async ({ filename, bytes, reason }) => {
      await fs.writeFile(join(root, filename), bytes)
      await mutate('write', [filename])
      const review = await record()
      expect(review).toMatchObject({
        status: 'unsupported',
        supported: false,
        reason,
        paths: [{ path: filename, before: side(bytes), after: side('new\n'), reason }]
      })
      const [row] = await db.select().from(conversationFileReviews)
      expect(JSON.parse(row!.recordJson).paths[0]).not.toHaveProperty('snapshot')
      if (reason === 'sensitive_content') expect(review.paths[0]).not.toHaveProperty('diff')
      else {
        expect(review.paths[0]!.diff).toMatchObject({
          hunks: [],
          ...(reason === 'binary' ? { binary: true } : { tooLarge: true })
        })
        expect(review.paths[0]!.diff).not.toHaveProperty('additions')
        expect(review.paths[0]!.diff).not.toHaveProperty('deletions')
      }
      expect(await service.rollback('thread', review.id)).toMatchObject({
        ok: false,
        code: 'REVIEW_UNSUPPORTED',
        restoredPaths: []
      })
      expect(await readBytes(filename)).toEqual(Buffer.from('new\n'))
    }
  )

  it.each([false, true])(
    'record insertion failure does not mask original executor outcome (throws=%s)',
    async (throws) => {
      await client.execute(
        `CREATE TRIGGER reject_review BEFORE INSERT ON conversation_file_reviews BEGIN SELECT RAISE(ABORT, 'fixture record failure'); END`
      )
      const original = new Error('original operation failure after write')
      const operation = service.executeFileOperation(
        ctx,
        'write',
        ['source.txt'],
        async ([target]) => {
          await fs.writeFile(target!, 'operation really ran\n')
          if (throws) throw original
          return { success: true, receipt: 73 }
        }
      )
      if (throws) await expect(operation).rejects.toBe(original)
      else expect(await operation).toEqual({ success: true, receipt: 73 })
      expect(await readBytes('source.txt')).toEqual(Buffer.from('operation really ran\n'))
      expect(await service.list('thread')).toEqual([])
    }
  )

  it.each([false, true])(
    'capture failure remains unknown without masking executor outcome (throws=%s)',
    async (throws) => {
      await fs.writeFile(join(root, 'source.txt'), 'old\n')
      const originalOpen = fs.open.bind(fs)
      vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
        if (args[0] === join(root, 'source.txt') && args[1] === 'r')
          throw Object.assign(new Error('read denied'), { code: 'EACCES' })
        return originalOpen(...args)
      })
      const original = new Error('executor failed after mutation')
      const operation = service.executeFileOperation(
        ctx,
        'write',
        ['source.txt'],
        async ([target]) => {
          await fs.writeFile(target!, 'new\n')
          if (throws) throw original
          return 'successful receipt'
        }
      )
      if (throws) await expect(operation).rejects.toBe(original)
      else expect(await operation).toBe('successful receipt')
      const review = await record()
      expect(review.supported).toBe(false)
      expect(review.paths[0]).toMatchObject({
        before: { exists: true },
        after: { exists: true },
        reason: 'capture_failed'
      })
      expect(review.paths[0]!.before).not.toHaveProperty('hash')
      expect(review.paths[0]!.after).not.toHaveProperty('hash')
      expect(await readBytes('source.txt')).toEqual(Buffer.from('new\n'))
    }
  )

  it('failed forward move records and reverses only the destination actually changed', async () => {
    await fs.writeFile(join(root, 'source.txt'), 'old\n')
    await fs.writeFile(join(root, 'destination.txt'), 'destination before\n')
    const original = new Error('unlink source failed')
    await expect(
      service.executeFileOperation(
        ctx,
        'move',
        ['source.txt', 'destination.txt'],
        async ([source, destination]) => {
          await fs.copyFile(source!, destination!)
          throw original
        }
      )
    ).rejects.toBe(original)
    const review = await record()
    expect(review).toMatchObject({ status: 'partial', supported: true, reason: 'operation_failed' })
    expect(review.paths.map((entry) => entry.after)).toEqual([side('old\n'), side('old\n')])
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: true,
      restoredPaths: ['destination.txt']
    })
    expect(await readBytes('source.txt')).toEqual(Buffer.from('old\n'))
    expect(await readBytes('destination.txt')).toEqual(Buffer.from('destination before\n'))
  })

  it('second restore OS failure reports and persists only the first restored path', async () => {
    await fs.writeFile(join(root, 'source.txt'), 'old\n')
    await fs.writeFile(join(root, 'destination.txt'), 'destination before\n')
    await mutate('move')
    const review = await record()
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (to === join(root, 'destination.txt'))
        throw Object.assign(new Error('restore denied'), { code: 'EACCES' })
      return rename(from, to)
    })
    expect(await service.rollback('thread', review.id)).toMatchObject({
      ok: false,
      code: 'REVIEW_ROLLBACK_PARTIAL',
      restoredPaths: ['source.txt'],
      review: { status: 'rollback_failed', supported: false, reason: 'partial_failure' }
    })
    expect(await readBytes('source.txt')).toEqual(Buffer.from('old\n'))
    expect(await readBytes('destination.txt')).toEqual(Buffer.from('old\n'))
    const [row] = await db.select().from(conversationFileReviews)
    expect(JSON.parse(row!.recordJson).restoredPaths).toEqual(['source.txt'])
    expect(
      JSON.parse(row!.recordJson).paths.every(
        (entry: Record<string, unknown>) => !('snapshot' in entry)
      )
    ).toBe(true)
    expect(await fs.readdir(root)).toEqual(
      expect.arrayContaining(['source.txt', 'destination.txt'])
    )
    expect((await fs.readdir(root)).filter((name) => name.includes('.tuff-review-'))).toEqual([])
  })

  it('read-only child evidence has no rollback authority, and cleanup never deletes user files', async () => {
    await fs.writeFile(join(root, 'source.txt'), 'old\n')
    await mutate('write', ['source.txt'])
    const source = await record()
    await db
      .insert(conversations)
      .values({ id: 'child', projectId: 'project', title: 'child', createdAt: 1, updatedAt: 1 })
    expect(await service.buildForkEvidenceRows('thread', 'child', new Set(['other-turn']))).toEqual(
      []
    )
    const rows = await service.buildForkEvidenceRows('thread', 'child', new Set(['turn']))
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]!.recordJson)).toEqual({ version: 1, readonly: true })
    await db.insert(conversationFileReviews).values(rows)
    const child = await service.get('child', rows[0]!.id)
    expect(child).toMatchObject({
      supported: false,
      reason: 'read_only_evidence',
      paths: source.paths
    })
    expect(child).not.toHaveProperty('runId')
    expect(child).not.toHaveProperty('turnId')
    expect(await service.rollback('child', rows[0]!.id)).toMatchObject({
      ok: false,
      code: 'REVIEW_READ_ONLY',
      restoredPaths: []
    })
    expect(await readBytes('source.txt')).toEqual(Buffer.from('new\n'))
    await service.cleanupConversation('thread')
    expect(await service.list('thread')).toEqual([])
    expect((await service.list('child')).map((entry) => entry.id)).toEqual([rows[0]!.id])
    expect(await readBytes('source.txt')).toEqual(Buffer.from('new\n'))
  })

  it('the unreviewed generic lifecycle preserves resolved file results and the original error', async () => {
    const generic = { taskId: 'unpersisted', agentId: 'generic', workingDirectory: root }
    expect(
      await service.executeFileOperation(generic, 'write', ['source.txt'], async ([target]) => {
        await fs.writeFile(target!, 'generic bytes\n')
        return { userVisible: 'generic receipt' }
      })
    ).toEqual({ userVisible: 'generic receipt' })
    const original = new Error('generic delete error')
    await expect(
      service.executeFileOperation(generic, 'delete', ['source.txt'], async () => {
        throw original
      })
    ).rejects.toBe(original)
    expect(await readBytes('source.txt')).toEqual(Buffer.from('generic bytes\n'))
    expect(await service.list('thread')).toEqual([])
  })
})
