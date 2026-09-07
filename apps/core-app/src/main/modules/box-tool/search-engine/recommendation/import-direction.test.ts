import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The recommendation rebuilder must not import a concrete source.
 *
 * `item-rebuilder` used to reach its seven sources through `await import()`. That was not lazy
 * loading: five of those six dynamic imports resolve back here through
 * `<provider> → search-core → recommendation-engine → item-rebuilder`, so a static import would
 * have produced a boot-time `Cannot access '...' before initialization` — before any window exists
 * to show it. The registry inverted the direction: sources push themselves in.
 *
 * `core-box/core-box-import-cycle.test.ts` guards the sibling directory and does not cover this
 * one, which is why the check is duplicated rather than shared.
 */

const DIR = __dirname
const MAIN_ROOT = path.resolve(DIR, '../../../../')

/** Modules outside this directory that a file here must not reach, statically or dynamically. */
const FORBIDDEN_TARGETS = [
  /box-tool\/addon\/system\//,
  /box-tool\/addon\/apps\/app-provider/,
  /box-tool\/addon\/files\/file-provider/,
  /box-tool\/search-engine\/search-core/,
  /modules\/plugin\/plugin-module/,
  /modules\/plugin\/adapters\//
]

function sourceFiles(): string[] {
  return readdirSync(DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => path.join(DIR, name))
    .filter((file) => statSync(file).isFile())
}

function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specifiers: string[] = []
  // Matches `from '...'` and `import('...')` alike; type-only imports are erased at runtime and
  // cannot form a cycle, so they are skipped.
  const pattern = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    const line = source.slice(source.lastIndexOf('\n', match.index) + 1, match.index)
    if (line.includes('import type')) continue
    specifiers.push(match[1])
  }
  return specifiers
}

describe('recommendation module import direction', () => {
  it('never reaches a concrete source or the search core, statically or dynamically', () => {
    // Both forms are checked with one list: a dynamic import would restore the old shape while
    // hiding it from the type checker, turning the cycle into a startup crash that only
    // reproduces in a packaged run.
    const violations: string[] = []

    for (const file of sourceFiles()) {
      for (const specifier of importSpecifiers(file)) {
        if (!specifier.startsWith('.')) continue
        const resolved = path.resolve(path.dirname(file), specifier)
        const relative = path.relative(MAIN_ROOT, resolved)
        if (FORBIDDEN_TARGETS.some((pattern) => pattern.test(relative))) {
          violations.push(`${path.basename(file)} -> ${specifier}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps the rebuilder free of any import from another module', () => {
    // The dispatcher is what the registry exists to protect: it must know about no source at all,
    // not merely avoid the forbidden ones. Leaf helpers under `utils/` are fine — they cannot
    // reach back into a provider — so the line is drawn at `modules/`.
    const rebuilder = path.join(DIR, 'item-rebuilder.ts')
    const foreignModules = importSpecifiers(rebuilder)
      .filter((specifier) => specifier.startsWith('.'))
      .filter((specifier) => {
        const resolved = path.resolve(DIR, specifier)
        if (resolved.startsWith(DIR)) return false
        return path.relative(MAIN_ROOT, resolved).startsWith('modules/')
      })

    expect(foreignModules).toEqual([])
  })
})
