import type { AgentContextSource, McpToolEntry } from './agent-context-source'
import type { ToolDefinition } from './tool-registry'
import { describe, expect, it, vi } from 'vitest'
import { createToolRegistry, mcpRiskToToolRisk } from './tool-registry'

function agentContext(overrides: Partial<AgentContextSource> = {}): AgentContextSource {
  return {
    readSkill: async () => 'skill body',
    listMcpServers: async () => [],
    listMcpTools: async () => [],
    callMcpTool: async () => 'result',
    ...overrides
  }
}

function registryWith(context: Partial<AgentContextSource>): Map<string, ToolDefinition> {
  return createToolRegistry({
    searchFiles: async () => [],
    openPath: async () => '',
    agentContext: agentContext(context)
  })
}

function toolEntry(overrides: Partial<McpToolEntry> = {}): McpToolEntry {
  return {
    serverId: 'fs',
    serverName: 'Filesystem',
    name: 'read_text_file',
    description: 'Read a file',
    risk: 'low',
    ...overrides
  }
}

describe('MCP risk mapping', () => {
  it('promotes only server-declared read-only tools to the rememberable tier', () => {
    expect(mcpRiskToToolRisk('low')).toBe('read')
    expect(mcpRiskToToolRisk('medium')).toBe('execute')
    expect(mcpRiskToToolRisk('high')).toBe('execute')
    expect(mcpRiskToToolRisk('critical')).toBe('execute')
  })
})

describe('tuff_skill_read', () => {
  it('returns the managed skill body', async () => {
    const readSkill = vi.fn(async () => '# Release notes')
    const result = await registryWith({ readSkill }).get('tuff_skill_read')!.execute({ id: 'sk-1' })

    expect(result).toEqual({ output: '# Release notes', isError: false })
    expect(readSkill).toHaveBeenCalledWith('sk-1')
  })

  it('reports an unavailable skill to the model instead of throwing', async () => {
    const result = await registryWith({
      readSkill: async () => {
        throw new Error('Skill "x" is not an active imported skill')
      }
    })
      .get('tuff_skill_read')!
      .execute({ id: 'x' })

    expect(result).toMatchObject({ isError: true })
    expect(result.output).toContain('not an active imported skill')
  })

  it('requires an id rather than guessing', async () => {
    expect(await registryWith({}).get('tuff_skill_read')!.execute({})).toMatchObject({
      isError: true
    })
  })

  it('caps a runaway skill file instead of flooding the context', async () => {
    const result = await registryWith({ readSkill: async () => 'x'.repeat(200 * 1024) })
      .get('tuff_skill_read')!
      .execute({ id: 'sk-1' })

    expect(result.isError).toBe(false)
    expect(result.output.length).toBeLessThan(70 * 1024)
    expect(result.output).toContain('truncated')
  })
})

describe('tuff_mcp_list_tools', () => {
  it('prompts rather than errors when no server is enabled', async () => {
    const result = await registryWith({}).get('tuff_mcp_list_tools')!.execute({})

    expect(result.isError).toBe(false)
    expect(result.output).toContain('No MCP servers are enabled')
  })

  it('lists each tool with the confirmation tier it will ask for', async () => {
    const result = await registryWith({
      listMcpServers: async () => [{ id: 'fs', name: 'Filesystem' }],
      listMcpTools: async () => [
        toolEntry(),
        toolEntry({ name: 'write_file', description: 'Write a file', risk: 'critical' })
      ]
    })
      .get('tuff_mcp_list_tools')!
      .execute({})

    expect(result.isError).toBe(false)
    expect(result.output.split('\n')).toEqual([
      'server\ttool\tconfirmation\tdescription',
      'fs\tread_text_file\tread\tRead a file',
      'fs\twrite_file\texecute\tWrite a file'
    ])
  })

  it('marks one unreachable server without losing the others', async () => {
    const result = await registryWith({
      listMcpServers: async () => [
        { id: 'fs', name: 'Filesystem' },
        { id: 'broken', name: 'Broken' },
        { id: 'empty', name: 'Empty' }
      ],
      listMcpTools: async (serverId) => {
        if (serverId === 'broken') throw new Error('spawn npx ENOENT')
        if (serverId === 'empty') return []
        return [toolEntry()]
      }
    })
      .get('tuff_mcp_list_tools')!
      .execute({})

    expect(result.isError).toBe(false)
    expect(result.output).toContain('fs\tread_text_file')
    expect(result.output).toContain('broken\tunavailable: spawn npx ENOENT')
    expect(result.output).toContain('empty\t(no tools)')
  })
})

describe('tuff_mcp_call', () => {
  const listMcpTools = async (): Promise<McpToolEntry[]> => [
    toolEntry(),
    toolEntry({ name: 'write_file', risk: 'high' }),
    toolEntry({ name: 'delete_file', risk: 'critical' })
  ]

  it('inherits the proxied tool risk and scopes the approval to that tool', async () => {
    const call = registryWith({ listMcpTools }).get('tuff_mcp_call')!

    expect(await call.classify!({ server: 'fs', tool: 'read_text_file' })).toEqual({
      risk: 'read',
      summary: 'Filesystem / read_text_file',
      rememberKey: 'tuff_mcp_call:fs/read_text_file'
    })
    expect(await call.classify!({ server: 'fs', tool: 'write_file' })).toMatchObject({
      risk: 'execute',
      rememberKey: 'tuff_mcp_call:fs/write_file'
    })
  })

  it('marks a destructive tool on the confirmation card', async () => {
    const call = registryWith({ listMcpTools }).get('tuff_mcp_call')!
    const plan = await call.classify!({ server: 'fs', tool: 'delete_file' })

    expect(plan.summary.startsWith('⚠ ')).toBe(true)
    expect(plan.summary).toContain('Filesystem / delete_file')
    expect(plan.risk).toBe('execute')
  })

  it('asks every time when the server cannot vouch for the tool', async () => {
    const unreachable = registryWith({
      listMcpTools: async () => {
        throw new Error('connection refused')
      }
    }).get('tuff_mcp_call')!
    expect(await unreachable.classify!({ server: 'fs', tool: 'read_text_file' })).toMatchObject({
      risk: 'execute',
      summary: 'fs / read_text_file'
    })

    const unknownTool = registryWith({ listMcpTools }).get('tuff_mcp_call')!
    expect(await unknownTool.classify!({ server: 'fs', tool: 'invented' })).toMatchObject({
      risk: 'execute'
    })
  })

  it('forwards the call and serialises a structured result', async () => {
    const callMcpTool = vi.fn(async () => ({ entries: ['a', 'b'] }))
    const result = await registryWith({ callMcpTool })
      .get('tuff_mcp_call')!
      .execute({ server: 'fs', tool: 'list_dir', args: { path: '/tmp' } })

    expect(result.isError).toBe(false)
    expect(JSON.parse(result.output)).toEqual({ entries: ['a', 'b'] })
    expect(callMcpTool).toHaveBeenCalledWith('fs', 'list_dir', { path: '/tmp' })
  })

  it('defaults missing arguments to an empty object and reports failures', async () => {
    const callMcpTool = vi.fn(async () => 'plain text')
    const registry = registryWith({ callMcpTool })

    expect(await registry.get('tuff_mcp_call')!.execute({ server: 'fs', tool: 'now' })).toEqual({
      output: 'plain text',
      isError: false
    })
    expect(callMcpTool).toHaveBeenCalledWith('fs', 'now', {})

    expect(await registry.get('tuff_mcp_call')!.execute({ tool: 'now' })).toMatchObject({
      isError: true
    })

    const failing = await registryWith({
      callMcpTool: async () => {
        throw new Error('tool exploded')
      }
    })
      .get('tuff_mcp_call')!
      .execute({ server: 'fs', tool: 'now' })
    expect(failing).toMatchObject({ isError: true })
    expect(failing.output).toContain('tool exploded')
  })
})
