import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `IntelligenceMessage` must be declared once (#519).
 *
 * It was declared in both `@talex-touch/utils` and `@talex-touch/tuff-intelligence`, and the two
 * had already drifted — the tuff-intelligence copy carried `metadata`, the utils one did not.
 * Main-process code imports the utils copy and renderer components import the tuff-intelligence
 * one, so **nothing typechecked them against each other**: the divergence only surfaced when a
 * message crossed the boundary, as a field that silently vanished.
 *
 * That is the property worth guarding. A second declaration is not a style problem here; it is a
 * type system that has stopped being able to see the mismatch.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const PACKAGES = path.join(REPO_ROOT, 'packages')
const SKIP = new Set(['node_modules', 'dist', '.git', '__tests__'])

const DECLARED = /^export\s+interface\s+(IntelligenceMessage|IntelligenceMessageAttachment)\b/m

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full))
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full)
  }
  return found
}

const declarations = sourceFiles(PACKAGES).filter((file) =>
  DECLARED.test(readFileSync(file, 'utf8'))
)

describe('IntelligenceMessage', () => {
  it('is declared somewhere', () => {
    // Positive control: "declared in exactly one place" is also what a scan that reads nothing
    // reports, except it reports zero — so the count is checked, not just the uniqueness.
    expect(declarations.length).toBeGreaterThan(0)
  })

  it('is declared in exactly one package', () => {
    const owners = [...new Set(declarations.map((file) => path.relative(PACKAGES, file).split(path.sep)[0]))]

    expect(owners).toEqual(['utils'])
  })

  it('carries the field the forked copy had, so nothing was lost in unforking', () => {
    // `metadata` existed only in the tuff-intelligence copy and is load-bearing —
    // agent-runtime.ts spreads it when normalising promptInjection. Dropping it while merging the
    // two would have been a silent regression rather than a visible one.
    const source = readFileSync(path.join(PACKAGES, 'utils/types/intelligence.ts'), 'utf8')
    const declaration = /export interface IntelligenceMessage \{[\s\S]*?\n\}/.exec(source)?.[0] ?? ''

    expect(declaration).toContain('metadata?:')
    expect(declaration).toContain('attachments?:')
    expect(declaration).not.toContain('Record<string, any>')
  })

  it('is re-exported by tuff-intelligence, so its consumers keep their import path', () => {
    // 13 files import it from tuff-intelligence. Unforking must not become a rename.
    const source = readFileSync(
      path.join(PACKAGES, 'tuff-intelligence/src/types/intelligence.ts'),
      'utf8'
    )

    expect(source).toMatch(/export type \{[\s\S]*?IntelligenceMessage[\s\S]*?\} from ["']@talex-touch\/utils/)
  })
})
