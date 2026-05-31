export type IndexedWatchPathNormalizer = (rawPath: string) => string

export interface IndexedWatchRootSet {
  paths: string[]
  normalizedPaths: string[]
}

export interface ResolveIndexedWatchRootSetInput {
  basePaths: string[]
  extraPaths?: string[]
  normalizePath: IndexedWatchPathNormalizer
}

export interface IndexedWatchPathOwnershipInput {
  rawPath: string
  normalizedWatchPaths: string[]
  normalizePath: IndexedWatchPathNormalizer
  pathSeparator?: string
}

export interface FilterIndexedWatchPendingPermissionPathsInput {
  pendingPaths: string[]
  normalizedWatchPaths: string[]
  normalizePath: IndexedWatchPathNormalizer
}

export function resolveIndexedWatchRootSet(
  input: ResolveIndexedWatchRootSetInput
): IndexedWatchRootSet {
  const paths: string[] = []
  const normalizedPaths: string[] = []
  const seen = new Set<string>()

  for (const candidate of [...input.basePaths, ...(input.extraPaths ?? [])]) {
    if (!candidate) continue
    const normalized = input.normalizePath(candidate)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    paths.push(candidate)
    normalizedPaths.push(normalized)
  }

  return { paths, normalizedPaths }
}

export function isIndexedWatchPathOwned(input: IndexedWatchPathOwnershipInput): boolean {
  if (!input.rawPath) return false

  const normalizedPath = input.normalizePath(input.rawPath)
  const separator = input.pathSeparator ?? inferIndexedWatchPathSeparator(normalizedPath)

  for (const watchRoot of input.normalizedWatchPaths) {
    if (normalizedPath === watchRoot) return true
    const rootWithSeparator = watchRoot.endsWith(separator) ? watchRoot : `${watchRoot}${separator}`
    if (normalizedPath.startsWith(rootWithSeparator)) {
      return true
    }
  }

  return false
}

export function filterIndexedWatchPendingPermissionPaths(
  input: FilterIndexedWatchPendingPermissionPathsInput
): string[] {
  const normalizedWatchSet = new Set(input.normalizedWatchPaths)
  return input.pendingPaths.filter((pendingPath) =>
    normalizedWatchSet.has(input.normalizePath(pendingPath))
  )
}

function inferIndexedWatchPathSeparator(normalizedPath: string): string {
  return normalizedPath.includes('\\') && !normalizedPath.includes('/') ? '\\' : '/'
}
