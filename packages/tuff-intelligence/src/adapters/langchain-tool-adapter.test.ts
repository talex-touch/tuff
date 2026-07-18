import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTuffTool } from '../tools/tool-kit'
import { LangChainToolAdapter } from './index'

describe('langChainToolAdapter Tuff tool bridge', () => {
  it('adapts a Tuff tool and keeps metadata', async () => {
    const tool = defineTuffTool({
      id: 'text.echo',
      name: 'Echo',
      description: 'Echo text.',
      source: 'mcp',
      riskLevel: 'medium',
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

    const adapted = LangChainToolAdapter.fromTuffTool(tool)
    const result = await adapted.invoke({ text: 'hello' })

    expect(adapted.name).toBe('text.echo')
    expect(adapted.tuffMetadata).toMatchObject({
      toolId: 'text.echo',
      source: 'mcp',
      riskLevel: 'medium',
      approvalRequired: false,
    })
    expect(result).toEqual({
      ok: true,
      toolId: 'text.echo',
      output: {
        text: 'hello',
      },
    })
  })

  it('returns ToolKit approval results', async () => {
    const tool = defineTuffTool({
      id: 'file.delete',
      name: 'Delete file',
      description: 'Delete a file.',
      riskLevel: 'critical',
      inputSchema: z.object({
        path: z.string(),
      }),
      execute: () => ({
        deleted: true,
      }),
    })

    const adapted = LangChainToolAdapter.fromTuffTool(tool)

    expect(await adapted.invoke({ path: '/tmp/demo' })).toMatchObject({
      ok: false,
      error: {
        code: 'TOOL_APPROVAL_DENIED',
      },
    })
  })

  it('adapts a batch while forwarding approval context', async () => {
    const lowercase = defineTuffTool({
      id: 'text.lower',
      name: 'Lowercase',
      description: 'Lowercase text.',
      inputSchema: z.object({
        text: z.string(),
      }),
      execute: input => input.text.toLowerCase(),
    })
    const deleteFile = defineTuffTool({
      id: 'file.delete',
      name: 'Delete file',
      description: 'Delete a file.',
      riskLevel: 'critical',
      inputSchema: z.object({
        path: z.string(),
      }),
      execute: input => ({ deleted: input.path }),
    })
    const approvalGate = vi.fn(async () => ({ approved: true }))

    const tools = LangChainToolAdapter.fromTuffTools([lowercase, deleteFile], {
      approvalGate,
      context: { sessionId: 'batch-session', caller: 'agent-runtime' },
    })

    await expect(tools[0]?.invoke({ text: 'HELLO' })).resolves.toEqual({
      ok: true,
      toolId: 'text.lower',
      output: 'hello',
    })
    await expect(tools[1]?.invoke({ path: '/tmp/demo' })).resolves.toEqual({
      ok: true,
      toolId: 'file.delete',
      output: { deleted: '/tmp/demo' },
    })
    expect(tools.map(tool => tool.name)).toEqual(['text.lower', 'file.delete'])
    expect(tools[1]?.tuffMetadata).toMatchObject({
      toolId: 'file.delete',
      approvalRequired: true,
    })
    expect(approvalGate).toHaveBeenCalledWith(expect.objectContaining({
      toolId: 'file.delete',
      input: { path: '/tmp/demo' },
      context: { sessionId: 'batch-session', caller: 'agent-runtime' },
      requiresApproval: true,
    }))
  })
})
