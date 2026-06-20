export interface IndexedScanProgressRow {
  path: string
  lastScanned: unknown
}

export interface IndexedScanEligibilityInput {
  watchPaths: string[]
  completedScans: IndexedScanProgressRow[]
  intervalMs: number
  now?: number
  normalizePath?: (path: string) => string
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
  const normalizePath = input.normalizePath ?? ((path: string) => path)
  const toTimestamp = input.toTimestamp ?? toIndexedScanTimestamp
  const watchPaths = uniqueIndexedScanPaths(input.watchPaths, normalizePath)
  const watchPathKeys = new Set(watchPaths.map((watchPath) => normalizePath(watchPath)))

  for (const scan of input.completedScans) {
    const scanPathKey = normalizePath(scan.path)
    if (scanPathKey.trim().length === 0) continue
    if (!watchPathKeys.has(scanPathKey)) continue
    const timestamp = toTimestamp(scan?.lastScanned)
    if (timestamp === null) continue
    completedMap.set(scanPathKey, timestamp)
    if (lastScannedAt === null || timestamp > lastScannedAt) {
      lastScannedAt = timestamp
    }
  }

  const newPaths = watchPaths.filter((watchPath) => !completedMap.has(normalizePath(watchPath)))
  const stalePaths =
    input.intervalMs <= 0
      ? watchPaths.filter((watchPath) => completedMap.has(normalizePath(watchPath)))
      : watchPaths.filter((watchPath) => {
          const last = completedMap.get(normalizePath(watchPath))
          if (last === undefined) return false
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

  return timestamp !== null && Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null
}

function uniqueIndexedScanPaths(
  paths: string[],
  normalizePath: (path: string) => string
): string[] {
  const seen = new Set<string>()
  const uniquePaths: string[] = []
  for (const path of paths) {
    const key = normalizePath(path)
    if (key.trim().length === 0) continue
    if (seen.has(key)) continue
    seen.add(key)
    uniquePaths.push(path)
  }
  return uniquePaths
}
