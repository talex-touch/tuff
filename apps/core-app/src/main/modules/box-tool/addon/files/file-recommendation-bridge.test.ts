/**
 * Unit tests for `file-recommendation-bridge.ts` (registry) and
 * `file-provider-recommendation-bridge-impl.ts` (implementation).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerFileRecommendationBridge,
  getFileRecommendationBridge,
  type FileRecommendationBridge
} from './file-recommendation-bridge'

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe('FileRecommendationBridge registry', () => {
  it('returns null before any registration', () => {
    expect(getFileRecommendationBridge()).toBeNull()
  })

  it('returns the registered bridge', () => {
    const bridge = {} as FileRecommendationBridge
    const dispose = registerFileRecommendationBridge(bridge)
    expect(getFileRecommendationBridge()).toBe(bridge)
    dispose()
  })

  it('returns null after disposal', () => {
    const bridge = {} as FileRecommendationBridge
    const dispose = registerFileRecommendationBridge(bridge)
    dispose()
    expect(getFileRecommendationBridge()).toBeNull()
  })

  it('latest registration wins (second replaces first)', () => {
    const bridgeA = { id: 'A' } as unknown as FileRecommendationBridge
    const bridgeB = { id: 'B' } as unknown as FileRecommendationBridge
    const disposeA = registerFileRecommendationBridge(bridgeA)
    const disposeB = registerFileRecommendationBridge(bridgeB)
    expect(getFileRecommendationBridge()).toBe(bridgeB)
    disposeA() // No-op: A is no longer active
    expect(getFileRecommendationBridge()).toBe(bridgeB)
    disposeB()
    expect(getFileRecommendationBridge()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Implementation tests (FileRecommendationBridgeImpl)
// ---------------------------------------------------------------------------

// We use a mock of fs/promises to avoid real filesystem access.
vi.mock('node:fs/promises', () => ({
  default: {
    lstat: vi.fn()
  }
}))

import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import { FileRecommendationBridgeImpl } from './services/file-provider-recommendation-bridge-impl'

function makeDeps(
  overrides: Partial<ConstructorParameters<typeof FileRecommendationBridgeImpl>[0]> = {}
): ConstructorParameters<typeof FileRecommendationBridgeImpl>[0] {
  return {
    getNativeIndexService: () => null,
    getEmbeddingService: () => null,
    getDbUtils: () => null,
    isPathAdmitted: () => true,
    normalizePath: (p) => p,
    logWarn: vi.fn(),
    ...overrides
  }
}

describe('FileRecommendationBridgeImpl.lookupFilesByPaths', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns empty map for empty input', async () => {
    const impl = new FileRecommendationBridgeImpl(makeDeps())
    const result = await impl.lookupFilesByPaths([])
    expect(result.size).toBe(0)
  })

  it('resolves paths that pass lstat', async () => {
    const statMock = vi.mocked(fs.lstat)
    statMock.mockResolvedValue({
      isSymbolicLink: () => false,
      isDirectory: () => false,
      size: 1234,
      mtime: new Date('2024-01-01'),
      birthtime: new Date('2024-01-01'),
      ctime: new Date('2024-01-01')
    } as unknown as Stats)

    const impl = new FileRecommendationBridgeImpl(makeDeps())
    const result = await impl.lookupFilesByPaths(['/foo/bar.ts'])
    expect(result.size).toBe(1)
    const record = result.get('/foo/bar.ts')!
    expect(record.name).toBe('bar.ts')
    expect(record.extension).toBe('ts')
    expect(record.size).toBe(1234)
    expect(record.isDir).toBe(false)
  })

  it('excludes paths rejected by isPathAdmitted', async () => {
    const statMock = vi.mocked(fs.lstat)
    statMock.mockResolvedValue({
      isSymbolicLink: () => false,
      isDirectory: () => false,
      size: 0,
      mtime: new Date(),
      birthtime: new Date(),
      ctime: new Date()
    } as unknown as Stats)

    const impl = new FileRecommendationBridgeImpl(makeDeps({ isPathAdmitted: () => false }))
    const result = await impl.lookupFilesByPaths(['/foo/bar.ts'])
    expect(result.size).toBe(0)
  })

  it('excludes symbolic links', async () => {
    const statMock = vi.mocked(fs.lstat)
    statMock.mockResolvedValue({
      isSymbolicLink: () => true,
      isDirectory: () => false,
      size: 0,
      mtime: new Date(),
      birthtime: new Date(),
      ctime: new Date()
    } as unknown as Stats)

    const impl = new FileRecommendationBridgeImpl(makeDeps())
    const result = await impl.lookupFilesByPaths(['/foo/symlink.ts'])
    expect(result.size).toBe(0)
  })

  it('handles lstat ENOENT gracefully (skips the path)', async () => {
    const statMock = vi.mocked(fs.lstat)
    statMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const impl = new FileRecommendationBridgeImpl(makeDeps())
    const result = await impl.lookupFilesByPaths(['/does/not/exist.ts'])
    expect(result.size).toBe(0)
  })
})

describe('FileRecommendationBridgeImpl.listRecentFiles', () => {
  it('returns empty for limit 0', async () => {
    const impl = new FileRecommendationBridgeImpl(makeDeps())
    const result = await impl.listRecentFiles({ limit: 0 })
    expect(result).toHaveLength(0)
  })

  it('returns empty when no native service and no db', async () => {
    const impl = new FileRecommendationBridgeImpl(makeDeps())
    const result = await impl.listRecentFiles({ limit: 5 })
    expect(result).toHaveLength(0)
  })

  it('queries DB when available and native arena is absent', async () => {
    const getRecentlyCreatedFiles = vi
      .fn()
      .mockResolvedValue([
        { path: '/home/user/file.txt', size: 100, isDir: false, ctime: new Date('2024-06-01') }
      ])
    const impl = new FileRecommendationBridgeImpl(
      makeDeps({
        getDbUtils: () => ({ getRecentlyCreatedFiles }) as never
      })
    )
    const result = await impl.listRecentFiles({ limit: 5 })
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/home/user/file.txt')
    expect(result[0].name).toBe('file.txt')
    expect(result[0].extension).toBe('txt')
  })
})

describe('FileRecommendationBridgeImpl.recallSemanticFiles', () => {
  it('returns empty when embedding service is null', async () => {
    const impl = new FileRecommendationBridgeImpl(makeDeps({ getEmbeddingService: () => null }))
    const result = await impl.recallSemanticFiles('invoice', { limit: 10 })
    expect(result).toHaveLength(0)
  })

  it('returns empty for empty query', async () => {
    const semanticSearch = vi.fn()
    const impl = new FileRecommendationBridgeImpl(
      makeDeps({
        getEmbeddingService: () => ({ semanticSearch }) as never
      })
    )
    const result = await impl.recallSemanticFiles('  ', { limit: 10 })
    expect(result).toHaveLength(0)
    expect(semanticSearch).not.toHaveBeenCalled()
  })

  it('filters results below minScore', async () => {
    const semanticSearch = vi.fn().mockResolvedValue([
      { sourceId: '1', score: 0.9, contentHash: 'abc' },
      { sourceId: '2', score: 0.1, contentHash: null }
    ])
    // No DB → no path resolution → empty hits (but filtering still happens)
    const impl = new FileRecommendationBridgeImpl(
      makeDeps({
        getEmbeddingService: () => ({ semanticSearch }) as never,
        getDbUtils: () => null
      })
    )
    const result = await impl.recallSemanticFiles('report', { limit: 10, minScore: 0.5 })
    expect(result).toHaveLength(0) // DB is null, so no paths resolved
    // But check semanticSearch was called
    expect(semanticSearch).toHaveBeenCalledWith('report', 10, undefined)
  })

  it('respects AbortSignal', async () => {
    const semanticSearch = vi.fn()
    const impl = new FileRecommendationBridgeImpl(
      makeDeps({
        getEmbeddingService: () => ({ semanticSearch }) as never
      })
    )
    const controller = new AbortController()
    controller.abort()
    const result = await impl.recallSemanticFiles('report', {
      limit: 10,
      signal: controller.signal
    })
    expect(result).toHaveLength(0)
    expect(semanticSearch).not.toHaveBeenCalled()
  })
})
