import { fileFilterService } from '../common/file-filter-service'
import { describe, expect, it } from 'vitest'
const r = (p: string): string => String(fileFilterService.getTraversalExclusionReason(p, undefined as never) ?? '—')

describe('#1727 system-dir anchoring', () => {
  it('still excludes real system locations at the filesystem root', () => {
    for (const p of ['/usr', '/var', '/tmp', '/private', '/dev', '/opt', '/etc', '/System', '/Library', '/Applications'])
      expect(r(p), p).not.toBe('—')
    // SYSTEM_BLACKLISTED_DIRS is platform-scoped -- on macOS it holds only MACOS_SYSTEM_DIRS, so
    // Windows names are not in it here. The drive-letter branch of isFilesystemRootChild is still
    // asserted, on a name this platform does have.
    expect(r('C:/Library'), 'C:/Library').toBe('system-path')
    expect(r('/Users/x/Documents/Application Support')).toBe('—')
  })

  it('still excludes system paths below the root, via the anchored patterns', () => {
    for (const p of ['/private/var/folders/x', '/System/Library/Fonts', '/Users/x/Library/Caches'])
      expect(r(p), p).toBe('system-path')
  })

  /** The six false positives measured on a real machine, minus the ones another list also owns. */
  it('no longer excludes user folders named after system directories', () => {
    for (const p of [
      '/Users/x/Pictures/private',
      '/Users/x/Documents/Library',
      '/Users/x/Documents/etc',
      '/Users/x/Music/var',
      '/Users/x/Documents/usr',
      '/Users/x/Documents/opt'
    ]) expect(r(p), p).toBe('—')
  })

  /**
   * Recorded, not fixed: `tmp` is on TEMP_BLACKLISTED_DIRS and `dev`/`bin`/`out`/`cache` on
   * DEV_BLACKLISTED_DIRS, and both lists are still matched on the leaf name at any depth. So the
   * observed Codex session tmp folders are still excluded -- by a different list, for a reason
   * that is a policy call rather than an obvious defect.
   */
  it('documents the two lists this change does not touch', () => {
    expect(r('/Users/x/Documents/tmp')).toBe('cache-path')
    expect(r('/Users/x/Downloads/cache')).toBe('development-path')
    expect(r('/Users/x/Documents/build')).toBe('development-path')
  })

  it('leaves the other reasons alone', () => {
    expect(r('/Users/x/p/node_modules')).toBe('development-path')
    expect(r('/Users/x/.config')).toBe('hidden-name')
    expect(r('/Users/x/Pictures/Photos Library.photoslibrary')).toBe('bundle-internal')
  })
})
