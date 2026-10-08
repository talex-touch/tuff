import type { AiImportedConfigItem } from '@talex-touch/utils/types/ai-orchestrator'
import type { LocalSkillDirView } from '@talex-touch/utils/transport/sdk/domains/skill-local'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agentSkillRoots, existingAgentSkillRoots } from '../agent-skill-roots'
import { localSkillId, scanLocalSkillSources } from '../skill-local-sources'
import { buildSkillInventory, SKILL_STORAGE_ROOT_IDS } from './skill-inventory'

// Real directories and real symlinks laid out the way the agents and cc-switch lay them out: the
// merge is a claim about what the filesystem does with links, and a stubbed fs would only test the
// stub. The root table is the real one too, so a renamed root id fails here rather than in the UI.
let sandbox: string
let home: string

async function writeSkill(dir: string, name: string, description: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\nBody\n`,
    'utf8'
  )
  return dir
}

async function link(target: string, at: string): Promise<void> {
  await mkdir(join(at, '..'), { recursive: true })
  await symlink(target, at, 'dir')
}

/** The directory table the runtime builds: detected agent roots, then the user's own. */
async function scanMachine(linkedDirs: string[] = [], disabledIds: string[] = []) {
  const roots = await existingAgentSkillRoots(home, {})
  const dirs: LocalSkillDirView[] = [
    ...roots.map((root) => ({ path: root.path, sourceId: root.id, auto: true, skillCount: 0 })),
    ...linkedDirs.map((path) => ({ path, sourceId: null, auto: false, skillCount: 0 }))
  ]
  const skills = await scanLocalSkillSources({
    dirs: dirs.map((dir) => dir.path),
    disabledIds
  })
  return { dirs, skills }
}

function importedSkill(overrides: Partial<AiImportedConfigItem> = {}): AiImportedConfigItem {
  return {
    id: 'claude:user:skill:abc:revision-1',
    candidateId: 'claude:user:skill:abc',
    sourceId: 'claude:user:root',
    provider: 'pi',
    sourceScope: 'user',
    targetScope: 'global',
    kind: 'skill',
    name: 'release-notes',
    sourceKey: 'skill:skills/release-notes/SKILL.md',
    contentRef: 'sha256:content',
    normalizedProjection: { description: 'Write release notes' },
    secrets: [],
    state: 'active',
    revisionId: 'revision-1',
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

beforeEach(async () => {
  sandbox = await realpath(await mkdtemp(join(tmpdir(), 'tuff-skill-inventory-')))
  home = join(sandbox, 'home')
  await mkdir(home, { recursive: true })
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('skill inventory merge (one row per real file)', () => {
  it('lists a file several agents link as one row naming all of them, stored where it really lives', async () => {
    const shared = await writeSkill(
      join(home, '.agents', 'skills', 'lark-approval'),
      'lark-approval',
      'Shared copy'
    )
    await link(shared, join(home, '.claude', 'skills', 'lark-approval'))
    await link(shared, join(home, '.pi', 'agent', 'skills', 'lark-approval'))

    const { rows } = buildSkillInventory({ ...(await scanMachine()), importedItems: [] })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      id: localSkillId(shared),
      kind: 'local',
      name: 'lark-approval',
      description: 'Shared copy',
      storage: 'agents-shared',
      storageRoot: join(home, '.agents', 'skills'),
      realPath: shared,
      sources: [
        { agentId: 'claude', entryPath: join(home, '.claude', 'skills', 'lark-approval') },
        { agentId: 'pi', entryPath: join(home, '.pi', 'agent', 'skills', 'lark-approval') }
      ],
      enabledInTuff: true
    })
  })

  it('keeps two files that only share a name as two rows, each with its own id and agents', async () => {
    const shared = await writeSkill(
      join(home, '.agents', 'skills', 'lark-approval'),
      'lark-approval',
      'Shared copy'
    )
    await link(shared, join(home, '.claude', 'skills', 'lark-approval'))
    const managed = await writeSkill(
      join(home, '.cc-switch', 'skills', 'lark-approval'),
      'lark-approval',
      'cc-switch copy'
    )
    await link(managed, join(home, '.codex', 'skills', 'lark-approval'))

    const { rows } = buildSkillInventory({
      ...(await scanMachine([], [localSkillId(managed)])),
      importedItems: []
    })

    expect(rows.map((row) => row.name)).toEqual(['lark-approval', 'lark-approval'])
    // Same name, so the shared libraries order them: cc-switch, then the ~/.agents layer.
    expect(rows.map((row) => [row.storage, row.sources.map((source) => source.agentId)])).toEqual([
      ['cc-switch', ['codex']],
      ['agents-shared', ['claude']]
    ])
    expect(rows[0]!.id).toBe(localSkillId(managed))
    expect(rows[1]!.id).toBe(localSkillId(shared))
    // One switch per file: turning the cc-switch copy off leaves the shared one on.
    expect(rows.map((row) => row.enabledInTuff)).toEqual([false, true])
  })

  it('stores a skill an agent keeps itself as local, and one linked from nowhere known as other', async () => {
    const own = await writeSkill(join(home, '.claude', 'skills', 'own-skill'), 'own-skill', 'Mine')
    const bundled = await writeSkill(
      join(sandbox, 'Applications', 'ego.app', 'skills', 'ego-browser'),
      'ego-browser',
      'Bundled'
    )
    await link(bundled, join(home, '.claude', 'skills', 'ego-browser'))

    const { rows } = buildSkillInventory({ ...(await scanMachine()), importedItems: [] })

    expect(rows.find((row) => row.name === 'own-skill')).toMatchObject({
      storage: 'local',
      storageRoot: join(home, '.claude', 'skills'),
      realPath: own,
      sources: [{ agentId: 'claude', entryPath: own }]
    })
    expect(rows.find((row) => row.name === 'ego-browser')).toMatchObject({
      storage: 'other',
      storageRoot: null,
      realPath: bundled,
      sources: [{ agentId: 'claude', entryPath: join(home, '.claude', 'skills', 'ego-browser') }]
    })
  })

  it('names no agent for a skill only storage or a linked directory holds', async () => {
    await writeSkill(join(home, '.agents', 'skills', 'only-shared'), 'only-shared', 'Unlinked')
    const linkedRoot = join(sandbox, 'tuff-skills')
    await writeSkill(join(linkedRoot, 'notes'), 'notes', 'Linked by hand')

    const { rows, agents } = buildSkillInventory({
      ...(await scanMachine([linkedRoot])),
      importedItems: []
    })

    expect(rows.find((row) => row.name === 'only-shared')).toMatchObject({
      storage: 'agents-shared',
      sources: []
    })
    expect(rows.find((row) => row.name === 'notes')).toMatchObject({
      storage: 'local',
      storageRoot: linkedRoot,
      sources: []
    })
    expect(agents).toEqual([])
  })

  it('files a library an agent links in wholesale under the directory it points at', async () => {
    const shared = await writeSkill(join(home, '.agents', 'skills', 'triage'), 'triage', 'Sort')
    await link(join(home, '.agents', 'skills'), join(home, '.claude', 'skills'))

    const { rows } = buildSkillInventory({ ...(await scanMachine()), importedItems: [] })

    expect(rows).toEqual([
      expect.objectContaining({
        realPath: shared,
        storage: 'agents-shared',
        storageRoot: join(home, '.agents', 'skills'),
        sources: [{ agentId: 'claude', entryPath: join(home, '.claude', 'skills', 'triage') }]
      })
    ])
  })

  it('lists an imported copy as its own row, owned by the agent it came from and stored in Tuff', async () => {
    const { rows } = buildSkillInventory({
      ...(await scanMachine()),
      importedItems: [
        importedSkill({ alias: 'Release notes' }),
        importedSkill({ id: 'missing', name: 'gone', state: 'source-missing', active: true }),
        importedSkill({ id: 'rule', kind: 'rule', name: 'not-a-skill' })
      ]
    })

    expect(rows).toEqual([
      {
        id: 'missing',
        kind: 'imported',
        name: 'gone',
        description: 'Write release notes',
        storage: 'tuff-import',
        storageRoot: null,
        realPath: null,
        sources: [{ agentId: 'pi', entryPath: null }],
        enabledInTuff: true,
        unavailableReason: 'source-missing'
      },
      {
        id: 'claude:user:skill:abc:revision-1',
        kind: 'imported',
        name: 'Release notes',
        description: 'Write release notes',
        storage: 'tuff-import',
        storageRoot: null,
        realPath: null,
        sources: [{ agentId: 'pi', entryPath: null }],
        enabledInTuff: true
      }
    ])
  })
})

describe('agent presence from the skill rows', () => {
  it('counts rows per agent, most first, leaves storage libraries out, and does not count MCP', async () => {
    const shared = await writeSkill(join(home, '.agents', 'skills', 'a'), 'a', '')
    await link(shared, join(home, '.claude', 'skills', 'a'))
    await link(shared, join(home, '.pi', 'agent', 'skills', 'a'))
    await writeSkill(join(home, '.claude', 'skills', 'b'), 'b', '')
    const managed = await writeSkill(join(home, '.cc-switch', 'skills', 'c'), 'c', '')
    await link(managed, join(home, '.codex', 'skills', 'c'))

    const { agents } = buildSkillInventory({
      ...(await scanMachine()),
      importedItems: [importedSkill()]
    })

    expect(agents).toEqual([
      { agentId: 'claude', label: 'Claude Code', skillCount: 2, mcpServerCount: null },
      { agentId: 'pi', label: 'Pi', skillCount: 2, mcpServerCount: null },
      { agentId: 'codex', label: 'Codex', skillCount: 1, mcpServerCount: null }
    ])
  })
})

describe('root table pin', () => {
  it('still names the storage libraries with the ids this merge treats as storage', () => {
    const ids = agentSkillRoots('/home/someone', {}).map((root) => root.id)
    // Positive control: the table is non-trivial and the agents are in it.
    expect(ids).toEqual(expect.arrayContaining(['codex', 'claude', 'pi']))
    expect(ids).toEqual(expect.arrayContaining([...SKILL_STORAGE_ROOT_IDS]))
    expect(SKILL_STORAGE_ROOT_IDS).toEqual(['cc-switch', 'agents'])
  })
})
