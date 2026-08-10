import { describe, expect, it, vi } from 'vitest'
import { createToolRegistry, resolveUserPath } from './tool-registry'

/**
 * The gateway keys its confirmation memory on plan.rememberKey, which falls back to the tool
 * name when a tool has no classify(). tuff_read_file is risk 'read' and therefore rememberable,
 * so a single approval with 'remember' ticked granted blanket session-wide reads of any path the
 * user can open (#643).
 */

function registry() {
  return createToolRegistry({
    agentContext: {
      listMcpTools: vi.fn(async () => [])
    }
  } as never)
}

async function rememberKeyFor(path: string): Promise<string> {
  const tool = registry().get('tuff_read_file')!
  const plan = await tool.classify!({ path })
  return plan.rememberKey
}

describe('tuff_read_file confirmation scope', () => {
  it('gives two different files two different remember keys', async () => {
    const a = await rememberKeyFor('~/notes.md')
    const b = await rememberKeyFor('~/.ssh/id_rsa')

    // The defect: both were 'tuff_read_file', so approving the first waved through the second.
    expect(a).not.toBe(b)
  })

  it('keys on the resolved path, so two spellings of one file share consent', async () => {
    const viaTilde = await rememberKeyFor('~/notes.md')
    const viaResolved = await rememberKeyFor(resolveUserPath('~/notes.md'))

    expect(viaTilde).toBe(viaResolved)
  })

  it('reports read risk so the approval prompt is unchanged', async () => {
    const tool = registry().get('tuff_read_file')!
    const plan = await tool.classify!({ path: '~/notes.md' })

    expect(plan.risk).toBe('read')
    expect(plan.summary).toContain('~/notes.md')
  })

  it('does not let unresolvable paths collapse into one shared key', async () => {
    // execute() rejects these anyway; sharing a key would let one remembered yes cover all of them.
    const a = await rememberKeyFor('')
    const b = await rememberKeyFor('   ')

    expect(a).not.toBe(b)
  })
})
