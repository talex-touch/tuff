import { describe, expect, it, vi } from 'vitest'
import { createIntelligenceClient } from '../intelligence/client'
import { intelligence } from '../plugin/sdk/intelligence'

describe('intelligence client hard-cut surface', () => {
  it('does not expose the retired client chat alias', () => {
    const channel = {
      send: vi.fn(async () => ({ ok: true, result: null })),
    }
    const client = createIntelligenceClient(channel)

    expect('chat' in client).toBe(false)
    expect(typeof client.chatLangChain).toBe('function')
    expect(typeof client.invoke).toBe('function')
  })

  it('does not expose the retired plugin intelligence chat alias', () => {
    expect('chat' in intelligence).toBe(false)
    expect(typeof intelligence.invoke).toBe('function')
  })
})
