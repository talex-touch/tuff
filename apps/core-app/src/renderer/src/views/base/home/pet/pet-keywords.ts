export type PetKeywordId = 'eat' | 'sleepy' | 'coffee' | 'swim' | 'meow' | 'rainbow'

const RULES: ReadonlyArray<{ id: PetKeywordId; phrases: readonly string[] }> = [
  { id: 'eat', phrases: ['饿了', '饿'] },
  { id: 'sleepy', phrases: ['困了', '困'] },
  { id: 'coffee', phrases: ['累了', '累'] },
  { id: 'swim', phrases: ['游泳'] },
  { id: 'meow', phrases: ['喵'] },
  { id: 'rainbow', phrases: ['彩虹'] }
]

const PUNCT = String.raw`\s，。！？；：、,.!?;:~～…“”"'‘’「」『』（）()【】[\]`
const EDGES = new RegExp(`^[${PUNCT}]+|[${PUNCT}]+$`, 'gu')

/**
 * A phrase counts when it stands on its own: the whole message, the start or end of it (trailing
 * punctuation ignored), or between spaces or punctuation. So 我很困 and 我累了。 match, while
 * 困难 and 累积 do not.
 */
function standalone(text: string, phrase: string): boolean {
  const body = text.replace(EDGES, '')
  if (body === phrase) return true
  if (body.startsWith(phrase) && new RegExp(`^${phrase}(?=[${PUNCT}])`, 'u').test(body)) return true
  if (body.endsWith(phrase)) return true
  return new RegExp(`[${PUNCT}]${phrase}(?=[${PUNCT}])`, 'u').test(body)
}

/**
 * Called once per send with the text being sent. Returns rule ids only; the text is not kept,
 * logged, or passed anywhere else.
 */
export function matchPetKeywords(text: string): PetKeywordId[] {
  return RULES.filter((rule) => rule.phrases.some((phrase) => standalone(text, phrase))).map(
    (rule) => rule.id
  )
}
