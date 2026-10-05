import type { IntelligenceCapabilityConfig } from '@talex-touch/tuff-intelligence'
import type { SkillInventoryRow } from '@talex-touch/utils/transport/sdk/domains/skill-local'
import { describe, expect, it } from 'vitest'
import {
  builtinDraftDirty,
  builtinSkillChannelSummary,
  draftPrompt,
  draftReorder,
  draftSetModels,
  enabledSkillCount,
  filterBuiltinSkills,
  filterSkillRows,
  mergeBuiltinDraft,
  normalizeBuiltinDraft,
  parentDirectory,
  sharedNames,
  skillAgentIds,
  sortBuiltinSkills,
  STORAGE_LABEL_KEYS,
  storageHint
} from './setting-skills-display'

function capability(overrides: Partial<IntelligenceCapabilityConfig> = {}) {
  return {
    id: 'text.chat',
    label: '对话',
    description: 'Talk to a model',
    providers: [
      { providerId: 'nexus', enabled: true, priority: 1, models: ['gpt-4o-mini'] },
      { providerId: 'openai', enabled: true, priority: 2, models: [] }
    ],
    promptTemplate: 'Be brief.',
    ...overrides
  } as IntelligenceCapabilityConfig
}

function skill(overrides: Partial<SkillInventoryRow> & Pick<SkillInventoryRow, 'id' | 'name'>) {
  return {
    kind: 'local',
    description: '',
    storage: 'local',
    storageRoot: null,
    realPath: `/skills/${overrides.name}`,
    sources: [],
    enabledInTuff: true,
    ...overrides
  } as SkillInventoryRow
}

describe('built-in skills', () => {
  it('keeps the order people reach for them in, ranking unknown ones by keyword', () => {
    const order = sortBuiltinSkills([
      capability({ id: 'audio.asr', label: '语音识别' }),
      capability({ id: 'custom.code-lint', label: 'Code lint' }),
      capability({ id: 'text.translate', label: '翻译' }),
      capability({ id: 'text.chat', label: '对话' }),
      capability({ id: 'zzz', label: 'Unknown' })
    ]).map((entry) => entry.id)
    expect(order).toEqual(['text.chat', 'text.translate', 'custom.code-lint', 'audio.asr', 'zzz'])
  })

  it('searches the id, the name and the description', () => {
    const list = [
      capability({ id: 'text.chat', label: '对话', description: 'Talk' }),
      capability({ id: 'vision.ocr', label: '文字识别', description: 'Read text in images' })
    ]
    expect(filterBuiltinSkills(list, 'OCR').map((entry) => entry.id)).toEqual(['vision.ocr'])
    expect(filterBuiltinSkills(list, 'images').map((entry) => entry.id)).toEqual(['vision.ocr'])
    expect(filterBuiltinSkills(list, '对话').map((entry) => entry.id)).toEqual(['text.chat'])
    expect(filterBuiltinSkills(list, '  ')).toHaveLength(2)
  })

  it('summarises the first channel in priority order, its model and how many follow', () => {
    const name = (id: string) => ({ nexus: 'Nexus', openai: 'OpenAI' })[id] ?? id
    expect(builtinSkillChannelSummary(capability(), name)).toEqual({
      channel: 'Nexus',
      model: 'gpt-4o-mini',
      more: 1
    })
    expect(
      builtinSkillChannelSummary(
        capability({
          providers: [
            { providerId: 'openai', enabled: true, priority: 2 },
            { providerId: 'nexus', enabled: false, priority: 1, models: ['x'] }
          ]
        }),
        name
      )
    ).toEqual({ channel: 'OpenAI', model: null, more: 0 })
    expect(builtinSkillChannelSummary(capability({ providers: [] }), name)).toBeNull()
  })
})

describe('local skills', () => {
  const rows = [
    skill({
      id: 'local:1',
      name: 'lark-approval',
      storage: 'cc-switch',
      sources: [{ agentId: 'codex', entryPath: '/h/.codex/skills/lark-approval' }]
    }),
    skill({
      id: 'local:2',
      name: 'lark-approval',
      storage: 'agents-shared',
      sources: [
        { agentId: 'claude', entryPath: '/h/.claude/skills/lark-approval' },
        { agentId: 'pi', entryPath: '/h/.pi/skills/lark-approval' },
        { agentId: 'claude', entryPath: '/h/.claude/plugins/lark-approval' }
      ]
    }),
    skill({
      id: 'local:3',
      name: 'apple-design',
      description: 'Fluid motion',
      enabledInTuff: false
    })
  ]
  const agentLabel = (id: string) => ({ codex: 'Codex', claude: 'Claude Code', pi: 'Pi' })[id] ?? id
  const storageLabel = (kind: string) =>
    ({ 'cc-switch': 'cc-switch 库', 'agents-shared': '~/.agents 共享层' })[kind] ?? '本地'

  it('names each agent once, in scan order', () => {
    expect(skillAgentIds(rows[1]!)).toEqual(['claude', 'pi'])
  })

  it('narrows to an agent’s skills and back to every row without a filter', () => {
    const names = (agentId: string | null) =>
      filterSkillRows(rows, { query: '', agentId, agentLabel, storageLabel }).map((row) => row.id)
    expect(names('codex')).toEqual(['local:1'])
    expect(names('pi')).toEqual(['local:2'])
    expect(names(null)).toEqual(['local:1', 'local:2', 'local:3'])
  })

  it('searches the name, description, agents and where the file is stored', () => {
    const ids = (query: string) =>
      filterSkillRows(rows, { query, agentId: null, agentLabel, storageLabel }).map((row) => row.id)
    expect(ids('APPLE')).toEqual(['local:3'])
    expect(ids('fluid')).toEqual(['local:3'])
    expect(ids('claude code')).toEqual(['local:2'])
    expect(ids('cc-switch')).toEqual(['local:1'])
  })

  it('counts the skills Tuff offers', () => {
    expect(enabledSkillCount(rows)).toBe(2)
  })

  it('has a label for every storage kind', () => {
    expect(Object.keys(STORAGE_LABEL_KEYS).sort()).toEqual(
      ['agents-shared', 'cc-switch', 'local', 'other', 'tuff-import'].sort()
    )
  })

  it('tells same-named rows apart by real path, and says where "elsewhere" is', () => {
    const shared = sharedNames(rows)
    expect([...shared]).toEqual(['lark-approval'])

    // Two rows named lark-approval: each label hints at its own file.
    expect(storageHint(rows[0]!, shared.has(rows[0]!.name), 'Kept in Tuff')).toBe(
      '/skills/lark-approval'
    )
    // A unique name in a known place needs no hint.
    expect(storageHint(rows[2]!, shared.has(rows[2]!.name), 'Kept in Tuff')).toBeNull()
    // "Elsewhere" always names the directory holding the skill.
    const elsewhere = skill({
      id: 'local:9',
      name: 'ai-effects-x',
      storage: 'other',
      realPath: '/Users/me/.omp/agent/managed-skills/ai-effects-x'
    })
    expect(storageHint(elsewhere, false, 'Kept in Tuff')).toBe(
      '/Users/me/.omp/agent/managed-skills'
    )
    // A shared name on a copy kept in Tuff, which has no path on disk.
    const copy = skill({ id: 'imported-1', name: 'x', storage: 'tuff-import', realPath: null })
    expect(storageHint(copy, true, 'Kept in Tuff')).toBe('Kept in Tuff')
  })

  it('finds the parent directory on either separator', () => {
    expect(parentDirectory('/a/b/c/')).toBe('/a/b')
    expect(parentDirectory('C:\\Users\\me\\skills\\x')).toBe('C:\\Users\\me\\skills')
    expect(parentDirectory('x')).toBe('x')
  })
})

describe('the built-in skill draft', () => {
  it('shows the draft over the stored skill without touching it', () => {
    const stored = capability()
    const draft = draftPrompt({}, 'Be thorough.')
    expect(mergeBuiltinDraft(stored, draft).promptTemplate).toBe('Be thorough.')
    expect(stored.promptTemplate).toBe('Be brief.')
  })

  it('forgets a change that was changed back, so nothing is left to save', () => {
    const stored = capability()
    let draft = draftPrompt({}, 'Be thorough.')
    expect(builtinDraftDirty(normalizeBuiltinDraft(stored, draft))).toBe(true)
    draft = draftPrompt(draft, 'Be brief.')
    expect(normalizeBuiltinDraft(stored, draft)).toEqual({})

    const models = draftSetModels(stored, {}, 'nexus', ['gpt-4o'])
    expect(builtinDraftDirty(normalizeBuiltinDraft(stored, models))).toBe(true)
    const back = draftSetModels(stored, models, 'nexus', [' gpt-4o-mini '])
    expect(normalizeBuiltinDraft(stored, back)).toEqual({})
  })

  it('treats a channel switched on and back off as no change at all', () => {
    const stored = capability()
    const original = stored.providers ?? []
    const withOllama = [
      ...original,
      { providerId: 'ollama', enabled: true, priority: original.length + 1, models: [] }
    ]

    let draft = draftReorder({}, withOllama)
    expect(
      mergeBuiltinDraft(stored, draft).providers?.map((binding) => binding.providerId)
    ).toEqual(['nexus', 'openai', 'ollama'])
    expect(builtinDraftDirty(normalizeBuiltinDraft(stored, draft))).toBe(true)

    draft = draftReorder(draft, [...original])
    expect(normalizeBuiltinDraft(stored, draft)).toEqual({})
  })

  it('records a reorder as the user’s order', () => {
    const stored = capability()
    const reversed = [...(stored.providers ?? [])].reverse()
    const draft = normalizeBuiltinDraft(stored, draftReorder({}, reversed))
    expect(draft.providers?.map((binding) => binding.providerId)).toEqual(['openai', 'nexus'])
    expect(draft.userReordered).toBe(true)
    expect(mergeBuiltinDraft(stored, draft).metadata).toMatchObject({ userReordered: true })
  })
})
