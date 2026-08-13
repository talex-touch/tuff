import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `tuff-intelligence` must forward the shared intelligence surface, not restate it (#520).
 *
 * It used to re-declare 151 names that `packages/utils/types/intelligence.ts` already owned, and
 * renderer components import the tuff-intelligence copy, so that copy is the one that wins for
 * them. The arrangement produced the `IntelligenceMessage` fork (#519) and a live data drift:
 * 7faea27bf consolidated `DEFAULT_CAPABILITIES` onto the shared declaration and left
 * `DEFAULT_PROVIDERS` a literal, so utils gained two speech models while the copy kept a third
 * and the app shipped the stale set for four weeks with nothing failing.
 *
 * The copy is gone. What this guards now is that it stays gone, and that the one part a wildcard
 * cannot carry keeps working: `export type *` forwards types only, so every runtime value has to
 * be named explicitly, and a value added upstream is silently unreachable from the renderer until
 * someone adds it here.
 *
 * Lives in packages/utils because `ci / CI - utils` is a blocking check.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')

const UTILS = readFileSync(path.join(REPO_ROOT, 'packages/utils/types/intelligence.ts'), 'utf8')
const TUFF_INTELLIGENCE = readFileSync(
  path.join(REPO_ROOT, 'packages/tuff-intelligence/src/types/intelligence.ts'),
  'utf8',
)

/** Top-level exported declaration names. */
function declaredNames(source: string): string[] {
  return [
    ...source.matchAll(/^export (?:declare )?(?:type|interface|enum|const|class) (\w+)/gm),
  ].map(match => match[1]!)
}

/** Exported names that exist at runtime, so a type-only forward cannot carry them. */
function valueNames(source: string): string[] {
  return [...source.matchAll(/^export (?:declare )?(?:enum|const|class) (\w+)/gm)].map(
    match => match[1]!,
  )
}

/** Names listed in `export { … } from "…"`, which is how the values are forwarded. */
function reExportedValues(source: string): Set<string> {
  const blocks = [...source.matchAll(/export \{([^}]*)\} from ["'][^"']*["']/g)]
  const names = new Set<string>()
  for (const block of blocks) {
    for (const raw of block[1]!.split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0]!.trim()
      if (name) names.add(name)
    }
  }
  return names
}

describe('the intelligence type barrels', () => {
  it('reads the two files it means to compare', () => {
    // Positive control: a wrong path or a changed declaration style would otherwise make every
    // assertion below vacuously true.
    expect(declaredNames(UTILS).length).toBeGreaterThan(150)
    expect(valueNames(UTILS).length).toBeGreaterThan(3)
    expect(TUFF_INTELLIGENCE).toContain('@talex-touch/utils/types/intelligence')
  })

  it('forwards the shared types with a wildcard instead of restating them', () => {
    expect(TUFF_INTELLIGENCE).toMatch(
      /export type \* from ["']@talex-touch\/utils\/types\/intelligence["']/,
    )

    // Nothing may be declared here. Anything re-declared is a second copy of a name utils owns,
    // and the renderer reads this one.
    expect(declaredNames(TUFF_INTELLIGENCE)).toEqual([])
  })

  it('names every runtime value, which a type-only wildcard cannot carry', () => {
    const forwarded = reExportedValues(TUFF_INTELLIGENCE)
    const missing = valueNames(UTILS).filter(name => !forwarded.has(name))

    // A value added upstream is unreachable from the renderer until it is listed here, and
    // nothing else reports that -- the wildcard above silently covers only the types.
    expect(missing).toEqual([])
  })
})
