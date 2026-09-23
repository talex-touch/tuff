import path from 'node:path'
import process from 'node:process'

export function resolveFileProviderBaseWatchPaths(input: {
  envValue?: string
  platform?: NodeJS.Platform
  getPath: (
    name: 'home' | 'documents' | 'downloads' | 'desktop' | 'music' | 'pictures' | 'videos'
  ) => string
  onPathError?: (name: string, error: unknown) => void
}): string[] {
  const envPaths =
    typeof input.envValue === 'string'
      ? input.envValue
          .split(path.delimiter)
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => path.resolve(value))
      : []
  if (envPaths.length > 0) {
    return [...new Set(envPaths)]
  }

  // macOS gets one broad user-space root. Traversal filters prune hidden, system, development,
  // cache and temporary subtrees. Other platforms retain their existing roots until realtime
  // watch depth and permission behavior are proven against a whole-home default there.
  const pathNames: Array<
    'home' | 'documents' | 'downloads' | 'desktop' | 'music' | 'pictures' | 'videos'
  > =
    (input.platform ?? process.platform) === 'darwin'
      ? ['home']
      : ['documents', 'downloads', 'desktop', 'music', 'pictures', 'videos']
  const paths = pathNames.map((name) => {
    try {
      return input.getPath(name)
    } catch (error) {
      input.onPathError?.(name, error)
      return null
    }
  })
  return [...new Set(paths.filter((value): value is string => Boolean(value)))]
}
