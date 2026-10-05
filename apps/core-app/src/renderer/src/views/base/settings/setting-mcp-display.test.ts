import type { AiImportedConfigItem } from '@talex-touch/tuff-intelligence'
import type { McpServerRow } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { describe, expect, it } from 'vitest'
import {
  declaredProbeRequestFor,
  emptyManualDraft,
  enabledRowCount,
  filterMcpRows,
  importRequestFor,
  importSourceFor,
  isManualMcpServer,
  manualDraftFromItem,
  manualDraftValid,
  manualInputFromDraft,
  mcpCredentialNames,
  mcpFailureKind,
  mcpProbeTarget,
  mcpSwitchModel,
  parseCommandArgs,
  parseKeyValueLines,
  resolveMcpTransport,
  rowAgentIds
} from './setting-mcp-display'

function makeItem(overrides: Partial<AiImportedConfigItem> = {}): AiImportedConfigItem {
  return {
    id: 'item-1',
    candidateId: 'codex:mcp:filesystem',
    sourceId: 'codex-global',
    provider: 'codex',
    sourceScope: 'global',
    targetScope: 'global',
    kind: 'mcp',
    name: 'filesystem',
    sourceKey: 'mcp.filesystem',
    secrets: [],
    state: 'active',
    revisionId: 'rev-1',
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  } as AiImportedConfigItem
}

describe('setting-mcp-display', () => {
  it('summarises a stdio profile as its full command line', () => {
    const item = makeItem({
      normalizedProjection: {
        mcpProfiles: [
          {
            id: 'p1',
            name: 'filesystem',
            transport: {
              type: 'stdio',
              command: 'npx',
              args: ['@modelcontextprotocol/server-filesystem', '/tmp']
            }
          }
        ]
      }
    })

    expect(resolveMcpTransport(item)).toEqual({
      kind: 'stdio',
      detail: 'npx @modelcontextprotocol/server-filesystem /tmp'
    })
  })

  it('summarises an http profile as its url', () => {
    const item = makeItem({
      normalizedProjection: {
        mcpProfiles: [
          { id: 'p1', transport: { type: 'streamable-http', url: 'https://mcp.example.com/sse' } }
        ]
      }
    })

    expect(resolveMcpTransport(item)).toEqual({
      kind: 'streamable-http',
      detail: 'https://mcp.example.com/sse'
    })
  })

  it('falls back to unknown when the projection carries no usable profile', () => {
    expect(resolveMcpTransport(makeItem())).toEqual({ kind: 'unknown', detail: '' })
    expect(
      resolveMcpTransport(makeItem({ normalizedProjection: { mcpProfiles: 'nope' } }))
    ).toEqual({ kind: 'unknown', detail: '' })
  })

  it('tells hand-entered servers from imported ones', () => {
    expect(isManualMcpServer(makeItem())).toBe(false)
    expect(isManualMcpServer(makeItem({ sourceId: 'manual' }))).toBe(true)
    expect(isManualMcpServer(makeItem({ sourceId: 'manual:local' }))).toBe(true)
    expect(isManualMcpServer(makeItem({ candidateId: 'manual:filesystem' }))).toBe(true)
  })

  it('keeps quoted runs together when splitting arguments', () => {
    expect(parseCommandArgs('  npx  server "/Users/me/My Files" --port 3000 ')).toEqual([
      'npx',
      'server',
      '/Users/me/My Files',
      '--port',
      '3000'
    ])
    expect(parseCommandArgs('')).toEqual([])
  })

  it('parses key/value lines with either separator and skips noise', () => {
    expect(
      parseKeyValueLines(
        ['API_KEY=sk-1234', '# comment', '', 'Authorization: Bearer a:b=c', 'broken'].join('\n')
      )
    ).toEqual({
      API_KEY: 'sk-1234',
      Authorization: 'Bearer a:b=c'
    })
  })
})

function makeRow(overrides: Partial<McpServerRow> = {}): McpServerRow {
  return {
    key: 'mcp:context7',
    name: 'context7',
    transport: 'stdio',
    summary: 'npx -y @upstash/context7-mcp',
    detail: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      envNames: [],
      headerNames: []
    },
    hasSecrets: false,
    agents: [
      { agentId: 'claude', sourcePath: '/Users/me/.claude.json', candidateId: 'claude:mcp' },
      { agentId: 'codex', sourcePath: '/Users/me/.codex/config.toml', candidateId: 'codex:mcp' }
    ],
    tuff: { state: 'not-imported' },
    ...overrides
  }
}

describe('the list', () => {
  const rows = [
    makeRow(),
    makeRow({
      key: 'mcp:pencil',
      name: 'pencil',
      summary: '/Applications/Pencil.app/mcp --app desktop',
      agents: [
        { agentId: 'claude', sourcePath: '/Users/me/.claude.json', candidateId: 'claude:mcp' }
      ],
      tuff: { state: 'enabled', itemId: 'item-1', profileId: 'p-1', origin: 'imported' }
    }),
    makeRow({
      key: 'mcp:docs',
      name: 'docs',
      summary: 'https://docs.example.com/mcp',
      transport: 'http',
      agents: [],
      tuff: { state: 'disabled', itemId: 'manual:1', profileId: 'm-1', origin: 'manual' }
    })
  ]
  const agentLabel = (agentId: string) =>
    ({ claude: 'Claude Code', codex: 'Codex' })[agentId] ?? agentId

  it('lists each declaring agent once, in the order main sent', () => {
    const row = makeRow({
      agents: [
        { agentId: 'codex', sourcePath: 'a', candidateId: 'x' },
        { agentId: 'claude', sourcePath: 'b', candidateId: 'y' },
        { agentId: 'codex', sourcePath: 'c', candidateId: 'z' }
      ]
    })
    expect(rowAgentIds(row)).toEqual(['codex', 'claude'])
  })

  it('narrows to the rows an agent declares, and back to every row without a filter', () => {
    expect(
      filterMcpRows(rows, { query: '', agentId: 'codex', agentLabel }).map((row) => row.name)
    ).toEqual(['context7'])
    expect(
      filterMcpRows(rows, { query: '', agentId: 'claude', agentLabel }).map((row) => row.name)
    ).toEqual(['context7', 'pencil'])
    expect(filterMcpRows(rows, { query: '', agentId: null, agentLabel })).toHaveLength(3)
  })

  it('searches the name, the command or address, and the agents by the name they show', () => {
    const names = (query: string) =>
      filterMcpRows(rows, { query, agentId: null, agentLabel }).map((row) => row.name)
    expect(names('PENCIL')).toEqual(['pencil'])
    expect(names('upstash')).toEqual(['context7'])
    expect(names('docs.example')).toEqual(['docs'])
    expect(names('claude code')).toEqual(['context7', 'pencil'])
    expect(names('  ')).toHaveLength(3)
    expect(names('nothing-like-this')).toEqual([])
  })

  it('applies the agent filter and the search together', () => {
    expect(filterMcpRows(rows, { query: 'pencil', agentId: 'codex', agentLabel })).toEqual([])
  })

  it('counts only the rows Tuff runs', () => {
    expect(enabledRowCount(rows)).toBe(1)
  })
})

describe('the switch', () => {
  it('flips a server Tuff holds, on or off', () => {
    expect(
      mcpSwitchModel(makeRow({ tuff: { state: 'enabled', itemId: 'i', profileId: 'p' } }))
    ).toEqual({ checked: true, mode: 'toggle' })
    expect(
      mcpSwitchModel(makeRow({ tuff: { state: 'disabled', itemId: 'i', profileId: 'p' } }))
    ).toEqual({ checked: false, mode: 'toggle' })
  })

  it('imports a server Tuff does not hold, from the first file that declares it', () => {
    const row = makeRow()
    expect(mcpSwitchModel(row)).toEqual({ checked: false, mode: 'import' })
    expect(importSourceFor(row)?.candidateId).toBe('claude:mcp')
  })

  it('refuses to switch on a copy that cannot run', () => {
    for (const blockedReason of ['reauth-required', 'source-missing', 'invalid'] as const) {
      expect(
        mcpSwitchModel(
          makeRow({ tuff: { state: 'disabled', itemId: 'i', profileId: 'p', blockedReason } })
        )
      ).toEqual({ checked: false, mode: 'blocked' })
    }
    expect(mcpSwitchModel(makeRow({ agents: [] }))).toEqual({ checked: false, mode: 'blocked' })
  })

  it('imports exactly one server of one file, confirming credentials only when told to', () => {
    const row = makeRow()
    const source = importSourceFor(row)!
    expect(importRequestFor('scan-9', row, source, false)).toEqual({
      scanId: 'scan-9',
      candidateIds: ['claude:mcp'],
      mcpServers: { 'claude:mcp': { include: ['context7'] } }
    })
    expect(importRequestFor('scan-9', row, source, true)).toMatchObject({
      confirmSecretMigration: true
    })
  })

  it('names credentials, never values', () => {
    const row = makeRow({
      detail: { command: 'npx', args: [], envNames: ['API_KEY'], headerNames: ['Authorization'] }
    })
    expect(mcpCredentialNames(row)).toEqual(['API_KEY', 'Authorization'])
  })
})

describe('the probe', () => {
  it('probes a server Tuff holds through its stored copy', () => {
    for (const state of ['enabled', 'disabled'] as const) {
      expect(mcpProbeTarget(makeRow({ tuff: { state, itemId: 'i', profileId: 'p' } }))).toEqual({
        mode: 'stored',
        itemId: 'i',
        profileId: 'p'
      })
    }
  })

  it('probes a server Tuff does not hold from the first file that declares it', () => {
    expect(mcpProbeTarget(makeRow())).toEqual({
      mode: 'declared',
      source: { agentId: 'claude', sourcePath: '/Users/me/.claude.json', candidateId: 'claude:mcp' }
    })
    expect(mcpProbeTarget(makeRow({ agents: [] }))).toBeNull()
  })

  it('names one server of one file of one scan, and its credentials only when told to', () => {
    const row = makeRow()
    const source = importSourceFor(row)!
    expect(declaredProbeRequestFor('scan-9', row, source, false)).toEqual({
      scanId: 'scan-9',
      candidateId: 'claude:mcp',
      server: 'context7',
      key: 'mcp:context7'
    })
    expect(declaredProbeRequestFor('scan-9', row, source, true)).toMatchObject({
      confirmSecrets: true
    })
  })
})

describe('mcpFailureKind', () => {
  function coded(code: string): Error {
    return Object.assign(new Error(code), { code })
  }

  it.each([
    [coded('AI_IMPORT_SECRET_CONFIRMATION_REQUIRED'), 'confirmation'],
    [coded('MCP_SERVER_REAUTH_REQUIRED'), 'reauth'],
    [coded('AI_IMPORT_SOURCE_CHANGED'), 'source-changed'],
    [coded('AI_IMPORT_SECURE_STORE_UNAVAILABLE'), 'secure-store'],
    [
      new Error('MCP_SERVER_REAUTH_REQUIRED: the server needs its credentials re-entered'),
      'reauth'
    ],
    [
      new Error("MCP_SERVER_SOURCE_MISSING: the agent's configuration no longer declares it"),
      'source-missing'
    ],
    [
      new Error('MCP_SERVER_INVALID: the stored copy cannot run until it is imported again'),
      'invalid'
    ],
    [new Error('MCP_SERVER_NOT_IMPORTED: Tuff holds no copy of this server yet'), 'not-imported'],
    [
      'AI_IMPORT_SECRET_CONFIRMATION_REQUIRED: github is started with its credentials only once the user agrees',
      'confirmation'
    ],
    ['AI_IMPORT_SOURCE_CHANGED: the configuration file changed after the scan', 'source-changed'],
    ['context7: MCP server is unavailable.', 'unknown'],
    [new Error('The operation failed. Please retry.'), 'unknown'],
    [new Error('MCP_SERVER_REAUTH_REQUIREDX'), 'unknown'],
    ['MCP_SERVER_INVALID', 'invalid'],
    [undefined, 'unknown']
  ])('reads %s as %s', (error, kind) => {
    expect(mcpFailureKind(error)).toBe(kind)
  })
})

describe('the hand-entered server form', () => {
  function manualItem(transport: Record<string, unknown>): AiImportedConfigItem {
    return makeItem({
      id: 'manual:1',
      sourceId: 'manual',
      provider: 'manual' as AiImportedConfigItem['provider'],
      normalizedProjection: { mcpProfiles: [{ id: 'm-1', name: 'fs', transport }] }
    })
  }

  it('reads a stored stdio server back without splitting an argument that holds a space', () => {
    const draft = manualDraftFromItem(
      manualItem({ type: 'stdio', command: 'npx', args: ['server', '/Users/me/My Files'] }),
      'fs'
    )
    expect(draft).toMatchObject({
      itemId: 'manual:1',
      name: 'fs',
      transport: 'stdio',
      command: 'npx',
      args: 'server "/Users/me/My Files"',
      env: ''
    })
    // And the form gives the same arguments back.
    expect(manualInputFromDraft(draft)).toEqual({
      name: 'fs',
      transport: 'stdio',
      command: 'npx',
      args: ['server', '/Users/me/My Files']
    })
  })

  it('reads a stored http server back as its address, with no header values', () => {
    expect(
      manualDraftFromItem(
        manualItem({ type: 'streamable-http', url: 'https://mcp.example.com/mcp' }),
        'remote'
      )
    ).toMatchObject({
      transport: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
      headers: ''
    })
  })

  it('needs a name and a command or an address before it can be saved', () => {
    expect(manualDraftValid(emptyManualDraft())).toBe(false)
    expect(manualDraftValid({ ...emptyManualDraft(), name: 'fs', command: 'npx' })).toBe(true)
    expect(
      manualDraftValid({ ...emptyManualDraft(), name: 'remote', transport: 'streamable-http' })
    ).toBe(false)
  })

  it('sends credentials only when some were typed', () => {
    expect(
      manualInputFromDraft({
        ...emptyManualDraft(),
        name: ' remote ',
        transport: 'streamable-http',
        url: ' https://mcp.example.com/mcp ',
        headers: 'Authorization: Bearer t0ken'
      })
    ).toEqual({
      name: 'remote',
      transport: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer t0ken' }
    })
    expect(
      manualInputFromDraft({ ...emptyManualDraft(), name: 'fs', command: 'npx', env: '# none' })
    ).not.toHaveProperty('env')
  })
})
