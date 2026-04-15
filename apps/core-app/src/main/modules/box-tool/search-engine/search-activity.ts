let lastSearchActivityAt = 0

export function markSearchActivity(at = Date.now()): void {
  lastSearchActivityAt = at
}

export function isSearchRecentlyActive(windowMs = 2000): boolean {
  if (lastSearchActivityAt <= 0) return false
  return Date.now() - lastSearchActivityAt <= Math.max(0, windowMs)
}

export function getLastSearchActivityAt(): number {
  return lastSearchActivityAt
}
