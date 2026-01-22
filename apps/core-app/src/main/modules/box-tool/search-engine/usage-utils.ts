import type { TuffSource } from '@talex-touch/utils/core-box'

/** Generate composite key for usage stats tracking */
export function generateUsageKey(source: TuffSource, itemId: string): string {
  return `${source.id}:${itemId}`
}

/** Parse composite key into sourceId and itemId */
export function parseUsageKey(key: string): { sourceId: string; itemId: string } {
  const parts = key.split(':')
  if (parts.length < 2) {
    throw new Error(`Invalid usage key format: ${key}`)
  }

  const sourceId = parts[0]
  const itemId = parts.slice(1).join(':')

  return { sourceId, itemId }
}

/**
 * Calculate frequency score with time decay
 * Formula: score = (executeCount*1 + searchCount*0.3 + cancelCount*(-0.5)) * exp(-lambda * days)
 */
export function calculateFrequencyScore(
  executeCount: number,
  searchCount: number,
  cancelCount: number = 0,
  lastExecuted: Date | null,
  lastSearched: Date | null,
  lastCancelled: Date | null = null,
  lambda: number = 0.1
): number {
  const now = Date.now()

  let baseFrequency = executeCount * 1.0 + searchCount * 0.3 + cancelCount * -0.5

  if (baseFrequency < 0) baseFrequency = 0

  const lastInteractionTime = Math.max(
    lastExecuted?.getTime() || 0,
    lastSearched?.getTime() || 0,
    lastCancelled?.getTime() || 0
  )

  if (lastInteractionTime > 0) {
    const daysSinceLastInteraction = (now - lastInteractionTime) / (1000 * 3600 * 24)
    const decayFactor = Math.exp(-lambda * daysSinceLastInteraction)
    baseFrequency *= decayFactor
  } else {
    baseFrequency *= 0.1
  }

  return baseFrequency
}

/** Batch generate usage keys for multiple items */
export function generateUsageKeys(items: Array<{ source: TuffSource; id: string }>): string[] {
  return items.map((item) => generateUsageKey(item.source, item.id))
}
