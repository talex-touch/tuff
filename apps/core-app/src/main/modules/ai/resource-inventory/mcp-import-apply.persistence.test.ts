import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type {
  AiCliProviderId,
  AiImportApplyRequest,
  AiImportApplyResult,
  AiImportedConfigItem,
  AiImportScanResult,
  AiMcpImportCandidate
} from '@talex-touch/utils/types/ai-orchestrator'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'

const harness = vi.hoisted(() => ({
  db: undefined as unknown,
  secureStore: new Map<string, string>(),
  content: new Map<string, string>(),
  registered: new Map<string, Record<string, unknown>>()
}))

vi.mock('electron', () => ({ app: {} }))
vi.mock('../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: async (_label: string, operation: () => Promise<unknown>) => await operation()
  }
}))
vi.mock('../../database', () => ({ databaseModule: { getDb: () => harness.db } }))
vi.mock('../../../utils/app-root-path', () => ({ resolveRuntimeRootPath: () => '/tuff-profile' }))
// Behaves like the real store: writing nothing (or an empty value) deletes the entry.
vi.mock('../../../utils/secure-store', () => ({
  isSecureStoreAvailable: () => true,
  getSecureStoreValue: vi.fn(
    async (_root: string, ref: string) => harness.secureStore.get(ref) ?? null
  ),
  setSecureStoreValue: vi.fn(async (_root: string, ref: string, value: string | null) => {
    if (value) harness.secureStore.set(ref, value)
    else harness.secureStore.delete(ref)
    return true
  })
}))
vi.mock('../ai-import-content-store', () => ({
  aiImportContentStore: {
    write: vi.fn(async (value: string) => {
      const ref = `sha256:${createHash('sha256').update(value).digest('hex')}`
      const created = !harness.content.has(ref)
      harness.content.set(ref, value)
      return { ref, created }
    }),
    read: vi.fn(async (ref: string) => harness.content.get(ref) ?? ''),
    remove: vi.fn(async (ref: string) => void harness.content.delete(ref))
  }
}))
// The registry is the one thing that would start a server process; this one records what the
// runtime asks it to hold instead.
vi.mock('../intelligence-mcp-registry', () => ({
  intelligenceMcpRegistry: {
    getProfile: (id: string) => harness.registered.get(id),
    registerProfile: (profile: Record<string, unknown>) =>
      harness.registered.set(profile.id as string, profile),
    unregisterProfile: async (id: string) => harness.registered.delete(id),
    listStructuredTools: async () => [],
    callTool: async () => ({})
  }
}))

import { AiCliImportService } from '../ai-cli-import-service'
import { aiImportRuntimeService } from '../ai-import-runtime'
import { aiImportedConfigRuntime } from '../ai-imported-config-runtime'
import { aiOrchestratorStore } from '../ai-orchestrator-store'
import { snapshotTree } from './fs-tree-snapshot'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')

/**
 * `~/.claude.json` as Claude Code keeps it: application state with the user's MCP servers inside.
 * context7 and notes carry a credential each; pencil none.
 */
function claudeJson(
  servers: Record<string, unknown> = {},
  context7Key = 'context7-secret-value'
): string {
  return JSON.stringify(
    {
      numStartups: 12,
      projects: { '/somewhere': { allowedTools: [] } },
      mcpServers: {
        context7: {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
          env: { CONTEXT7_API_KEY: context7Key }
        },
        pencil: { command: '/Applications/Pencil.app/mcp', args: ['--app', 'desktop'] },
        notes: { command: 'node', args: ['notes.js'], env: { NOTES_TOKEN: 'notes-secret-value' } },
        ...servers
      }
    },
    null,
    2
  )
}

const CLAUDE_JSON = claudeJson()

/** The same file once it also declares a server signed in through OAuth. */
const CLAUDE_JSON_WITH_OAUTH = claudeJson({
  remote: { url: 'https://mcp.example.test/v1', oauth: { clientId: 'remote-client' } }
})

const originalEnvironment = {
  HOME: process.env.HOME,
  PATH: process.env.PATH,
  CODEX_HOME: process.env.CODEX_HOME
}

let client: Client
let db: LibSQLDatabase<typeof schema>
let sandbox: string
let home: string
let workspace: string

async function writeHomeFile(path: string, content: string): Promise<string> {
  const target = join(home, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
  return target
}

function mcpCandidate(scan: AiImportScanResult, provider: AiCliProviderId): AiMcpImportCandidate {
  const candidate = scan.candidates.find(
    (item): item is AiMcpImportCandidate =>
      item.kind === 'mcp' && item.provider === provider && item.scope === 'user'
  )
  if (!candidate) throw new Error(`no user MCP candidate for ${provider}`)
  return candidate
}

/** The current stored copy of a candidate: its two switches and each server's. */
async function storedSwitches(candidateId: string) {
  const item = (await aiOrchestratorStore.listImportedItems()).find(
    (candidate) => candidate.candidateId === candidateId
  )
  if (!item) return undefined
  const profiles = (item.normalizedProjection?.mcpProfiles ?? []) as Array<{
    name: string
    enabled?: boolean
  }>
  return {
    active: item.active,
    state: item.state,
    servers: Object.fromEntries(profiles.map((profile) => [profile.name, profile.enabled]))
  }
}

async function storedItem(candidateId: string): Promise<AiImportedConfigItem> {
  const item = (await aiOrchestratorStore.listImportedItems()).find(
    (candidate) => candidate.candidateId === candidateId
  )
  if (!item) throw new Error(`nothing stored for ${candidateId}`)
  return item
}

function profileIdOf(item: AiImportedConfigItem, name: string): string {
  const profiles = (item.normalizedProjection?.mcpProfiles ?? []) as Array<{
    id: string
    name: string
  }>
  const profile = profiles.find((candidate) => candidate.name === name)
  if (!profile) throw new Error(`no stored server ${name}`)
  return profile.id
}

/** The servers the runtime registered — the ones that would actually run. */
function registeredNames(): string[] {
  return [...harness.registered.values()].map((profile) => String(profile.name)).sort()
}

async function writeClaudeFiles(content = CLAUDE_JSON): Promise<void> {
  await writeHomeFile('.claude/settings.json', '{}')
  await writeHomeFile('.claude.json', content)
}

/** A fresh scan of Claude Code's configuration, and the user MCP file it found. */
async function scanClaude(
  service: AiCliImportService
): Promise<{ scan: AiImportScanResult; candidate: AiMcpImportCandidate }> {
  const scan = await service.preview({ cwd: workspace, providerIds: ['claude'] })
  return { scan, candidate: mcpCandidate(scan, 'claude') }
}

/** What the MCP page does when a server of Claude Code's file is switched on: scan, then pick it. */
async function pickClaudeServers(
  service: AiCliImportService,
  include: string[],
  request: Partial<AiImportApplyRequest> = {}
): Promise<AiImportApplyResult> {
  const { scan, candidate } = await scanClaude(service)
  return await service.apply({
    scanId: scan.scanId,
    candidateIds: [candidate.id],
    mcpServers: { [candidate.id]: { include } },
    ...request
  })
}

beforeEach(async () => {
  harness.secureStore.clear()
  harness.content.clear()
  harness.registered.clear()
  sandbox = await realpath(await mkdtemp(join(tmpdir(), 'tuff-mcp-import-apply-')))
  home = join(sandbox, 'home')
  workspace = join(sandbox, 'workspace')
  await mkdir(home, { recursive: true })
  await mkdir(workspace, { recursive: true })
  process.env.HOME = home
  process.env.PATH = join(sandbox, 'empty-bin')
  delete process.env.CODEX_HOME
  client = createClient({ url: `file:${join(sandbox, 'database.sqlite')}` })
  db = drizzle(client, { schema })
  harness.db = db
  await migrate(db, { migrationsFolder })
  await client.execute('PRAGMA foreign_keys = ON')
})

afterEach(async () => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  client.close()
  await rm(sandbox, { recursive: true, force: true })
})

describe('applying a user MCP file an agent keeps outside its config directory', () => {
  it('imports Claude Code’s ~/.claude.json, which sits beside ~/.claude rather than inside it', async () => {
    await writeHomeFile('.claude/settings.json', '{}')
    await writeHomeFile('.claude.json', CLAUDE_JSON)
    const service = new AiCliImportService()
    const scan = await service.preview({ cwd: workspace, providerIds: ['claude'] })
    const candidate = mcpCandidate(scan, 'claude')
    // Read at discovery within its own directory, and carried so apply reads it the same way.
    expect(candidate.containedBy).toBe(home)

    const result = await service.apply({
      scanId: scan.scanId,
      candidateIds: [candidate.id],
      confirmSecretMigration: true
    })

    expect(result.items).toEqual([
      expect.objectContaining({ candidateId: candidate.id, status: 'imported' })
    ])
    expect(await storedSwitches(candidate.id)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: true, pencil: true, notes: true }
    })
    expect([...harness.secureStore.values()].sort()).toEqual([
      'context7-secret-value',
      'notes-secret-value'
    ])
  })

  it('imports pi’s and omp’s own mcp.json through the same path', async () => {
    await writeHomeFile(
      '.pi/agent/mcp.json',
      JSON.stringify({ mcpServers: { files: { command: 'npx', args: ['server-filesystem'] } } })
    )
    await writeHomeFile(
      '.omp/agent/mcp.json',
      JSON.stringify({
        mcpServers: { search: { type: 'stdio', command: 'uvx', args: ['search'] } }
      })
    )
    const service = new AiCliImportService()
    const scan = await service.preview({ cwd: workspace, providerIds: ['pi', 'oh-my-pi'] })
    const pi = mcpCandidate(scan, 'pi')
    const omp = mcpCandidate(scan, 'oh-my-pi')
    // Their own directory is the agent's directory, so there is no other root to carry.
    expect([pi.containedBy, omp.containedBy]).toEqual([undefined, undefined])

    await service.apply({
      scanId: scan.scanId,
      candidateIds: [pi.id, omp.id],
      mcpServers: { [pi.id]: { include: ['files'] }, [omp.id]: { include: ['search'] } }
    })

    expect(await storedSwitches(pi.id)).toEqual({
      active: true,
      state: 'active',
      servers: { files: true }
    })
    expect(await storedSwitches(omp.id)).toEqual({
      active: true,
      state: 'active',
      servers: { search: true }
    })
  })

  it('still refuses a file that really leaves its directory — at discovery and at apply', async () => {
    await writeHomeFile('.claude/settings.json', '{}')
    const outside = join(sandbox, 'outside', 'claude.json')
    await mkdir(dirname(outside), { recursive: true })
    await writeFile(outside, CLAUDE_JSON, 'utf8')
    const service = new AiCliImportService()

    // Linked out of the home directory before the scan: never offered.
    await symlink(outside, join(home, '.claude.json'))
    const linkedScan = await service.preview({ cwd: workspace, providerIds: ['claude'] })
    expect(linkedScan.candidates.filter((item) => item.kind === 'mcp')).toEqual([])
    expect(
      linkedScan.sources.find((source) => source.provider === 'claude' && source.scope === 'user')
        ?.warnings
    ).toEqual([expect.stringContaining('escapes its canonical source root')])

    // Swapped for a link to identical bytes outside it after the scan: refused at apply.
    await rm(join(home, '.claude.json'))
    await writeHomeFile('.claude.json', CLAUDE_JSON)
    const scan = await service.preview({ cwd: workspace, providerIds: ['claude'] })
    const candidate = mcpCandidate(scan, 'claude')
    await rm(join(home, '.claude.json'))
    await symlink(outside, join(home, '.claude.json'))

    await expect(
      service.apply({
        scanId: scan.scanId,
        candidateIds: [candidate.id],
        confirmSecretMigration: true
      })
    ).rejects.toThrow('escapes its canonical source root')
    expect(await aiOrchestratorStore.listImportedItems()).toEqual([])
    expect(harness.secureStore.size).toBe(0)
    expect(harness.content.size).toBe(0)
  })
})

describe('adding a server to a file Tuff already holds servers of', () => {
  it('adds pencil to the context7 imported alone: context7 keeps its switch and its credential', async () => {
    await writeClaudeFiles()
    const service = new AiCliImportService()
    const first = await pickClaudeServers(service, ['context7'], { confirmSecretMigration: true })
    const candidateId = first.items[0]!.candidateId
    const credentials = new Map(harness.secureStore)
    expect([...credentials.values()]).toEqual(['context7-secret-value'])

    // No confirmation: pencil has no credential, and context7's is already in the secure store.
    const added = await pickClaudeServers(service, ['pencil'])

    expect(added.items).toEqual([expect.objectContaining({ candidateId, status: 'imported' })])
    expect(await storedSwitches(candidateId)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: true, pencil: true }
    })
    expect(harness.secureStore).toEqual(credentials)
    expect(registeredNames()).toEqual(['context7', 'pencil'])
  })

  it('keeps a server the user switched off switched off', async () => {
    await writeClaudeFiles()
    const service = new AiCliImportService()
    const first = await pickClaudeServers(service, ['context7', 'pencil'], {
      confirmSecretMigration: true
    })
    const item = await storedItem(first.items[0]!.candidateId)
    await aiImportedConfigRuntime.setMcpProfileEnabled(item.id, profileIdOf(item, 'pencil'), false)

    await pickClaudeServers(service, ['notes'], { confirmSecretMigration: true })

    expect(await storedSwitches(item.candidateId)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: true, pencil: false, notes: true }
    })
    expect(registeredNames()).toEqual(['context7', 'notes'])
  })

  it('starts the added server alone in a file that was switched off as a whole', async () => {
    await writeClaudeFiles()
    const service = new AiCliImportService()
    const first = await pickClaudeServers(service, ['context7', 'pencil'], {
      confirmSecretMigration: true
    })
    const item = await storedItem(first.items[0]!.candidateId)
    await aiImportedConfigRuntime.setActive(item.id, false)
    expect(registeredNames()).toEqual([])

    await pickClaudeServers(service, ['notes'], { confirmSecretMigration: true })

    expect(await storedSwitches(item.candidateId)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: false, pencil: false, notes: true }
    })
    expect(registeredNames()).toEqual(['notes'])
    // Held, credential and all, ready to be switched on.
    expect([...harness.secureStore.values()].sort()).toEqual([
      'context7-secret-value',
      'notes-secret-value'
    ])
  })

  it('switches an unchanged copy back on in place when its server is picked again', async () => {
    await writeClaudeFiles()
    const service = new AiCliImportService()
    const first = await pickClaudeServers(service, ['context7'], { confirmSecretMigration: true })
    const item = await storedItem(first.items[0]!.candidateId)
    await aiImportedConfigRuntime.setActive(item.id, false)

    // No confirmation: its credential is already held.
    const again = await pickClaudeServers(service, ['context7'])

    expect(again.items).toEqual([expect.objectContaining({ status: 'unchanged', itemId: item.id })])
    expect(await storedSwitches(item.candidateId)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: true }
    })
    expect(registeredNames()).toEqual(['context7'])
  })

  it('refuses to commit over a switch flipped while the addition was being prepared', async () => {
    await writeClaudeFiles()
    const service = new AiCliImportService()
    const first = await pickClaudeServers(service, ['pencil'])
    const item = await storedItem(first.items[0]!.candidateId)
    const commit = aiOrchestratorStore.applyPreparedImportScan.bind(aiOrchestratorStore)
    const race = vi
      .spyOn(aiOrchestratorStore, 'applyPreparedImportScan')
      .mockImplementationOnce(async (...args) => {
        // The user switches pencil off on its row while context7 is being added.
        await aiImportedConfigRuntime.setMcpProfileEnabled(
          item.id,
          profileIdOf(item, 'pencil'),
          false
        )
        return await commit(...args)
      })

    await expect(
      pickClaudeServers(service, ['context7'], { confirmSecretMigration: true })
    ).rejects.toThrow('changed while it was being imported')
    race.mockRestore()

    // The user's switch stands, and nothing of context7 stayed behind.
    expect(await storedSwitches(item.candidateId)).toEqual({
      active: false,
      state: 'active',
      servers: { pencil: false }
    })
    expect(harness.secureStore.size).toBe(0)
  })
})

describe('confirming a credential once per value', () => {
  it('asks only for a credential the secure store does not hold yet, and moves nothing until then', async () => {
    await writeClaudeFiles()
    const service = new AiCliImportService()
    const first = await pickClaudeServers(service, ['pencil'])
    const candidateId = first.items[0]!.candidateId

    await expect(pickClaudeServers(service, ['notes'])).rejects.toThrow(
      'requires secret migration confirmation for notes'
    )
    expect(harness.secureStore.size).toBe(0)
    expect(await storedSwitches(candidateId)).toEqual({
      active: true,
      state: 'active',
      servers: { pencil: true }
    })

    await pickClaudeServers(service, ['notes'], { confirmSecretMigration: true })
    expect([...harness.secureStore.values()]).toEqual(['notes-secret-value'])
  })

  it('asks again when the agent’s file now holds a different value for a held credential', async () => {
    await writeClaudeFiles()
    const service = new AiCliImportService()
    await pickClaudeServers(service, ['context7'], { confirmSecretMigration: true })
    const [reference] = [...harness.secureStore.keys()]
    await writeHomeFile('.claude.json', claudeJson({}, 'context7-rotated-value'))

    await expect(pickClaudeServers(service, ['pencil'])).rejects.toThrow(
      'requires secret migration confirmation for context7'
    )
    expect([...harness.secureStore.entries()]).toEqual([[reference, 'context7-secret-value']])

    await pickClaudeServers(service, ['pencil'], { confirmSecretMigration: true })
    expect([...harness.secureStore.entries()]).toEqual([[reference, 'context7-rotated-value']])
  })
})

describe('a file whose stored copy is invalid', () => {
  it('lets its runnable servers be taken and leaves the OAuth one behind', async () => {
    await writeClaudeFiles(CLAUDE_JSON_WITH_OAUTH)
    const service = new AiCliImportService()
    const whole = await scanClaude(service)
    await service.apply({
      scanId: whole.scan.scanId,
      candidateIds: [whole.candidate.id],
      confirmSecretMigration: true
    })
    // One OAuth server marks the whole copy invalid: nothing in it runs.
    expect(await storedSwitches(whole.candidate.id)).toMatchObject({
      active: true,
      state: 'invalid'
    })
    expect(registeredNames()).toEqual([])

    const { scan, candidate } = await scanClaude(service)
    expect(candidate.state).toBe('invalid')
    const apply = (request: Partial<AiImportApplyRequest>) =>
      service.apply({ scanId: scan.scanId, candidateIds: [candidate.id], ...request })
    // The whole file again, or a pick that names the OAuth server: still refused.
    await expect(apply({ confirmSecretMigration: true })).rejects.toThrow(
      'stale, blocked, or missing'
    )
    await expect(
      apply({ mcpServers: { [candidate.id]: { include: ['context7', 'remote'] } } })
    ).rejects.toThrow('MCP_SERVER_REAUTH_REQUIRED')

    // No confirmation: the credentials it keeps are already held.
    await apply({ mcpServers: { [candidate.id]: { include: ['context7'] } } })

    expect(await storedSwitches(candidate.id)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: true, pencil: false, notes: false }
    })
    expect(registeredNames()).toEqual(['context7'])
  })
})

describe('checking a server pick against its scan', () => {
  it('refuses a pick that does not fit before any file or credential is read', async () => {
    await writeClaudeFiles()
    const service = new AiCliImportService()
    const { scan, candidate } = await scanClaude(service)
    const config = scan.candidates.find(
      (item) => item.provider === 'claude' && item.kind === 'config'
    )!
    const apply = (mcpServers: unknown, candidateIds = [candidate.id]) =>
      service.apply({
        scanId: scan.scanId,
        candidateIds,
        mcpServers: mcpServers as AiImportApplyRequest['mcpServers'],
        confirmSecretMigration: true
      })
    const misfits: Array<[unknown, string[], string]> = [
      [[], [candidate.id], 'must map candidate ids to server picks'],
      [{ [candidate.id]: { include: 'pencil' } }, [candidate.id], 'must list server names'],
      [{ [candidate.id]: { include: [] } }, [candidate.id], 'selects no server'],
      [{ [candidate.id]: { include: ['figma'] } }, [candidate.id], 'does not declare server figma'],
      [
        { [candidate.id]: { include: ['pencil'], disabled: ['notes'] } },
        [candidate.id],
        'switches off server notes it does not import'
      ],
      [{ [candidate.id]: { include: ['pencil'] } }, [], 'which this apply does not select'],
      [{ [config.id]: { include: ['pencil'] } }, [config.id], 'which is not MCP'],
      [{ 'claude:user:gone': { include: ['pencil'] } }, ['claude:user:gone'], 'did not find']
    ]
    // Preparing is where the file is read and the secure store consulted.
    const prepare = vi.spyOn(aiImportRuntimeService, 'prepare')

    for (const [mcpServers, candidateIds, message] of misfits)
      await expect(apply(mcpServers, candidateIds)).rejects.toThrow(message)

    expect(prepare).not.toHaveBeenCalled()
    prepare.mockRestore()
    expect(await aiOrchestratorStore.listImportedItems()).toEqual([])
    expect(harness.secureStore.size).toBe(0)
    expect(harness.content.size).toBe(0)
  })
})

describe('Tuff only reads the agents’ files', () => {
  it('leaves every agent file byte-identical across scans, imports, additions and switches', async () => {
    await writeClaudeFiles(CLAUDE_JSON_WITH_OAUTH)
    await writeHomeFile(
      '.pi/agent/mcp.json',
      JSON.stringify({ mcpServers: { files: { command: 'npx', args: ['server-filesystem'] } } })
    )
    const before = await snapshotTree(home)
    const service = new AiCliImportService()

    const first = await pickClaudeServers(service, ['context7'], { confirmSecretMigration: true })
    const item = await storedItem(first.items[0]!.candidateId)
    await aiImportedConfigRuntime.setMcpProfileEnabled(
      item.id,
      profileIdOf(item, 'context7'),
      false
    )
    await pickClaudeServers(service, ['pencil'])
    await expect(pickClaudeServers(service, ['remote'])).rejects.toThrow(
      'MCP_SERVER_REAUTH_REQUIRED'
    )
    const pi = await service.preview({ cwd: workspace, providerIds: ['pi'] })
    await service.apply({
      scanId: pi.scanId,
      candidateIds: [mcpCandidate(pi, 'pi').id],
      mcpServers: { [mcpCandidate(pi, 'pi').id]: { include: ['files'] } }
    })
    await aiImportedConfigRuntime.setActive((await storedItem(item.candidateId)).id, false)

    expect(await snapshotTree(home)).toEqual(before)
    // Positive control: the fingerprint does see a write into an agent's file.
    await writeHomeFile('.claude.json', `${CLAUDE_JSON_WITH_OAUTH}\n`)
    expect(await snapshotTree(home)).not.toEqual(before)
  })
})
