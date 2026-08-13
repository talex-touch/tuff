import { describe, expect, it } from 'vitest'
import { normalizeUpdateAssetKey } from './update-asset-utils'

/**
 * The one survivor of #529, which had no test.
 *
 * Every manifest-to-asset lookup in update-system.ts goes through this key — `resolveAssetByName`,
 * the signature lookup, and the manifest asset scan. If it stopped folding case, a manifest
 * written as `Tuff-1.2.3.dmg` would not match an asset uploaded as `tuff-1.2.3.dmg`, and the
 * update would report no artifact rather than fail loudly.
 */

describe('normalizeUpdateAssetKey', () => {
  it('folds case so manifest and release spellings match', () => {
    expect(normalizeUpdateAssetKey('Tuff-1.2.3.dmg')).toBe(
      normalizeUpdateAssetKey('tuff-1.2.3.dmg')
    )
    expect(normalizeUpdateAssetKey('LATEST-RELEASE.YML')).toBe('latest-release.yml')
  })

  it('changes nothing else about the name', () => {
    // Separators, dots and version digits are part of the identity — a key that also stripped
    // punctuation would collide two different artifacts onto one entry.
    expect(normalizeUpdateAssetKey('tuff-core_1.2.3-beta.2.app.zip')).toBe(
      'tuff-core_1.2.3-beta.2.app.zip'
    )
    expect(normalizeUpdateAssetKey('')).toBe('')
  })

  it('keeps distinct artifacts distinct', () => {
    expect(normalizeUpdateAssetKey('tuff-1.2.3.dmg')).not.toBe(
      normalizeUpdateAssetKey('tuff-1.2.3.pkg')
    )
  })
})
