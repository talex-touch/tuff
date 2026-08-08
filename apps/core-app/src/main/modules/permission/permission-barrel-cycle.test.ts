import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Nothing in this directory may reach its own barrel at runtime (#525).
 *
 * index.ts re-exports channel-guard's public API, so a value import of './index' from inside the
 * directory closes a cycle through the code that gates IPC channels. It works today only because
 * `getPermissionModule` was a hoisted function declaration; the moment index.ts gains module-scope
 * initialization that runs before it, the guard resolves an uninitialized binding and the failure
 * shows up as a permission check that silently never runs.
 *
 * `import type` is exempt: it is erased before the module graph exists.
 *
 * A source scan rather than an import-order test, because the hazard is the edge itself — an
 * import-order test would only catch the orderings someone thought to write.
 */

const DIR = __dirname
const SELF_BARREL = /from\s+['"]\.(?:\/index)?['"]/

interface ImportStatement {
  file: string
  line: number
  text: string
}

function collectImports(): { statements: ImportStatement[]; files: string[] } {
  const files = readdirSync(DIR).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')
  )

  const statements: ImportStatement[] = []
  for (const file of files) {
    const lines = readFileSync(path.join(DIR, file), 'utf8').split('\n')
    lines.forEach((text, index) => {
      if (/^\s*(?:import|export)\b/.test(text) && /\bfrom\s+['"]/.test(text))
        statements.push({ file, line: index + 1, text: text.trim() })
    })
  }

  return { statements, files }
}

describe('permission barrel cycle', () => {
  it('reads the directory it claims to check', () => {
    // Positive control. Every assertion below is "nothing matched", which a scan reading zero
    // files or zero lines would also satisfy.
    const { statements, files } = collectImports()

    // Kept independent of whether the fix is in place: this test must stay green on a tree where
    // the cycle has been reintroduced, so that a failure here means the scan broke and a failure
    // below means the cycle came back.
    expect(files).toContain('index.ts')
    expect(files).toContain('channel-guard.ts')
    expect(statements.length).toBeGreaterThan(10)
    expect(statements.some((statement) => statement.file === 'channel-guard.ts')).toBe(true)
  })

  it('has no value import of the barrel from inside the directory', () => {
    const { statements } = collectImports()

    const offenders = statements.filter(
      (statement) => SELF_BARREL.test(statement.text) && !/^import\s+type\b/.test(statement.text)
    )

    expect(
      offenders.map((offender) => `${offender.file}:${offender.line} ${offender.text}`)
    ).toEqual([])
  })

  it('detects a barrel import when one is present', () => {
    // Proves the regex above actually matches the shape it is meant to catch — the form this
    // issue was filed for, plus the bare-directory spelling that resolves to the same file.
    expect(SELF_BARREL.test("import { getPermissionModule } from './index'")).toBe(true)
    expect(SELF_BARREL.test("import { getPermissionModule } from '.'")).toBe(true)
    expect(SELF_BARREL.test("export { PermissionGuard } from './permission-guard'")).toBe(false)
    expect(SELF_BARREL.test("import { setPermissionModule } from './permission-module-ref'")).toBe(
      false
    )
  })

  it('keeps the barrel re-exporting the singleton accessors', () => {
    // Fourteen files outside this directory import getPermissionModule from the barrel. Moving the
    // definition must stay invisible to them.
    const barrel = readFileSync(path.join(DIR, 'index.ts'), 'utf8')
    expect(barrel).toMatch(
      /export\s*\{[^}]*getPermissionModule[^}]*\}\s*from\s+['"]\.\/permission-module-ref['"]/
    )
    expect(barrel).toMatch(
      /export\s*\{[^}]*setPermissionModule[^}]*\}\s*from\s+['"]\.\/permission-module-ref['"]/
    )
  })
})
