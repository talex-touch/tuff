import type { PreviewAbilityResult, PreviewCardPayload } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { BasePreviewAbility } from '../preview-ability'
import { performance } from 'perf_hooks'

const TAG_KEYWORDS = ['words', 'word', 'chars', 'char', 'len', 'length', 'count', '长度', '字数', '词数']

const KEYWORD_PREFIX = new RegExp(
  `^(${TAG_KEYWORDS.join('|')})(?:[:：\\s]+)`,
  'i'
)

function cleanQuotes(input: string): string {
  const trimmed = input.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function containsKeyword(input: string): boolean {
  const lower = input.toLowerCase()
  return TAG_KEYWORDS.some((keyword) => lower.includes(keyword) || input.includes(keyword))
}

export class TextStatsAbility extends BasePreviewAbility {
  readonly id = 'preview.textstats'
  readonly priority = 50

  override canHandle(query: { text?: string }): boolean {
    if (!query.text) return false
    return containsKeyword(query.text)
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const text = this.getNormalizedQuery(context.query)
    if (!containsKeyword(text)) return null

    let contentRaw = text.replace(KEYWORD_PREFIX, '').trim()
    const contentMatch = contentRaw.match(/["'`].+["'`]/)
    if (contentMatch) {
      contentRaw = contentMatch[0]
    }
    const content = cleanQuotes(contentRaw || text)

    const characters = content.length
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) ?? []).length
    const words = content
      .trim()
      .split(/\s+/)
      .filter(Boolean).length

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: content.slice(0, 24),
      subtitle: '文本统计',
      primaryLabel: '字符数',
      primaryValue: characters.toString(),
      secondaryLabel: '词数',
      secondaryValue: words.toString(),
      chips: [
        { label: '中文字符', value: chineseChars.toString() },
        { label: 'ASCII', value: (characters - chineseChars).toString() }
      ],
      sections: [
        {
          rows: [
            { label: '去首尾空白', value: content.trim().length.toString() },
            { label: '行数', value: content.split(/\r?\n/).length.toString() }
          ]
        }
      ]
    }

    return {
      abilityId: this.id,
      confidence: 0.6,
      payload,
      durationMs: performance.now() - startedAt
    }
  }
}
