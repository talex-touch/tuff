const EXTENDED_PICTOGRAPHIC_PATTERN = /\p{Extended_Pictographic}/u

/**
 * Conservative, tokenizer-independent estimate for host-owned context budgets.
 * Provider tokenizers remain authoritative for billed/actual usage.
 */
export function estimateContextTokens(content: string): number {
  const normalized = content.trim()
  if (!normalized) return 1

  let estimate = 0
  let asciiRunLength = 0

  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x7f) {
      asciiRunLength += 1
      continue
    }

    if (asciiRunLength > 0) {
      estimate += Math.ceil(asciiRunLength / 4)
      asciiRunLength = 0
    }
    estimate += EXTENDED_PICTOGRAPHIC_PATTERN.test(character) ? 2 : 1
  }

  if (asciiRunLength > 0) {
    estimate += Math.ceil(asciiRunLength / 4)
  }

  return Math.max(1, estimate)
}

/** Normalize an untrusted runtime token budget without numeric coercion. */
export function normalizeContextTokenBudget(value: unknown, fallback: number): number {
  const normalizedFallback = Number.isFinite(fallback) ? Math.max(1, Math.floor(fallback)) : 1
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return normalizedFallback
  }
  return Math.max(1, Math.floor(value))
}
