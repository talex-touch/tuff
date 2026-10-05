import type {
  AiImportCandidate,
  AiImportedConfigItem,
  AiImportScanResult,
  AiImportSourceSnapshot,
  AiMcpImportCandidate
} from '@talex-touch/utils/types/ai-orchestrator'
import type { McpServerInventory } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { IntelligenceMcpProfile } from '../intelligence-mcp-registry'
import type { McpServerSwitchDeps } from './mcp-inventory'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MCP_SECRET_MASK } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const secureStore = vi.hoisted(() => new Map<string, string | null>())

// The inventory reads projections the way the runtime does; the runtime's own module would pull in
// the database and the MCP client, neither of which a merge needs.
vi.mock('../ai-orchestrator-store', () => ({ aiOrchestratorStore: {} }))
vi.mock('../intelligence-mcp-registry', () => ({ intelligenceMcpRegistry: {} }))
// The real importer prepares the stored copies below, so the copies are exactly what an import
// writes; only where it would write them is redirected.
vi.mock('../../../utils/app-root-path', () => ({ resolveRuntimeRootPath: () => '/tuff-profile' }))
vi.mock('../../../utils/secure-store', () => ({
  isSecureStoreAvailable: () => true,
  getSecureStoreValue: vi.fn(async (_root: string, ref: string) => secureStore.get(ref) ?? null),
  setSecureStoreValue: vi.fn(async (_root: string, ref: string, value: string | null) => {
    secureStore.set(ref, value)
    return true
  })
}))
vi.mock('../ai-import-content-store', () => ({
  aiImportContentStore: {
    write: vi.fn(async (content: string) => ({
      ref: `sha256:${createHash('sha256').update(content).digest('hex')}`,
      created: true
    })),
    remove: vi.fn(async () => undefined)
  }
}))

import { AiImportRuntimeService } from '../ai-import-runtime'
import { snapshotTree } from './fs-tree-snapshot'
import {
  buildMcpServerInventory,
  loadMcpDiscovery,
  mcpTuffEntries,
  setMcpServerEnabled
} from './mcp-inventory'

let sandbox: string
let home: string

const CODEX_CONFIG = [
  'model = "gpt-5"',
  '[mcp_servers.context7]',
  'command = "npx"',
  'args = ["-y", "@upstash/context7-mcp"]',
  '[mcp_servers.github]',
  'command = "docker"',
  'args = ["run", "--rm", "-e", "GITHUB_TOKEN", "ghcr.io/github/github-mcp-server"]',
  'env = { GITHUB_TOKEN = "ghp-canary-codex" }',
  ''
].join('\n')

// `~/.claude.json` is Claude Code's application state; the servers are one block of it.
const CLAUDE_STATE = JSON.stringify({
  numStartups: 12,
  mcpServers: {
    context7: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: { CONTEXT7_API_KEY: 'ctx7-canary' }
    },
    pencil: { command: '/Applications/Pencil.app/mcp', args: ['--app', 'desktop'] },
    github: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github', '--token', 'ghp-canary-claude']
    },
    figma: {
      url: 'https://mcp.figma.test/mcp?team=canary-team',
      headers: { Authorization: 'Bearer figma-canary' }
    }
  }
})

const PI_MCP = JSON.stringify({
  mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } }
})

function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function source(
  id: string,
  provider: AiImportSourceSnapshot['provider'],
  rootPath: string,
  scope: AiImportSourceSnapshot['scope'] = 'user'
): AiImportSourceSnapshot {
  return {
    id,
    provider,
    label: provider,
    scope,
    rootPath,
    installed: true,
    scannedAt: 1,
    fingerprint: '',
    warnings: []
  }
}

function mcpCandidate(
  overrides: Partial<AiMcpImportCandidate> & Pick<AiMcpImportCandidate, 'id' | 'sourceId' | 'path'>
): AiMcpImportCandidate {
  return {
    provider: 'codex',
    scope: 'user',
    targetScope: 'global',
    canonicalRootId: overrides.sourceId,
    sourceKey: `mcp:${overrides.path}`,
    kind: 'mcp',
    name: 'MCP',
    fingerprint: '',
    state: 'added',
    warnings: [],
    ignoredFields: [],
    blockingIssues: [],
    serverNames: ['context7'],
    transportTypes: ['stdio'],
    secretKeyPaths: [],
    ...overrides
  }
}

/** What the preview would record for the fixture machine. */
function machineScan(): AiImportScanResult {
  const project = join(sandbox, 'project')
  return {
    scanId: 'scan-machine',
    scannedAt: 1,
    cwd: project,
    sources: [
      source('codex:user', 'codex', join(home, '.codex')),
      source('claude:user', 'claude', join(home, '.claude')),
      source('pi:user', 'pi', join(home, '.pi', 'agent')),
      source('claude:project', 'claude', project, 'project'),
      source('opencode:user', 'opencode', join(home, '.config', 'opencode'))
    ],
    candidates: [
      mcpCandidate({
        id: 'codex:user:config:mcp',
        sourceId: 'codex:user',
        provider: 'codex',
        path: join(home, '.codex', 'config.toml'),
        fingerprint: fingerprint(CODEX_CONFIG),
        serverNames: ['context7', 'github']
      }),
      // Kept beside the agent's directory, not inside it — the scan reads it from its own folder.
      mcpCandidate({
        id: 'claude:user:mcp',
        sourceId: 'claude:user',
        provider: 'claude',
        path: join(home, '.claude.json'),
        serverNames: ['context7', 'figma', 'github', 'pencil']
      }),
      mcpCandidate({
        id: 'pi:user:mcp',
        sourceId: 'pi:user',
        provider: 'pi',
        path: join(home, '.pi', 'agent', 'mcp.json')
      }),
      // A folder the app happened to start in, not an agent on this machine.
      mcpCandidate({
        id: 'claude:project:mcp',
        sourceId: 'claude:project',
        provider: 'claude',
        scope: 'project',
        targetScope: 'workspace',
        path: join(project, '.mcp.json'),
        serverNames: ['project-only']
      }),
      // A format the parser does not take: preview already marked it blocked.
      mcpCandidate({
        id: 'opencode:user:config:mcp',
        sourceId: 'opencode:user',
        provider: 'opencode',
        path: join(home, '.config', 'opencode', 'opencode.json'),
        serverNames: [],
        blockingIssues: ['No supported MCP stdio or HTTP profile was found in this configuration']
      }),
      {
        ...mcpCandidate({
          id: 'claude:user:skill',
          sourceId: 'claude:user',
          path: join(home, '.claude', 'skills', 'x', 'SKILL.md')
        }),
        kind: 'skill',
        description: '',
        manifestPath: join(home, '.claude', 'skills', 'x', 'SKILL.md')
      } as unknown as AiImportCandidate
    ]
  }
}

async function writeMachine(): Promise<void> {
  await mkdir(join(home, '.codex'), { recursive: true })
  await mkdir(join(home, '.claude'), { recursive: true })
  await mkdir(join(home, '.pi', 'agent'), { recursive: true })
  await mkdir(join(home, '.config', 'opencode'), { recursive: true })
  await mkdir(join(sandbox, 'project'), { recursive: true })
  await writeFile(join(home, '.codex', 'config.toml'), CODEX_CONFIG)
  await writeFile(join(home, '.claude.json'), CLAUDE_STATE)
  await writeFile(join(home, '.pi', 'agent', 'mcp.json'), PI_MCP)
  await writeFile(
    join(home, '.config', 'opencode', 'opencode.json'),
    JSON.stringify({ mcp: { x: { type: 'local', command: ['node'] } } })
  )
  await writeFile(
    join(sandbox, 'project', '.mcp.json'),
    JSON.stringify({ mcpServers: { 'project-only': { command: 'node' } } })
  )
}

async function inventoryOf(items: AiImportedConfigItem[] = []): Promise<McpServerInventory> {
  const scan = machineScan()
  return buildMcpServerInventory({
    scanId: scan.scanId,
    discovery: await loadMcpDiscovery(scan),
    items
  })
}

/** A stored copy exactly as the importer writes it, from the fixture's Codex configuration. */
async function importFromCodex(
  serverNames?: string[],
  overrides: Partial<AiImportedConfigItem> = {}
): Promise<AiImportedConfigItem> {
  const scan = machineScan()
  const candidate = scan.candidates[0]!
  const transaction = await new AiImportRuntimeService().prepare(
    sandbox,
    [candidate],
    {
      scanId: scan.scanId,
      candidateIds: [candidate.id],
      confirmSecretMigration: true,
      ...(serverNames ? { mcpServers: { [candidate.id]: { include: serverNames } } } : {})
    },
    scan.sources
  )
  const prepared = transaction.items[0]!
  return {
    id: `${candidate.id}:revision-1`,
    candidateId: candidate.id,
    sourceId: candidate.sourceId,
    provider: 'codex',
    sourceScope: 'user',
    targetScope: 'global',
    kind: 'mcp',
    name: candidate.name,
    sourceKey: candidate.sourceKey,
    contentRef: prepared.contentRef,
    normalizedProjection: JSON.parse(JSON.stringify(prepared.projection)),
    secrets: prepared.secrets,
    state: 'active',
    revisionId: 'revision-1',
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function manualItem(overrides: Partial<AiImportedConfigItem> = {}): AiImportedConfigItem {
  const profile: IntelligenceMcpProfile = {
    id: 'manual.local-notes',
    name: 'local-notes',
    enabled: true,
    transport: { type: 'stdio', command: 'node', args: ['notes.js'], env: {}, envAuthRefs: {} },
    metadata: { origin: 'manual', requiredPermission: 'SYSTEM_EXEC' }
  }
  return {
    id: 'manual:1',
    candidateId: 'manual:1',
    sourceId: 'manual',
    provider: 'manual',
    sourceScope: 'user',
    targetScope: 'global',
    kind: 'mcp',
    name: 'local-notes',
    sourceKey: 'manual:1',
    normalizedProjection: { kind: 'mcp', origin: 'manual', mcpProfiles: [profile] },
    secrets: [],
    state: 'active',
    revisionId: 'manual',
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

beforeEach(async () => {
  secureStore.clear()
  sandbox = await realpath(await mkdtemp(join(tmpdir(), 'tuff-mcp-inventory-')))
  home = join(sandbox, 'home')
  await writeMachine()
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('MCP inventory merge', () => {
  it('lists a server several agents declare the same way as one row naming every agent', async () => {
    const inventory = await inventoryOf()

    const context7 = inventory.rows.filter((row) => row.name === 'context7')
    expect(context7).toHaveLength(1)
    expect(context7[0]).toMatchObject({
      transport: 'stdio',
      summary: 'npx -y @upstash/context7-mcp',
      agents: [
        {
          agentId: 'codex',
          sourcePath: join(home, '.codex', 'config.toml'),
          candidateId: 'codex:user:config:mcp'
        },
        {
          agentId: 'claude',
          sourcePath: join(home, '.claude.json'),
          candidateId: 'claude:user:mcp'
        },
        {
          agentId: 'pi',
          sourcePath: join(home, '.pi', 'agent', 'mcp.json'),
          candidateId: 'pi:user:mcp'
        }
      ],
      tuff: { state: 'not-imported' }
    })
    // Claude's copy sets a key the others do not; the row lists every name any copy uses.
    expect(context7[0]!.detail.envNames).toEqual(['CONTEXT7_API_KEY'])
    expect(context7[0]!.hasSecrets).toBe(true)
  })

  it('keeps a server of the same name run another way as its own row', async () => {
    const inventory = await inventoryOf()

    const github = inventory.rows.filter((row) => row.name === 'github')
    // The importer's credential rule masks the argument after any credential-looking one, so the
    // image name after `-e GITHUB_TOKEN` reads as masked too: over-masking, never under.
    expect(github.map((row) => [row.summary, row.agents.map((agent) => agent.agentId)])).toEqual([
      [`docker run --rm -e GITHUB_TOKEN ${MCP_SECRET_MASK}`, ['codex']],
      [`npx -y @modelcontextprotocol/server-github --token ${MCP_SECRET_MASK}`, ['claude']]
    ])
    expect(new Set(github.map((row) => row.key)).size).toBe(2)
  })

  it('counts each agent’s servers, most first, without counting skills', async () => {
    const inventory = await inventoryOf()

    expect(inventory.agents).toEqual([
      { agentId: 'claude', label: 'Claude Code', skillCount: null, mcpServerCount: 4 },
      { agentId: 'codex', label: 'Codex', skillCount: null, mcpServerCount: 2 },
      { agentId: 'pi', label: 'Pi', skillCount: null, mcpServerCount: 1 }
    ])
  })

  it('takes only this machine’s own configuration and leaves blocked or other kinds out', async () => {
    const inventory = await inventoryOf()

    expect(inventory.rows.map((row) => row.name)).toEqual([
      'context7',
      'figma',
      'github',
      'github',
      'pencil'
    ])
    expect(inventory.scanId).toBe('scan-machine')
    expect(inventory.unreadableSources).toEqual([])
  })

  it('reports a configuration file it could not use instead of dropping its servers silently', async () => {
    await rm(join(home, '.pi', 'agent', 'mcp.json'))
    await writeFile(join(home, '.claude.json'), '{ not json')

    const inventory = await inventoryOf()

    expect(inventory.unreadableSources).toEqual([
      { agentId: 'claude', sourcePath: join(home, '.claude.json'), reason: 'unparseable' },
      { agentId: 'pi', sourcePath: join(home, '.pi', 'agent', 'mcp.json'), reason: 'unreadable' }
    ])
    expect(inventory.rows.flatMap((row) => row.agents.map((agent) => agent.agentId))).toEqual([
      'codex',
      'codex'
    ])
  })
})

describe('MCP inventory keeps credentials in main', () => {
  it('never carries an environment value, header value, token argument or query string', async () => {
    const inventory = await inventoryOf([await importFromCodex()])
    const payload = JSON.stringify(inventory)

    for (const canary of [
      'ghp-canary-codex',
      'ghp-canary-claude',
      'ctx7-canary',
      'figma-canary',
      'canary-team'
    ])
      expect(payload).not.toContain(canary)
    // Positive control: the same fixture does carry those values on disk.
    const onDisk = `${await readFile(join(home, '.claude.json'), 'utf8')}${CODEX_CONFIG}`
    expect(onDisk).toContain('ghp-canary-claude')
    expect(onDisk).toContain('ghp-canary-codex')

    const figma = inventory.rows.find((row) => row.name === 'figma')!
    expect(figma).toMatchObject({
      transport: 'http',
      summary: 'https://mcp.figma.test/mcp',
      detail: { url: 'https://mcp.figma.test/mcp', headerNames: ['Authorization'], envNames: [] },
      hasSecrets: true
    })
    const dockerGithub = inventory.rows.find((row) => row.summary.startsWith('docker'))!
    expect(dockerGithub.detail.envNames).toEqual(['GITHUB_TOKEN'])
    expect(dockerGithub.hasSecrets).toBe(true)
    expect(inventory.rows.find((row) => row.name === 'pencil')!.hasSecrets).toBe(false)
  })

  it('masks a credential argument the same way whether read from the agent or from Tuff’s copy', async () => {
    const tokenArgs = JSON.stringify({
      mcpServers: {
        search: { command: 'search-mcp', args: ['--api-key=sk-canary-1', '--token', 'sk-canary-2'] }
      }
    })
    await writeFile(join(home, '.pi', 'agent', 'mcp.json'), tokenArgs)
    const scan = machineScan()
    const piCandidate = { ...scan.candidates[2]!, fingerprint: fingerprint(tokenArgs) }
    const transaction = await new AiImportRuntimeService().prepare(
      sandbox,
      [piCandidate],
      { scanId: scan.scanId, candidateIds: [piCandidate.id] },
      scan.sources
    )
    const item: AiImportedConfigItem = {
      ...(await importFromCodex(['context7'])),
      id: 'pi-copy',
      provider: 'pi',
      normalizedProjection: JSON.parse(JSON.stringify(transaction.items[0]!.projection))
    }

    const inventory = await inventoryOf([item])
    const search = inventory.rows.filter((row) => row.name === 'search')

    // One row: the stored copy (credentials replaced) and the file (credentials present) agree.
    expect(search).toHaveLength(1)
    expect(search[0]!.detail.args).toEqual([
      `--api-key=${MCP_SECRET_MASK}`,
      '--token',
      MCP_SECRET_MASK
    ])
    expect(search[0]!.agents.map((agent) => agent.agentId)).toEqual(['pi'])
    expect(search[0]!.tuff).toMatchObject({ origin: 'imported', provider: 'pi' })
    expect(JSON.stringify(inventory)).not.toContain('sk-canary')
  })
})

describe('MCP inventory reads agents’ files without touching them', () => {
  it('leaves every agent configuration byte-identical across a read and an import preparation', async () => {
    const before = await snapshotTree(home)

    await inventoryOf()
    // The whole file, so github's credential is migrated too. A pick naming github alone is refused
    // now: its `-e GITHUB_TOKEN` argument marks it as needing re-authentication.
    await importFromCodex()

    expect(await snapshotTree(home)).toEqual(before)
    // Positive control: the fingerprint does see a write into an agent's configuration.
    await writeFile(join(home, '.codex', 'config.toml'), `${CODEX_CONFIG}# edited\n`)
    expect(await snapshotTree(home)).not.toEqual(before)
  })
})

describe('MCP inventory with Tuff’s own copies', () => {
  it('lights the row of an imported server and leaves the file’s other servers unimported', async () => {
    const item = await importFromCodex(['context7'])

    const inventory = await inventoryOf([item])

    expect(inventory.rows.find((row) => row.name === 'context7')!.tuff).toEqual({
      state: 'enabled',
      itemId: item.id,
      profileId: mcpTuffEntries([item])[0]!.profileId,
      origin: 'imported',
      provider: 'codex'
    })
    expect(inventory.rows.find((row) => row.summary.startsWith('docker'))!.tuff).toEqual({
      state: 'not-imported'
    })
  })

  it('gives a hand-entered server its own row, switched by the item it lives in', async () => {
    const inventory = await inventoryOf([manualItem({ active: false })])

    const row = inventory.rows.find((candidate) => candidate.name === 'local-notes')!
    expect(row).toMatchObject({ agents: [], summary: 'node notes.js' })
    expect(row.tuff).toEqual({
      state: 'disabled',
      itemId: 'manual:1',
      profileId: 'manual.local-notes',
      origin: 'manual',
      provider: 'manual'
    })
  })

  it('says why a stored copy cannot run', async () => {
    const reauth = await importFromCodex(['context7'])
    const profiles = reauth.normalizedProjection!.mcpProfiles as Array<Record<string, unknown>>
    profiles[0] = { ...profiles[0], enabled: false, metadata: { reauthRequired: true } }

    const inventory = await inventoryOf([reauth])

    expect(inventory.rows.find((row) => row.name === 'context7')!.tuff).toMatchObject({
      state: 'disabled',
      blockedReason: 'reauth-required'
    })
  })
})

describe('switching one server', () => {
  function harness(items: AiImportedConfigItem[]) {
    const calls: string[] = []
    const deps: McpServerSwitchDeps = {
      listImportedItems: async () => items,
      setProfileEnabled: async (itemId, profileId, enabled) => {
        calls.push(`profile ${itemId} ${profileId} ${enabled}`)
        const item = items.find((candidate) => candidate.id === itemId)!
        const profiles = item.normalizedProjection!.mcpProfiles as Array<Record<string, unknown>>
        const others = profiles.filter((profile) => profile.id !== profileId)
        for (const profile of profiles) if (profile.id === profileId) profile.enabled = enabled
        if (enabled && !item.active) for (const profile of others) profile.enabled = false
        item.active =
          enabled || (item.active && others.some((profile) => profile.enabled !== false))
      },
      setItemActive: async (itemId, active) => {
        calls.push(`item ${itemId} ${active}`)
        items.find((candidate) => candidate.id === itemId)!.active = active
      }
    }
    return { deps, calls }
  }

  async function keyOf(name: string, items: AiImportedConfigItem[]): Promise<string> {
    return (await inventoryOf(items)).rows.find((row) => row.name === name)!.key
  }

  it('refuses a server Tuff holds no copy of — importing one is the import path’s job', async () => {
    const { deps, calls } = harness([])

    await expect(
      setMcpServerEnabled(deps, { key: await keyOf('pencil', []), enabled: true })
    ).rejects.toThrow('MCP_SERVER_NOT_IMPORTED')
    expect(calls).toEqual([])
  })

  it('switches on one copy of a server imported twice, and off every copy', async () => {
    const older = await importFromCodex(['context7'], { id: 'older', active: false, updatedAt: 1 })
    const newer = await importFromCodex(['context7'], { id: 'newer', active: false, updatedAt: 2 })
    const items = [older, newer]
    const { deps, calls } = harness(items)
    const key = await keyOf('context7', items)

    await expect(setMcpServerEnabled(deps, { key, enabled: true })).resolves.toMatchObject({
      state: 'enabled',
      itemId: 'newer'
    })
    expect(calls).toEqual([`profile newer ${mcpTuffEntries([newer])[0]!.profileId} true`])

    items[0]!.active = true
    calls.length = 0
    await expect(setMcpServerEnabled(deps, { key, enabled: false })).resolves.toMatchObject({
      state: 'disabled'
    })
    expect(calls).toHaveLength(2)
  })

  it('does nothing when the server already runs', async () => {
    const items = [await importFromCodex(['context7'])]
    const { deps, calls } = harness(items)

    await setMcpServerEnabled(deps, { key: await keyOf('context7', items), enabled: true })

    expect(calls).toEqual([])
  })

  it('refuses to switch on a copy that cannot run, and writes nothing', async () => {
    const item = await importFromCodex(['context7'], { state: 'source-missing', active: false })
    const { deps, calls } = harness([item])

    await expect(
      setMcpServerEnabled(deps, { key: await keyOf('context7', [item]), enabled: true })
    ).rejects.toThrow('MCP_SERVER_SOURCE_MISSING')
    expect(calls).toEqual([])
  })

  it('switches a hand-entered server through its item', async () => {
    const items = [manualItem({ active: false })]
    const { deps, calls } = harness(items)
    const key = await keyOf('local-notes', items)

    await expect(setMcpServerEnabled(deps, { key, enabled: true })).resolves.toMatchObject({
      state: 'enabled',
      origin: 'manual'
    })
    await setMcpServerEnabled(deps, { key, enabled: false })

    expect(calls).toEqual(['item manual:1 true', 'item manual:1 false'])
  })
})
