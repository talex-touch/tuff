import type { IndexedSourceRoot } from '@talex-touch/utils/search'
import process from 'node:process'

export interface IndexingRootPolicyResolution {
  roots: IndexedSourceRoot[]
  reason: string | null
}

function normalizePathForMatch(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '')
  return process.platform === 'linux' ? normalized : normalized.toLowerCase()
}

function dedupeRoots(roots: IndexedSourceRoot[]): IndexedSourceRoot[] {
  const seen = new Set<string>()
  const result: IndexedSourceRoot[] = []

  for (const root of roots) {
    const path = root.path.trim()
    if (!path) continue

    const key = `${root.sourceId}:${normalizePathForMatch(path)}`
    if (seen.has(key)) continue

    seen.add(key)
    result.push({ ...root, path })
  }

  return result
}

export class IndexingRootPolicy {
  private readonly rootsBySource = new Map<string, IndexedSourceRoot[]>()

  setSourceRoots(sourceId: string, roots: IndexedSourceRoot[]): void {
    this.rootsBySource.set(
      sourceId,
      dedupeRoots(roots.filter((root) => root.sourceId === sourceId || !root.sourceId)).map(
        (root) => ({ ...root, sourceId })
      )
    )
  }

  clearSource(sourceId: string): void {
    this.rootsBySource.delete(sourceId)
  }

  clear(): void {
    this.rootsBySource.clear()
  }

  getRoots(sourceId: string): IndexedSourceRoot[] {
    return [...(this.rootsBySource.get(sourceId) ?? [])]
  }

  resolveSourceRoots(sourceId: string): IndexingRootPolicyResolution {
    const roots = this.getRoots(sourceId)
    return {
      roots,
      reason: roots.length > 0 ? null : 'indexing-root-policy-source-roots-empty'
    }
  }

  resolveFileSearchRoots(sourceId = 'file-provider'): IndexingRootPolicyResolution {
    const roots = this.getRoots(sourceId).filter((root) => root.permissionState === 'granted')
    return {
      roots,
      reason: roots.length > 0 ? null : 'indexing-root-policy-file-roots-empty'
    }
  }
}

export const indexingRootPolicy = new IndexingRootPolicy()
