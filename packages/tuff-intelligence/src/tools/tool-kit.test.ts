import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  createToolKit,
  defineTuffTool,
  toCapabilityManifest,
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
      }),
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
})
