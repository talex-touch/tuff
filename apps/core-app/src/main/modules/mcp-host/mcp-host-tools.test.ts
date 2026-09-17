/**
 * The rows `tuff_list_skills` hands to an external model.
 *
 * A tab-separated table is only readable while every row has the same columns,
 * and this is the one place Tuff's own filesystem scan is turned into text a
 * stranger's model reads — so both halves (the local scan and the imported
 * config) are stubbed here and their row shapes asserted as data.
 */

import type { LocalSkillEntry } from '../ai/skill-local-sources'
import type { ToolDefinition } from '../tool-gateway/tool-registry'
import type { McpHostImportedSkill } from './mcp-host-tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A path no caller is entitled to: it must never survive projection. */
const CANARY = '/Users/someone/secret-skills'

const localSkills = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('../ai/skill-local-sources', () => ({
  listEnabledLocalSkills: localSkills.list
}))

import { createMcpHostToolset } from './mcp-host-tools'

function localSkill(overrides: Partial<LocalSkillEntry> = {}): LocalSkillEntry {
  return {
    id: 'local:abc123def456',
    name: 'triage',
    description: 'Sort the inbox',
    path: '/Users/dev/tuff-skills/triage',
    manifestPath: '/Users/dev/tuff-skills/triage/SKILL.md',
    sourceDir: '/Users/dev/tuff-skills',
    enabled: true,
    ...overrides
  }
}

function importedSkill(overrides: Partial<McpHostImportedSkill> = {}): McpHostImportedSkill {
  return { id: 'skill-1', name: 'notes', description: 'take notes', ...overrides }
}

interface ListSkillsOptions {
  local?: LocalSkillEntry[] | Error
  imported?: McpHostImportedSkill[] | Error
}

function readError(value: unknown): Error | null {
  return value instanceof Error ? value : null
}

async function listSkills(options: ListSkillsOptions = {}): Promise<string> {
  const localFailure = readError(options.local)
  localSkills.list.mockImplementation(async () => {
    if (localFailure) throw localFailure
    return options.local ?? []
  })

  const importedFailure = readError(options.imported)
  const toolset = createMcpHostToolset({
    registry: new Map<string, ToolDefinition>(),
    listImportedSkills: async () => {
      if (importedFailure) throw importedFailure
      return (options.imported as McpHostImportedSkill[] | undefined) ?? []
    }
  })

  const tool = toolset.resolve('tuff_list_skills')
  if (!tool) throw new Error('tuff_list_skills was not exposed')
  const result = await tool.execute({})
  return result.output
}

/** The output split back into the columns it claims to have. */
function rowsOf(output: string): string[][] {
  return output.split('\n').map((line) => line.split('\t'))
}

beforeEach(() => {
  localSkills.list.mockReset()
})

describe('tuff_list_skills rows', () => {
  it('keeps a linked skill and an imported skill in the same four columns', async () => {
    const output = await listSkills({
      local: [localSkill()],
      imported: [importedSkill()]
    })
    const rows = rowsOf(output)

    expect(rows[0]).toEqual(['id', 'source', 'name', 'description'])
    // The regression this pins: an earlier version appended a marker to the
    // linked row, which shifted its name and description one column right.
    expect(rows[1]).toEqual(['local:abc123def456', 'linked', 'triage', 'Sort the inbox'])
    expect(rows[2]).toEqual(['skill-1', 'imported', 'notes', 'take notes'])
  })

  it('gives every row exactly four columns and names its source', async () => {
    const output = await listSkills({
      local: [localSkill(), localSkill({ id: 'local:bbb', name: 'review' })],
      imported: [importedSkill(), importedSkill({ id: 'skill-2', name: 'deploy' })]
    })
    const rows = rowsOf(output)

    expect(rows).toHaveLength(5)
    for (const row of rows) {
      expect(row).toHaveLength(4)
    }
    expect(rows.slice(1).map((row) => row[1])).toEqual(['linked', 'linked', 'imported', 'imported'])
  })

  it.each([
    {
      case: 'the local scan',
      options: { imported: [importedSkill()] },
      failedSource: 'linked'
    },
    {
      case: 'the imported config',
      options: { local: [localSkill()] },
      failedSource: 'imported'
    }
  ])(
    'keeps a failure in $case to one row that leaks no path',
    async ({ options, failedSource }) => {
      const failure = Object.assign(new Error(`EACCES: permission denied, scandir '${CANARY}'`), {
        code: 'EACCES'
      })
      const wired =
        failedSource === 'linked'
          ? { ...options, local: failure }
          : { ...options, imported: failure }

      const output = await listSkills(wired)
      const rows = rowsOf(output)

      expect(output).not.toContain(CANARY)
      expect(output).not.toContain('EACCES')
      // The healthy half still lists: one unreadable source is not an empty list.
      const healthy = rows.find(
        (row) => row[1] === (failedSource === 'linked' ? 'imported' : 'linked')
      )
      expect(healthy).toBeDefined()

      const degraded = rows.find(
        (row) => row[1] === failedSource && row[3]?.startsWith('unavailable:')
      )
      expect(degraded).toBeDefined()
      expect(degraded).toHaveLength(4)
    }
  )
})
