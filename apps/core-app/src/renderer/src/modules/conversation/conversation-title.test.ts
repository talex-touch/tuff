import type { IntelligenceInvokeResult } from '@talex-touch/utils/types/intelligence'
import { describe, expect, it, vi } from 'vitest'
import type { TitleChatSdk } from './conversation-title'
import {
  CONVERSATION_TITLE_MAX_CODEPOINTS,
  deriveRestoredTitle,
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

describe('deriveRestoredTitle', () => {
  it('treats a stored title equal to the opening message as the working title, not a custom one', () => {
    // Blocking generation forever on the pre-generation persist is the bug this guards.
    expect(deriveRestoredTitle('帮我整理下载目录', '帮我整理下载目录')).toBeNull()
  })

  it('keeps a stored title that differs from the opening message', () => {
    expect(deriveRestoredTitle('整理下载', '帮我整理下载目录')).toBe('整理下载')
  })

  it('ignores empty storage', () => {
    expect(deriveRestoredTitle('', '帮我整理下载目录')).toBeNull()
    expect(deriveRestoredTitle(undefined, '帮我整理下载目录')).toBeNull()
  })
})

describe('generateConversationTitle', () => {
  it('sends one low-stakes chat call and normalizes the answer', async () => {
    const chat = vi.fn<TitleChatSdk['text']['chat']>(async () => chatResult('「整理下载目录」'))
    const title = await generateConversationTitle(
      { text: { chat } },
      '帮我整理下载目录',
      '好的…',
      STRINGS
    )
    expect(title).toBe('整理下载目录')
    expect(chat).toHaveBeenCalledTimes(1)
    const [payload, options] = chat.mock.calls[0]!
    expect(payload.messages).toHaveLength(2)
    expect(payload.temperature).toBeLessThanOrEqual(0.5)
    expect(payload.maxTokens).toBeLessThanOrEqual(64)
    expect(options?.timeout).toBeLessThanOrEqual(15_000)
  })

  it('clips long transcripts before they reach the prompt', async () => {
    const chat = vi.fn<TitleChatSdk['text']['chat']>(async () => chatResult('长文摘要'))
    await generateConversationTitle(
      { text: { chat } },
      '长'.repeat(2000),
      '答'.repeat(2000),
      STRINGS
    )
    const [payload] = chat.mock.calls[0]!
    const sent = String(payload.messages[1]?.content ?? '')
    expect([...sent].length).toBeLessThan(800)
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
