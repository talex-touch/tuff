import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTuffTool } from '@talex-touch/tuff-intelligence'
import { ToolRegistry, agentToolToTuffTool, tuffToolResultToAgentToolResult } from './tool-registry'

describe('agent ToolRegistry Tuff bridge', () => {
  it('keeps legacy registerTool and executeTool behavior', async () => {
    const registry = new ToolRegistry()
    registry.registerTool(
      {
        id: 'legacy.echo',
        name: 'Legacy Echo',
        description: 'Echo input.',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string'
            }
          },
          required: ['text']
        }
      },
      async (input) => input
    )

    await expect(
      registry.executeTool(
        'legacy.echo',
        { text: 'hello' },
        {
          taskId: 'task-1',
          agentId: 'agent-1'
        }
      )
    ).resolves.toEqual({
      success: true,
      output: {
        text: 'hello'
      }
    })
  })

  it('converts AgentTool definitions into Tuff tools', async () => {
    const executor = vi.fn(async (input) => ({
      value: (input as { value: number }).value * 2
    }))
    const tool = agentToolToTuffTool(
      {
        id: 'legacy.double',
        name: 'Double',
        description: 'Double a number.',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              type: 'number'
            }
          },
          required: ['value']
        }
      },
      executor
    )

    const result = await tool.execute(
      { value: 3 },
      {
        caller: 'agent-1',
        traceId: 'task-1'
      }
    )

    expect(executor).toHaveBeenCalledWith(
      { value: 3 },
      expect.objectContaining({
        taskId: 'task-1',
        agentId: 'agent-1'
      })
    )
    expect(result).toEqual({
      value: 6
    })
  })

  it('registers Tuff tools without replacing legacy APIs', async () => {
    const registry = new ToolRegistry()
    registry.registerTuffTool(
      defineTuffTool({
        id: 'tuff.lower',
        name: 'Lowercase',
        description: 'Lowercase text.',
        inputSchema: z.object({
          text: z.string()
        }),
        execute: (input) => ({
          text: input.text.toLowerCase()
        })
      })
    )

    await expect(
      registry.executeTool(
        'tuff.lower',
        { text: 'HELLO' },
        {
          taskId: 'task-1',
          agentId: 'agent-1'
        }
      )
    ).resolves.toEqual({
      success: true,
      output: {
        text: 'hello'
      }
    })
  })

  it('executes registered Tuff tools through ToolKit validation and approval', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const registry = new ToolRegistry()
    registry.registerTuffTool(
      defineTuffTool({
        id: 'tuff.write',
        name: 'Write',
        description: 'Write data.',
        requiresApproval: true,
        inputSchema: z.object({
          text: z.string()
        }),
        execute
      })
    )

    await expect(
      registry.executeTool(
        'tuff.write',
        { text: 'hello' },
        {
          taskId: 'task-1',
          agentId: 'agent-1'
        }
      )
    ).resolves.toMatchObject({
      success: false,
      error: 'Tool "tuff.write" requires approval.'
    })
    await expect(
      registry.executeTool(
        'tuff.write',
        { text: 1 },
        {
          taskId: 'task-1',
          agentId: 'agent-1'
        }
      )
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Input for tool "tuff.write" is invalid.')
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('maps Tuff invocation results back to Agent ToolResult', () => {
    expect(
      tuffToolResultToAgentToolResult({
        ok: true,
        toolId: 'ok',
        output: 1
      })
    ).toEqual({
      success: true,
      output: 1
    })
    expect(
      tuffToolResultToAgentToolResult({
        ok: false,
        toolId: 'fail',
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: 'boom'
        }
      })
    ).toEqual({
      success: false,
      error: 'boom'
    })
  })
})
