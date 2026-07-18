import type {
  AiImportCandidate,
  AiImportScanResult
} from '@talex-touch/utils/types/ai-orchestrator'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AiCliImportService } from './ai-cli-import-service'

const importStoreMocks = vi.hoisted(() => {
  const state = {
    activeCandidates: [] as AiImportCandidate[],
    scans: new Map<string, AiImportScanResult>()
  }
  return {
    state,
    saveImportScan: vi.fn(async (scan: AiImportScanResult) => {
      state.scans.set(scan.scanId, scan)
    }),
    listActiveImportCandidates: vi.fn(async () => state.activeCandidates),
    getImportScan: vi.fn(async (scanId: string) => state.scans.get(scanId) ?? null),
    applyPreparedImportScan: vi.fn()
  }
})

const importRuntimeMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  rollback: vi.fn(async () => undefined),
  activate: vi.fn()
}))

const importedConfigRuntimeMocks = vi.hoisted(() => ({
  refresh: vi.fn(async () => undefined)
}))

vi.mock('./ai-orchestrator-store', () => ({
  aiOrchestratorStore: importStoreMocks
}))

vi.mock('./ai-import-runtime', () => ({
  aiImportRuntimeService: importRuntimeMocks
}))

vi.mock('./ai-imported-config-runtime', () => ({
  aiImportedConfigRuntime: importedConfigRuntimeMocks
}))

const originalEnvironment = {
  HOME: process.env.HOME,
  PATH: process.env.PATH,
  CODEX_HOME: process.env.CODEX_HOME
}

function restoreEnvironment(): void {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function writeFixture(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content, 'utf8')
}

describe('aiCliImportService preview', () => {
  let fixtureRoot = ''

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-17T12:00:00.000Z'))
    vi.clearAllMocks()
    importStoreMocks.state.activeCandidates = []
    importStoreMocks.state.scans.clear()
    fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'tuff-ai-cli-import-')))
    process.env.HOME = join(fixtureRoot, 'home')
    process.env.PATH = join(fixtureRoot, 'empty-bin')
    delete process.env.CODEX_HOME
  })

  afterEach(async () => {
    restoreEnvironment()
    vi.useRealTimers()
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('discovers supported providers at normalized user and project scopes without exposing configuration secrets', async () => {
    const workspace = join(fixtureRoot, 'workspace')
    const secretValues = ['codex-api-secret-value', 'mcp-token-secret-value']

    await writeFixture(
      fixtureRoot,
      'home/.codex/config.toml',
      '[mcp_servers.review]\ncommand = "node"\napi_key = "codex-api-secret-value"\n'
    )
    await writeFixture(
      fixtureRoot,
      'workspace/.mcp.json',
      JSON.stringify({
        mcpServers: {
          local: {
            command: 'node',
            env: { API_TOKEN: 'mcp-token-secret-value' }
          }
        }
      })
    )
    await writeFixture(
      fixtureRoot,
      'workspace/.pi/skills/release/SKILL.md',
      '---\nname: release\ndescription: Prepare a release\n---\nDo not publish automatically.\n'
    )
    await writeFixture(
      fixtureRoot,
      'home/.omp/agent/commands/inspect.md',
      '---\nname: inspect\ndescription: Inspect safely\n---\n'
    )
    await writeFixture(
      fixtureRoot,
      'home/.config/opencode/agents/reviewer.md',
      '---\nname: reviewer\ndescription: Review changes\nmode: subagent\n---\n'
    )

    const service = new AiCliImportService()
    const scan = await service.preview({
      cwd: workspace,
      providerIds: ['codex', 'claude', 'pi', 'oh-my-pi', 'opencode']
    })

    const normalizedCandidates = scan.candidates.map((candidate) => ({
      provider: candidate.provider,
      scope: candidate.scope,
      kind: candidate.kind,
      sourceId: candidate.sourceId
    }))

    expect(normalizedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'codex',
          scope: 'user',
          kind: 'config',
          sourceId: expect.stringMatching(/^codex:user:/)
        }),
        expect.objectContaining({
          provider: 'claude',
          scope: 'project',
          kind: 'mcp',
          sourceId: expect.stringMatching(/^claude:project:/)
        }),
        expect.objectContaining({
          provider: 'pi',
          scope: 'project',
          kind: 'skill',
          sourceId: expect.stringMatching(/^pi:project:/)
        }),
        expect.objectContaining({
          provider: 'oh-my-pi',
          scope: 'user',
          kind: 'command',
          sourceId: expect.stringMatching(/^oh-my-pi:user:/)
        }),
        expect.objectContaining({
          provider: 'opencode',
          scope: 'user',
          kind: 'agent',
          sourceId: expect.stringMatching(/^opencode:user:/)
        })
      ])
    )

    const serializedScan = JSON.stringify(scan)
    for (const secret of secretValues) expect(serializedScan).not.toContain(secret)

    const codexConfig = scan.candidates.find(
      (candidate) =>
        candidate.provider === 'codex' && candidate.scope === 'user' && candidate.kind === 'config'
    )
    expect(codexConfig).toMatchObject({
      kind: 'config',
      sensitiveKeyPaths: expect.arrayContaining(['mcp_servers.review.api_key'])
    })

    const claudeMcp = scan.candidates.find(
      (candidate) =>
        candidate.provider === 'claude' && candidate.scope === 'project' && candidate.kind === 'mcp'
    )
    expect(claudeMcp).toMatchObject({
      kind: 'mcp',
      serverNames: ['local'],
      secretKeyPaths: ['mcpServers.local.env.API_TOKEN']
    })
    expect(importStoreMocks.saveImportScan).toHaveBeenCalledWith(scan)
  })

  it('limits discovery to requested providers while retaining both normalized source scopes', async () => {
    const workspace = join(fixtureRoot, 'workspace')
    await writeFixture(fixtureRoot, 'home/.pi/agent/AGENTS.md', 'User instructions\n')
    await writeFixture(fixtureRoot, 'workspace/.pi/settings.json', '{ "safe": true }\n')

    const scan: AiImportScanResult = await new AiCliImportService().preview({
      cwd: workspace,
      providerIds: ['pi']
    })

    expect(scan.sources).toHaveLength(2)
    expect(
      scan.sources.map((source) => ({ provider: source.provider, scope: source.scope }))
    ).toEqual([
      { provider: 'pi', scope: 'user' },
      { provider: 'pi', scope: 'project' }
    ])
    expect(scan.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'pi', scope: 'user', kind: 'instruction' }),
        expect.objectContaining({ provider: 'pi', scope: 'project', kind: 'config' })
      ])
    )
  })
  it('preserves canonical candidate identity while reporting unchanged, changed, and source-missing states', async () => {
    const workspace = join(fixtureRoot, 'workspace')
    const skillPath = 'workspace/.pi/skills/release/SKILL.md'
    await writeFixture(fixtureRoot, skillPath, '---\nname: release\n---\nReview release notes.\n')
    const service = new AiCliImportService()

    const initial = await service.preview({ cwd: workspace, providerIds: ['pi'] })
    const candidate = initial.candidates.find(
      (item) => item.kind === 'skill' && item.scope === 'project'
    )
    expect(candidate).toBeDefined()
    importStoreMocks.state.activeCandidates = [candidate!]

    const unchanged = await service.preview({ cwd: workspace, providerIds: ['pi'] })
    expect(unchanged.candidates).toContainEqual(
      expect.objectContaining({
        id: candidate!.id,
        sourceId: candidate!.sourceId,
        canonicalRootId: candidate!.canonicalRootId,
        state: 'unchanged'
      })
    )

    await writeFixture(
      fixtureRoot,
      skillPath,
      '---\nname: release\n---\nReview release artifacts and risks.\n'
    )
    const changed = await service.preview({ cwd: workspace, providerIds: ['pi'] })
    expect(changed.candidates).toContainEqual(
      expect.objectContaining({ id: candidate!.id, state: 'changed' })
    )

    await rm(join(fixtureRoot, skillPath))
    const sourceMissing = await service.preview({ cwd: workspace, providerIds: ['pi'] })
    expect(sourceMissing.candidates).toContainEqual(
      expect.objectContaining({
        id: candidate!.id,
        sourceId: candidate!.sourceId,
        state: 'source-missing',
        warnings: expect.arrayContaining(['Source item was not found during this scan'])
      })
    )
  })

  it('rolls back prepared import state when durable persistence rejects the transaction', async () => {
    const workspace = join(fixtureRoot, 'workspace')
    await writeFixture(
      fixtureRoot,
      'workspace/.pi/skills/release/SKILL.md',
      '---\nname: release\n---\nReview.\n'
    )
    const service = new AiCliImportService()
    const scan = await service.preview({ cwd: workspace, providerIds: ['pi'] })
    const candidate = scan.candidates.find(
      (item) => item.kind === 'skill' && item.scope === 'project'
    )
    if (!candidate) throw new Error('Expected project skill candidate')
    const transaction = { items: [], createdContentRefs: [], secretUndo: [] }
    importRuntimeMocks.prepare.mockResolvedValue(transaction)
    importStoreMocks.applyPreparedImportScan.mockRejectedValue(new Error('database write failed'))

    await expect(
      service.apply({ scanId: scan.scanId, candidateIds: [candidate.id] })
    ).rejects.toThrow('database write failed')

    expect(importRuntimeMocks.rollback).toHaveBeenCalledWith(transaction)
    expect(importRuntimeMocks.activate).not.toHaveBeenCalled()
  })
  it('allows an empty selection to reconcile source-missing items through the durable apply path', async () => {
    const workspace = join(fixtureRoot, 'workspace')
    const skillPath = 'workspace/.pi/skills/release/SKILL.md'
    await writeFixture(fixtureRoot, skillPath, '---\nname: release\n---\nReview.\n')
    const service = new AiCliImportService()
    const initial = await service.preview({ cwd: workspace, providerIds: ['pi'] })
    const candidate = initial.candidates.find(
      (item) => item.kind === 'skill' && item.scope === 'project'
    )
    if (!candidate) throw new Error('Expected project skill candidate')
    importStoreMocks.state.activeCandidates = [candidate]
    await rm(join(fixtureRoot, skillPath))
    const scan = await service.preview({ cwd: workspace, providerIds: ['pi'] })
    const result = {
      revisionId: 'revision-source-missing',
      imported: 0,
      unchanged: 0,
      removed: 1,
      items: []
    }
    importRuntimeMocks.prepare.mockResolvedValue({
      items: [],
      createdContentRefs: [],
      secretUndo: []
    })
    importStoreMocks.applyPreparedImportScan.mockResolvedValue(result)

    await expect(service.apply({ scanId: scan.scanId, candidateIds: [] })).resolves.toEqual(result)

    expect(importRuntimeMocks.prepare).toHaveBeenCalledWith(
      scan.cwd,
      [],
      expect.any(Object),
      scan.sources
    )
    expect(importStoreMocks.applyPreparedImportScan).toHaveBeenCalledWith(scan.scanId, [])
    expect(importedConfigRuntimeMocks.refresh).toHaveBeenCalledOnce()
  })
  it('normalizes rule frontmatter path lists and reports unknown keys without widening the rule contract', async () => {
    const workspace = join(fixtureRoot, 'workspace')
    await writeFixture(
      fixtureRoot,
      'workspace/.claude/rules/scoped.md',
      '---\nname: scoped\npaths:\n  - "src/**/*.ts"\n  - "packages/*/src/**"\nalways-apply: false\nunknown-setting: retained-for-review\n---\nApply only to scoped files.\n'
    )
    await writeFixture(
      fixtureRoot,
      'workspace/.claude/rules/inline.md',
      '---\nname: inline\npaths: ["src/**/*.tsx", "tests/**/*.ts"]\nglobs: ["docs/**/*.md", "scripts/*.ts"]\nalwaysApply: true\nowner: platform\n---\nApply to the listed files.\n'
    )

    const scan = await new AiCliImportService().preview({ cwd: workspace, providerIds: ['claude'] })
    const scoped = scan.candidates.find(
      (item) => item.kind === 'rule' && item.scope === 'project' && item.name === 'scoped'
    )
    const inline = scan.candidates.find(
      (item) => item.kind === 'rule' && item.scope === 'project' && item.name === 'inline'
    )

    expect(scoped).toMatchObject({
      globs: ['src/**/*.ts', 'packages/*/src/**'],
      alwaysApply: false,
      ignoredFields: ['unknown-setting']
    })
    expect(inline).toMatchObject({
      globs: ['src/**/*.tsx', 'tests/**/*.ts', 'docs/**/*.md', 'scripts/*.ts'],
      alwaysApply: true,
      ignoredFields: ['owner']
    })
  })
})

describe('aiCliImportService canonical ingress', () => {
  let fixtureRoot = ''

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-17T12:00:00.000Z'))
    vi.clearAllMocks()
    importStoreMocks.state.activeCandidates = []
    importStoreMocks.state.scans.clear()
    fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'tuff-ai-cli-import-ingress-')))
    process.env.HOME = join(fixtureRoot, 'home')
    process.env.PATH = join(fixtureRoot, 'empty-bin')
    delete process.env.CODEX_HOME
  })

  afterEach(async () => {
    restoreEnvironment()
    vi.useRealTimers()
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('discovers Codex project TOML as a canonical source snapshot while keeping ordinary config non-importable', async () => {
    const workspace = join(fixtureRoot, 'workspace')
    const configPath = join(workspace, '.codex', 'config.toml')
    await writeFixture(
      fixtureRoot,
      'workspace/.codex/config.toml',
      '[mcp_servers.review]\ncommand = "node"\nargs = ["review"]\nenv = { API_TOKEN = "secret" }\n'
    )

    const scan = await new AiCliImportService().preview({ cwd: workspace, providerIds: ['codex'] })
    const source = scan.sources.find(
      (item) => item.provider === 'codex' && item.scope === 'project'
    )
    const config = scan.candidates.find(
      (item) => item.kind === 'config' && item.scope === 'project'
    )
    const mcp = scan.candidates.find((item) => item.kind === 'mcp' && item.scope === 'project')

    expect(source).toMatchObject({ rootPath: workspace })
    expect(config).toMatchObject({ path: configPath, blockingIssues: expect.any(Array) })
    expect(mcp).toMatchObject({
      path: configPath,
      serverNames: ['review'],
      transportTypes: ['stdio']
    })
    await expect(
      new AiCliImportService().apply({ scanId: scan.scanId, candidateIds: [config!.id] })
    ).rejects.toThrow('Import selection contains stale, blocked, or missing candidates')
    expect(importRuntimeMocks.prepare).not.toHaveBeenCalled()
  })

  it.each([
    ['a symlink escaping the project root', 'escapes its canonical source root'],
    ['an oversized config file', 'exceeds 2097152 bytes'],
    ['a non-regular config target', 'not a regular file']
  ])('rejects %s before it can become an import candidate', async (kind, warning) => {
    const workspace = join(fixtureRoot, kind.replaceAll(' ', '-'))
    const configPath = join(workspace, '.codex', 'config.toml')
    await mkdir(join(workspace, '.codex'), { recursive: true })
    if (kind === 'a symlink escaping the project root') {
      const outside = join(fixtureRoot, 'outside.toml')
      await writeFile(outside, '[mcp_servers.outside]\ncommand = "node"\n', 'utf8')
      await symlink(outside, configPath)
    } else if (kind === 'an oversized config file') {
      await writeFile(configPath, Buffer.alloc(2 * 1024 * 1024 + 1, 'x'))
    } else {
      await mkdir(configPath)
    }

    const scan = await new AiCliImportService().preview({ cwd: workspace, providerIds: ['codex'] })
    expect(
      scan.candidates.filter((item) => item.provider === 'codex' && item.scope === 'project')
    ).toEqual([])
    expect(
      scan.sources.find((item) => item.provider === 'codex' && item.scope === 'project')?.warnings
    ).toEqual(expect.arrayContaining([expect.stringContaining(warning)]))
  })

  it('uses one file budget across all configured project skill directories', async () => {
    const workspace = join(fixtureRoot, 'workspace')
    const primary = join(workspace, '.codex', 'skills')
    await mkdir(primary, { recursive: true })
    await Promise.all(
      Array.from({ length: 2_000 }, async (_, index) => {
        const path = join(primary, `skill-${index}`, 'SKILL.md')
        await mkdir(join(path, '..'), { recursive: true })
        await writeFile(path, '---\nname: bounded\n---\n', 'utf8')
      })
    )
    await writeFixture(
      fixtureRoot,
      'workspace/.agents/skills/after-budget/SKILL.md',
      '---\nname: after\n---\n'
    )

    const scan = await new AiCliImportService().preview({ cwd: workspace, providerIds: ['codex'] })
    const skills = scan.candidates.filter(
      (item) => item.provider === 'codex' && item.scope === 'project' && item.kind === 'skill'
    )

    expect(skills).toHaveLength(2_000)
    expect(skills).not.toContainEqual(
      expect.objectContaining({
        path: join(workspace, '.agents', 'skills', 'after-budget', 'SKILL.md')
      })
    )
  })
})
