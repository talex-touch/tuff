import { describe, expect, it, vi } from 'vitest'
import { createIntelligenceClient } from './client'

describe('tuff intelligence client hard-cut surface', () => {
  it('does not expose the retired chat alias', () => {
    const channel = {
      send: vi.fn(async () => ({ ok: true, result: null })),
    }
    const client = createIntelligenceClient(channel)

    expect('chat' in client).toBe(false)
    expect(typeof client.chatLangChain).toBe('function')
    expect(typeof client.invoke).toBe('function')
  })
})
