import { describe, expect, it } from 'vitest'
import {
  CONTEXT_DEPENDENT_BLACKLISTED_DIRS,
  DEV_BLACKLISTED_DIRS,
  TEMP_BLACKLISTED_DIRS,
} from '../common/file-scan-constants'
import { fileFilterService } from '../common/file-filter-service'

/**
 * #1727's last acceptance criterion: a decision on whether development names apply under a user's
 * document roots.
 *
 * The decision is *not by name alone*. `node_modules` is nobody's document folder and keeps
 * excluding everywhere; `build`, `dist`, `out`, `bin`, `target`, `coverage`, `logs`, `tmp`, `temp`
 * and `cache` are ordinary English words, and they exclude only where a project marker sits beside
 * them — the same signal ripgrep, fd and VS Code use, and free here because the traversal has
 * already read the parent before it descends.
 *
 * Both directions are asserted below, because only one of them is the silent one: a wrongly-kept
 * exclusion produces no error, no `errorCount`, and a search result identical to "file not there".
 */

/** A directory whose siblings were read and contain no project marker. */
const withoutProject = (p: string, siblings: readonly string[] = ['notes.txt']): string =>
  String(fileFilterService.getTraversalExclusionReason(p, undefined, { siblingNames: siblings }) ?? '—')

/** The same, next to a `package.json`. */
const withProject = (p: string, marker = 'package.json'): string =>
  String(
    fileFilterService.getTraversalExclusionReason(p, undefined, {
      siblingNames: [marker, 'src', 'README.md'],
    }) ?? '—',
  )

/** No context at all — every caller other than the traversal. */
const withoutContext = (p: string): string =>
  String(fileFilterService.getTraversalExclusionReason(p) ?? '—')

const ORDINARY_WORDS = [...CONTEXT_DEPENDENT_BLACKLISTED_DIRS]

describe('#1727 ordinary-word dirs under a user root', () => {
  it('has names to check, so the loops below are not vacuous', () => {
    expect(ORDINARY_WORDS.length).toBeGreaterThan(0)
  })

  /**
   * The set only ever weakens where an existing list applies. A name here that is on neither list
   * would be inventing policy in a constant nobody reads.
   */
  it('only relaxes names the two blacklists already own', () => {
    for (const name of ORDINARY_WORDS) {
      expect(
        DEV_BLACKLISTED_DIRS.has(name) || TEMP_BLACKLISTED_DIRS.has(name),
        name,
      ).toBe(true)
    }
  })

  it('indexes them when nothing beside them says "project"', () => {
    for (const name of ORDINARY_WORDS) {
      const p = `/Users/someone/Documents/${name}`
      expect(withoutProject(p), p).toBe('—')
    }
  })

  it('still excludes them beside a project marker', () => {
    for (const name of ORDINARY_WORDS) {
      const p = `/Users/someone/Projects/app/${name}`
      expect(withProject(p), p).not.toBe('—')
    }
  })

  /**
   * The half a leaf-name-only fix would have missed. `PATH_PATTERNS.DEV_PATHS` carries `/build\//`
   * unanchored, so it matches an *ancestor* segment: `~/Documents/build` would come back indexed
   * while everything under it stayed excluded.
   */
  it('indexes what is below them too, not just the folder itself', () => {
    const p = '/Users/someone/Documents/build/2026'
    expect(withoutProject(p, ['2026', 'notes.txt']), p).toBe('—')
    expect(withoutProject('/Users/someone/Documents/tmp/receipts'), 'tmp/receipts').toBe('—')
  })

  it('recognises project markers other than package.json', () => {
    for (const marker of ['Cargo.toml', 'go.mod', 'Makefile', 'pom.xml', '.git'])
      expect(withProject('/Users/someone/Documents/target', marker), marker).not.toBe('—')
  })

  /** `App.csproj` is named per project, so the marker list matches it by suffix. */
  it('recognises per-project marker names by suffix', () => {
    expect(withProject('/Users/someone/Documents/bin', 'App.csproj')).not.toBe('—')
  })

  it('matches markers case-insensitively', () => {
    expect(withProject('/Users/someone/Documents/build', 'makefile')).not.toBe('—')
  })
})

describe('#1727 what the relaxation must not touch', () => {
  it('keeps node_modules excluded with or without a project beside it', () => {
    const p = '/Users/someone/Documents/node_modules'
    expect(withoutProject(p)).toBe('development-path')
    expect(withProject(p)).toBe('development-path')
    expect(withoutContext(p)).toBe('development-path')
  })

  /**
   * `bin` is on the macOS system list *and* the dev list. Relaxing the dev half must not hand back
   * `/usr/bin`, and it does not: `PATH_PATTERNS.SYSTEM_PATHS` is the one of the three pattern sets
   * left unconditional, precisely because it catches what the per-level name rule cannot.
   */
  it('keeps real system paths excluded once bin and tmp are relaxed', () => {
    if (process.platform === 'win32') return
    for (const p of ['/usr/bin', '/var/tmp', '/usr/local/bin'])
      expect(withoutProject(p, ['lib', 'share']), p).toBe('system-path')
  })

  it('keeps hidden and bundle rules ahead of the relaxation', () => {
    expect(withoutProject('/Users/someone/Documents/.cache')).toBe('hidden-name')
    expect(withoutProject('/Users/someone/Pictures/Photos Library.photoslibrary')).toBe(
      'bundle-internal',
    )
  })

  it('still honours an explicit custom blacklist', () => {
    const reason = fileFilterService.getTraversalExclusionReason(
      '/Users/someone/Documents/build',
      { customBlacklistedDirs: new Set(['build']) },
      { siblingNames: ['notes.txt'] },
    )
    expect(reason).toBe('excluded-path')
  })
})

describe('#1727 callers that supply no context are unchanged', () => {
  /**
   * The regression guard for everything that is not the traversal — index upserts, manual adds, the
   * file-level containing-path check. They cannot see siblings, so they keep the pre-#1727 answer
   * rather than being handed a guess.
   */
  it('gives the strict answer when siblings were never read', () => {
    expect(withoutContext('/Users/x/Documents/tmp')).toBe('cache-path')
    expect(withoutContext('/Users/x/Downloads/cache')).toBe('development-path')
    expect(withoutContext('/Users/x/Documents/build')).toBe('development-path')
    expect(withoutContext('/Users/x/Documents/build/2026')).toBe('development-path')
  })

  /**
   * Read-and-found-nothing is a different statement from never-looked, and an empty directory is a
   * real thing to be standing in. Collapsing the two would make an empty parent strict again.
   */
  it('treats an empty sibling list as read, not as unknown', () => {
    expect(withoutProject('/Users/x/Documents/build', [])).toBe('—')
  })
})
