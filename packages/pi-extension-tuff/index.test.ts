import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const source = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8')

interface RegisteredTool {
  name: string
  label: string
  description: string
  promptSnippet: string
  parameters: { properties?: Record<string, unknown>, required?: string[] }
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>
}

/**
 * The gateway address is read at module load, so each case re-imports the
 * extension with the environment it wants to describe.
 */
async function loadTools(env: { url?: string, token?: string } = {}): Promise<RegisteredTool[]> {
  vi.resetModules()
  vi.stubEnv('TUFF_TOOL_GATEWAY_URL', env.url ?? 'http://127.0.0.1:1/invoke')
  vi.stubEnv('TUFF_TOOL_GATEWAY_TOKEN', env.token ?? 'test-token')

  const registered: RegisteredTool[] = []
  const module = await import('./index')
  module.default({ registerTool: tool => registered.push(tool as RegisteredTool) })
  return registered
}

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * A live `pi 0.83` run proved the executor is called as
 * `(toolCallId, params, …)`. Reading that as `(args)` handed the call id to the
 * tool as its parameters and every call failed argument validation — a bug no
 * unit test caught because nothing here owns pi's signature. These assertions
 * pin the shape so a refactor cannot quietly go back to the wrong one.
 */
describe('pi extension executor contract', () => {
  it('takes the tool call id first and the model arguments second', () => {
    expect(source).toContain('execute: (toolCallId, params) =>')
    expect(source).not.toMatch(/execute:\s*args\s*=>/)
  })

  it('forwards both the call id and the arguments to the gateway', () => {
    expect(source).toContain('JSON.stringify({ tool, callId, args })')
  })

  it('registers nothing without the gateway environment', async () => {
    // A plain `pi` run outside Tuff must not advertise tools it cannot reach.
    expect(source).toMatch(/if \(!GATEWAY_URL \|\| !GATEWAY_TOKEN\)\s+return/)
    expect(await loadTools({ url: '', token: '' })).toHaveLength(0)
  })

  it('keeps every registered executor on pi\'s two-argument shape', async () => {
    const tools = await loadTools()
    expect(tools.length).toBeGreaterThan(0)
    for (const tool of tools) expect(tool.execute).toHaveLength(2)
  })
})

describe('skills and MCP tools', () => {
  it('exposes skill reads and the MCP bridge', async () => {
    const names = (await loadTools()).map(tool => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['tuff_skill_read', 'tuff_mcp_list_tools', 'tuff_mcp_call']),
    )
  })

  it('tells the model to discover MCP tools before calling one', async () => {
    const tools = await loadTools()
    const list = tools.find(tool => tool.name === 'tuff_mcp_list_tools')!
    const call = tools.find(tool => tool.name === 'tuff_mcp_call')!

    // The catalogue is deferred: it changes with the user's settings, so a
    // model that skips discovery would be calling tools that may not exist.
    expect(list.description).toContain('before tuff_mcp_call')
    expect(list.description).toContain('never assume a tool exists')
    expect(call.description).toContain('tuff_mcp_list_tools')
    expect(call.parameters.required).toEqual(['server', 'tool'])
    expect(Object.keys(call.parameters.properties ?? {})).toEqual(['server', 'tool', 'args'])
  })

  it('takes a skill id, never a path', async () => {
    const skill = (await loadTools()).find(tool => tool.name === 'tuff_skill_read')!

    expect(skill.parameters.required).toEqual(['id'])
    expect(Object.keys(skill.parameters.properties ?? {})).toEqual(['id'])
    expect(skill.description).toContain('not a file reader')
  })
})

describe('plugin feature tools', () => {
  it('pairs feature discovery with invocation', async () => {
    const tools = await loadTools()
    const list = tools.find(tool => tool.name === 'tuff_list_features')!
    const invoke = tools.find(tool => tool.name === 'tuff_invoke_feature')!

    // Same deferred shape as the MCP pair: the catalogue moves with the user's
    // installed plugins, so a model that skips discovery invents feature ids.
    expect(list.description).toContain('before tuff_invoke_feature')
    expect(list.description).toContain('never assume a feature exists')
    expect(invoke.description).toContain('tuff_list_features')
    expect(invoke.parameters.required).toEqual(['plugin', 'feature'])
    expect(Object.keys(invoke.parameters.properties ?? {})).toEqual(['plugin', 'feature', 'text'])
  })

  it('warns that invocation is neither silent nor free', async () => {
    const invoke = (await loadTools()).find(tool => tool.name === 'tuff_invoke_feature')!

    // Two things the model cannot infer from the schema: the call runs a third
    // party's code behind a prompt, and a UI feature answers on screen only.
    expect(invoke.description).toContain('asks the user every single time')
    expect(invoke.description).toContain('opens_ui=yes')
  })
})
