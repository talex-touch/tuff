export interface IndexedScanProgressRow {
  path: string
  lastScanned: unknown
}

export interface IndexedScanEligibilityInput {
  watchPaths: string[]
  completedScans: IndexedScanProgressRow[]
  intervalMs: number
  now?: number
  toTimestamp?: (value: unknown) => number | null
}

export interface IndexedScanEligibility {
  newPaths: string[]
  stalePaths: string[]
  lastScannedAt: number | null
}

export function resolveIndexedScanEligibility(
  input: IndexedScanEligibilityInput
): IndexedScanEligibility {
  const completedMap = new Map<string, number>()
  let lastScannedAt: number | null = null
  const toTimestamp = input.toTimestamp ?? toIndexedScanTimestamp

  for (const scan of input.completedScans) {
    const timestamp = toTimestamp(scan?.lastScanned)
    if (timestamp === null) continue
    completedMap.set(scan.path, timestamp)
    if (lastScannedAt === null || timestamp > lastScannedAt) {
      lastScannedAt = timestamp
    }
  }

  const watchPathSet = new Set(input.watchPaths)
  const newPaths = input.watchPaths.filter((watchPath) => !completedMap.has(watchPath))
  const stalePaths =
    input.intervalMs <= 0
      ? Array.from(completedMap.keys()).filter((watchPath) => watchPathSet.has(watchPath))
      : input.watchPaths.filter((watchPath) => {
          const last = completedMap.get(watchPath)
          if (!last) return false
          return (input.now ?? Date.now()) - last >= input.intervalMs
        })

  return { newPaths, stalePaths, lastScannedAt }
}

export function toIndexedScanTimestamp(value: unknown): number | null {
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Date.parse(value)
          : null

  return timestamp !== null && Number.isFinite(timestamp) ? timestamp : null
}
