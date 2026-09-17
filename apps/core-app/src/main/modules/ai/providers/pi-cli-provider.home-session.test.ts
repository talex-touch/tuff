/**
 * Home Pi turns continue one native transcript per conversation.
 *
 * The contract has three parts, and all three live at the process/DB boundary rather than in a mock:
 *
 *  - A fresh Home turn creates the transcript with `--session-id <uuid>` and binds exactly the id Pi
 *    names back, on the conversation, before any output is forwarded.
 *  - A returning turn resumes with `--session <same id>` from the canonical project cwd and sends
 *    only the newest user turn — the native transcript owns the earlier ones.
 *  - Every refusal (foreign owner, missing/conflicted pointer, drifted head, an unsupported protocol
 *    version, a second writer) happens before the child is spawned, and every exit path releases the
 *    shared native-session lease.
 *
 * So this file drives a stub `pi` executable that really writes an append-only session file, and a
 * real libSQL chain, because a mocked spawn or a mocked session store could only re-assert itself.
 */
import type { Client } from '@libsql/client'
import type { MainDatabase } from '../../../db/db-write'
import type {
  IntelligenceInvokeOptions,
  IntelligenceProviderConfig,
  IntelligenceStreamChunk
} from '@talex-touch/tuff-intelligence'
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { INTELLIGENCE_HOME_SURFACE } from '@talex-touch/utils/types/intelligence'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'
import { nativeSessionLeaseRegistry } from '../../local-ai-cli/native-session-lease'
import { setLocalAiCliWorkspaceRoot } from '../../local-ai-cli/workspace-root'
import { PiCliProvider } from './pi-cli-provider'
import {
  CLAUDE_CLI_ORIGIN,
  CLAUDE_CLI_PROVIDER_ID,
  PI_CLI_ORIGIN,
  PI_CLI_PROVIDER_ID,
  resetAllCliExecutableCaches,
  resetPiExecutableCache
} from './pi-cli-runtime'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')

let db: MainDatabase

vi.mock('../../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

// The scheduler only serialises; running the task inline keeps these tests about the write itself.
vi.mock('../../../db/db-write', () => ({
  scheduleDbWrite: (_name: string, task: () => Promise<unknown>) => task()
}))

const CONFIG: IntelligenceProviderConfig = {
  id: PI_CLI_PROVIDER_ID,
  type: IntelligenceProviderType.LOCAL,
  name: 'Pi (local CLI)',
  enabled: true,
  priority: 0,
  models: [],
  timeout: 120000,
  capabilities: ['text.chat'],
  metadata: { origin: PI_CLI_ORIGIN }
}

/**
 * A real `pi` stand-in. It records every spawn (argv, resolved cwd, prompt), answers the RPC shapes
 * the provider reads, and maintains an append-only session JSONL in `PI_CODING_AGENT_SESSION_DIR`,
 * which is what `findPiNativeSessionFile`/`capturePiSessionFile` verify after the run.
 */
const STUB_SOURCE = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const argv = process.argv.slice(2)
let create = false
let sessionId = null
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--session-id') {
    create = true
    sessionId = argv[index + 1]
  } else if (argv[index] === '--session') {
    create = false
    sessionId = argv[index + 1]
  }
}
const prompt = argv.length ? argv[argv.length - 1] : ''
const cwd = fs.realpathSync(process.cwd())

const spawnLog = process.env.TUFF_STUB_SPAWN_LOG
if (spawnLog) {
  fs.appendFileSync(spawnLog, JSON.stringify({ argv: argv, cwd: cwd, sessionId: sessionId, create: create, prompt: prompt }) + '\\n')
}

const emit = (record) => process.stdout.write(JSON.stringify(record) + '\\n')
if (!process.env.TUFF_STUB_SKIP_SESSION) {
  emit({
    type: 'session',
    version: Number(process.env.TUFF_STUB_VERSION || '3'),
    id: process.env.TUFF_STUB_EMIT_ID || sessionId
  })
}

const waitFor = process.env.TUFF_STUB_WAIT_FOR
if (waitFor) {
  const deadline = Date.now() + 20000
  while (!fs.existsSync(waitFor)) {
    if (Date.now() > deadline) process.exit(9)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
  }
}

const sessionDir = process.env.PI_CODING_AGENT_SESSION_DIR
if (sessionDir && sessionId) {
  fs.mkdirSync(sessionDir, { recursive: true })
  const file = path.join(sessionDir, sessionId + '.jsonl')
  if (fs.existsSync(file)) {
    let head = null
    for (const line of fs.readFileSync(file, 'utf8').split('\\n')) {
      if (!line) continue
      try {
        const record = JSON.parse(line)
        if (record.type !== 'session' && record.id) head = record.id
      } catch (error) {}
    }
    const stamp = Date.now().toString(36) + '-' + process.pid
    fs.appendFileSync(file, JSON.stringify({ type: 'message', id: 'u-' + stamp, parentId: head, message: { role: 'user' } }) + '\\n')
    fs.appendFileSync(file, JSON.stringify({ type: 'message', id: 'a-' + stamp, parentId: 'u-' + stamp, message: { role: 'assistant' } }) + '\\n')
  } else {
    const header = JSON.stringify({ type: 'session', id: sessionId, cwd: cwd }) + '\\n'
    const user = JSON.stringify({ type: 'message', id: 'h1', parentId: null, message: { role: 'user' } }) + '\\n'
    const assistant = JSON.stringify({ type: 'message', id: 'h2', parentId: 'h1', message: { role: 'assistant' } }) + '\\n'
    fs.writeFileSync(file, header + user + assistant)
  }
}

if (!process.env.TUFF_STUB_SILENT_OUTPUT) {
  emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: process.env.TUFF_STUB_DELTA || 'answer' } })
  emit({ type: 'agent_settled' })
}
process.exit(Number(process.env.TUFF_STUB_EXIT_CODE || '0'))
`

interface StubSpawn {
  argv: string[]
  cwd: string
  sessionId: string | null
  create: boolean
  prompt: string
}

let client: Client
let fixtureRoot: string
let caseDir: string
let sessionRoot: string
let workspaceRoot: string
let projectRoot: string

function provider(): PiCliProvider {
  return new PiCliProvider({ ...CONFIG })
}

function homeOptions(
  conversationId: string | null,
  projectId: string | null = null
): IntelligenceInvokeOptions {
  return {
    metadata: {
      surface: INTELLIGENCE_HOME_SURFACE,
      operation: INTELLIGENCE_HOME_SURFACE,
      autoContext: true,
      ...(conversationId === null ? {} : { conversationId }),
      projectId
    }
  }
}

async function collect(
  stream: AsyncGenerator<IntelligenceStreamChunk>
): Promise<IntelligenceStreamChunk[]> {
  const chunks: IntelligenceStreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

async function collectError(
  stream: AsyncGenerator<IntelligenceStreamChunk>
): Promise<{ chunks: IntelligenceStreamChunk[]; error: Error | null }> {
  const chunks: IntelligenceStreamChunk[] = []
  try {
    for await (const chunk of stream) chunks.push(chunk)
  } catch (error) {
    return { chunks, error: error as Error }
  }
  return { chunks, error: null }
}

function spawns(): StubSpawn[] {
  const logPath = process.env.TUFF_STUB_SPAWN_LOG
  if (!logPath) return []
  try {
    return readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StubSpawn)
  } catch {
    return []
  }
}

async function waitFor(condition: () => boolean, label: string, timeoutMs = 10_000): Promise<void> {
  // Integration seam: the condition is cross-process state (a freshly appended spawn log) and an
  // in-process registry the provider mutates from its async stdout loop. There is no promise to
  // await and fake timers cannot drive a real child, so poll the condition rather than guess a
  // duration.
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, 10)
    await promise
  }
}

/** Acquires and immediately releases: a leaked lease makes the acquire itself throw. */
function expectLeaseFree(nativeSessionId: string): void {
  const release = nativeSessionLeaseRegistry.acquire({
    provider: 'pi',
    projectRoot: workspaceRoot,
    nativeSessionId
  })
  release()
}

async function seedProject(id: string, rootPath: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO projects (id, root_path, name, pinned, archived, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, 0, 0, 1, 1, 1)`,
    args: [id, rootPath, id]
  })
}

async function seedPointer(input: {
  id: string
  conversationId: string
  provider?: string
  projectId?: string | null
  projectRoot: string
  nativeSessionId: string
  state?: string
  expectedHeadId?: string | null
  title?: string
}): Promise<void> {
  await client.execute({
    sql: `INSERT INTO local_ai_cli_sessions (id, conversation_id, project_id, provider, project_root, native_session_id, title, state, origin, expected_head_id, created_at, updated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'tuff', ?, 1, 1, 1)`,
    args: [
      input.id,
      input.conversationId,
      input.projectId ?? null,
      input.provider ?? 'pi',
      input.projectRoot,
      input.nativeSessionId,
      input.title ?? 'seeded',
      input.state ?? 'available',
      input.expectedHeadId ?? null
    ]
  })
}

interface PointerRow {
  id: string
  conversationId: string | null
  projectId: string | null
  provider: string
  projectRoot: string
  nativeSessionId: string
  title: string
  state: string
  expectedHeadId: string | null
}

async function pointer(conversationId: string): Promise<PointerRow | null> {
  const result = await client.execute({
    sql: `SELECT * FROM local_ai_cli_sessions WHERE conversation_id = ?`,
    args: [conversationId]
  })
  const row = result.rows[0]
  if (!row) return null
  return {
    id: String(row.id),
    conversationId: row.conversation_id === null ? null : String(row.conversation_id),
    projectId: row.project_id === null ? null : String(row.project_id),
    provider: String(row.provider),
    projectRoot: String(row.project_root),
    nativeSessionId: String(row.native_session_id),
    title: String(row.title),
    state: String(row.state),
    expectedHeadId: row.expected_head_id === null ? null : String(row.expected_head_id)
  }
}

async function pointerCount(): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS n FROM local_ai_cli_sessions`)
  return Number(result.rows[0]?.n ?? 0)
}

/** Writes the append-only session file a returning Home turn must find and continue. */
async function writeSessionFile(
  nativeSessionId: string,
  cwd: string,
  entries: Array<{ id: string; parentId: string | null; role: 'user' | 'assistant' }>
): Promise<string> {
  await mkdir(sessionRoot, { recursive: true })
  const file = join(sessionRoot, `${nativeSessionId}.jsonl`)
  const lines = [JSON.stringify({ type: 'session', id: nativeSessionId, cwd })]
  for (const entry of entries) {
    lines.push(
      JSON.stringify({
        type: 'message',
        id: entry.id,
        parentId: entry.parentId,
        message: { role: entry.role }
      })
    )
  }
  await writeFile(file, `${lines.join('\n')}\n`)
  return file
}

beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'pi-home-native-'))
  const stubPath = join(fixtureRoot, 'pi-stub.js')
  await writeFile(stubPath, STUB_SOURCE, 'utf8')
  await chmod(stubPath, 0o755)
  process.env.TUFF_PI_CLI_PATH = stubPath
  resetPiExecutableCache()

  client = createClient({ url: `file:${join(fixtureRoot, 'chain.db')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
})

afterAll(async () => {
  delete process.env.TUFF_PI_CLI_PATH
  resetPiExecutableCache()
  client.close()
  await rm(fixtureRoot, { recursive: true, force: true })
})

beforeEach(async () => {
  nativeSessionLeaseRegistry.clear()
  // One migrated chain is shared for speed, so each case starts from empty tables — pointer counts
  // and conversation lookups must not observe rows a previous case seeded.
  await client.execute('DELETE FROM local_ai_cli_sessions')
  await client.execute('DELETE FROM projects')
  caseDir = await mkdtemp(join(fixtureRoot, 'case-'))
  sessionRoot = join(caseDir, 'pi-sessions')
  workspaceRoot = await realpath(await mkdtemp(join(caseDir, 'workspace-')))
  projectRoot = await realpath(await mkdtemp(join(caseDir, 'project-')))
  process.env.PI_CODING_AGENT_SESSION_DIR = sessionRoot
  process.env.TUFF_STUB_SPAWN_LOG = join(caseDir, 'spawns.log')
  setLocalAiCliWorkspaceRoot(workspaceRoot)
})

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_SESSION_DIR
  delete process.env.TUFF_STUB_SPAWN_LOG
  delete process.env.TUFF_STUB_WAIT_FOR
  delete process.env.TUFF_STUB_EMIT_ID
  delete process.env.TUFF_STUB_SKIP_SESSION
  delete process.env.TUFF_STUB_SILENT_OUTPUT
  delete process.env.TUFF_STUB_VERSION
  delete process.env.TUFF_STUB_EXIT_CODE
  delete process.env.TUFF_STUB_DELTA
  setLocalAiCliWorkspaceRoot(null)
  nativeSessionLeaseRegistry.clear()
  await rm(caseDir, { recursive: true, force: true })
})

const TURNS_ONE = [{ role: 'user' as const, content: 'Project smoke title\nPROMPT_BODY_CANARY' }]
const TURNS_TWO = [
  ...TURNS_ONE,
  { role: 'assistant' as const, content: 'PRIOR_ASSISTANT_CANARY' },
  { role: 'user' as const, content: 'third question' }
]

describe('PiCliProvider Home native sessions', () => {
  it('creates one transcript on the first turn and continues it with the newest turn only', async () => {
    const conversationId = 'conv-fresh'

    const firstChunks = await collect(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions(conversationId))
    )
    expect(firstChunks.some((chunk) => chunk.delta === 'answer')).toBe(true)

    const bound = await pointer(conversationId)
    expect(bound).not.toBeNull()
    expect(bound?.projectId).toBeNull()
    expect(bound?.projectRoot).toBe(workspaceRoot)
    // The stored title is the bounded first prompt line, never the whole prompt body.
    expect(bound?.title).toBe('Project smoke title')
    expect(bound?.expectedHeadId).toBe('h2')

    const [firstSpawn] = spawns()
    expect(firstSpawn?.create).toBe(true)
    expect(firstSpawn?.cwd).toBe(workspaceRoot)
    expect(firstSpawn?.argv).toContain('--session-id')
    expect(firstSpawn?.argv).not.toContain('--no-session')
    expect(firstSpawn?.argv[firstSpawn!.argv.indexOf('--session-id') + 1]).toBe(
      bound?.nativeSessionId
    )
    // No pointer existed, so this one send seeds the visible history into the new transcript.
    expect(firstSpawn?.prompt).toContain('PROMPT_BODY_CANARY')

    const secondChunks = await collect(
      provider().chatStream({ messages: TURNS_TWO }, homeOptions(conversationId))
    )
    expect(secondChunks.some((chunk) => chunk.delta === 'answer')).toBe(true)

    const resumed = spawns()[1]
    expect(resumed?.create).toBe(false)
    expect(resumed?.cwd).toBe(workspaceRoot)
    expect(resumed?.argv).toContain('--session')
    expect(resumed?.argv).not.toContain('--session-id')
    expect(resumed?.argv).not.toContain('--no-session')
    expect(resumed?.argv[resumed!.argv.indexOf('--session') + 1]).toBe(bound?.nativeSessionId)
    // The native transcript owns the earlier turns: the positional must be the newest user turn.
    expect(resumed?.prompt).toBe('third question')
    expect(resumed?.prompt).not.toContain('PRIOR_ASSISTANT_CANARY')

    const advanced = await pointer(conversationId)
    expect(advanced?.id).toBe(bound?.id)
    expect(advanced?.nativeSessionId).toBe(bound?.nativeSessionId)
    expect(advanced?.expectedHeadId).toMatch(/^a-/)
    expect(advanced?.expectedHeadId).not.toBe(bound?.expectedHeadId)

    expectLeaseFree(bound!.nativeSessionId)
  })

  it('runs a quick-invoke turn session-less and records no pointer', async () => {
    await collect(provider().chatStream({ messages: TURNS_ONE }, {}))

    const [spawn] = spawns()
    expect(spawn?.argv).toContain('--no-session')
    expect(spawn?.argv).not.toContain('--session-id')
    expect(spawn?.argv).not.toContain('--session')
    expect(await pointerCount()).toBe(0)
  })

  it('refuses a Home turn without a usable conversation owner before spawning', async () => {
    const invalid: Array<{ name: string; options: IntelligenceInvokeOptions }> = [
      { name: 'no conversation', options: homeOptions(null) },
      {
        name: 'non-opaque conversation',
        options: homeOptions('not a valid id')
      },
      {
        name: 'non-opaque project',
        options: {
          metadata: {
            surface: INTELLIGENCE_HOME_SURFACE,
            operation: INTELLIGENCE_HOME_SURFACE,
            autoContext: true,
            conversationId: 'conv-owner',
            projectId: '../escape'
          }
        }
      },
      {
        name: 'plugin caller impersonating Home',
        options: {
          metadata: {
            surface: INTELLIGENCE_HOME_SURFACE,
            operation: INTELLIGENCE_HOME_SURFACE,
            autoContext: true,
            conversationId: 'conv-owner',
            caller: 'plugin-ai-session'
          }
        }
      }
    ]

    for (const scenario of invalid) {
      const { error } = await collectError(
        provider().chatStream({ messages: TURNS_ONE }, scenario.options)
      )
      expect(error?.message, scenario.name).toBe('PI_NATIVE_SESSION_CONTEXT_INVALID')
    }
    expect(spawns()).toHaveLength(0)
  })

  it('refuses a transcript owned by another provider, project or cwd before spawning', async () => {
    await seedProject('project-other', projectRoot)
    await seedPointer({
      id: 'ptr-foreign-provider',
      conversationId: 'conv-foreign-provider',
      provider: 'claude',
      projectId: null,
      projectRoot: workspaceRoot,
      nativeSessionId: 'native-foreign-provider'
    })
    await seedPointer({
      id: 'ptr-foreign-project',
      conversationId: 'conv-foreign-project',
      projectId: 'project-other',
      projectRoot: projectRoot,
      nativeSessionId: 'native-foreign-project'
    })
    await seedPointer({
      id: 'ptr-foreign-root',
      conversationId: 'conv-foreign-root',
      projectId: null,
      projectRoot: '/projects/elsewhere',
      nativeSessionId: 'native-foreign-root'
    })

    for (const conversationId of [
      'conv-foreign-provider',
      'conv-foreign-project',
      'conv-foreign-root'
    ]) {
      const { error } = await collectError(
        provider().chatStream({ messages: TURNS_ONE }, homeOptions(conversationId, null))
      )
      expect(error?.message, conversationId).toBe('NATIVE_SESSION_CONFLICT')
    }
    expect(spawns()).toHaveLength(0)
  })

  it('refuses a pointer whose native state is missing or conflicted before spawning', async () => {
    await seedPointer({
      id: 'ptr-missing',
      conversationId: 'conv-missing',
      projectRoot: workspaceRoot,
      nativeSessionId: 'native-missing',
      state: 'missing'
    })
    await seedPointer({
      id: 'ptr-conflict',
      conversationId: 'conv-conflict',
      projectRoot: workspaceRoot,
      nativeSessionId: 'native-conflict',
      state: 'conflict'
    })

    const missing = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions('conv-missing'))
    )
    expect(missing.error?.message).toBe('NATIVE_SESSION_MISSING')

    const conflict = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions('conv-conflict'))
    )
    expect(conflict.error?.message).toBe('NATIVE_SESSION_CONFLICT')

    expect(spawns()).toHaveLength(0)
  })

  it('refuses to resume a transcript whose head moved, and marks a vanished transcript missing', async () => {
    const driftedId = 'native-drifted'
    await writeSessionFile(driftedId, workspaceRoot, [
      { id: 'h1', parentId: null, role: 'user' },
      { id: 'h2', parentId: 'h1', role: 'assistant' },
      { id: 'h3', parentId: 'h2', role: 'user' }
    ])
    await seedPointer({
      id: 'ptr-drifted',
      conversationId: 'conv-drifted',
      projectRoot: workspaceRoot,
      nativeSessionId: driftedId,
      expectedHeadId: 'h2'
    })

    const drifted = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions('conv-drifted'))
    )
    expect(drifted.error?.message).toBe('NATIVE_SESSION_CONFLICT')

    await seedPointer({
      id: 'ptr-vanished',
      conversationId: 'conv-vanished',
      projectRoot: workspaceRoot,
      nativeSessionId: 'native-vanished',
      expectedHeadId: 'h2'
    })
    const vanished = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions('conv-vanished'))
    )
    expect(vanished.error?.message).toBe('NATIVE_SESSION_MISSING')
    expect((await pointer('conv-vanished'))?.state).toBe('missing')

    expect(spawns()).toHaveLength(0)
  })

  it('refuses a second writer of the same native tuple before spawning', async () => {
    const nativeSessionId = 'native-leased'
    await writeSessionFile(nativeSessionId, workspaceRoot, [
      { id: 'h1', parentId: null, role: 'user' },
      { id: 'h2', parentId: 'h1', role: 'assistant' }
    ])
    await seedPointer({
      id: 'ptr-leased',
      conversationId: 'conv-leased',
      projectRoot: workspaceRoot,
      nativeSessionId,
      expectedHeadId: 'h2'
    })

    const release = nativeSessionLeaseRegistry.acquire({
      provider: 'pi',
      projectRoot: workspaceRoot,
      nativeSessionId
    })
    try {
      const { error } = await collectError(
        provider().chatStream({ messages: TURNS_ONE }, homeOptions('conv-leased'))
      )
      expect(error?.message).toBe('NATIVE_SESSION_BUSY')
      expect(spawns()).toHaveLength(0)
    } finally {
      release()
    }
  })

  it('serialises a second Home turn on the same conversation', async () => {
    const conversationId = 'conv-busy'
    const releaseFile = join(caseDir, 'release-first')
    process.env.TUFF_STUB_WAIT_FOR = releaseFile

    const first = collect(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions(conversationId))
    )
    await waitFor(() => spawns().length === 1, 'the first Home spawn')
    const nativeSessionId = spawns()[0]!.sessionId as string
    await waitFor(
      () =>
        nativeSessionLeaseRegistry.isLeased({
          provider: 'pi',
          projectRoot: workspaceRoot,
          nativeSessionId: nativeSessionId
        }),
      'the first turn to hold the native lease'
    )

    const second = await collectError(
      provider().chatStream({ messages: TURNS_TWO }, homeOptions(conversationId))
    )
    expect(second.error?.message).toBe('NATIVE_SESSION_BUSY')
    expect(spawns()).toHaveLength(1)

    await writeFile(releaseFile, '')
    await expect(first).resolves.toBeDefined()
    expect((await pointer(conversationId))?.nativeSessionId).toBe(nativeSessionId)
    expectLeaseFree(nativeSessionId)
  })

  it('releases both leases when a Home turn is cancelled', async () => {
    const conversationId = 'conv-cancel'
    const nativeSessionId = 'native-cancel'
    await writeSessionFile(nativeSessionId, workspaceRoot, [
      { id: 'h1', parentId: null, role: 'user' },
      { id: 'h2', parentId: 'h1', role: 'assistant' }
    ])
    await seedPointer({
      id: 'ptr-cancel',
      conversationId,
      projectRoot: workspaceRoot,
      nativeSessionId,
      expectedHeadId: 'h2'
    })

    const releaseFile = join(caseDir, 'release-cancel')
    process.env.TUFF_STUB_WAIT_FOR = releaseFile
    const controller = new AbortController()
    const pending = collect(
      provider().chatStream({ messages: TURNS_ONE }, {
        ...homeOptions(conversationId),
        signal: controller.signal
      } as IntelligenceInvokeOptions & { signal: AbortSignal })
    )
    await waitFor(
      () =>
        nativeSessionLeaseRegistry.isLeased({
          provider: 'pi',
          projectRoot: workspaceRoot,
          nativeSessionId: nativeSessionId
        }),
      'the cancelled turn to hold the native lease'
    )

    controller.abort()
    await expect(pending).resolves.toBeDefined()

    expectLeaseFree(nativeSessionId)
    // The conversation guard must clear too: a later turn on the same thread must not read BUSY.
    delete process.env.TUFF_STUB_WAIT_FOR
    const followUp = await collectError(
      provider().chatStream({ messages: TURNS_TWO }, homeOptions(conversationId))
    )
    expect(followUp.error).toBeNull()
    expect((await pointer(conversationId))?.expectedHeadId).toMatch(/^a-/)
  })

  it('releases the native lease when the resumed child fails before output', async () => {
    const conversationId = 'conv-child-failure'
    const nativeSessionId = 'native-child-failure'
    await writeSessionFile(nativeSessionId, workspaceRoot, [
      { id: 'h1', parentId: null, role: 'user' },
      { id: 'h2', parentId: 'h1', role: 'assistant' }
    ])
    await seedPointer({
      id: 'ptr-child-failure',
      conversationId,
      projectRoot: workspaceRoot,
      nativeSessionId,
      expectedHeadId: 'h2'
    })
    process.env.TUFF_STUB_SKIP_SESSION = '1'
    process.env.TUFF_STUB_SILENT_OUTPUT = '1'
    process.env.TUFF_STUB_EXIT_CODE = '2'

    const { error } = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions(conversationId))
    )
    expect(error?.message).toMatch(/exited with code 2/)

    expectLeaseFree(nativeSessionId)
    // A process failure is not a transcript verdict: the pointer must stay resumable.
    expect((await pointer(conversationId))?.state).toBe('available')
  })

  it('does not strand the conversation when the isolation directory cannot be created', async () => {
    const conversationId = 'conv-isolation-failure'
    const claudeStub = join(caseDir, 'claude-stub.js')
    await writeFile(claudeStub, '#!/usr/bin/env node\n', 'utf8')
    await chmod(claudeStub, 0o755)
    process.env.TUFF_CLAUDE_CLI_PATH = claudeStub
    resetAllCliExecutableCaches()
    // `codex`/`claude` run in a throwaway cwd, and this is the one thing between the conversation
    // lease and the `finally` that releases it: a directory that is not there makes `mkdtemp`
    // reject, which used to leave the thread in NATIVE_SESSION_BUSY until the app restarted.
    process.env.TMPDIR = join(caseDir, 'missing-tmp')

    try {
      const failed = await collectError(
        new PiCliProvider({
          ...CONFIG,
          id: CLAUDE_CLI_PROVIDER_ID,
          metadata: { origin: CLAUDE_CLI_ORIGIN }
        }).chatStream({ messages: TURNS_ONE }, homeOptions(conversationId))
      )
      expect(failed.error?.message).toMatch(/ENOENT/)

      delete process.env.TMPDIR
      // The same thread must still be usable: a stranded lease would answer NATIVE_SESSION_BUSY.
      const followUp = await collectError(
        provider().chatStream({ messages: TURNS_ONE }, homeOptions(conversationId))
      )
      expect(followUp.error).toBeNull()
    } finally {
      delete process.env.TMPDIR
      delete process.env.TUFF_CLAUDE_CLI_PATH
      resetAllCliExecutableCaches()
    }
  })

  it('fails closed, before forwarding output, when Pi names a different session', async () => {
    // Fresh turn: the provider generated the id, so any other id is a fork, not a continuation.
    process.env.TUFF_STUB_EMIT_ID = 'some-other-session'
    const { chunks, error } = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions('conv-wrong-id'))
    )
    expect(error?.message).toBe('NATIVE_SESSION_CONFLICT')
    expect(chunks).toHaveLength(0)
    expect(await pointer('conv-wrong-id')).toBeNull()
  })

  it('marks the pointer missing when a resumed Pi session names another id', async () => {
    const conversationId = 'conv-resume-wrong-id'
    const nativeSessionId = 'native-resume-wrong-id'
    await writeSessionFile(nativeSessionId, workspaceRoot, [
      { id: 'h1', parentId: null, role: 'user' },
      { id: 'h2', parentId: 'h1', role: 'assistant' }
    ])
    await seedPointer({
      id: 'ptr-resume-wrong-id',
      conversationId,
      projectRoot: workspaceRoot,
      nativeSessionId,
      expectedHeadId: 'h2'
    })
    process.env.TUFF_STUB_EMIT_ID = 'some-other-session'

    const { error } = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions(conversationId))
    )
    expect(error?.message).toBe('NATIVE_SESSION_MISSING')
    expect((await pointer(conversationId))?.state).toBe('missing')
  })

  it('refuses a Pi protocol version this provider was not written against', async () => {
    const conversationId = 'conv-version'
    const nativeSessionId = 'native-version'
    await writeSessionFile(nativeSessionId, workspaceRoot, [
      { id: 'h1', parentId: null, role: 'user' },
      { id: 'h2', parentId: 'h1', role: 'assistant' }
    ])
    await seedPointer({
      id: 'ptr-version',
      conversationId,
      projectRoot: workspaceRoot,
      nativeSessionId,
      expectedHeadId: 'h2'
    })
    process.env.TUFF_STUB_VERSION = '4'

    const { error } = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions(conversationId))
    )
    expect(error?.message).toBe('PROVIDER_RESUME_UNSUPPORTED')
    // A protocol mismatch says nothing about the transcript, so the pointer stays resumable.
    expect((await pointer(conversationId))?.state).toBe('available')
  })

  it('fails closed when Pi never emits a session line', async () => {
    process.env.TUFF_STUB_SKIP_SESSION = '1'
    const { error } = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions('conv-no-session-line'))
    )
    expect(error?.message).toBe('PROTOCOL_INVALID')
    expect(await pointer('conv-no-session-line')).toBeNull()
  })

  it('refuses a non-canonical project root without rewriting the project', async () => {
    const realRoot = await mkdtemp(join(caseDir, 'real-project-'))
    const linkedRoot = join(caseDir, 'linked-project')
    await symlink(realRoot, linkedRoot, 'dir')
    await seedProject('project-linked', linkedRoot)

    const { error } = await collectError(
      provider().chatStream({ messages: TURNS_ONE }, homeOptions('conv-linked', 'project-linked'))
    )
    expect(error?.message).toBe('WORKSPACE_INVALID')

    const stored = await client.execute({
      sql: `SELECT root_path FROM projects WHERE id = 'project-linked'`
    })
    expect(String(stored.rows[0]?.root_path)).toBe(linkedRoot)
    expect(spawns()).toHaveLength(0)
  })

  it('runs a project Home turn in the canonical project root', async () => {
    await seedProject('project-canonical', projectRoot)

    await collect(
      provider().chatStream(
        { messages: TURNS_ONE },
        homeOptions('conv-project', 'project-canonical')
      )
    )

    const [spawn] = spawns()
    expect(spawn?.cwd).toBe(projectRoot)
    const bound = await pointer('conv-project')
    expect(bound?.projectId).toBe('project-canonical')
    expect(bound?.projectRoot).toBe(projectRoot)
  })
})
