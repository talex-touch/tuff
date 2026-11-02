import type { MessageUpdateEvent } from '@talex-touch/pi-desktop-reuse/message-stream'
import { describe, expect, it } from 'vitest'
import { applyWorkspaceUpdate } from './workspace-message-stream'

describe('applyWorkspaceUpdate', () => {
  it('marks open reasoning done when text delta arrives', () => {
    const previous = {
      id: 'm1',
      role: 'assistant' as const,
      content: '',
      status: 'streaming' as const,
      parts: [{ type: 'reasoning' as const, text: 'thinking text', done: false }]
    }

    const update: MessageUpdateEvent = {
      type: 'message_update',
      stream: 'delta',
      message: { id: 'm1', role: 'assistant', content: '', createdAt: '' },
      deltaText: 'Hello from prose'
    }

    const next = applyWorkspaceUpdate(previous, update)
    expect(next?.parts).toBeDefined()
    expect(next?.parts?.[0]).toMatchObject({
      type: 'reasoning',
      text: 'thinking text',
      done: true
    })
    expect(next?.parts?.[1]).toMatchObject({
      type: 'text',
      text: 'Hello from prose'
    })
  })
})
