import { describe, expect, it } from 'vitest'
import { IndexedSourceProfileDiagnosticsService } from '../../search'

const service = new IndexedSourceProfileDiagnosticsService()

describe('IndexedSourceProfileDiagnosticsService', () => {
  it('builds profile evidence with roots and metadata', () => {
    expect(
      service.buildEvidence({
        sourceId: 'browser-bookmarks',
        checkedAt: 123,
        metadata: {
          scannerOwner: 'core-runtime'
        },
        diagnostics: [
          {
            key: 'chrome',
            label: 'Chrome Bookmarks',
            status: 'ready',
            root: '/browser/chrome',
            itemCount: 2,
            metadata: {
              profileCount: 1
            }
          }
        ]
      })
    ).toEqual([
      {
        id: 'browser-bookmarks:chrome',
        label: 'Chrome Bookmarks',
        status: 'ready',
        itemCount: 2,
        rootCount: 1,
        roots: ['/browser/chrome'],
        lastCheckedAt: 123,
        reason: undefined,
        metadata: {
          scannerOwner: 'core-runtime',
          profileCount: 1
        }
      }
    ])
  })

  it('builds granted roots for supported profile diagnostics', () => {
    expect(
      service.buildRoots({
        sourceId: 'browser-bookmarks',
        rootWatchDepth: 2,
        diagnostics: [
          {
            key: 'chrome',
            label: 'Chrome Bookmarks',
            status: 'ready',
            root: '/browser/chrome'
          },
          {
            key: 'arc',
            label: 'Arc Bookmarks',
            status: 'unsupported',
            root: '/browser/arc'
          },
          {
            key: 'edge',
            label: 'Edge Bookmarks',
            status: 'degraded'
          }
        ]
      })
    ).toEqual([
      {
        sourceId: 'browser-bookmarks',
        path: '/browser/chrome',
        permissionState: 'granted',
        watchDepth: 2,
        reason: undefined
      }
    ])
  })

  it('uses root reason override when provided', () => {
    expect(
      service.buildRoots({
        sourceId: 'browser-history',
        rootWatchDepth: 1,
        rootReason: 'browser-data-profile-root',
        diagnostics: [
          {
            key: 'chrome',
            label: 'Chrome History',
            status: 'degraded',
            root: '/browser/chrome',
            reason: 'history-file-not-found'
          }
        ]
      })
    ).toEqual([
      {
        sourceId: 'browser-history',
        path: '/browser/chrome',
        permissionState: 'granted',
        watchDepth: 1,
        reason: 'browser-data-profile-root'
      }
    ])
  })
})
