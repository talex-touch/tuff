import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type {
  McpProbeResult,
  McpServerDeclaredProbeRequest,
  McpServerRow
} from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { AiImportScanResult } from '@talex-touch/utils/types/ai-orchestrator'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MCP_SECRET_MASK,
  McpServerEvents
} from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'

/**
 * Probing a server Tuff does not hold, through the channel the settings page calls and the wiring the
 * app uses: the real discovery scan and store on a migrated database, the agent's file in a sandbox
 * home. Only the registry — the one thing that would start a process — records what it is asked to
 * run instead.
 */

type RegistryCall = {
  call: 'register' | 'list' | 'unregister'
  id: string
  profile?: Record<string, unknown>
}

const harness = vi.hoisted(() => ({
  db: undefined as unknown,
  secureWrites: [] as string[],
  contentWrites: [] as string[],
  registered: new Map<string, Record<string, unknown>>(),
  calls: [] as RegistryCall[],
  tools: async (_profile: Record<string, unknown>): Promise<unknown[]> => [
    { name: 'resolve' },
    { name: 'query' }
  ]
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
  getSecureStoreValue: async () => null,
  setSecureStoreValue: async (_root: string, ref: string) => {
    harness.secureWrites.push(ref)
    return true
  }
}))
vi.mock('../ai-import-content-store', () => ({
  aiImportContentStore: {
    write: async (value: string) => {
      harness.contentWrites.push(value)
      return { ref: `sha256:${harness.contentWrites.length}`, created: true }
    },
    read: async () => '',
    remove: async () => undefined
  }
}))
vi.mock('../intelligence-mcp-registry', () => ({
  intelligenceMcpRegistry: {
    registerProfile: (profile: Record<string, unknown>) => {
      harness.calls.push({ call: 'register', id: String(profile.id), profile })
      harness.registered.set(String(profile.id), profile)
    },
    unregisterProfile: async (id: string) => {
      harness.calls.push({ call: 'unregister', id })
      return harness.registered.delete(id)
    },
    // Lists nothing for a profile it does not hold or holds switched off, as the real one does.
    listStructuredTools: async (ids: string[] = []) => {
      const id = ids[0] ?? ''
      harness.calls.push({ call: 'list', id })
      const profile = harness.registered.get(id)
      if (!profile || profile.enabled === false) return []
      return await harness.tools(profile)
    }
  }
}))

import { AiCliImportService } from '../ai-cli-import-service'
import { aiOrchestratorStore } from '../ai-orchestrator-store'
import { snapshotTree } from './fs-tree-snapshot'
import { buildMcpServerInventory, loadMcpDiscovery } from './mcp-inventory'
import { registerMcpInventoryChannels } from './mcp-inventory-runtime'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')

const CONTEXT7_KEY = 'canary-context7-key-7d2f'
const DOCS_KEY = 'canary-docs-header-91ab'
const DOCS_TOKEN = 'canary-docs-token-c3e0'
const GITHUB_ARG_TOKEN = 'canary-github-arg-55d1'

/** `~/.claude.json`: application state with the user's MCP servers inside. */
const CLAUDE_JSON = JSON.stringify(
  {
    numStartups: 12,
    mcpServers: {
      pencil: { command: '/Applications/Pencil.app/mcp', args: ['--app', 'desktop'] },
      context7: {
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        env: { CONTEXT7_API_KEY: CONTEXT7_KEY }
      },
      docs: {
        url: 'https://docs.example.test/mcp',
        headers: { 'X-Docs-Key': DOCS_KEY },
        bearer_token: DOCS_TOKEN
      },
      remote: { url: 'https://mcp.example.test/v1', oauth: { clientId: 'remote-client' } },
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github', '--token', GITHUB_ARG_TOKEN]
      },
      'github-env': {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        // A reference the agent resolves itself; an imported copy could not.
        env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' }
      }
    }
  },
  null,
  2
)

const hostContext = { sender: {}, eventName: 'host' } as unknown as HandlerContext
const pluginContext = {
  sender: {},
  eventName: 'plugin',
  plugin: { name: 'curious-plugin', uniqueKey: 'activation-key' }
} as unknown as HandlerContext

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

/** What the page reads: a scan of Claude Code's configuration, merged into rows. */
async function scanRows(): Promise<{ scan: AiImportScanResult; rows: McpServerRow[] }> {
  const scan = await new AiCliImportService().preview({ cwd: workspace, providerIds: ['claude'] })
  const inventory = buildMcpServerInventory({
    scanId: scan.scanId,
    discovery: await loadMcpDiscovery(scan),
    items: []
  })
  return { scan, rows: inventory.rows }
}

function rowNamed(rows: McpServerRow[], name: string): McpServerRow {
  const row = rows.find((candidate) => candidate.name === name)
  if (!row) throw new Error(`no row named ${name}`)
  return row
}

/** What the page sends for a row: the first agent file that declares it. */
function requestFor(
  scanId: string,
  row: McpServerRow,
  confirmSecrets = false
): McpServerDeclaredProbeRequest {
  return {
    scanId,
    candidateId: row.agents[0]!.candidateId,
    server: row.name,
    key: row.key,
    ...(confirmSecrets ? { confirmSecrets: true } : {})
  }
}

/** The page's channel, registered with the app's own wiring (no injected dependencies). */
function probeChannel(): (
  request: McpServerDeclaredProbeRequest,
  context?: HandlerContext
) => Promise<McpProbeResult> {
  type Handler = (payload: unknown, context: HandlerContext) => Promise<unknown>
  const handlers = new Map<string, Handler>()
  const transport = {
    on: (event: { toEventName: () => string }, handler: Handler) => {
      handlers.set(event.toEventName(), handler)
      return () => handlers.delete(event.toEventName())
    }
  } as unknown as ITuffTransportMain
  registerMcpInventoryChannels(transport)
  const handler = handlers.get(McpServerEvents.probeDeclared.toEventName())!
  return async (request, context = hostContext) =>
    (await handler(request, context)) as McpProbeResult
}

/** Every row of every table Tuff keeps, so a write anywhere shows. */
async function databaseDump(): Promise<string> {
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  const dump: Record<string, unknown[]> = {}
  for (const table of tables.rows) {
    const name = String(table.name)
    dump[name] = (await client.execute(`SELECT * FROM "${name}"`)).rows.map((row) => ({ ...row }))
  }
  return JSON.stringify(dump)
}

/** Everything written to the console while `run` runs, with a line of its own as the control. */
async function consoleDuring(run: () => Promise<void>): Promise<string> {
  const lines: string[] = []
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const
  const spies = methods.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
    })
  )
  try {
    console.warn('console-capture-control')
    await run()
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
  return lines.join('\n')
}

beforeEach(async () => {
  harness.secureWrites.length = 0
  harness.contentWrites.length = 0
  harness.registered.clear()
  harness.calls.length = 0
  harness.tools = async () => [{ name: 'resolve' }, { name: 'query' }]
  sandbox = await realpath(await mkdtemp(join(tmpdir(), 'tuff-mcp-declared-probe-')))
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
  await writeHomeFile('.claude/settings.json', '{}')
  await writeHomeFile('.claude.json', CLAUDE_JSON)
})

afterEach(async () => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  client.close()
  await rm(sandbox, { recursive: true, force: true })
})

describe('probing a server Tuff does not hold', () => {
  it('starts the one server the row shows, alone, from the agent’s file, and drops it after', async () => {
    const { scan, rows } = await scanRows()
    const probe = probeChannel()

    await expect(probe(requestFor(scan.scanId, rowNamed(rows, 'pencil')))).resolves.toEqual({
      ok: true,
      toolCount: 2
    })

    expect(harness.calls.map((entry) => entry.call)).toEqual(['register', 'list', 'unregister'])
    expect(new Set(harness.calls.map((entry) => entry.id)).size).toBe(1)
    const started = harness.calls[0]!.profile!
    expect(started).toMatchObject({
      name: 'pencil',
      enabled: true,
      transport: {
        type: 'stdio',
        command: '/Applications/Pencil.app/mcp',
        args: ['--app', 'desktop'],
        env: {}
      }
    })
    // Its own id, so it can never stand in for a server the runtime holds.
    expect(String(started.id)).toMatch(/^probe\./)
    expect(harness.registered.size).toBe(0)
  })

  it('drops the server again when it does not answer, and says so', async () => {
    const { scan, rows } = await scanRows()
    const probe = probeChannel()
    harness.tools = async () => {
      throw new Error('MCP server is unavailable.')
    }

    await expect(probe(requestFor(scan.scanId, rowNamed(rows, 'pencil')))).resolves.toEqual({
      ok: false,
      error: 'pencil: MCP server is unavailable.'
    })
    expect(harness.calls.map((entry) => entry.call)).toEqual(['register', 'list', 'unregister'])
    expect(harness.registered.size).toBe(0)
  })

  it('asks before handing a server its credentials, and starts it with them only after a yes', async () => {
    const { scan, rows } = await scanRows()
    const probe = probeChannel()
    const context7 = rowNamed(rows, 'context7')

    const asked = await probe(requestFor(scan.scanId, context7))
    expect(asked.ok).toBe(false)
    expect(asked.error).toMatch(/^AI_IMPORT_SECRET_CONFIRMATION_REQUIRED: /)
    expect(harness.calls).toEqual([])

    const probed = await probe(requestFor(scan.scanId, context7, true))
    expect(probed).toEqual({ ok: true, toolCount: 2 })
    // The value reached the process definition — the control for every "never appears" below.
    expect(harness.calls[0]!.profile).toMatchObject({
      transport: { env: { CONTEXT7_API_KEY: CONTEXT7_KEY } }
    })
    expect(JSON.stringify([asked, probed])).not.toContain(CONTEXT7_KEY)
    expect(harness.registered.size).toBe(0)
  })

  it('hands an http server its headers and token the same way, after the same question', async () => {
    const { scan, rows } = await scanRows()
    const probe = probeChannel()
    const docs = rowNamed(rows, 'docs')

    expect((await probe(requestFor(scan.scanId, docs))).error).toMatch(
      /^AI_IMPORT_SECRET_CONFIRMATION_REQUIRED: /
    )
    expect(harness.calls).toEqual([])
    expect(await probe(requestFor(scan.scanId, docs, true))).toEqual({ ok: true, toolCount: 2 })
    expect(harness.calls[0]!.profile).toMatchObject({
      transport: {
        type: 'streamable-http',
        url: 'https://docs.example.test/mcp',
        headers: { 'X-Docs-Key': DOCS_KEY, Authorization: `Bearer ${DOCS_TOKEN}` }
      }
    })
  })

  it('keeps nothing: no item, scan, content or secure-store entry, and the agent’s file untouched', async () => {
    const { scan, rows } = await scanRows()
    const probe = probeChannel()
    const homeBefore = await snapshotTree(home)
    const databaseBefore = await databaseDump()

    await probe(requestFor(scan.scanId, rowNamed(rows, 'pencil')))
    await probe(requestFor(scan.scanId, rowNamed(rows, 'context7')))
    await probe(requestFor(scan.scanId, rowNamed(rows, 'context7'), true))
    await probe(requestFor(scan.scanId, rowNamed(rows, 'github'), true))
    harness.tools = async () => {
      throw new Error('MCP server is unavailable.')
    }
    await probe(requestFor(scan.scanId, rowNamed(rows, 'docs'), true))

    expect(harness.calls.filter((entry) => entry.call === 'register')).toHaveLength(3)
    expect(await databaseDump()).toEqual(databaseBefore)
    expect(harness.secureWrites).toEqual([])
    expect(harness.contentWrites).toEqual([])
    expect(await snapshotTree(home)).toEqual(homeBefore)
    expect(harness.registered.size).toBe(0)

    // Controls: the dump does see a stored scan, and the tree does see a write.
    await scanRows()
    expect(await databaseDump()).not.toEqual(databaseBefore)
    await writeHomeFile('.claude.json', `${CLAUDE_JSON}\n`)
    expect(await snapshotTree(home)).not.toEqual(homeBefore)
  })

  it('keeps a credential out of the answer and the console even when a failure quotes it', async () => {
    const { scan, rows } = await scanRows()
    const probe = probeChannel()
    const quoted: string[] = []
    harness.tools = async (profile) => {
      const env = (profile.transport as { env?: Record<string, string> }).env ?? {}
      const message = `spawn failed with CONTEXT7_API_KEY=${env.CONTEXT7_API_KEY}`
      quoted.push(message)
      throw new Error(message)
    }

    let result: McpProbeResult | undefined
    const output = await consoleDuring(async () => {
      result = await probe(requestFor(scan.scanId, rowNamed(rows, 'context7'), true))
    })

    expect(quoted).toEqual([`spawn failed with CONTEXT7_API_KEY=${CONTEXT7_KEY}`])
    expect(result).toEqual({
      ok: false,
      error: `context7: spawn failed with CONTEXT7_API_KEY=${MCP_SECRET_MASK}`
    })
    expect(output).toContain('console-capture-control')
    expect(output).not.toContain(CONTEXT7_KEY)
    expect(harness.registered.size).toBe(0)
  })

  it('refuses what an import would refuse — OAuth, a token argument, a value kept elsewhere — unstarted', async () => {
    const { scan, rows } = await scanRows()
    const probe = probeChannel()

    for (const name of ['remote', 'github', 'github-env']) {
      const result = await probe(requestFor(scan.scanId, rowNamed(rows, name), true))
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/^MCP_SERVER_REAUTH_REQUIRED: /)
      expect(JSON.stringify(result)).not.toContain(GITHUB_ARG_TOKEN)
    }
    expect(harness.calls).toEqual([])
  })

  it('refuses a changed file, a definition the row does not show and a server no longer declared, unstarted', async () => {
    const { scan, rows } = await scanRows()
    const probe = probeChannel()
    const pencil = rowNamed(rows, 'pencil')
    const expectRefusal = async (request: McpServerDeclaredProbeRequest, code: string) => {
      const result = await probe(request)
      expect(result.ok).toBe(false)
      expect(result.error?.startsWith(`${code}: `)).toBe(true)
    }

    await expectRefusal(
      { ...requestFor(scan.scanId, pencil), key: 'mcp:other' },
      'AI_IMPORT_SOURCE_CHANGED'
    )
    await expectRefusal(
      { ...requestFor(scan.scanId, pencil), server: 'ghost' },
      'MCP_SERVER_SOURCE_MISSING'
    )
    await expectRefusal(
      { ...requestFor(scan.scanId, pencil), scanId: 'scan-gone' },
      'AI_IMPORT_SOURCE_CHANGED'
    )
    const notInScan = await probe({ ...requestFor(scan.scanId, pencil), candidateId: 'codex:mcp' })
    expect(notInScan.ok).toBe(false)

    // Claude Code rewrites its state file all the time; a file changed anywhere since the scan is
    // not the one the user was shown, as for an import.
    await writeHomeFile(
      '.claude.json',
      CLAUDE_JSON.replace('"numStartups": 12', '"numStartups": 13')
    )
    await expectRefusal(requestFor(scan.scanId, pencil), 'AI_IMPORT_SOURCE_CHANGED')
    await rm(join(home, '.claude.json'))
    await expectRefusal(requestFor(scan.scanId, pencil), 'MCP_SERVER_SOURCE_MISSING')
    expect(harness.calls).toEqual([])

    // What the page does next: scan again, and probe what the file says now.
    await writeHomeFile('.claude.json', CLAUDE_JSON)
    const fresh = await scanRows()
    await expect(
      probe(requestFor(fresh.scan.scanId, rowNamed(fresh.rows, 'pencil')))
    ).resolves.toEqual({
      ok: true,
      toolCount: 2
    })
  })

  it('refuses a plugin caller before reading the scan or starting anything', async () => {
    const { scan, rows } = await scanRows()
    const probe = probeChannel()
    const getScan = vi.spyOn(aiOrchestratorStore, 'getImportScan')

    try {
      await expect(
        probe(requestFor(scan.scanId, rowNamed(rows, 'context7'), true), pluginContext)
      ).rejects.toThrow('INTELLIGENCE_HOST_ONLY_CAPABILITY')
      expect(getScan).not.toHaveBeenCalled()
      expect(harness.calls).toEqual([])
      // Control: the same request from the host does read the scan.
      await probe(requestFor(scan.scanId, rowNamed(rows, 'pencil')))
      expect(getScan).toHaveBeenCalledTimes(1)
    } finally {
      getScan.mockRestore()
    }
  })
})
