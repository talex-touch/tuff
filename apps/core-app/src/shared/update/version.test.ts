import type { GitHubRelease } from '@talex-touch/utils'
import { AppPreviewChannel } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  compareUpdateVersions,
  parseComparableUpdateVersion,
  selectLatestUpdateRelease
} from './version'

function createRelease(tag: string, publishedAt: string): GitHubRelease {
  return {
    tag_name: tag,
    name: tag,
    published_at: publishedAt,
    body: '',
    assets: []
  }
}

describe('shared update version helpers', () => {
  it('normalizes snapshot preview versions into the beta channel', () => {
    const version = parseComparableUpdateVersion('2.4.9-SNAPSHOT.15')

    expect(version.channel).toBe(AppPreviewChannel.BETA)
    expect(version.prereleaseFamily).toBe('preview')
    expect(version.prereleaseIdentifiers).toEqual([15])
  })

  it('treats snapshot and beta prerelease numbers as the same preview sequence', () => {
    expect(compareUpdateVersions('2.4.9-SNAPSHOT.15', '2.4.9-beta.12')).toBe(1)
    expect(compareUpdateVersions('2.4.9-beta.15', '2.4.9-SNAPSHOT.15')).toBe(0)
  })

  it('keeps stable releases higher than preview releases of the same base version', () => {
    expect(compareUpdateVersions('2.4.9', '2.4.9-beta.99')).toBe(1)
  })

  it('selects the newest release even when the provider returns an unsorted list', () => {
    const releases = [
      createRelease('v2.4.9-beta.12', '2026-04-15T10:56:44Z'),
      createRelease('v2.4.9-beta.15', '2026-04-17T10:56:44Z'),
      createRelease('v2.4.9-beta.10', '2026-03-31T05:59:00Z')
    ]

    expect(selectLatestUpdateRelease(releases)?.tag_name).toBe('v2.4.9-beta.15')
  })
})
