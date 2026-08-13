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

  /**
   * `pathSegments` drops separators, so `usr` and `/usr` are both one segment. Without the root
   * marker a caller passing a relative path — `scanDirectory` does not require an absolute one —
   * would have it classified as a filesystem root. Found by CodeRabbit on #1728.
   */
  it('does not treat a relative path as the filesystem root', () => {
    for (const name of systemNames) {
      expect(reason(name), name).not.toBe('system-path')
      expect(reason(`./${name}`), `./${name}`).not.toBe('system-path')
      expect(reason(`a/${name}`), `a/${name}`).not.toBe('system-path')
      expect(reason(`C:${name}`), `C:${name}`).not.toBe('system-path')
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

/**
 * #1727's second acceptance criterion, which the root anchor above did not meet.
 *
 * `~/Library` and `%APPDATA%` are system locations under the user's home, not at the root, so
 * anchoring the name list to the filesystem root stopped excluding them. The claim that
 * `PATH_PATTERNS.SYSTEM_PATHS` still covered them was off by one separator: its macOS pattern is
 * `/^\/Users\/[^\/]+\/Library\//`, which needs a slash after `Library` and therefore matches
 * everything inside `~/Library` while missing `~/Library` itself.
 *
 * The leak is one directory level — on one Mac, all 111 subdirectories stayed excluded and six
 * direct files did not — and it is reachable only through a custom scan root, since the six default
 * roots never contain `~/Library`. Small, but it is a stated criterion and the comment asserting it
 * was wrong.
 */
describe('#1727 home-anchored system dirs', () => {
  const CANDIDATES = ['Library', 'AppData', 'LocalAppData']
  const active = CANDIDATES.filter(name => SYSTEM_BLACKLISTED_DIRS.has(name))

  it('gates on the platform list rather than a hardcoded name', () => {
    // Pins the intent per platform, and keeps the loops below from passing by being empty.
    const expected
      = process.platform === 'darwin'
        ? ['Library']
        : process.platform === 'win32'
          ? ['AppData', 'LocalAppData']
          : []
    expect(active).toEqual(expected)
  })

  it('excludes them one level under a home directory', () => {
    for (const name of active) {
      for (const home of ['/Users/someone', '/home/someone', 'C:/Users/someone'])
        expect(reason(`${home}/${name}`), `${home}/${name}`).toBe('system-path')
    }
  })

  /** The #1728 fix this must not undo: the same name deeper down is the user's own folder. */
  it('still indexes the same name below the home level', () => {
    for (const name of active) {
      const deep = `/Users/someone/Documents/${name}`
      expect(reason(deep), deep).not.toBe('system-path')
    }
  })

  it('leaves names the platform does not claim alone', () => {
    for (const name of CANDIDATES.filter(n => !SYSTEM_BLACKLISTED_DIRS.has(n)))
      expect(reason(`/home/someone/${name}`), name).not.toBe('system-path')
  })

  /**
   * The shape rule is three segments *and* a `Users`/`home` container. Without the second half any
   * three-segment path would qualify. `/opt/...` is not usable as the counter-example here — it is
   * already `system-path` through `PATH_PATTERNS.SYSTEM_PATHS`, which is correct and would have made
   * this pass for the wrong reason.
   */
  it('does not treat an arbitrary three-segment path as a home child', () => {
    for (const name of active) {
      for (const p of [`/data/vendor/${name}`, `/Volumes/Ext/${name}`])
        expect(reason(p), p).not.toBe('system-path')
    }
  })

  it('keeps excluding what was already excluded inside them', () => {
    if (process.platform === 'darwin')
      expect(reason('/Users/x/Library/Caches')).toBe('system-path')
  })
})
