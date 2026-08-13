import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult
} from '@talex-touch/utils/types/intelligence'

/**
 * Generates the short conversation title HomePage's working title stands in for (#969).
 *
 * The working title is the user's opening message verbatim, which a long prompt turns into a
 * top-bar and sidebar full of one paragraph. After the first turn settles, one low-stakes model
 * call summarises the exchange into a handful of characters; every failure path falls back to the
 * working title by returning null, silently — a conversation must never fail, stall or toast over
 * its own label.
 */
export interface TitleChatSdk {
  text: {
    chat: (
      payload: IntelligenceChatPayload,
      options?: IntelligenceInvokeOptions
    ) => Promise<IntelligenceInvokeResult<string>>
  }
}

/**
 * Hard ceiling on a stored title, in code points.
 *
 * The prompt asks for ≤8 characters; the clamp sits well above it so a slightly chatty but usable
 * answer ("整理下载目录的脚本") survives while a model that ignored the instruction and answered in
 * prose does not get persisted as the label. Overflow rejects rather than truncates: a cut-off
 * sentence reads worse than the user's own words.
 */
export const CONVERSATION_TITLE_MAX_CODEPOINTS = 24

/** How much of each side of the exchange the summariser sees. Enough for topic, not the essay. */
const EXCERPT_CODEPOINTS = 320

/**
 * The instruction and transcript labels, supplied by the caller from the renderer catalog.
 *
 * Model-facing text is still locale text: a hardcoded Chinese prompt asks an English-locale user's
 * model for a Chinese label, and "≤8 个字" is not even the right unit outside CJK — the English
 * catalog asks for words. Keeping the module free of vue-i18n keeps it pure and testable; the
 * lookup happens once at the call site.
 */
export interface TitlePromptStrings {
  prompt: string
  userLabel: string
  assistantLabel: string
}

function clip(value: string, max: number): string {
  const points = [...value]
  return points.length <= max ? value : `${points.slice(0, max).join('')}…`
}

/**
 * Trims decoration a model wraps titles in despite the prompt: whitespace, wrapping quote pairs
 * (straight, curly, CJK corner and title marks), and a trailing full stop. Anything still empty or
 * over the ceiling afterwards is rejected as null.
 */
export function normalizeGeneratedTitle(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  let title = raw.trim()
  // One leading/trailing pair per pass; loop so 「"标题"」 unwraps fully but inner quotes survive.
  const PAIRS: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
    ['「', '」'],
    ['『', '』'],
    ['《', '》'],
    ['(', ')'],
    ['（', '）']
  ]
  // Unwrapping and period-stripping interleave until stable: `《标题》。` only exposes its pair
  // after the stop goes, and `「」` unwraps to empty — `>=` admits the bare pair so it lands in the
  // empty-string rejection below instead of surviving as decoration.
  let before = ''
  while (before !== title) {
    before = title
    title = title.replace(/[。.．]+$/u, '').trim()
    for (const [open, close] of PAIRS) {
      if (
        title.length >= open.length + close.length &&
        title.startsWith(open) &&
        title.endsWith(close)
      ) {
        title = title.slice(open.length, title.length - close.length).trim()
      }
    }
  }
  // A model that answered in prose put line breaks in; a title has none.
  if (/[\r\n]/.test(title)) return null
  if (title.length === 0) return null
  if ([...title].length > CONVERSATION_TITLE_MAX_CODEPOINTS) return null
  return title
}

/**
 * Whether this settled turn is the one that should trigger generation.
 *
 * Only once per conversation (a non-null generated title, restored or fresh, blocks it), and only
 * when there is a completed exchange to summarise — a failed or empty first turn keeps the working
 * title, and the next settled turn gets another chance.
 */
export function shouldGenerateTitle(args: {
  generatedTitle: string | null
  inFlight: boolean
  firstUserContent: string | undefined
  firstAssistantContent: string | undefined
}): boolean {
  if (args.generatedTitle !== null || args.inFlight) return false
  if (!args.firstUserContent?.trim()) return false
  if (!args.firstAssistantContent?.trim()) return false
  return true
}

/**
 * The stored title, when it is a real one.
 *
 * `history.load` hands back whatever `persist` wrote. Before a title was ever generated that is the
 * working title — the opening message verbatim — and treating it as custom would freeze the label
 * and block generation forever. Only a stored title that *differs* from the opening message is
 * information.
 */
export function deriveRestoredTitle(
  storedTitle: string | null | undefined,
  firstUserContent: string | null | undefined
): string | null {
  const stored = storedTitle?.trim()
  if (!stored) return null
  if (stored === firstUserContent?.trim()) return null
  return stored
}

/**
 * One summarisation call, resolving to null on every failure.
 *
 * Low temperature and a tight token budget because the task is extraction, not writing; a short
 * timeout because a label is not worth queueing behind — the working title is already on screen
 * and perfectly serviceable.
 */
export async function generateConversationTitle(
  sdk: TitleChatSdk,
  firstUserContent: string,
  firstAssistantContent: string,
  strings: TitlePromptStrings
): Promise<string | null> {
  try {
    const result = await sdk.text.chat(
      {
        messages: [
          { role: 'system', content: strings.prompt },
          {
            role: 'user',
            content: `${strings.userLabel}：${clip(firstUserContent, EXCERPT_CODEPOINTS)}\n${strings.assistantLabel}：${clip(firstAssistantContent, EXCERPT_CODEPOINTS)}`
          }
        ],
        temperature: 0.2,
        maxTokens: 32
      },
      { timeout: 10_000 }
    )
    return normalizeGeneratedTitle(result?.result ?? null)
  } catch {
    return null
  }
}
