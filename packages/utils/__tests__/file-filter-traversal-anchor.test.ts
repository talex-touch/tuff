import { describe, expect, it } from 'vitest'
import { fileFilterService } from '../common/file-filter-service'
import { SYSTEM_BLACKLISTED_DIRS } from '../common/file-scan-constants'

const reason = (p: string): string =>
  String(fileFilterService.getTraversalExclusionReason(p, undefined as never) ?? '—')

/**
 * The names are read from the runtime set rather than written down.
 *
 * `SYSTEM_BLACKLISTED_DIRS` is assembled per platform — macOS gets `MACOS_SYSTEM_DIRS`, Linux gets
 * `LINUX_SYSTEM_DIRS`, and only the matching branch is present. The first version of this file
 * asserted `/private` and `C:/Windows` directly; it passed on macOS and failed on Linux CI, because
 * `private` is macOS-only and the Windows names are Windows-only. What #1727 changed is *where* a
 * name matches, not *which* names are on the list, so the test asks the list.
 */
const systemNames = [...SYSTEM_BLACKLISTED_DIRS].filter(
  (name): name is string => typeof name === 'string' && name.length > 0 && !name.includes('/'),
)

describe('#1727 system-dir anchoring', () => {
  it('has names to check, so the assertions below are not vacuous', () => {
    expect(systemNames.length).toBeGreaterThan(0)
  })

  it('still excludes every system name at the filesystem root', () => {
    for (const name of systemNames) expect(reason(`/${name}`), `/${name}`).not.toBe('—')
  })

  /**
   * The defect: those names excluded a user's folder anywhere they appeared, before `readdir`, with
   * no error and no `errorCount` — so the file simply never showed up in search. Six of 545
   * directories under the default roots on one machine.
   *
   * Other lists own some of these names too, so this asserts only that `system-path` is no longer
   * the reason — not that the folder is definitely indexed.
   */
  it('no longer reports system-path for a user folder of the same name', () => {
    for (const name of systemNames) {
      const deep = `/Users/someone/Documents/${name}`
      expect(reason(deep), deep).not.toBe('system-path')
    }
  })

  it('keeps the root-anchored patterns doing their job below the root', () => {
    // From PATH_PATTERNS.SYSTEM_PATHS, which is where root-level system paths were always handled;
    // the name list was only ever adding the unanchored half. Platform-split for the same reason
    // as above.
    const belowRoot
      = process.platform === 'darwin'
        ? ['/System/Library/Fonts', '/Users/x/Library/Caches']
        : ['/usr/local/share', '/var/log']
    for (const p of belowRoot) expect(reason(p), p).toBe('system-path')
  })

  /**
   * Recorded, not fixed. `TEMP_BLACKLISTED_DIRS` and `DEV_BLACKLISTED_DIRS` are still matched on the
   * leaf name at any depth, so the folders that prompted #1727 are still excluded — by a different
   * list. Whether an ordinary word should exclude a folder under a user's documents is a policy
   * question, and this pins the current answer rather than deciding it.
   */
  it('documents the two lists this change does not touch', () => {
    expect(reason('/Users/x/Documents/tmp')).toBe('cache-path')
    expect(reason('/Users/x/Downloads/cache')).toBe('development-path')
    expect(reason('/Users/x/Documents/build')).toBe('development-path')
  })

  it('leaves the other reasons alone', () => {
    expect(reason('/Users/x/p/node_modules')).toBe('development-path')
    expect(reason('/Users/x/.config')).toBe('hidden-name')
    expect(reason('/Users/x/Pictures/Photos Library.photoslibrary')).toBe('bundle-internal')
  })
})
