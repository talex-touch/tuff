import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ID,
  TUFF_NEXUS_PROVIDER_ORIGIN
} from '../intelligence/nexus-provider'

/**
 * The Nexus-managed provider rule, and the guarantee that only one module states it (#537).
 *
 * Main and renderer both classify providers with this predicate for different reasons — the
 * renderer decides whether to show the official badge and the edit/delete buttons, main decides
 * runtime resolution and whether a delete is honoured. They used to hold byte-identical private
 * copies, so widening the rule on one side would have left the UI offering Delete on a provider
 * main refuses to delete, and the user would get a silent no-op.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')

/** Where the names may be declared. Everywhere else must import them. */
const DECLARING_FILE = 'packages/utils/intelligence/nexus-provider.ts'

const SEARCH_ROOTS = ['apps', 'packages', 'plugins']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.nuxt', '.output', 'coverage'])

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* sourceFiles(path.join(dir, entry.name))
      continue
    }
    if (/\.(ts|tsx|vue|js|mjs)$/.test(entry.name)) yield path.join(dir, entry.name)
  }
}

/**
 * Implemented with node:fs rather than by shelling out. A first version used ripgrep, which is
 * not installed on the CI runner — the guard then failed as `spawnSync rg ENOENT`, which is the
 * loud version of a check that cannot run, but a check that cannot run all the same.
 */
function declarationsOf(name: string): string[] {
  const pattern = new RegExp(`export\\s+(?:const|function)\\s+${name}\\b`)
  const found: string[] = []

  for (const root of SEARCH_ROOTS) {
    const absolute = path.join(REPO_ROOT, root)
    if (!existsSync(absolute)) continue
    for (const file of sourceFiles(absolute)) {
      if (pattern.test(readFileSync(file, 'utf8')))
        found.push(path.relative(REPO_ROOT, file))
    }
  }

  return found.sort()
}

describe('isNexusManagedProvider', () => {
  it('matches the managed provider by id', () => {
    expect(isNexusManagedProvider({ id: TUFF_NEXUS_PROVIDER_ID })).toBe(true)
  })

  it('matches any provider carrying the managed origin', () => {
    // The second arm exists so Nexus can hand out more than one provider; a rule that only
    // checked the id would classify those as user-owned and offer Delete on them.
    expect(
      isNexusManagedProvider({ id: 'something-else', metadata: { origin: TUFF_NEXUS_PROVIDER_ORIGIN } })
    ).toBe(true)
  })

  it('leaves user-configured providers alone', () => {
    expect(isNexusManagedProvider({ id: 'openai' })).toBe(false)
    expect(isNexusManagedProvider({ id: 'openai', metadata: {} })).toBe(false)
    expect(isNexusManagedProvider({ id: 'openai', metadata: null })).toBe(false)
    expect(isNexusManagedProvider({})).toBe(false)
    expect(isNexusManagedProvider({ metadata: { origin: 'user' } })).toBe(false)
  })

  it('does not treat a near-miss origin as managed', () => {
    // Substring or case-insensitive matching here would silently take ownership of a provider the
    // user configured.
    expect(isNexusManagedProvider({ metadata: { origin: 'tuff-nexus-mirror' } })).toBe(false)
    expect(isNexusManagedProvider({ metadata: { origin: 'TUFF-NEXUS' } })).toBe(false)
    expect(isNexusManagedProvider({ id: 'tuff-nexus-default-2' })).toBe(false)
  })
})

describe('single declaration', () => {
  it('runs against the monorepo', () => {
    // Positive control: the scans below assert that nothing outside one file declares these
    // names, which an unreadable tree would satisfy just as well.
    expect(existsSync(path.join(REPO_ROOT, 'apps'))).toBe(true)
    expect(existsSync(path.join(REPO_ROOT, DECLARING_FILE))).toBe(true)
  })

  it.each(['TUFF_NEXUS_PROVIDER_ID', 'isNexusManagedProvider'])(
    'declares %s exactly once',
    (name) => {
      const declarations = declarationsOf(name)

      // Non-empty first: a broken pattern returning nothing would otherwise read as "one place".
      expect(declarations.length).toBeGreaterThan(0)
      expect(declarations).toEqual([DECLARING_FILE])
    }
  )
})
