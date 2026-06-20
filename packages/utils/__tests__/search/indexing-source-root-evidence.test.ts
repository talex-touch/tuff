import { afterEach, describe, expect, it, vi } from 'vitest'
import { IndexedSourceRootEvidenceService } from '../../search'

const service = new IndexedSourceRootEvidenceService()

describe('IndexedSourceRootEvidenceService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds ready evidence when roots are present', () => {
    expect(
      service.build({
        id: 'app-provider:watch-roots',
        label: 'Watch roots',
        roots: ['/Applications', '/Users/demo/Applications'],
        emptyReason: 'app-watch-roots-empty',
        checkedAt: 123,
        metadata: {
          platform: 'darwin'
        }
      })
    ).toEqual({
      id: 'app-provider:watch-roots',
      label: 'Watch roots',
      status: 'ready',
      rootCount: 2,
      roots: ['/Applications', '/Users/demo/Applications'],
      lastCheckedAt: 123,
      reason: undefined,
      metadata: {
        platform: 'darwin'
      }
    })
  })

  it('builds degraded evidence when roots are empty', () => {
    expect(
      service.build({
        id: 'app-provider:watch-roots',
        label: 'Watch roots',
        roots: [],
        emptyReason: 'app-watch-roots-empty',
        checkedAt: 456
      })
    ).toEqual({
      id: 'app-provider:watch-roots',
      label: 'Watch roots',
      status: 'degraded',
      rootCount: 0,
      roots: [],
      lastCheckedAt: 456,
      reason: 'app-watch-roots-empty',
      metadata: undefined
    })
  })

  it('normalizes malformed checkedAt values', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)

    expect(
      service.build({
        id: 'app-provider:watch-roots',
        label: 'Watch roots',
        roots: ['/Applications'],
        emptyReason: 'app-watch-roots-empty',
        checkedAt: -1
      })
    ).toMatchObject({
      lastCheckedAt: 1700000000000
    })
  })
})
