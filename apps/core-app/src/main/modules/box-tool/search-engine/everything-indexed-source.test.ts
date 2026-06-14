import type { IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import { IndexedSourceScanReasons, isIndexedSourceAdmissionReady } from '@talex-touch/utils/search'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildEverythingIndexedSource,
  buildEverythingIndexedSourceDescriptor
} from './everything-indexed-source'
import { indexingRootPolicy } from './indexing-root-policy'

vi.mock('../addon/files/everything-provider', () => ({
  everythingProvider: {
    getStatusSnapshot: vi.fn(() => ({
      enabled: true,
      available: true,
      healthReason: null,
      error: null,
      lastBackendError: null,
      lastChecked: 1700000000000,
      pathFiltering: {
        enabled: true,
        allowedRootCount: 1,
        lastRawResultCount: 3,
        lastFilteredResultCount: 2,
        lastDroppedResultCount: 1,
        lastChecked: 1700000000100,
        reason: 'dropped-outside-authorized-roots'
      }
    }))
  }
}))

beforeEach(() => {
  indexingRootPolicy.clear()
})

describe('everythingIndexedSource', () => {
  it('describes Everything as a trusted external fast source', () => {
    const descriptor = buildEverythingIndexedSourceDescriptor()

    expect(descriptor).toMatchObject({
      id: 'everything-provider',
      storage: 'external-fast',
      admission: {
        owner: 'core',
        permissionScopes: ['external-tool', 'file-system'],
        defaultState: 'enabled',
        clearable: false,
        rebuildable: false
      }
    })
    expect(isIndexedSourceAdmissionReady(descriptor)).toBe(true)
  })

  it('mirrors file index root policy as external fast roots', async () => {
    indexingRootPolicy.setSourceRoots('file-provider', [
      {
        sourceId: 'file-provider',
        path: 'C:\\Users\\demo\\Documents',
        permissionState: 'granted'
      }
    ])

    const source = buildEverythingIndexedSource()

    await expect(source.getRoots()).resolves.toEqual([
      expect.objectContaining({
        sourceId: 'everything-provider',
        path: 'C:\\Users\\demo\\Documents',
        reason: 'mirrors-file-index-root-policy'
      })
    ])
  })

  it('exposes diagnostic evidence without leaking authorized root paths', async () => {
    indexingRootPolicy.setSourceRoots('file-provider', [
      {
        sourceId: 'file-provider',
        path: 'C:\\Users\\demo\\Documents',
        permissionState: 'granted'
      }
    ])

    const source = buildEverythingIndexedSource()

    const evidence = await source.getEvidence?.()

    expect(evidence).toEqual([
      expect.objectContaining({
        id: 'everything-provider:external-backend',
        label: 'Everything external backend',
        itemCount: 2,
        rootCount: 1,
        reason: 'dropped-outside-authorized-roots',
        metadata: expect.objectContaining({
          storage: 'external-fast',
          pathFiltering: {
            enabled: true,
            allowedRootCount: 1,
            lastRawResultCount: 3,
            lastFilteredResultCount: 2,
            lastDroppedResultCount: 1,
            reason: 'dropped-outside-authorized-roots'
          }
        })
      })
    ])
    expect(evidence?.[0]).not.toHaveProperty('roots')
  })

  it('degrades health and evidence when no authorized File roots are available on Windows', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })

    try {
      const source = buildEverythingIndexedSource()

      await expect(source.getHealth()).resolves.toMatchObject({
        status: 'degraded',
        reason: 'indexing-root-policy-file-roots-empty'
      })
      await expect(source.getEvidence?.()).resolves.toEqual([
        expect.objectContaining({
          status: 'degraded',
          rootCount: 0,
          reason: 'indexing-root-policy-file-roots-empty'
        })
      ])
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('reports unsupported scan as an empty iterable', async () => {
    const source = buildEverythingIndexedSource()
    const batches: IndexedSourceRecordBatch[] = []

    for await (const batch of source.scan({
      sourceId: source.descriptor.id,
      reason: IndexedSourceScanReasons.ManualRebuild
    })) {
      batches.push(batch)
    }

    expect(batches).toEqual([])
  })
})
