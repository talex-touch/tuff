export interface IndexedScanStrategyInput {
  watchPaths: string[]
  completedScanPaths: Set<string>
  normalizePath?: (path: string) => string
}

export interface IndexedScanStrategy {
  newPathsToScan: string[]
  reconciliationPaths: string[]
}

export function resolveIndexedScanStrategy(input: IndexedScanStrategyInput): IndexedScanStrategy {
  const normalizePath = input.normalizePath ?? ((path: string) => path)
  const completedPathKeys = new Set(
    Array.from(input.completedScanPaths, (completedPath) => normalizePath(completedPath))
  )
  const isCompleted = (watchPath: string): boolean => completedPathKeys.has(normalizePath(watchPath))
  const watchPaths = uniqueIndexedScanStrategyPaths(input.watchPaths, normalizePath)

  return {
    newPathsToScan: watchPaths.filter((path) => !isCompleted(path)),
    reconciliationPaths: watchPaths.filter((path) => isCompleted(path))
  }
}

function uniqueIndexedScanStrategyPaths(
  paths: string[],
  normalizePath: (path: string) => string
): string[] {
  const seen = new Set<string>()
  const uniquePaths: string[] = []
  for (const path of paths) {
    const key = normalizePath(path)
    if (seen.has(key)) continue
    seen.add(key)
    uniquePaths.push(path)
  }
  return uniquePaths
}
