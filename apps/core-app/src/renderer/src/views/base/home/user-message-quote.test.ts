import { describe, expect, it } from 'vitest'
import { parseQuotedUserMessage } from './user-message-quote'

describe('parseQuotedUserMessage', () => {
  it('parses file-backed blockquote prompt produced by WorkspaceFileViewer', () => {
    const raw = [
      '`无名.md`',
      '> 被抹除。”',
      '>',
      '> 我扶着舱沿站起来。赤脚踩上地板，知道它是铝合金。',
      '>',
      '> 我知道的事很多。只要不问这些事是谁教我的。',
      '',
      '优化'
    ].join('\n')

    const parsed = parseQuotedUserMessage(raw)
    expect(parsed).not.toBeNull()
    expect(parsed?.sourcePath).toBe('无名.md')
    expect(parsed?.sourceName).toBe('无名.md')
    expect(parsed?.badge).toBe('MD')
    expect(parsed?.quoteText).toBe(
      '被抹除。”\n\n我扶着舱沿站起来。赤脚踩上地板，知道它是铝合金。\n\n我知道的事很多。只要不问这些事是谁教我的。'
    )
    expect(parsed?.prompt).toBe('优化')
    expect(parsed?.charCount).toBe(parsed?.quoteText.length)
  })

  it('extracts basename and uppercase extension badge for nested file paths', () => {
    const parsed = parseQuotedUserMessage('`docs/novels/chapter-1.mdx`\n> First line.\n\n润色一下')
    expect(parsed).toMatchObject({
      sourcePath: 'docs/novels/chapter-1.mdx',
      sourceName: 'chapter-1.mdx',
      badge: 'MDX',
      quoteText: 'First line.',
      prompt: '润色一下'
    })
  })

  it('parses transcript passage quotes without a file header', () => {
    const parsed = parseQuotedUserMessage('> Quoted reply line\n> Second line\n\nCan you expand this?')
    expect(parsed).toEqual({
      quoteText: 'Quoted reply line\nSecond line',
      prompt: 'Can you expand this?',
      charCount: 'Quoted reply line\nSecond line'.length
    })
  })

  it('returns null for plain messages or non-quoted inline code', () => {
    expect(parseQuotedUserMessage('优化一下开头')).toBeNull()
    expect(parseQuotedUserMessage('`无名.md`\n帮我改一下标题')).toBeNull()
    expect(parseQuotedUserMessage('a > b is true')).toBeNull()
    expect(parseQuotedUserMessage('>   \n\nhello')).toBeNull()
  })
})
