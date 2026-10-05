import type {
  AiImportApplyRequest,
  AiImportCandidate,
  AiImportSourceSnapshot,
  AiMcpImportCandidate
} from '@talex-touch/utils/types/ai-orchestrator'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeMocks = vi.hoisted(() => ({
  getSecureStoreValue: vi.fn(
    async (_root: string, _ref: string, _purpose?: string): Promise<string | null | undefined> =>
      undefined
  ),
  setSecureStoreValue: vi.fn(
    async (_root: string, _ref: string, _value: string | null, _purpose?: string) => true
  ),
  writeContent: vi.fn(async () => ({ ref: 'content-ref-1', created: true })),
  removeContent: vi.fn(async () => undefined),
  registerProfile: vi.fn()
}))

vi.mock('electron', () => ({ app: {} }))
vi.mock('../../utils/app-root-path', () => ({
  resolveRuntimeRootPath: () => '/runtime-root'
}))
vi.mock('../../utils/secure-store', () => ({
  getSecureStoreValue: runtimeMocks.getSecureStoreValue,
  isSecureStoreAvailable: () => true,
  setSecureStoreValue: runtimeMocks.setSecureStoreValue
}))
vi.mock('./ai-import-content-store', () => ({
  aiImportContentStore: {
    write: runtimeMocks.writeContent,
    remove: runtimeMocks.removeContent
  }
}))
vi.mock('./intelligence-mcp-registry', () => ({
  intelligenceMcpRegistry: { registerProfile: runtimeMocks.registerProfile }
}))

import { AiImportRuntimeService } from './ai-import-runtime'

function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function candidate(path: string, content: string): AiMcpImportCandidate {
  return {
    id: 'candidate-mcp-release',
    sourceId: 'claude:project:release-root',
    provider: 'claude',
    scope: 'project',
    targetScope: 'workspace',
    canonicalRootId: 'claude:project:release-root',
    sourceKey: 'mcp:.mcp.json',
    kind: 'mcp',
    name: 'release MCP',
    path,
    fingerprint: fingerprint(content),
    state: 'added',
    warnings: [],
    ignoredFields: [],
    blockingIssues: [],
    serverNames: ['release'],
    transportTypes: ['stdio'],
    secretKeyPaths: ['mcpServers.release.env.API_TOKEN']
  }
}

function sources(rootPath: string): AiImportSourceSnapshot[] {
  return [
    {
      id: 'claude:project:release-root',
      provider: 'claude',
      label: 'Claude Code Project',
      scope: 'project',
      rootPath,
      installed: false,
      scannedAt: 0,
      fingerprint: '',
      warnings: []
    }
  ]
}

describe('AiImportRuntimeService secret migration', () => {
  let fixtureRoot = ''

  beforeEach(async () => {
    vi.clearAllMocks()
    runtimeMocks.getSecureStoreValue.mockResolvedValue(undefined)
    runtimeMocks.setSecureStoreValue.mockResolvedValue(true)
    runtimeMocks.writeContent.mockResolvedValue({ ref: 'content-ref-1', created: true })
    fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'tuff-ai-import-runtime-')))
  })

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('replaces imported MCP secrets with secure references before content or runtime profiles are exposed', async () => {
    const content = JSON.stringify({
      mcpServers: {
        release: { command: 'node', env: { API_TOKEN: 'mcp-secret-value' } }
      }
    })
    const path = join(fixtureRoot, '.mcp.json')
    await writeFile(path, content, 'utf8')

    const transaction = await new AiImportRuntimeService().prepare(
      fixtureRoot,
      [candidate(path, content)],
      {
        scanId: 'scan-release',
        candidateIds: ['candidate-mcp-release'],
        confirmSecretMigration: true
      },
      sources(fixtureRoot)
    )

    const item = transaction.items[0]!
    expect(item.secrets).toEqual([
      expect.objectContaining({
        keyPath: 'mcpServers.release.env.API_TOKEN',
        authRef: expect.any(String),
        reauthRequired: false
      })
    ])
    expect(JSON.stringify(item.projection)).not.toContain('mcp-secret-value')
    expect(item.projection).toMatchObject({
      mcpProfiles: [
        expect.objectContaining({
          transport: expect.objectContaining({
            env: {},
            envAuthRefs: { API_TOKEN: expect.any(String) }
          })
        })
      ]
    })
    expect(runtimeMocks.setSecureStoreValue).toHaveBeenCalledWith(
      '/runtime-root',
      expect.any(String),
      'mcp-secret-value',
      'ai-import-secret'
    )
  })

  it('marks externally referenced MCP credentials as reauthentication-required without copying them', async () => {
    const content = JSON.stringify({
      mcpServers: {
        release: { command: 'node', env: { API_TOKEN: '${MCP_TOKEN}' } }
      }
    })
    const path = join(fixtureRoot, '.mcp.json')
    await writeFile(path, content, 'utf8')

    const transaction = await new AiImportRuntimeService().prepare(
      fixtureRoot,
      [candidate(path, content)],
      { scanId: 'scan-release', candidateIds: ['candidate-mcp-release'] },
      sources(fixtureRoot)
    )

    const item = transaction.items[0]!
    expect(item.secrets).toEqual([
      expect.objectContaining({
        keyPath: 'mcpServers.release.env.API_TOKEN',
        authRef: undefined,
        reauthRequired: true
      })
    ])
    expect(JSON.stringify(item.projection)).not.toContain('${MCP_TOKEN}')
    expect(runtimeMocks.writeContent).toHaveBeenCalledWith(expect.stringContaining('[redacted]'))
    expect(runtimeMocks.writeContent).not.toHaveBeenCalledWith(
      expect.stringContaining('${MCP_TOKEN}')
    )
    expect(runtimeMocks.setSecureStoreValue).not.toHaveBeenCalled()
  })

  it('restores already-written secure secrets and avoids content persistence when a later secret write fails', async () => {
    const content = JSON.stringify({
      mcpServers: {
        release: {
          command: 'node',
          env: { FIRST_TOKEN: 'first-secret', SECOND_TOKEN: 'second-secret' }
        }
      }
    })
    const path = join(fixtureRoot, '.mcp.json')
    await writeFile(path, content, 'utf8')
    runtimeMocks.setSecureStoreValue
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)

    await expect(
      new AiImportRuntimeService().prepare(
        fixtureRoot,
        [candidate(path, content)],
        {
          scanId: 'scan-release',
          candidateIds: ['candidate-mcp-release'],
          confirmSecretMigration: true
        },
        sources(fixtureRoot)
      )
    ).rejects.toThrow('Failed to persist imported secret mcpServers.release.env.SECOND_TOKEN')

    expect(runtimeMocks.setSecureStoreValue).toHaveBeenLastCalledWith(
      '/runtime-root',
      expect.any(String),
      undefined,
      'ai-import-secret'
    )
    expect(runtimeMocks.writeContent).not.toHaveBeenCalled()
  })
})

describe('AiImportRuntimeService MCP transport normalization', () => {
  let fixtureRoot = ''

  beforeEach(async () => {
    vi.clearAllMocks()
    runtimeMocks.getSecureStoreValue.mockResolvedValue(undefined)
    runtimeMocks.setSecureStoreValue.mockResolvedValue(true)
    runtimeMocks.writeContent.mockResolvedValue({ ref: 'content-ref-1', created: true })
    fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'tuff-ai-import-runtime-normalize-')))
  })

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('requires explicit confirmation before copying a TOML MCP secret into secure storage', async () => {
    const content =
      '[mcp_servers.review]\ncommand = "node"\nargs = ["review"]\nenv = { API_TOKEN = "toml-secret" }\n'
    const path = join(fixtureRoot, 'config.toml')
    await writeFile(path, content, 'utf8')

    await expect(
      new AiImportRuntimeService().prepare(
        fixtureRoot,
        [candidate(path, content)],
        { scanId: 'scan-toml', candidateIds: ['candidate-mcp-release'] },
        sources(fixtureRoot)
      )
    ).rejects.toThrow('requires secret migration confirmation')

    expect(runtimeMocks.setSecureStoreValue).not.toHaveBeenCalled()
    expect(runtimeMocks.writeContent).not.toHaveBeenCalled()
  })

  it('normalizes TOML stdio MCP configuration after confirmed secret migration', async () => {
    const content =
      '[mcp_servers.review]\ncommand = "node"\nargs = ["review"]\ncwd = "/tmp/review"\nenv = { API_TOKEN = "toml-secret" }\n'
    const path = join(fixtureRoot, 'config.toml')
    await writeFile(path, content, 'utf8')

    const transaction = await new AiImportRuntimeService().prepare(
      fixtureRoot,
      [candidate(path, content)],
      {
        scanId: 'scan-toml',
        candidateIds: ['candidate-mcp-release'],
        confirmSecretMigration: true
      },
      sources(fixtureRoot)
    )

    expect(transaction.items[0]?.mcpProfiles).toEqual([
      expect.objectContaining({
        name: 'review',
        enabled: true,
        transport: expect.objectContaining({
          type: 'stdio',
          command: 'node',
          args: ['review'],
          cwd: '/tmp/review',
          env: {},
          envAuthRefs: { API_TOKEN: expect.any(String) }
        })
      })
    ])
  })

  it('maps a YAML HTTP bearer token to an authorization auth reference without exposing the token', async () => {
    const content =
      'mcpServers:\n  remote:\n    url: https://mcp.example.test\n    bearer_token: yaml-bearer-secret\n'
    const path = join(fixtureRoot, 'mcp.yaml')
    await writeFile(path, content, 'utf8')

    const transaction = await new AiImportRuntimeService().prepare(
      fixtureRoot,
      [candidate(path, content)],
      {
        scanId: 'scan-yaml',
        candidateIds: ['candidate-mcp-release'],
        confirmSecretMigration: true
      },
      sources(fixtureRoot)
    )
    const profile = transaction.items[0]?.mcpProfiles[0]

    expect(profile).toMatchObject({
      name: 'remote',
      enabled: true,
      transport: {
        type: 'streamable-http',
        url: 'https://mcp.example.test',
        headers: {},
        headerAuthRefs: { Authorization: expect.any(String) }
      }
    })
    expect(transaction.items[0]?.secrets).toEqual([
      expect.objectContaining({ keyPath: 'mcpServers.remote.bearer_token', reauthRequired: false })
    ])
    expect(JSON.stringify(transaction.items[0]?.projection)).not.toContain('yaml-bearer-secret')
  })

  it('marks YAML OAuth MCP imports reauthentication-required without migrating external credentials', async () => {
    const content =
      'mcp:\n  remote:\n    url: https://mcp.example.test\n    oauth: ${EXTERNAL_OAUTH}\n'
    const path = join(fixtureRoot, 'mcp.yml')
    await writeFile(path, content, 'utf8')

    const transaction = await new AiImportRuntimeService().prepare(
      fixtureRoot,
      [candidate(path, content)],
      { scanId: 'scan-yaml-oauth', candidateIds: ['candidate-mcp-release'] },
      sources(fixtureRoot)
    )

    expect(transaction.items[0]?.mcpProfiles).toEqual([
      expect.objectContaining({
        enabled: false,
        metadata: expect.objectContaining({ reauthRequired: true })
      })
    ])
    expect(transaction.items[0]?.secrets).toEqual([
      expect.objectContaining({
        keyPath: 'mcp.remote.oauth',
        authRef: undefined,
        reauthRequired: true
      })
    ])
    expect(runtimeMocks.setSecureStoreValue).not.toHaveBeenCalled()
    expect(JSON.stringify(transaction.items[0]?.projection)).not.toContain('${EXTERNAL_OAUTH}')
  })

  it('rejects a candidate whose preview path escapes its matched source snapshot', async () => {
    const outside = join(fixtureRoot, '..', 'outside-mcp.json')
    const content = JSON.stringify({ mcpServers: { outside: { command: 'node' } } })
    await writeFile(outside, content, 'utf8')

    await expect(
      new AiImportRuntimeService().prepare(
        fixtureRoot,
        [candidate(outside, content)],
        { scanId: 'scan-isolation', candidateIds: ['candidate-mcp-release'] },
        sources(fixtureRoot)
      )
    ).rejects.toThrow('escapes its canonical source root')

    expect(runtimeMocks.writeContent).not.toHaveBeenCalled()
  })
})

describe('AiImportRuntimeService per-server selection', () => {
  let fixtureRoot = ''
  let path = ''
  // Three servers in one file, two of them carrying credentials, plus a second MCP root the parser
  // never imports. Canaries: none of these values may reach a store unless its server was picked.
  const content = JSON.stringify({
    mcpServers: {
      context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      pencil: {
        command: 'node',
        args: ['pencil.js'],
        env: { PENCIL_TOKEN: 'pencil-secret-value' }
      },
      remote: {
        url: 'https://mcp.example.test/v1',
        headers: { 'X-Api-Key': 'remote-secret-value' }
      }
    },
    mcp: { legacy: { command: 'node', env: { LEGACY_TOKEN: 'legacy-secret-value' } } }
  })

  function prepare(request: Partial<AiImportApplyRequest>) {
    return new AiImportRuntimeService().prepare(
      fixtureRoot,
      [{ ...candidate(path, content), serverNames: ['context7', 'pencil', 'remote'] }],
      { scanId: 'scan-select', candidateIds: ['candidate-mcp-release'], ...request },
      sources(fixtureRoot)
    )
  }

  function storedContent(): string {
    return (runtimeMocks.writeContent.mock.calls as unknown as unknown[][])
      .map((call) => String(call[0]))
      .join('\n')
  }

  function securedValues(): unknown[] {
    return (runtimeMocks.setSecureStoreValue.mock.calls as unknown as unknown[][]).map(
      (call) => call[2]
    )
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    runtimeMocks.getSecureStoreValue.mockResolvedValue(undefined)
    runtimeMocks.setSecureStoreValue.mockResolvedValue(true)
    runtimeMocks.writeContent.mockResolvedValue({ ref: 'content-ref-1', created: true })
    fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'tuff-ai-import-select-')))
    path = join(fixtureRoot, '.mcp.json')
    await writeFile(path, content, 'utf8')
  })

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('imports every server of the file when no selection is given, as before', async () => {
    const transaction = await prepare({ confirmSecretMigration: true })

    expect(transaction.items[0]?.mcpProfiles.map((profile) => profile.name)).toEqual([
      'context7',
      'pencil',
      'remote'
    ])
  })

  it('imports only the picked server: no profile, secret write or stored copy of the others', async () => {
    // No confirmation: the picked server has no credential, so none is needed.
    const transaction = await prepare({
      mcpServers: { 'candidate-mcp-release': { include: ['context7'] } }
    })

    const item = transaction.items[0]!
    expect(item.mcpProfiles.map((profile) => [profile.name, profile.enabled])).toEqual([
      ['context7', true]
    ])
    expect(item.secrets).toEqual([])
    expect(runtimeMocks.setSecureStoreValue).not.toHaveBeenCalled()
    const stored = `${storedContent()}\n${JSON.stringify(item.projection)}`
    expect(stored).toContain('context7')
    for (const absent of [
      'pencil',
      'remote',
      'legacy',
      'pencil-secret-value',
      'remote-secret-value',
      'legacy-secret-value'
    ])
      expect(stored).not.toContain(absent)
  })

  it('migrates the picked server’s credentials only, and only after confirmation', async () => {
    const selection = { 'candidate-mcp-release': { include: ['pencil'] } }

    await expect(prepare({ mcpServers: selection })).rejects.toThrow(
      'requires secret migration confirmation'
    )
    expect(runtimeMocks.setSecureStoreValue).not.toHaveBeenCalled()
    expect(runtimeMocks.writeContent).not.toHaveBeenCalled()

    const transaction = await prepare({ mcpServers: selection, confirmSecretMigration: true })

    expect(securedValues()).toEqual(['pencil-secret-value'])
    expect(transaction.items[0]?.secrets).toEqual([
      expect.objectContaining({ keyPath: 'mcpServers.pencil.env.PENCIL_TOKEN' })
    ])
    expect(storedContent()).not.toContain('pencil-secret-value')
  })

  it('lands the servers it is told to keep switched off, imported but not run', async () => {
    const transaction = await prepare({
      mcpServers: {
        'candidate-mcp-release': { include: ['context7', 'pencil'], disabled: ['pencil'] }
      },
      confirmSecretMigration: true
    })

    expect(
      transaction.items[0]?.mcpProfiles.map((profile) => [profile.name, profile.enabled])
    ).toEqual([
      ['context7', true],
      ['pencil', false]
    ])
    // Switched off is still imported: its credential moved with it.
    expect(securedValues()).toEqual(['pencil-secret-value'])
  })

  it('rejects a selection that does not fit before reading a secret or writing anything', async () => {
    const misfits: Array<[AiImportApplyRequest['mcpServers'], string]> = [
      [{ 'candidate-mcp-release': { include: ['figma'] } }, 'does not declare server figma'],
      [{ 'candidate-mcp-release': { include: [] } }, 'selects no server'],
      [
        { 'candidate-mcp-release': { include: ['context7'], disabled: ['pencil'] } },
        'switches off server pencil it does not import'
      ],
      [{ 'candidate-elsewhere': { include: ['context7'] } }, 'outside this import']
    ]

    for (const [mcpServers, message] of misfits) {
      await expect(prepare({ mcpServers, confirmSecretMigration: true })).rejects.toThrow(message)
    }
    expect(runtimeMocks.setSecureStoreValue).not.toHaveBeenCalled()
    expect(runtimeMocks.writeContent).not.toHaveBeenCalled()
  })

  it('rejects a selection for a candidate that is not MCP', async () => {
    const skillPath = join(fixtureRoot, 'SKILL.md')
    await writeFile(skillPath, '---\nname: notes\n---\n', 'utf8')
    const skill = {
      ...candidate(skillPath, '---\nname: notes\n---\n'),
      id: 'candidate-skill',
      kind: 'skill',
      description: '',
      manifestPath: skillPath
    } as unknown as AiImportCandidate

    await expect(
      new AiImportRuntimeService().prepare(
        fixtureRoot,
        [skill],
        {
          scanId: 'scan-select',
          candidateIds: ['candidate-skill'],
          mcpServers: { 'candidate-skill': { include: ['notes'] } }
        },
        sources(fixtureRoot)
      )
    ).rejects.toThrow('which is not MCP')
    expect(runtimeMocks.writeContent).not.toHaveBeenCalled()
  })
})

describe('AiImportRuntimeService containment of a file kept beside its source root', () => {
  let fixtureRoot = ''
  let home = ''
  let path = ''
  const content = JSON.stringify({ mcpServers: { context7: { command: 'npx', args: ['ctx7'] } } })

  // Discovery holds `~/.claude.json` to its own directory: the source root is `~/.claude`.
  function prepare(containedBy: string | undefined, file = path) {
    return new AiImportRuntimeService().prepare(
      fixtureRoot,
      [{ ...candidate(file, content), containedBy }],
      { scanId: 'scan-contained', candidateIds: ['candidate-mcp-release'] },
      sources(join(home, '.claude'))
    )
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    runtimeMocks.getSecureStoreValue.mockResolvedValue(undefined)
    runtimeMocks.setSecureStoreValue.mockResolvedValue(true)
    runtimeMocks.writeContent.mockResolvedValue({ ref: 'content-ref-1', created: true })
    fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'tuff-ai-import-contained-')))
    home = join(fixtureRoot, 'home')
    await mkdir(join(home, '.claude'), { recursive: true })
    path = join(home, '.claude.json')
    await writeFile(path, content, 'utf8')
  })

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('reads it within the directory discovery held it to, not the source root', async () => {
    await expect(prepare(undefined)).rejects.toThrow('escapes its canonical source root')

    const transaction = await prepare(home)

    expect(transaction.items[0]?.mcpProfiles.map((profile) => profile.name)).toEqual(['context7'])
  })

  it('still refuses a file that leaves that directory', async () => {
    const outside = join(fixtureRoot, 'outside.json')
    await writeFile(outside, content, 'utf8')
    const link = join(home, 'linked.json')
    await symlink(outside, link)

    await expect(prepare(home, link)).rejects.toThrow('escapes its canonical source root')
    expect(runtimeMocks.writeContent).not.toHaveBeenCalled()
  })

  it('refuses a containment directory that is not absolute', async () => {
    await expect(prepare('home')).rejects.toThrow('has no usable containment directory')
  })
})

describe('AiImportRuntimeService picks added to the servers already held', () => {
  let fixtureRoot = ''
  let path = ''
  const stored = new Map<string, string>()
  // pencil carries a credential the importer can move; remote signs in through OAuth and github
  // passes a token by name on its command line — neither of those two can run from a copy.
  const content = JSON.stringify({
    mcpServers: {
      context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      pencil: {
        command: 'node',
        args: ['pencil.js'],
        env: { PENCIL_TOKEN: 'pencil-secret-value' }
      },
      notes: { command: 'node', args: ['notes.js'] },
      remote: { url: 'https://mcp.example.test/v1', oauth: { clientId: 'remote-client' } },
      github: {
        command: 'docker',
        args: ['run', '-e', 'GITHUB_TOKEN', 'ghcr.io/github/github-mcp-server']
      }
    }
  })

  function prepare(
    request: Partial<AiImportApplyRequest>,
    held?: Record<string, { running: boolean }>
  ) {
    return new AiImportRuntimeService().prepare(
      fixtureRoot,
      [
        {
          ...candidate(path, content),
          serverNames: ['context7', 'github', 'notes', 'pencil', 'remote']
        }
      ],
      { scanId: 'scan-held', candidateIds: ['candidate-mcp-release'], ...request },
      sources(fixtureRoot),
      held ? new Map([['candidate-mcp-release', new Map(Object.entries(held))]]) : undefined
    )
  }

  function pick(include: string[]): Partial<AiImportApplyRequest> {
    return { mcpServers: { 'candidate-mcp-release': { include } } }
  }

  function switches(transaction: Awaited<ReturnType<typeof prepare>>) {
    return transaction.items[0]?.mcpProfiles.map((profile) => [profile.name, profile.enabled])
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    stored.clear()
    runtimeMocks.getSecureStoreValue.mockImplementation(
      async (_root, ref) => stored.get(ref) ?? null
    )
    runtimeMocks.setSecureStoreValue.mockImplementation(async (_root, ref, value) => {
      if (value) stored.set(ref, value)
      else stored.delete(ref)
      return true
    })
    runtimeMocks.writeContent.mockResolvedValue({ ref: 'content-ref-1', created: true })
    fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'tuff-ai-import-held-')))
    path = join(fixtureRoot, '.mcp.json')
    await writeFile(path, content, 'utf8')
  })

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('keeps each held server with its switch, and asks nothing for a credential already held', async () => {
    await prepare({ ...pick(['context7', 'pencil']), confirmSecretMigration: true })
    expect([...stored.values()]).toEqual(['pencil-secret-value'])
    runtimeMocks.setSecureStoreValue.mockClear()

    const transaction = await prepare(pick(['notes']), {
      context7: { running: true },
      pencil: { running: false }
    })

    expect(switches(transaction)).toEqual([
      ['context7', true],
      ['pencil', false],
      ['notes', true]
    ])
    // Its credential stays referenced, so the commit keeps it in the secure store.
    expect(transaction.items[0]?.secrets).toEqual([
      expect.objectContaining({
        keyPath: 'mcpServers.pencil.env.PENCIL_TOKEN',
        authRef: [...stored.keys()][0]
      })
    ])
    expect(runtimeMocks.setSecureStoreValue).not.toHaveBeenCalled()
    expect(transaction.secretUndo).toEqual([])
  })

  it('turns a picked server on even when it was held switched off', async () => {
    const transaction = await prepare(pick(['context7']), {
      context7: { running: false },
      notes: { running: false }
    })

    expect(switches(transaction)).toEqual([
      ['context7', true],
      ['notes', false]
    ])
  })

  it('leaves out a held server it cannot carry: one needing re-authentication, one no longer declared', async () => {
    const transaction = await prepare(pick(['notes']), {
      context7: { running: true },
      remote: { running: false },
      github: { running: false },
      'removed-from-file': { running: true }
    })

    expect(switches(transaction)).toEqual([
      ['context7', true],
      ['notes', true]
    ])
    expect(transaction.items[0]?.secrets).toEqual([])
  })

  it('refuses a pick naming a server that needs re-authentication, before a secret is read', async () => {
    for (const blocked of [['context7', 'remote'], ['github']]) {
      await expect(
        prepare({ ...pick(blocked), confirmSecretMigration: true }, { context7: { running: true } })
      ).rejects.toThrow(
        `MCP_SERVER_REAUTH_REQUIRED: MCP candidate candidate-mcp-release selects ${blocked.at(-1)}`
      )
    }
    expect(runtimeMocks.getSecureStoreValue).not.toHaveBeenCalled()
    expect(runtimeMocks.setSecureStoreValue).not.toHaveBeenCalled()
    expect(runtimeMocks.writeContent).not.toHaveBeenCalled()
  })

  it('asks again for a held credential whose value changed, and undoes to the old one', async () => {
    await prepare({ ...pick(['pencil']), confirmSecretMigration: true })
    const [reference] = [...stored.keys()]
    stored.set(reference!, 'pencil-old-value')

    await expect(prepare(pick(['context7']), { pencil: { running: true } })).rejects.toThrow(
      'requires secret migration confirmation for pencil'
    )
    expect(stored.get(reference!)).toBe('pencil-old-value')

    const transaction = await prepare(
      { ...pick(['context7']), confirmSecretMigration: true },
      { pencil: { running: true } }
    )
    expect(stored.get(reference!)).toBe('pencil-secret-value')
    expect(transaction.secretUndo).toEqual([
      { authRef: reference, previousValue: 'pencil-old-value' }
    ])
  })
})
