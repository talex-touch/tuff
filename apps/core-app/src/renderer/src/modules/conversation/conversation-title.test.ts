import type { IntelligenceInvokeResult } from '@talex-touch/utils/types/intelligence'
import { describe, expect, it, vi } from 'vitest'
import type { TitleChatSdk } from './conversation-title'
import {
  CONVERSATION_TITLE_MAX_CODEPOINTS,
  createWorkingConversationTitle,
  deriveRestoredTitle,
  findTitleExchange,
  generateConversationTitle,
  normalizeGeneratedTitle,
  shouldGenerateTitle
} from './conversation-title'

const STRINGS = {
  prompt: '用不超过 8 个字概括这段对话的主题。只输出标题本身。',
  userLabel: '用户',
  assistantLabel: '助手'
}

function chatResult(result: string): IntelligenceInvokeResult<string> {
  return {
    result,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    model: 'm',
    latency: 1,
    traceId: 't',
    provider: 'p'
  }
}

describe('normalizeGeneratedTitle', () => {
  it('passes a plain short title through', () => {
    expect(normalizeGeneratedTitle('整理下载目录')).toBe('整理下载目录')
  })

  it('strips wrapping quotes, CJK marks and a trailing full stop', () => {
    expect(normalizeGeneratedTitle('「整理下载目录」')).toBe('整理下载目录')
    expect(normalizeGeneratedTitle('"Download cleanup"')).toBe('Download cleanup')
    expect(normalizeGeneratedTitle('《整理下载目录》。')).toBe('整理下载目录')
  })

  it('unwraps nested decoration but keeps interior quotes', () => {
    expect(normalizeGeneratedTitle('「"整理下载目录"」')).toBe('整理下载目录')
    expect(normalizeGeneratedTitle('讨论"quoted"用法')).toBe('讨论"quoted"用法')
  })

  /**
   * Rejection, not truncation: a model that answered in prose must not have its first clause
   * persisted as the label — the user's own words read better than a cut-off sentence.
   */
  it('rejects prose-length answers instead of truncating them', () => {
    const prose = '这段对话主要讨论了如何整理下载目录并批量重命名其中的文件,涉及脚本编写'
    expect([...prose].length).toBeGreaterThan(CONVERSATION_TITLE_MAX_CODEPOINTS)
    expect(normalizeGeneratedTitle(prose)).toBeNull()
  })

  it('rejects multi-line answers, empty strings and non-strings', () => {
    expect(normalizeGeneratedTitle('标题\n还有解释')).toBeNull()
    expect(normalizeGeneratedTitle('   ')).toBeNull()
    expect(normalizeGeneratedTitle('「」')).toBeNull()
    expect(normalizeGeneratedTitle(null)).toBeNull()
    expect(normalizeGeneratedTitle(undefined)).toBeNull()
  })

  it('counts code points, not UTF-16 units, at the ceiling', () => {
    const emoji = '🧭'.repeat(CONVERSATION_TITLE_MAX_CODEPOINTS)
    expect(normalizeGeneratedTitle(emoji)).toBe(emoji)
    expect(normalizeGeneratedTitle(`${emoji}🧭`)).toBeNull()
  })
})

describe('shouldGenerateTitle', () => {
  const ready = {
    generatedTitle: null,
    inFlight: false,
    firstUserContent: '帮我整理下载目录',
    firstAssistantContent: '好的,可以按扩展名分组…'
  }

  it('fires exactly on the ready shape', () => {
    expect(shouldGenerateTitle(ready)).toBe(true)
  })

  it('never fires twice: an existing title, restored or generated, blocks it', () => {
    expect(shouldGenerateTitle({ ...ready, generatedTitle: '整理下载' })).toBe(false)
  })

  it('does not stack calls while one is in flight', () => {
    expect(shouldGenerateTitle({ ...ready, inFlight: true })).toBe(false)
  })

  it('waits for a completed exchange', () => {
    expect(shouldGenerateTitle({ ...ready, firstAssistantContent: undefined })).toBe(false)
    expect(shouldGenerateTitle({ ...ready, firstAssistantContent: '  ' })).toBe(false)
    expect(shouldGenerateTitle({ ...ready, firstUserContent: undefined })).toBe(false)
  })
})

describe('findTitleExchange', () => {
  /**
   * A thread opened from Home starts with the assistant's opening line. Summarising that greeting
   * would title every such conversation after the greeting instead of after what was asked.
   */
  it('skips the Home opening that precedes the first user message', () => {
    expect(
      findTitleExchange([
        { role: 'assistant', content: '你好，要先推进哪件事？', status: 'complete' },
        { role: 'user', content: '帮我整理下载目录', status: 'complete' },
        { role: 'assistant', content: '好的,可以按扩展名分组…', status: 'complete' }
      ])
    ).toEqual({
      firstUserContent: '帮我整理下载目录',
      firstAssistantContent: '好的,可以按扩展名分组…'
    })
  })

  it('waits for a settled reply after the user message', () => {
    expect(
      findTitleExchange([
        { role: 'assistant', content: '你好', status: 'complete' },
        { role: 'user', content: '帮我整理下载目录', status: 'complete' },
        { role: 'assistant', content: '', status: 'streaming' }
      ])
    ).toEqual({ firstUserContent: '帮我整理下载目录', firstAssistantContent: undefined })
  })

  it('reads a thread without an opening as before', () => {
    expect(
      findTitleExchange([
        { role: 'user', content: 'u', status: 'complete' },
        { role: 'assistant', content: 'a', status: 'failed' },
        { role: 'assistant', content: 'b', status: 'complete' }
      ])
    ).toEqual({ firstUserContent: 'u', firstAssistantContent: 'b' })
    expect(findTitleExchange([])).toEqual({
      firstUserContent: undefined,
      firstAssistantContent: undefined
    })
  })
})
describe('working conversation title', () => {
  it.each([
    { name: 'BMP characters', point: '长' },
    { name: 'astral characters', point: '🧭' }
  ])('bounds $name without splitting the last code point', ({ point }) => {
    const atLimit = point.repeat(CONVERSATION_TITLE_MAX_CODEPOINTS)
    expect(createWorkingConversationTitle(atLimit)).toBe(atLimit)
    expect(createWorkingConversationTitle(`${atLimit}${point}`)).toBe(`${atLimit}…`)
    expect(createWorkingConversationTitle(`  ${point.repeat(650)}  `)).toBe(`${atLimit}…`)
  })
})

describe('deriveRestoredTitle', () => {
  it.each([
    { name: 'legacy full prompt', bounded: false },
    { name: 'bounded working title', bounded: true }
  ])('$name remains eligible for generation after restore', ({ bounded }) => {
    const prompt = `🧭${'整理下载目录并保留原始文件。'.repeat(60)}`
    const storedTitle = bounded ? createWorkingConversationTitle(prompt) : prompt
    const generatedTitle = deriveRestoredTitle(storedTitle, prompt)
    expect(generatedTitle).toBeNull()
    expect(
      shouldGenerateTitle({
        generatedTitle,
        inFlight: false,
        firstUserContent: prompt,
        firstAssistantContent: '已整理目录，原始文件全部保留。'
      })
    ).toBe(true)
  })

  it.each(['整理下载', '我的下载归档 🧭', '整理下载目录。'])(
    'preserves stored custom or generated title %s and does not regenerate it',
    (storedTitle) => {
      const prompt = '帮我整理下载目录'.repeat(80)
      const generatedTitle = deriveRestoredTitle(storedTitle, prompt)
      expect(generatedTitle).toBe(storedTitle)
      expect(
        shouldGenerateTitle({
          generatedTitle,
          inFlight: false,
          firstUserContent: prompt,
          firstAssistantContent: '完成。'
        })
      ).toBe(false)
    }
  )

  it('ignores empty storage', () => {
    expect(deriveRestoredTitle('', '帮我整理下载目录')).toBeNull()
    expect(deriveRestoredTitle(undefined, '帮我整理下载目录')).toBeNull()
  })
})

describe('generateConversationTitle', () => {
  it('normalizes the provider answer into a usable conversation title', async () => {
    const chat = vi.fn<TitleChatSdk['text']['chat']>(async () => chatResult('「整理下载目录」'))
    const title = await generateConversationTitle(
      { text: { chat } },
      '帮我整理下载目录',
      '好的…',
      STRINGS
    )
    expect(title).toBe('整理下载目录')
  })

  /** A label is never worth an error surface: every failure path is silently null. */
  it('resolves null when the call rejects', async () => {
    const chat = vi.fn(async () => {
      throw new Error('provider down')
    })
    await expect(
      generateConversationTitle({ text: { chat } }, 'u', 'a', STRINGS)
    ).resolves.toBeNull()
  })

  it('resolves null when the answer is unusable', async () => {
    const chat = vi.fn(async () =>
      chatResult('这不是一个标题,而是一段没有守住字数约束的完整解释性文字。')
    )
    await expect(
      generateConversationTitle({ text: { chat } }, 'u', 'a', STRINGS)
    ).resolves.toBeNull()
  })
})
