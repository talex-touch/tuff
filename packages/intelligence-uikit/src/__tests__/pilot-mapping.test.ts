import { describe, expect, it } from 'vitest'
import {
  mapPilotChatBlocksToAiBlocks,
  mapPilotChatMessageToAiMessage,
  TxPilotConversation,
  TxPilotMessage,
} from '../pilot'

describe('pilot mapping', () => {
  it('maps pilot blocks to ai rich blocks', () => {
    const blocks = mapPilotChatBlocksToAiBlocks([
      { type: 'markdown', value: '**hello**' },
      { type: 'tool', name: 'search', status: 'running', value: { query: 'tuff' } },
      { type: 'unknown-card', name: 'custom', data: 'payload' },
      { type: 'error', value: 'failed', status: 'error' },
    ])

    expect(blocks).toEqual([
      expect.objectContaining({ id: 'markdown-0', type: 'markdown', content: '**hello**' }),
      expect.objectContaining({ id: 'tool-1', type: 'tool', name: 'search' }),
      expect.objectContaining({ id: 'card-2', type: 'card', name: 'custom', content: 'payload' }),
      expect.objectContaining({ id: 'error-3', type: 'error', content: 'failed', status: 'error' }),
    ])
  })

  it('maps pilot message to ai message', () => {
    const message = mapPilotChatMessageToAiMessage({
      id: 'm1',
      role: 'assistant',
      timestamp: 123,
      value: [{ type: 'text', value: 'hello' }],
    })

    expect(message).toEqual(expect.objectContaining({
      id: 'm1',
      role: 'assistant',
      createdAt: 123,
    }))
    expect(message.blocks?.[0]).toEqual(expect.objectContaining({ type: 'text', content: 'hello' }))
  })

  it('exports pilot component aliases', () => {
    expect(TxPilotConversation).toBeTruthy()
    expect(TxPilotMessage).toBeTruthy()
  })
})
