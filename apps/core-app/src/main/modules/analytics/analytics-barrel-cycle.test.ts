import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Nothing under this directory may reach the analytics barrel at runtime (#526).
 *
 * index.ts's first statement re-exports analytics-module, so `import { getStartupAnalytics }
 * from '.'` inside analytics-module closed a cycle. It was benign only because the single call
 * site sits inside a method; any module-scope use would have resolved to undefined and thrown on
 * first metrics collection. The self-import also made every consumer of analytics-module pull in
 * ./types and ./startup-analytics whether or not it wanted them.
 *
 * `import type` is exempt: it is erased before the module graph exists.
 */

const DIR = __dirname
const SELF_BARREL = /from\s+['"]\.{1,2}(?:\/index)?['"]/

interface ImportStatement {
  file: string
  line: number
  text: string
}

function walk(dir: string, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...walk(full, path.join(prefix, entry)))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts'))
      found.push(path.join(prefix, entry))
  }
  return found
}

function collectImports(): { statements: ImportStatement[]; files: string[] } {
  const files = walk(DIR)
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

describe('analytics barrel cycle', () => {
  it('reads the tree it claims to check', () => {
    // Positive control, kept independent of whether the fix is in place: this stays green on a
    // tree where the cycle is reintroduced, so a failure here means the scan broke rather than
    // that the cycle came back.
    const { statements, files } = collectImports()

    expect(files).toContain('analytics-module.ts')
    expect(files).toContain('startup-analytics.ts')
    // Nested directories carry real code too, and a walk that stopped at the top level would
    // silently exclude them.
    expect(files.some((file) => file.includes(path.sep))).toBe(true)
    expect(statements.length).toBeGreaterThan(20)
  })

  it('has no value import of the barrel from inside the tree', () => {
    const { statements } = collectImports()

    const offenders = statements.filter(
      (statement) => SELF_BARREL.test(statement.text) && !/^import\s+type\b/.test(statement.text)
    )

    expect(
      offenders.map((offender) => `${offender.file}:${offender.line} ${offender.text}`)
    ).toEqual([])
  })

  it('detects a barrel import when one is present', () => {
    // Proves the pattern matches the shapes it is meant to catch, including the `..` spelling a
    // file in collectors/ or storage/ would use to reach the same barrel.
    expect(SELF_BARREL.test("import { getStartupAnalytics } from '.'")).toBe(true)
    expect(SELF_BARREL.test("import { getStartupAnalytics } from './index'")).toBe(true)
    expect(SELF_BARREL.test("import { x } from '..'")).toBe(true)
    expect(SELF_BARREL.test("import { x } from '../index'")).toBe(true)
    expect(SELF_BARREL.test("import { getStartupAnalytics } from './startup-analytics'")).toBe(
      false
    )
    expect(SELF_BARREL.test("import { createLogger } from '../../utils/logger'")).toBe(false)
  })
})
