import { describe, expect, it } from 'vitest'
import {
  filterIndexedWatchPendingPermissionPaths,
  isIndexedWatchPathOwned,
  resolveIndexedWatchRootSet
} from '../../search'

const normalizeCaseInsensitive = (rawPath: string) => rawPath.toLowerCase()

describe('indexing watch root policy', () => {
  it('resolves base and extra roots with normalized de-duplication', () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ['/Users/demo/Documents', '/Users/demo/Downloads'],
      extraPaths: ['/users/demo/documents', '/Users/demo/Desktop'],
      normalizePath: normalizeCaseInsensitive
    })

    expect(rootSet.paths).toEqual([
      '/Users/demo/Documents',
      '/Users/demo/Downloads',
      '/Users/demo/Desktop'
    ])
    expect(rootSet.normalizedPaths).toEqual([
      '/users/demo/documents',
      '/users/demo/downloads',
      '/users/demo/desktop'
    ])
  })

  it('checks ownership for roots and child paths', () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ['/Users/demo/Documents'],
      normalizePath: normalizeCaseInsensitive
    })

    expect(
      isIndexedWatchPathOwned({
        rawPath: '/users/demo/documents',
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive,
        pathSeparator: '/'
      })
    ).toBe(true)
    expect(
      isIndexedWatchPathOwned({
        rawPath: '/Users/demo/Documents/report.md',
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive,
        pathSeparator: '/'
      })
    ).toBe(true)
  })

  it('does not treat shared prefixes as owned roots', () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ['/Users/demo/Documents'],
      normalizePath: normalizeCaseInsensitive
    })

    expect(
      isIndexedWatchPathOwned({
        rawPath: '/Users/demo/Documents-old/report.md',
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive,
        pathSeparator: '/'
      })
    ).toBe(false)
  })

  it('filters pending permission paths by exact normalized roots', () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ['/Users/demo/Documents', '/Users/demo/Downloads'],
      normalizePath: normalizeCaseInsensitive
    })

    expect(
      filterIndexedWatchPendingPermissionPaths({
        pendingPaths: [
          '/users/demo/documents',
          '/Users/demo/Documents/report.md',
          '/Applications'
        ],
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive
      })
    ).toEqual(['/users/demo/documents'])
  })

  it('supports windows path separators', () => {
    const rootSet = resolveIndexedWatchRootSet({
      basePaths: ['C:\\Users\\demo\\Documents'],
      normalizePath: normalizeCaseInsensitive
    })

    expect(
      isIndexedWatchPathOwned({
        rawPath: 'c:\\users\\demo\\documents\\report.md',
        normalizedWatchPaths: rootSet.normalizedPaths,
        normalizePath: normalizeCaseInsensitive,
        pathSeparator: '\\'
      })
    ).toBe(true)
  })
})
