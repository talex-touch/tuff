import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A type declared in both intelligence barrels must not drift apart (#520).
 *
 * `packages/utils/types/intelligence.ts` owns the shared surface. `tuff-intelligence` forwards 58
 * names by hand and re-declares 146 more locally, so the two files hold ~146 declarations of the
 * same names — and renderer components import from `@talex-touch/tuff-intelligence`, which is the
 * copy that wins for them.
 *
 * That is the arrangement that produced the `IntelligenceMessage` fork (#519). It also produced a
 * live one in *runtime data*: 7faea27bf consolidated `DEFAULT_CAPABILITIES` onto the shared
 * declaration and left `DEFAULT_PROVIDERS` a literal, so utils gained two speech models while the
 * copy kept a third — and `intelligence-config.ts` imports the copy, so the app shipped the stale
 * set for four weeks with nothing failing.
 *
 * This does not stop the duplication; replacing it with `export type *` needs the 146 local
 * declarations deleted first, and would drop 7 value exports that a type-only re-export cannot
 * carry. What it does is make a divergence loud, which is the part that was missing.
 *
 * Lives in packages/utils because `ci / CI - utils` is a blocking check.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')

const UTILS = readFileSync(path.join(REPO_ROOT, 'packages/utils/types/intelligence.ts'), 'utf8')
const TUFF_INTELLIGENCE = readFileSync(
  path.join(REPO_ROOT, 'packages/tuff-intelligence/src/types/intelligence.ts'),
  'utf8',
)

/** Top-level exported declarations, keyed by name, with comments and whitespace normalised away. */
function declarations(source: string): Map<string, string> {
  const lines = source.split('\n')
  const found = new Map<string, string>()
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^export (?:type|interface|enum|const) (\w+)/.exec(lines[index]!)
    if (!match)
      continue
    let end = index + 1
    while (end < lines.length && !(lines[end]!).startsWith('export ')) end += 1
    found.set(
      match[1]!,
      lines
        .slice(index, end)
        .join('\n')
        .replace(/\/\*\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }
  return found
}

const utils = declarations(UTILS)
const local = declarations(TUFF_INTELLIGENCE)
const duplicated = [...local.keys()].filter(name => utils.has(name))

describe('the intelligence type barrels', () => {
  it('read the two files they mean to compare', () => {
    // Positive control: "nothing has drifted" is also what two empty maps report, which is what a
    // wrong path or a changed declaration style produces.
    expect(utils.size).toBeGreaterThan(150)
    expect(local.size).toBeGreaterThan(100)
    expect(duplicated.length).toBeGreaterThan(100)
  })

  it('declare the duplicated names identically', () => {
    // A name that delegates to the shared declaration is the *fixed* state, and its text differs
    // from the original by definition — so it is excluded here and checked below instead. Matching
    // on `SHARED_` rather than on a name list keeps that exclusion from becoming a place to hide.
    const drifted = duplicated
      .filter(name => !/=\s*SHARED_\w+/.test(local.get(name)!))
      .filter(name => utils.get(name) !== local.get(name))

    expect(drifted).toEqual([])
  })

  it('delegate the shared runtime constants rather than copying them', () => {
    // Types drifting is a compile error somewhere eventually. A constant drifting is not — it
    // ships. Both of these are values the app reads at startup, so they get named explicitly.
    expect(TUFF_INTELLIGENCE).toMatch(/DEFAULT_CAPABILITIES[\s\S]{0,80}=\s*SHARED_DEFAULT_CAPABILITIES/)
    expect(TUFF_INTELLIGENCE).toMatch(/DEFAULT_PROVIDERS[\s\S]{0,80}=\s*SHARED_DEFAULT_PROVIDERS/)
  })
})
