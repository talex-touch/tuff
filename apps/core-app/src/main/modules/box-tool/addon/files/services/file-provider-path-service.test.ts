import { describe, expect, it } from 'vitest'
import { getWatchDepthForPath, normalizeWatchPath } from './file-provider-path-service'

describe('file-provider-path-service', () => {
  it('normalizes path and respects case sensitivity flag', () => {
    const source = '/Users/Test/Projects/../App/File.TXT'
    const insensitive = normalizeWatchPath(source, true)
    const sensitive = normalizeWatchPath(source, false)

    expect(insensitive).toBe(sensitive.toLowerCase())
  })

  it('returns a positive watch depth', () => {
    expect(getWatchDepthForPath('/tmp')).toBeGreaterThan(0)
  })
})
