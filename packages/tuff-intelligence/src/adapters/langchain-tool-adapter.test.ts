import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTuffTool } from '../tools/tool-kit'
import { createDeepAgentToolsFromTuff, LangChainToolAdapter } from './index'

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

  it('creates DeepAgent structured tools from Tuff tools', () => {
    const tool = defineTuffTool({
      id: 'text.lower',
      name: 'Lowercase',
      description: 'Lowercase text.',
      inputSchema: z.object({
        text: z.string(),
      }),
      execute: input => input.text.toLowerCase(),
    })

    const tools = createDeepAgentToolsFromTuff([tool])

    expect(tools).toHaveLength(1)
    expect(tools[0]?.name).toBe('text.lower')
  })
})
