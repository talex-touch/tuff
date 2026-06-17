import { describe, expect, it } from 'vitest'
import { getIndexedWatchDepthForPath, normalizeIndexedWatchPath } from '../../search'

describe('indexing watch path policy', () => {
  it('normalizes path and respects case sensitivity flag', () => {
    const source = '/Users/Test/Projects/../App/File.TXT'
    const insensitive = normalizeIndexedWatchPath(source, true)
    const sensitive = normalizeIndexedWatchPath(source, false)

    expect(insensitive).toBe(sensitive.toLowerCase())
  })

  it('uses deeper macOS watch depth for file index roots', () => {
    expect(
      getIndexedWatchDepthForPath({
        platform: 'darwin',
        watchPath: '/Users/test/Downloads'
      })
    ).toBe(5)
    expect(
      getIndexedWatchDepthForPath({
        platform: 'darwin',
        watchPath: '/Applications'
      })
    ).toBe(5)
    expect(
      getIndexedWatchDepthForPath({
        platform: 'darwin',
        watchPath: '/Users/test/Documents'
      })
    ).toBe(5)
  })

  it('uses platform defaults for non-macOS roots', () => {
    expect(
      getIndexedWatchDepthForPath({
        platform: 'win32',
        watchPath: 'C:\\Users\\test\\Documents'
      })
    ).toBe(4)
    expect(
      getIndexedWatchDepthForPath({
        platform: 'linux',
        watchPath: '/home/test/Documents'
      })
    ).toBe(3)
  })
})
