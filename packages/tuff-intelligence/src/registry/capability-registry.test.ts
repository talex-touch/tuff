import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTuffTool } from '../tools/tool-kit'
import { CapabilityRegistry } from './capability-registry'

describe('capability registry tool bridge', () => {
  it('registers a Tuff tool as a capability manifest', async () => {
    const registry = new CapabilityRegistry()
    const manifest = registry.registerTool(defineTuffTool({
      id: 'math.double',
      name: 'Double',
      description: 'Double a number.',
      inputSchema: z.object({
        value: z.number(),
      }),
      outputSchema: z.object({
        value: z.number(),
      }),
      execute: input => ({
        value: input.value * 2,
      }),
    }))

    expect(registry.get('math.double')).toBe(manifest)
    expect(registry.list()).toEqual([manifest])

    const result = await manifest.invoke({ value: 3 }, { sessionId: 's1' })

    expect(result).toEqual({
      ok: true,
      toolId: 'math.double',
      output: {
        value: 6,
      },
    })
  })
})
