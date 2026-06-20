export interface NormalizedScanProgressUpsert {
  paths: string[]
  lastScanned: Date
}

export function normalizeScanProgressPaths(paths: readonly unknown[]): string[] {
  const normalizedPaths: string[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    if (typeof path !== 'string') continue
    if (path.trim().length === 0) continue
    if (seen.has(path)) continue

    seen.add(path)
    normalizedPaths.push(path)
  }

  return normalizedPaths
}

export function normalizeScanProgressLastScanned(value: unknown): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value as never)
  return Number.isFinite(date.getTime()) ? date : null
}

export function normalizeScanProgressUpsert(
  paths: readonly unknown[],
  lastScanned: unknown
): NormalizedScanProgressUpsert | null {
  const normalizedPaths = normalizeScanProgressPaths(paths)
  if (normalizedPaths.length === 0) return null

  const normalizedLastScanned = normalizeScanProgressLastScanned(lastScanned)
  if (!normalizedLastScanned) return null

  return {
    paths: normalizedPaths,
    lastScanned: normalizedLastScanned
  }
}
