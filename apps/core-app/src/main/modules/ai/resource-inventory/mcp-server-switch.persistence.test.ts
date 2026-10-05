import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type {
  AiAgentProfile,
  AiImportScanResult,
  AiMcpImportCandidate
} from '@talex-touch/utils/types/ai-orchestrator'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'

const harness = vi.hoisted(() => ({
  db: undefined as unknown,
  secureStore: new Map<string, string | null>(),
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
vi.mock('../../../utils/secure-store', () => ({
  isSecureStoreAvailable: () => true,
  getSecureStoreValue: vi.fn(
    async (_root: string, ref: string) => harness.secureStore.get(ref) ?? null
  ),
  setSecureStoreValue: vi.fn(async (_root: string, ref: string, value: string | null) => {
    harness.secureStore.set(ref, value)
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
// runtime asks it to hold instead, which is exactly what "visible to the runtime" means here.
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

import { createAgentContextSource } from '../../tool-gateway/agent-context-source'
import { AiImportRuntimeService } from '../ai-import-runtime'
import { AiImportedConfigRuntime } from '../ai-imported-config-runtime'
import { aiOrchestratorStore } from '../ai-orchestrator-store'
import { snapshotTree } from './fs-tree-snapshot'
import { buildMcpServerInventory, mcpTuffEntries, setMcpServerEnabled } from './mcp-inventory'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')

const CODEX_CONFIG = [
  '[mcp_servers.context7]',
  'command = "npx"',
  'args = ["-y", "@upstash/context7-mcp"]',
  '[mcp_servers.pencil]',
  'command = "/Applications/Pencil.app/mcp"',
  'args = ["--app", "desktop"]',
  ''
].join('\n')

/** The same file once it also declares a server signed in through OAuth. */
const CODEX_CONFIG_WITH_OAUTH = [
  CODEX_CONFIG,
  '[mcp_servers.remote]',
  'url = "https://mcp.example.test/v1"',
  'oauth = "${REMOTE_OAUTH}"',
  ''
].join('\n')

let client: Client
let db: LibSQLDatabase<typeof schema>
let sandbox: string
let home: string
let runtime: AiImportedConfigRuntime

function agentProfile(): AiAgentProfile {
  return {
    id: 'profile-test',
    name: 'Test',
    description: '',
    runtimeProvider: 'pi-core',
    enabled: true,
    modelPreference: [],
    allowedToolIds: [],
    enabledSkillIds: [],
    permissionPolicy: { mode: 'manual', allowedPermissions: [] },
    timeoutMs: 1_000,
    createdAt: 1,
    updatedAt: 1
  }
}

/**
 * Codex's configuration imported for real — a recorded scan, a prepared transaction, a committed
 * item — the same three steps an apply takes.
 */
async function importCodexServers(
  config = CODEX_CONFIG,
  serverNames?: string[]
): Promise<{ itemId: string; profileIds: Record<string, string> }> {
  const path = join(home, '.codex', 'config.toml')
  await writeFile(path, config)
  const candidate: AiMcpImportCandidate = {
    id: 'codex:user:config:mcp',
    sourceId: 'codex:user',
    provider: 'codex',
    scope: 'user',
    targetScope: 'global',
    canonicalRootId: 'codex:user',
    sourceKey: 'mcp:config.toml',
    kind: 'mcp',
    name: 'Codex MCP',
    path,
    fingerprint: createHash('sha256').update(config).digest('hex'),
    state: 'added',
    warnings: [],
    ignoredFields: [],
    blockingIssues: [],
    serverNames: ['context7', 'pencil'],
    transportTypes: ['stdio'],
    secretKeyPaths: []
  }
  const scan: AiImportScanResult = {
    scanId: `scan-${createHash('sha256').update(config).digest('hex').slice(0, 8)}`,
    scannedAt: 1,
    cwd: sandbox,
    sources: [
      {
        id: 'codex:user',
        provider: 'codex',
        label: 'Codex User',
        scope: 'user',
        rootPath: join(home, '.codex'),
        installed: true,
        scannedAt: 1,
        fingerprint: '',
        warnings: []
      }
    ],
    candidates: [candidate]
  }
  await aiOrchestratorStore.saveImportScan(scan)
  const transaction = await new AiImportRuntimeService().prepare(
    sandbox,
    [candidate],
    {
      scanId: scan.scanId,
      candidateIds: [candidate.id],
      ...(serverNames ? { mcpServers: { [candidate.id]: { include: serverNames } } } : {})
    },
    scan.sources
  )
  const result = await aiOrchestratorStore.applyPreparedImportScan(scan.scanId, transaction.items)
  const itemId = result.items[0]!.itemId!
  const profileIds = Object.fromEntries(
    transaction.items[0]!.mcpProfiles.map((profile) => [profile.name, profile.id])
  )
  return { itemId, profileIds }
}

async function keyOf(name: string): Promise<string> {
  const entry = mcpTuffEntries(await aiOrchestratorStore.listImportedItems()).find(
    (candidate) => candidate.facts.name === name
  )
  if (!entry) throw new Error(`no stored server ${name}`)
  return entry.facts.key
}

function switchDeps() {
  return {
    listImportedItems: () => aiOrchestratorStore.listImportedItems(),
    setProfileEnabled: (itemId: string, profileId: string, enabled: boolean) =>
      runtime.setMcpProfileEnabled(itemId, profileId, enabled),
    setItemActive: (itemId: string, active: boolean) => runtime.setActive(itemId, active)
  }
}

async function storedSwitches(itemId: string) {
  const item = await aiOrchestratorStore.getImportedItem(itemId)
  const profiles = (item?.normalizedProjection?.mcpProfiles ?? []) as Array<{
    name: string
    enabled?: boolean
  }>
  return {
    active: item?.active,
    state: item?.state,
    servers: Object.fromEntries(profiles.map((profile) => [profile.name, profile.enabled]))
  }
}

function homeConversationSource() {
  return createAgentContextSource({
    listImportedItems: () => aiOrchestratorStore.listImportedItems(),
    readContent: async () => '',
    readLocalSkill: async () => '',
    registerMcpProfile: () => undefined,
    listStructuredTools: async () => [],
    callMcpTool: async () => ({})
  })
}

beforeEach(async () => {
  harness.secureStore.clear()
  harness.content.clear()
  harness.registered.clear()
  sandbox = await realpath(await mkdtemp(join(tmpdir(), 'tuff-mcp-switch-')))
  home = join(sandbox, 'home')
  await mkdir(join(home, '.codex'), { recursive: true })
  client = createClient({ url: `file:${join(sandbox, 'database.sqlite')}` })
  db = drizzle(client, { schema })
  harness.db = db
  await migrate(db, { migrationsFolder })
  await client.execute('PRAGMA foreign_keys = ON')
  runtime = new AiImportedConfigRuntime()
})

afterEach(async () => {
  client.close()
  await rm(sandbox, { recursive: true, force: true })
})

describe('per-server switch on a migrated database', () => {
  it('switches one server off and leaves the rest of its file running — in the store, the registry and every reader', async () => {
    const { itemId, profileIds } = await importCodexServers()
    await runtime.refresh()
    expect([...harness.registered.keys()].sort()).toEqual(
      [profileIds.context7, profileIds.pencil].sort()
    )

    const state = await setMcpServerEnabled(switchDeps(), {
      key: await keyOf('context7'),
      enabled: false
    })

    expect(state).toMatchObject({ state: 'disabled', itemId, profileId: profileIds.context7 })
    expect(await storedSwitches(itemId)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: false, pencil: true }
    })
    // The registry closed and dropped it; its neighbour stays registered.
    expect([...harness.registered.keys()]).toEqual([profileIds.pencil])
    // The orchestrator neither advertises it nor lets a run reach it.
    const prompt = await runtime.buildSystemPrompt(agentProfile(), sandbox, 'anything')
    expect(prompt).toContain(profileIds.pencil)
    expect(prompt).not.toContain(profileIds.context7)
    await expect(runtime.listMcpTools(profileIds.context7!, sandbox)).rejects.toThrow('unavailable')
    await expect(runtime.listMcpTools(profileIds.pencil!, sandbox)).resolves.toEqual([])
    // The home conversation's tools see the same thing.
    expect((await homeConversationSource().listMcpServers()).map((server) => server.name)).toEqual([
      'pencil'
    ])

    // A fresh runtime — the next launch — reads the switch back from the database.
    harness.registered.clear()
    await new AiImportedConfigRuntime().refresh()
    expect([...harness.registered.keys()]).toEqual([profileIds.pencil])
  })

  it('switches it back on without touching its neighbours', async () => {
    const { itemId, profileIds } = await importCodexServers()
    await runtime.refresh()
    const key = await keyOf('context7')
    await setMcpServerEnabled(switchDeps(), { key, enabled: false })

    const state = await setMcpServerEnabled(switchDeps(), { key, enabled: true })

    expect(state).toMatchObject({ state: 'enabled', profileId: profileIds.context7 })
    expect(await storedSwitches(itemId)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: true, pencil: true }
    })
    expect([...harness.registered.keys()].sort()).toEqual(
      [profileIds.context7, profileIds.pencil].sort()
    )
  })

  it('switching on one server of a file that was off as a whole starts that server alone', async () => {
    const { itemId, profileIds } = await importCodexServers()
    await runtime.setActive(itemId, false)
    expect(harness.registered.size).toBe(0)

    await setMcpServerEnabled(switchDeps(), { key: await keyOf('context7'), enabled: true })

    expect(await storedSwitches(itemId)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: true, pencil: false }
    })
    expect([...harness.registered.keys()]).toEqual([profileIds.context7])
  })

  it('switching off the last running server switches the file off', async () => {
    const { itemId } = await importCodexServers()
    await runtime.refresh()

    await setMcpServerEnabled(switchDeps(), { key: await keyOf('context7'), enabled: false })
    await setMcpServerEnabled(switchDeps(), { key: await keyOf('pencil'), enabled: false })

    expect(await storedSwitches(itemId)).toEqual({
      active: false,
      state: 'active',
      servers: { context7: false, pencil: false }
    })
    expect(harness.registered.size).toBe(0)
  })

  it('refuses a server whose credentials must be re-entered, at the switch and in the store', async () => {
    // One OAuth server in the file marks the whole stored copy invalid, so nothing in it runs.
    const { itemId, profileIds } = await importCodexServers(CODEX_CONFIG_WITH_OAUTH)
    const before = await storedSwitches(itemId)
    expect(before).toEqual({
      active: true,
      state: 'invalid',
      servers: { context7: true, pencil: true, remote: false }
    })

    await expect(
      setMcpServerEnabled(switchDeps(), { key: await keyOf('remote'), enabled: true })
    ).rejects.toThrow('MCP_SERVER_REAUTH_REQUIRED')
    await expect(
      setMcpServerEnabled(switchDeps(), { key: await keyOf('context7'), enabled: true })
    ).rejects.toThrow('MCP_SERVER_INVALID')
    await expect(
      aiOrchestratorStore.setImportedMcpProfileEnabled(itemId, profileIds.remote!, true)
    ).rejects.toThrow('credentials re-entered')

    expect(await storedSwitches(itemId)).toEqual(before)
  })

  it('imports the picked servers alone, so the OAuth neighbour no longer blocks them', async () => {
    const { itemId, profileIds } = await importCodexServers(CODEX_CONFIG_WITH_OAUTH, [
      'context7',
      'pencil'
    ])
    await runtime.refresh()

    expect(await storedSwitches(itemId)).toEqual({
      active: true,
      state: 'active',
      servers: { context7: true, pencil: true }
    })
    expect([...harness.registered.keys()].sort()).toEqual(
      [profileIds.context7, profileIds.pencil].sort()
    )
  })

  it('writes Tuff’s database only — the agent’s configuration file is byte-identical', async () => {
    const { itemId } = await importCodexServers()
    const before = await snapshotTree(home)
    await runtime.refresh()

    await setMcpServerEnabled(switchDeps(), { key: await keyOf('context7'), enabled: false })
    await setMcpServerEnabled(switchDeps(), { key: await keyOf('context7'), enabled: true })
    await runtime.setActive(itemId, false)

    expect(await snapshotTree(home)).toEqual(before)
  })

  it('shows each server’s own state on its inventory row', async () => {
    const { itemId } = await importCodexServers()
    await runtime.refresh()
    await setMcpServerEnabled(switchDeps(), { key: await keyOf('context7'), enabled: false })

    const inventory = buildMcpServerInventory({
      scanId: 'scan-codex',
      discovery: { files: [], unreadable: [] },
      items: await aiOrchestratorStore.listImportedItems()
    })

    expect(inventory.rows.map((row) => [row.name, row.tuff.state])).toEqual([
      ['context7', 'disabled'],
      ['pencil', 'enabled']
    ])
    expect(inventory.rows.every((row) => row.tuff.itemId === itemId)).toBe(true)
  })
})
