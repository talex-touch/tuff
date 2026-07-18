import type {
  AiImportSourceSnapshot,
  AiMcpImportCandidate
} from '@talex-touch/utils/types/ai-orchestrator'
import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeMocks = vi.hoisted(() => ({
  getSecureStoreValue: vi.fn(async () => undefined),
  setSecureStoreValue: vi.fn(async () => true),
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
