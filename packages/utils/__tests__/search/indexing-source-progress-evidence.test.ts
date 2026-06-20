import { afterEach, describe, expect, it, vi } from 'vitest'
import { IndexedSourceProgressEvidenceService } from '../../search'

const service = new IndexedSourceProgressEvidenceService()

describe('IndexedSourceProgressEvidenceService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds ready evidence when all roots are complete', () => {
    expect(
      service.build({
        id: 'source:progress',
        label: 'Source progress',
        roots: ['/a'],
        itemCount: 3,
        pendingRoots: 0,
        failedItems: 0,
        isActive: false,
        checkedAt: 123
      })
    ).toMatchObject({
      status: 'ready',
      reason: 'indexed-source-progress-ready',
      itemCount: 3,
      rootCount: 1,
      lastCheckedAt: 123,
      metadata: {
        totalRoots: 1,
        pendingRoots: 0,
        pendingPermissionRoots: 0,
        pendingPermissionPaths: []
      }
    })
  })

  it('prioritizes permission-required over failed and pending states', () => {
    expect(
      service.build({
        id: 'source:progress',
        label: 'Source progress',
        roots: ['/a', '/b'],
        itemCount: 1,
        pendingRoots: 1,
        failedItems: 2,
        isActive: true,
        pendingPermissionPaths: ['/b']
      })
    ).toMatchObject({
      status: 'permission-required',
      reason: 'indexed-source-progress-pending-permission',
      metadata: {
        pendingRoots: 1,
        pendingPermissionRoots: 1,
        pendingPermissionPaths: ['/b']
      }
    })
  })

  it('deduplicates empty roots and pending permission paths before building evidence', () => {
    expect(
      service.build({
        id: 'source:progress',
        label: 'Source progress',
        roots: ['/a', '', '  ', '/b', '/a'],
        itemCount: 1,
        pendingRoots: 0,
        failedItems: 0,
        isActive: false,
        pendingPermissionPaths: ['/b', '', '/b', '  ', '/c']
      })
    ).toMatchObject({
      status: 'permission-required',
      reason: 'indexed-source-progress-pending-permission',
      rootCount: 2,
      roots: ['/a', '/b'],
      metadata: {
        totalRoots: 2,
        pendingPermissionRoots: 2,
        pendingPermissionPaths: ['/b', '/c']
      }
    })
  })

  it('builds degraded evidence when failed items exist', () => {
    expect(
      service.build({
        id: 'source:progress',
        label: 'Source progress',
        roots: ['/a'],
        itemCount: 3,
        pendingRoots: 0,
        failedItems: 1,
        isActive: false
      })
    ).toMatchObject({
      status: 'degraded',
      reason: 'indexed-source-progress-has-failed-items'
    })
  })

  it('builds warming evidence for pending roots or active indexing', () => {
    expect(
      service.build({
        id: 'source:progress',
        label: 'Source progress',
        roots: ['/a', '/b'],
        itemCount: 1,
        pendingRoots: 1,
        failedItems: 0,
        isActive: false
      })
    ).toMatchObject({
      status: 'warming',
      reason: 'indexed-source-progress-has-pending-roots'
    })

    expect(
      service.build({
        id: 'source:progress',
        label: 'Source progress',
        roots: ['/a'],
        itemCount: 1,
        pendingRoots: 0,
        failedItems: 0,
        isActive: true
      })
    ).toMatchObject({
      status: 'warming',
      reason: 'indexed-source-progress-running'
    })
  })

  it('supports source-specific reasons and metadata', () => {
    expect(
      service.build({
        id: 'file-provider:scan-progress',
        label: 'File scan progress',
        roots: ['/a'],
        itemCount: 3,
        totalRoots: 2,
        pendingRoots: 1,
        failedItems: 0,
        isActive: false,
        metadata: {
          completedFiles: 3
        },
        reasons: {
          pendingRoots: 'file-index-progress-has-pending-roots'
        }
      })
    ).toMatchObject({
      reason: 'file-index-progress-has-pending-roots',
      metadata: {
        completedFiles: 3,
        totalRoots: 2,
        pendingRoots: 1
      }
    })
  })

  it('isolates nested metadata from returned evidence mutations', () => {
    const metadata = {
      nested: {
        completedFiles: 3
      }
    }
    const evidence = service.build({
      id: 'file-provider:scan-progress',
      label: 'File scan progress',
      roots: ['/a'],
      itemCount: 3,
      pendingRoots: 0,
      failedItems: 0,
      isActive: false,
      metadata
    })

    const evidenceMetadata = evidence.metadata
    if (!evidenceMetadata) {
      throw new Error('Expected progress evidence metadata')
    }

    ;(evidenceMetadata.nested as { completedFiles: number }).completedFiles = 99

    expect(metadata.nested.completedFiles).toBe(3)
  })

  it('ignores empty source-specific reason overrides', () => {
    expect(
      service.build({
        id: 'file-provider:scan-progress',
        label: 'File scan progress',
        roots: ['/a'],
        itemCount: 3,
        pendingRoots: 1,
        failedItems: 0,
        isActive: false,
        reasons: {
          pendingRoots: '   '
        }
      })
    ).toMatchObject({
      status: 'warming',
      reason: 'indexed-source-progress-has-pending-roots'
    })
  })

  it('normalizes malformed checkedAt and progress counters', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)

    expect(
      service.build({
        id: 'source:progress',
        label: 'Source progress',
        roots: ['/a'],
        itemCount: Number.NaN,
        totalRoots: Number.POSITIVE_INFINITY,
        pendingRoots: -1,
        failedItems: Number.NaN,
        isActive: false,
        checkedAt: -10
      })
    ).toMatchObject({
      status: 'ready',
      itemCount: 0,
      lastCheckedAt: 1700000000000,
      metadata: {
        totalRoots: 0,
        pendingRoots: 0
      }
    })
  })
})
