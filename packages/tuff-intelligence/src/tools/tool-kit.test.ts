import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  createToolKit,
  defineTuffTool,
  toCapabilityManifest,
  toToolManifest,
} from './tool-kit'

describe('tuff intelligence tool kit', () => {
  it('defines and registers a typed tool', () => {
    const tool = defineTuffTool({
      id: 'math.add',
      name: 'Add',
      description: 'Add two numbers.',
      inputSchema: z.object({
        a: z.number(),
        b: z.number(),
      }),
      outputSchema: z.object({
        sum: z.number(),
      }),
      execute: input => ({
        sum: input.a + input.b,
      }),
    })
    const kit = createToolKit()

    const registered = kit.register(tool)

    expect(registered.source).toBe('builtin')
    expect(registered.riskLevel).toBe('low')
    expect(kit.get('math.add')).toBe(registered)
    expect(kit.list()).toEqual([registered])
  })

  it('rejects duplicate tool ids', () => {
    const kit = createToolKit()
    const tool = defineTuffTool({
      id: 'math.add',
      name: 'Add',
      description: 'Add two numbers.',
      inputSchema: z.object({}),
      execute: () => ({}),
    })

    kit.register(tool)

    expect(() => kit.register(tool)).toThrow('Tool "math.add" is already registered.')
  })

  it('invokes a low-risk tool successfully', async () => {
    const kit = createToolKit()
    kit.register(defineTuffTool({
      id: 'text.upper',
      name: 'Uppercase',
      description: 'Uppercase text.',
      inputSchema: z.object({
        text: z.string(),
      }),
      outputSchema: z.object({
        text: z.string(),
      }),
      execute: (input, context) => ({
        text: `${input.text}:${context.sessionId}`,
      }),
    }))

    const result = await kit.invoke('text.upper', { text: 'hello' }, { sessionId: 's1' })

    expect(result).toEqual({
      ok: true,
      toolId: 'text.upper',
      output: {
        text: 'hello:s1',
      },
    })
  })

  it('returns input validation errors without executing the tool', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const kit = createToolKit()
    kit.register(defineTuffTool({
      id: 'input.strict',
      name: 'Strict input',
      description: 'Requires a string.',
      inputSchema: z.object({
        value: z.string(),
      }),
      execute,
    }))

    const result = await kit.invoke('input.strict', { value: 1 })

    expect(execute).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('TOOL_INPUT_INVALID')
  })

  it('returns output validation errors', async () => {
    const kit = createToolKit()
    kit.register(defineTuffTool({
      id: 'output.strict',
      name: 'Strict output',
      description: 'Requires boolean output.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        ok: z.boolean(),
      }),
      execute: () => ({
        ok: 'yes',
      }) as never,
    }))

    const result = await kit.invoke('output.strict', {})

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('TOOL_OUTPUT_INVALID')
  })

  it('returns not found for missing tools', async () => {
    const kit = createToolKit()

    const result = await kit.invoke('missing.tool', {})

    expect(result).toMatchObject({
      ok: false,
      toolId: 'missing.tool',
      error: {
        code: 'TOOL_NOT_FOUND',
      },
    })
  })

  it('blocks approval-required tools with the default gate', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const kit = createToolKit()
    kit.register(defineTuffTool({
      id: 'file.write',
      name: 'Write file',
      description: 'Write a file.',
      requiresApproval: true,
      inputSchema: z.object({
        path: z.string(),
      }),
      execute,
    }))

    const result = await kit.invoke('file.write', { path: '/tmp/example.txt' })

    expect(execute).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('TOOL_APPROVAL_DENIED')
  })

  it('blocks high-risk tools with the default gate', async () => {
    const execute = vi.fn(async () => ({ deleted: true }))
    const kit = createToolKit()
    kit.register(defineTuffTool({
      id: 'file.delete',
      name: 'Delete file',
      description: 'Delete a file.',
      riskLevel: 'high',
      inputSchema: z.object({
        path: z.string(),
      }),
      execute,
    }))

    const result = await kit.invoke('file.delete', { path: '/tmp/example.txt' })

    expect(execute).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('TOOL_APPROVAL_DENIED')
  })

  it('returns structured errors when approval gates fail', async () => {
    const kit = createToolKit({
      approvalGate: async () => {
        throw new Error('approval backend unavailable')
      },
    })
    kit.register(defineTuffTool({
      id: 'file.write',
      name: 'Write file',
      description: 'Write a file.',
      inputSchema: z.object({}),
      execute: () => ({ ok: true }),
    }))

    const result = await kit.invoke('file.write', {})

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      code: 'TOOL_EXECUTION_FAILED',
      message: 'approval backend unavailable',
    })
  })

  it('allows high-risk tools through a custom approval gate', async () => {
    const approvalGate = vi.fn(async request => ({
      approved: request.toolId === 'file.delete',
      metadata: {
        approvedBy: 'test',
      },
    }))
    const kit = createToolKit({ approvalGate })
    kit.register(defineTuffTool({
      id: 'file.delete',
      name: 'Delete file',
      description: 'Delete a file.',
      riskLevel: 'critical',
      inputSchema: z.object({
        path: z.string(),
      }),
      outputSchema: z.object({
        deleted: z.boolean(),
      }),
      execute: () => ({
        deleted: true,
      }),
    }))

    const result = await kit.invoke('file.delete', { path: '/tmp/example.txt' }, { caller: 'tester' })

    expect(approvalGate).toHaveBeenCalledWith(expect.objectContaining({
      toolId: 'file.delete',
      riskLevel: 'critical',
      requiresApproval: true,
      context: {
        caller: 'tester',
      },
    }))
    expect(result).toEqual({
      ok: true,
      toolId: 'file.delete',
      output: {
        deleted: true,
      },
    })
  })

  it('converts a tool into a capability manifest', async () => {
    const tool = defineTuffTool({
      id: 'text.echo',
      name: 'Echo',
      description: 'Echo text.',
      inputSchema: z.object({
        text: z.string(),
      }),
      outputSchema: z.object({
        text: z.string(),
      }),
      execute: input => ({
        text: input.text,
      }),
    })

    const capability = toCapabilityManifest(tool)
    const result = await capability.invoke({ text: 'hello' }, { sessionId: 's1' })

    expect(capability.id).toBe('text.echo')
    expect(capability.annotations?.readOnly).toBe(true)
    expect(result).toEqual({
      ok: true,
      toolId: 'text.echo',
      output: {
        text: 'hello',
      },
    })
  })

  it('keeps capability manifests on the default approval gate', async () => {
    const tool = defineTuffTool({
      id: 'file.delete',
      name: 'Delete file',
      description: 'Delete a file.',
      riskLevel: 'critical',
      inputSchema: z.object({ path: z.string() }),
      execute: () => ({ deleted: true }),
    })

    const capability = toCapabilityManifest(tool)
    const result = await capability.invoke({ path: '/tmp/example.txt' }, { sessionId: 's1' })

    expect(capability.annotations?.requiresApproval).toBe(true)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('TOOL_APPROVAL_DENIED')
  })

  it('allows capability manifests to use a caller-provided approval gate', async () => {
    const tool = defineTuffTool({
      id: 'file.delete',
      name: 'Delete file',
      description: 'Delete a file.',
      riskLevel: 'critical',
      inputSchema: z.object({ path: z.string() }),
      execute: () => ({ deleted: true }),
    })

    const capability = toCapabilityManifest(tool, {
      approvalGate: () => ({ approved: true }),
    })
    const result = await capability.invoke({ path: '/tmp/example.txt' }, { sessionId: 's1' })

    expect(result).toEqual({
      ok: true,
      toolId: 'file.delete',
      output: { deleted: true },
    })
  })

  it('builds safe tool manifests and filters by discovery metadata', () => {
    const kit = createToolKit()
    const searchTool = kit.register(defineTuffTool({
      id: 'search.files',
      name: 'Search files',
      description: 'Search local files.',
      source: 'mcp',
      riskLevel: 'medium',
      tags: ['search', 'files'],
      examples: [
        {
          input: { query: 'readme' },
          description: 'Find README files.',
        },
      ],
      inputSchema: z.object({
        query: z.string(),
      }),
      execute: () => [],
    }))
    kit.register(defineTuffTool({
      id: 'file.delete',
      name: 'Delete file',
      description: 'Delete a file.',
      riskLevel: 'critical',
      inputSchema: z.object({
        path: z.string(),
      }),
      execute: () => ({ deleted: true }),
    }))

    const manifest = toToolManifest(searchTool)

    expect('execute' in manifest).toBe(false)
    expect(manifest).toMatchObject({
      id: 'search.files',
      source: 'mcp',
      riskLevel: 'medium',
      requiresApproval: false,
      tags: ['search', 'files'],
    })
    expect(kit.listManifests({ tags: ['search'], source: 'mcp' })).toHaveLength(1)
    expect(kit.listManifests({ requiresApproval: true })).toEqual([
      expect.objectContaining({
        id: 'file.delete',
      }),
    ])
  })
})
