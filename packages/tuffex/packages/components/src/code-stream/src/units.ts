/**
 * Where each word of `code` ends. A word carries the whitespace before it, so a
 * line break and its indentation arrive with the line's first word instead of
 * leaving the caret alone on an empty line; trailing whitespace is a last word
 * of its own. Shared with TxStreamElement, which slices code by these words.
 */
const WORD = /\s*\S+|\s+$/g

export function codeWordEnds(code: string): number[] {
  const ends: number[] = []
  for (const match of code.matchAll(WORD))
    ends.push((match.index ?? 0) + match[0].length)
  return ends
}
