/**
 * Longest input `levenshteinDistance` will process, per argument.
 *
 * The helper is exported from `@talex-touch/utils/search`, so a plugin can hand it arbitrary
 * text -- clipboard contents, a whole document. The previous full (m+1)x(n+1) table meant two
 * 20,000-character strings allocated ~400 million slots across 20,001 nested arrays, freezing
 * the renderer before running out of memory (#887). The rolling form below removes most of that
 * cost, but the work is still O(m*n) in time, so an explicit ceiling stays.
 *
 * 4096 is far above any realistic query, title or path this is used for.
 */
export const LEVENSHTEIN_MAX_LENGTH = 4096

/**
 * Computes the Levenshtein distance between two strings.
 *
 * Uses the two-row rolling form, iterating the shorter string in the inner dimension, so memory
 * is O(min(m, n)) rather than O(m * n).
 *
 * @param s1 The first string.
 * @param s2 The second string.
 * @returns The Levenshtein distance.
 * @throws RangeError when either argument exceeds {@link LEVENSHTEIN_MAX_LENGTH}. Refusing is
 * deliberate: silently returning an approximation would make a wrong number indistinguishable
 * from a real distance.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1.length > LEVENSHTEIN_MAX_LENGTH || s2.length > LEVENSHTEIN_MAX_LENGTH) {
    throw new RangeError(
      `[levenshteinDistance] input exceeds LEVENSHTEIN_MAX_LENGTH (${LEVENSHTEIN_MAX_LENGTH}): `
      + `got ${s1.length} and ${s2.length}. Truncate or pre-filter before comparing.`,
    )
  }

  if (s1 === s2)
    return 0
  if (s1.length === 0)
    return s2.length
  if (s2.length === 0)
    return s1.length

  // Keep the shorter string on the inner axis so the rows stay as small as possible.
  const [shorter, longer] = s1.length <= s2.length ? [s1, s2] : [s2, s1]
  const width = shorter.length

  let previous = new Array<number>(width + 1)
  let current = new Array<number>(width + 1)

  for (let j = 0; j <= width; j++)
    previous[j] = j

  for (let i = 1; i <= longer.length; i++) {
    current[0] = i
    const longerChar = longer[i - 1]

    for (let j = 1; j <= width; j++) {
      const cost = longerChar === shorter[j - 1] ? 0 : 1
      current[j] = Math.min(
        (previous[j] ?? 0) + 1, // Deletion
        (current[j - 1] ?? 0) + 1, // Insertion
        (previous[j - 1] ?? 0) + cost, // Substitution
      )
    }

    const swap = previous
    previous = current
    current = swap
  }

  return previous[width] ?? 0
}
