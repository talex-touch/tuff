export interface IndexedScanStrategyInput {
  watchPaths: string[]
  completedScanPaths: Set<string>
}

export interface IndexedScanStrategy {
  newPathsToScan: string[]
  reconciliationPaths: string[]
}

export function resolveIndexedScanStrategy(input: IndexedScanStrategyInput): IndexedScanStrategy {
  return {
    newPathsToScan: input.watchPaths.filter((path) => !input.completedScanPaths.has(path)),
    reconciliationPaths: input.watchPaths.filter((path) => input.completedScanPaths.has(path))
  }
}
