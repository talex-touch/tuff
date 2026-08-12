import type { AdaptedStructuredTool } from '@talex-touch/tuff-intelligence'
import type { AiImportedConfigItem } from '@talex-touch/utils/types/ai-orchestrator'
import type { AgentContextDeps } from './agent-context-source'
import { describe, expect, it, vi } from 'vitest'
import { createAgentContextSource } from './agent-context-source'

function item(overrides: Partial<AiImportedConfigItem> = {}): AiImportedConfigItem {
  return {
    id: 'item-1',
    candidateId: 'candidate-1',
    sourceId: 'source-1',
    provider: 'claude',
    sourceScope: 'user',
    targetScope: 'global',
    kind: 'skill',
    name: 'Release notes',
    sourceKey: 'skills/release-notes',
    contentRef: 'content/release-notes.md',
    secrets: [],
    state: 'active',
    revisionId: 'rev-1',
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

function mcpItem(
  profiles: Array<Record<string, unknown>>,
  overrides: Partial<AiImportedConfigItem> = {}
): AiImportedConfigItem {
  return item({
    id: 'mcp-item',
    kind: 'mcp',
    name: 'Imported servers',
    contentRef: undefined,
    normalizedProjection: { mcpProfiles: profiles },
    ...overrides
  })
}

function stdioProfile(id: string, name: string, enabled?: boolean): Record<string, unknown> {
  return {
    id,
    name,
    ...(enabled === undefined ? {} : { enabled }),
    transport: { type: 'stdio', command: 'npx', args: ['-y', `server-${id}`] }
  }
}

function structuredTool(
  name: string,
  metadata: Record<string, unknown> | undefined,
  riskLevel: unknown,
  description = 'Does a thing'
): AdaptedStructuredTool {
  return {
    name,
    description,
    tuffMetadata: { toolId: name, source: 'mcp', riskLevel, approvalRequired: false, metadata }
  } as unknown as AdaptedStructuredTool
}

function deps(overrides: Partial<AgentContextDeps> = {}): AgentContextDeps {
  return {
    listImportedItems: async () => [],
    readContent: async () => 'content',
    registerMcpProfile: () => undefined,
    listStructuredTools: async () => [],
    callMcpTool: async () => 'ok',
    ...overrides
  }
}

describe('imported skill reads', () => {
  it('resolves an active skill through its managed content ref', async () => {
    const readContent = vi.fn(async () => '# Release notes\nSteps…')
    const source = createAgentContextSource(
      deps({ listImportedItems: async () => [item()], readContent })
    )

    expect(await source.readSkill('item-1')).toContain('Release notes')
    expect(readContent).toHaveBeenCalledWith('content/release-notes.md')
  })

  it('refuses a path instead of an id, without touching the content store', async () => {
    const readContent = vi.fn(async () => 'secret')
    const source = createAgentContextSource(
      deps({ listImportedItems: async () => [item()], readContent })
    )

    // The only reachable content is what the user imported: a caller cannot
    // steer this at an arbitrary file by naming one.
    for (const path of ['/etc/passwd', '~/.ssh/id_rsa', '../../content/release-notes.md']) {
      await expect(source.readSkill(path)).rejects.toThrow('not an active imported skill')
    }
    expect(readContent).not.toHaveBeenCalled()
  })

  it('refuses items that are not active skills with managed content', async () => {
    const source = createAgentContextSource(
      deps({
        listImportedItems: async () => [
          item({ id: 'inactive', active: false }),
          item({ id: 'superseded', state: 'invalid' }),
          item({ id: 'a-rule', kind: 'rule' }),
          item({ id: 'no-content', contentRef: undefined })
        ]
      })
    )

    await expect(source.readSkill('inactive')).rejects.toThrow('not an active imported skill')
    await expect(source.readSkill('superseded')).rejects.toThrow('not an active imported skill')
    await expect(source.readSkill('a-rule')).rejects.toThrow('not an active imported skill')
    await expect(source.readSkill('no-content')).rejects.toThrow('no managed content')
    await expect(source.readSkill('missing')).rejects.toThrow('not an active imported skill')
  })
})

describe('MCP server availability', () => {
  it('lists profiles of active items and skips disabled ones', async () => {
    const source = createAgentContextSource(
      deps({
        listImportedItems: async () => [
          mcpItem([stdioProfile('fs', 'Filesystem'), stdioProfile('off', 'Disabled', false)]),
          mcpItem([stdioProfile('inactive', 'Inactive item')], {
            id: 'mcp-inactive',
            active: false
          }),
          item()
        ]
      })
    )

    expect(await source.listMcpServers()).toEqual([{ id: 'fs', name: 'Filesystem' }])
  })

  it('keeps one entry per server id when two items import the same server', async () => {
    const source = createAgentContextSource(
      deps({
        listImportedItems: async () => [
          mcpItem([stdioProfile('fs', 'Filesystem')]),
          mcpItem([stdioProfile('fs', 'Filesystem (project)')], { id: 'mcp-item-2' })
        ]
      })
    )

    expect(await source.listMcpServers()).toHaveLength(1)
  })

  it('refuses to list or call a server the user has not enabled', async () => {
    const callMcpTool = vi.fn(async () => 'ok')
    const source = createAgentContextSource(
      deps({
        listImportedItems: async () => [mcpItem([stdioProfile('off', 'Disabled', false)])],
        callMcpTool
      })
    )

    await expect(source.listMcpTools('off')).rejects.toThrow('is not enabled')
    await expect(source.callMcpTool('off', 'anything', {})).rejects.toThrow('is not enabled')
    await expect(source.callMcpTool('never-heard-of-it', 'x', {})).rejects.toThrow('is not enabled')
    expect(callMcpTool).not.toHaveBeenCalled()
  })
})

describe('MCP tool catalogue', () => {
  it('registers the profile before listing, and reports the server-side tool name and risk', async () => {
    const registerMcpProfile = vi.fn()
    const listStructuredTools = vi.fn(async () => [
      structuredTool(
        'mcp.fs.read_text_file',
        { profileId: 'fs', profileName: 'Filesystem', toolName: 'read_text_file' },
        'low',
        'Read a file'
      )
    ])
    const source = createAgentContextSource(
      deps({
        listImportedItems: async () => [mcpItem([stdioProfile('fs', 'Filesystem')])],
        registerMcpProfile,
        listStructuredTools
      })
    )

    expect(await source.listMcpTools('fs')).toEqual([
      {
        serverId: 'fs',
        serverName: 'Filesystem',
        name: 'read_text_file',
        description: 'Read a file',
        risk: 'low'
      }
    ])
    expect(registerMcpProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs', name: 'Filesystem' })
    )
    expect(listStructuredTools).toHaveBeenCalledWith(['fs'])
  })

  it('falls back to the composite id and never calls an unclassified tool safe', async () => {
    const source = createAgentContextSource(
      deps({
        listImportedItems: async () => [mcpItem([stdioProfile('fs', 'Filesystem')])],
        listStructuredTools: async () => [
          structuredTool('mcp.fs.write_file', undefined, undefined),
          structuredTool('bare_name', undefined, 'critical')
        ]
      })
    )

    expect(await source.listMcpTools('fs')).toMatchObject([
      { name: 'write_file', risk: 'high' },
      { name: 'bare_name', risk: 'critical' }
    ])
  })

  it('forwards a call to the registry under the resolved profile id', async () => {
    const callMcpTool = vi.fn(async () => ({ ok: true }))
    const registerMcpProfile = vi.fn()
    const source = createAgentContextSource(
      deps({
        listImportedItems: async () => [mcpItem([stdioProfile('fs', 'Filesystem')])],
        registerMcpProfile,
        callMcpTool
      })
    )

    expect(await source.callMcpTool('fs', 'read_text_file', { path: '/tmp/a' })).toEqual({
      ok: true
    })
    expect(callMcpTool).toHaveBeenCalledWith('fs', 'read_text_file', { path: '/tmp/a' })
    expect(registerMcpProfile).toHaveBeenCalledTimes(1)
  })
})
