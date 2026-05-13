import { describe, expect, it } from 'vitest'
import { buildChatMessageContent, buildDeepAgentMessages, buildResponsesInput } from './deepagent-input'
import type { TurnState } from '../protocol/session'

function turnState(overrides: Partial<TurnState>): TurnState {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    done: false,
    seq: 1,
    messages: [],
    events: [],
    ...overrides,
  }
}

describe('deepagent input', () => {
  it('builds chat content with image and input file parts', () => {
    const content = buildChatMessageContent('Analyze', [
      {
        id: 'image-1',
        type: 'image',
        ref: 'ignored',
        dataUrl: 'data:image/png;base64,AAAA',
      },
      {
        id: 'file-1',
        type: 'file',
        ref: 'file-ref',
        name: 'brief.pdf',
        mimeType: 'application/pdf',
        dataUrl: 'data:application/pdf;base64,QUJD',
        size: 2048,
      },
    ])

    expect(content).toEqual([
      {
        type: 'text',
        text: 'Analyze\n\n[Attachment metadata]\n1. brief.pdf (application/pdf, 2.00 KB)',
      },
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,AAAA',
        },
      },
      {
        type: 'input_file',
        file_data: 'QUJD',
        filename: 'brief.pdf',
      },
    ])
  })

  it('adds attachments only to the latest user message', () => {
    const state = turnState({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'latest' },
      ],
      attachments: [
        {
          id: 'image-1',
          type: 'image',
          ref: 'https://example.test/image.png',
        },
      ],
    })

    expect(buildDeepAgentMessages(state)).toEqual([
      { type: 'user', content: 'first' },
      { type: 'assistant', content: 'ok' },
      {
        type: 'user',
        content: [
          {
            type: 'text',
            text: 'latest',
          },
          {
            type: 'image_url',
            image_url: {
              url: 'https://example.test/image.png',
            },
          },
        ],
      },
    ])
  })

  it('builds Responses input and keeps only model-eligible messages', () => {
    const state = turnState({
      messages: [
        { role: 'system', content: 'hidden system' },
        {
          role: 'system',
          content: 'allowed system',
          metadata: {
            eventType: 'system.policy',
            contextPolicy: 'allow',
          },
        },
        { role: 'assistant', content: 'assistant note' },
        { role: 'user', content: 'read this' },
      ],
      attachments: [
        {
          id: 'file-1',
          type: 'file',
          ref: 'file-ref',
          providerFileId: 'file-abc',
          name: 'context.txt',
          mimeType: 'text/plain',
          size: 12,
        },
      ],
    })

    expect(buildResponsesInput(state)).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'allowed system',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'input_text',
            text: 'assistant note',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'read this\n\n[Attachment metadata]\n1. context.txt (text/plain, 12 B)',
          },
          {
            type: 'input_file',
            file_id: 'file-abc',
            filename: 'context.txt',
          },
        ],
      },
    ])
  })
})
