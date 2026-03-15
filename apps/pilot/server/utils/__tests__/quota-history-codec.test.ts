import { describe, expect, it } from 'vitest'
import { extractLatestQuotaUserMessage, extractLatestQuotaUserTurn } from '../quota-history-codec'

describe('quota-history-codec', () => {
  it('extractLatestQuotaUserTurn should keep latest user text and attachments', () => {
    const turn = extractLatestQuotaUserTurn([
      {
        role: 'user',
        content: [{ type: 'text', value: 'old question' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'markdown', value: 'old answer' }],
      },
      {
        role: 'user',
        content: [
          { type: 'text', value: '(无正文内容)' },
          { type: 'image', value: 'https://example.com/image.png', name: 'image.png' },
          { type: 'file', value: 'https://example.com/doc.pdf', name: 'doc.pdf', data: 'application/pdf' },
        ],
      },
    ])

    expect(turn.text).toBe('(无正文内容)')
    expect(turn.attachments).toEqual([
      {
        type: 'image',
        value: 'https://example.com/image.png',
        name: 'image.png',
        data: undefined,
      },
      {
        type: 'file',
        value: 'https://example.com/doc.pdf',
        name: 'doc.pdf',
        data: 'application/pdf',
      },
    ])
  })

  it('extractLatestQuotaUserTurn should support string content', () => {
    const turn = extractLatestQuotaUserTurn([
      {
        role: 'user',
        content: 'hello world',
      },
    ])

    expect(turn.text).toBe('hello world')
    expect(turn.attachments).toEqual([])
  })

  it('extractLatestQuotaUserMessage should fallback to attachment value when text is empty', () => {
    const text = extractLatestQuotaUserMessage([
      {
        role: 'user',
        content: [
          { type: 'image', value: 'https://example.com/only-image.png' },
        ],
      },
    ])

    expect(text).toBe('https://example.com/only-image.png')
  })

  it('split user turns 会导致只读取最后一条 turn（文本与图片应同 turn 发送）', () => {
    const turn = extractLatestQuotaUserTurn([
      {
        role: 'user',
        content: [{ type: 'text', value: '请帮我识别这张图' }],
      },
      {
        role: 'user',
        content: [{ type: 'image', value: 'https://example.com/split-image.png' }],
      },
    ])

    expect(turn.text).toBe('')
    expect(turn.attachments).toEqual([
      {
        type: 'image',
        value: 'https://example.com/split-image.png',
        name: undefined,
        data: undefined,
      },
    ])
  })
})
