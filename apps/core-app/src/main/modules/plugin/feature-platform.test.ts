import { describe, expect, it } from 'vitest'
import { isFeatureUnavailableOnPlatform } from './feature-platform'

describe('isFeatureUnavailableOnPlatform', () => {
  it('excludes only on an explicit false for the running platform', () => {
    const feature = { platform: { win32: true, darwin: false, linux: false } }

    expect(isFeatureUnavailableOnPlatform(feature, 'darwin')).toBe(true)
    expect(isFeatureUnavailableOnPlatform(feature, 'linux')).toBe(true)
    expect(isFeatureUnavailableOnPlatform(feature, 'win32')).toBe(false)
  })

  it('leaves a feature that declares nothing available everywhere', () => {
    // 25 of the 30 shipped features declare no platform. Treating undeclared as unavailable
    // would empty the launcher (#820).
    for (const platform of ['win32', 'darwin', 'linux'] as NodeJS.Platform[]) {
      expect(isFeatureUnavailableOnPlatform({}, platform)).toBe(false)
      expect(isFeatureUnavailableOnPlatform({ platform: undefined }, platform)).toBe(false)
      expect(isFeatureUnavailableOnPlatform(undefined, platform)).toBe(false)
    }
  })

  it('treats a platform the author did not mention as not ruled out', () => {
    // Absence is "did not consider", not "excluded" — the difference matters on a platform
    // outside the three the manifest schema knows about.
    const feature = { platform: { win32: true, darwin: true, linux: true } }

    expect(isFeatureUnavailableOnPlatform(feature, 'freebsd' as NodeJS.Platform)).toBe(false)
  })

  it('ignores a platform value that is not the manifest shape', () => {
    // `plugins:validate` rejects these, but a hand-edited or older manifest can still reach
    // the loader, and guessing at an unknown shape is worse than ignoring it.
    expect(isFeatureUnavailableOnPlatform({ platform: 'linux' }, 'linux')).toBe(false)
    expect(isFeatureUnavailableOnPlatform({ platform: ['linux'] }, 'linux')).toBe(false)
    expect(isFeatureUnavailableOnPlatform({ platform: null }, 'linux')).toBe(false)
    // The IPlatform runtime shape: `enable: false` is not the manifest's `false`.
    expect(
      isFeatureUnavailableOnPlatform({ platform: { linux: { enable: false } } }, 'linux')
    ).toBe(false)
  })

  it('does not treat a falsy-but-not-false value as an exclusion', () => {
    // `0`, `''` and `null` are all things a loose manifest could carry; only `false` means
    // the author ruled the platform out.
    for (const value of [0, '', null, 'false']) {
      expect(isFeatureUnavailableOnPlatform({ platform: { linux: value } }, 'linux')).toBe(false)
    }
  })
})
