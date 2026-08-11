import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from '../permission/registry'

/**
 * Every name a guard is handed must resolve to a permission (#915).
 *
 * Two vocabularies feed `PermissionGuard.check()` through the same parameter:
 *
 * - `API_PERMISSION_MAPPINGS` is keyed on colon-separated **API names** — `clipboard:read`,
 *   `native:file:stat` — which it maps to one or more permission ids.
 * - `withPermission` / `createProtectedRegister` name a dotted **permission id** directly
 *   (`{ permissionId: 'system.shell' }`), and `channel-guard.ts` passes that value straight
 *   through as the `apiName` argument.
 *
 * No pattern in the table contains a dot, so for a long time every one of those fell off the
 * end of the lookup and `check()` returned `allowed: true`. The terminal, network,
 * plugin-window, localization and agent-execution gates were all allow-everything, and the
 * only visible symptom was their absence: the code reads exactly like a working gate.
 *
 * That is why this test lives in `packages/utils` rather than beside the guard — `ci / CI -
 * utils` blocks a PR, `App suites (core-app)` is continue-on-error and reports success
 * whatever the suite does.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const MAIN = path.join(REPO_ROOT, 'apps/core-app/src/main')
const GUARD = path.join(MAIN, 'modules/permission/permission-guard.ts')

const REGISTERED = new Set(PERMISSIONS.map(permission => permission.id))

/** The `pattern` side of API_PERMISSION_MAPPINGS. */
function apiPatterns(): string[] {
  const source = readFileSync(GUARD, 'utf8')
  const table = source.slice(
    source.indexOf('export const API_PERMISSION_MAPPINGS'),
    source.indexOf('export class PermissionGuard'),
  )
  return [...table.matchAll(/pattern:\s*'([^']+)'/g)].map(([, pattern]) => pattern)
}

function matchesPattern(pattern: string, name: string): boolean {
  if (pattern.endsWith('*'))
    return name.startsWith(pattern.slice(0, -1))
  if (pattern.includes('*'))
    return new RegExp(`^${pattern.replace(/\*/g, '.*')}$`).test(name)
  return pattern === name
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found)
      continue
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.'))
      found.push(full)
  }
  return found
}

/**
 * `permissionId: '<literal>'` in guard-option position.
 *
 * Skips the type-annotation form (`permissionId: 'fs.read' | 'fs.write'`) and the guard's own
 * empty placeholder, neither of which is a value handed to a check.
 */
function declaredPermissionIds(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const file of sourceFiles(MAIN)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/permissionId:\s*'([^']*)'(\s*\|)?/g)) {
      const [, name, isUnion] = match
      if (isUnion || name === '')
        continue
      const line = source.slice(0, match.index).split('\n').length
      const where = `${path.relative(MAIN, file)}:${line}`
      found.set(name, [...(found.get(name) ?? []), where])
    }
  }
  return found
}

describe('permission id vocabulary', () => {
  it('reads the sources it means to check', () => {
    // Positive control. "Nothing resolves to nothing" is also what an empty scan reports, and
    // three separate mechanisms here can silently return empty: a wrong root, a renamed table,
    // and a quoting change in the registry.
    expect(REGISTERED.size).toBeGreaterThan(20)
    expect(REGISTERED.has('system.shell')).toBe(true)
    expect(apiPatterns().length).toBeGreaterThan(30)
    expect(declaredPermissionIds().size).toBeGreaterThan(5)
  })

  it('names something the guard can resolve at every call site', () => {
    const patterns = apiPatterns()
    const unresolvable: string[] = []

    for (const [name, sites] of declaredPermissionIds()) {
      const resolves
        = REGISTERED.has(name) || patterns.some(pattern => matchesPattern(pattern, name))
      if (!resolves)
        unresolvable.push(`${name} (${sites.join(', ')})`)
    }

    expect(unresolvable).toEqual([])
  })

  it('keeps the two vocabularies from colliding', () => {
    // The fallback in getRequiredPermissions is only unambiguous because API names use colons
    // and permission ids use dots. A registered permission that also matched an API pattern
    // would make the lookup order load-bearing and silently mean different things.
    const patterns = apiPatterns()
    const ambiguous = [...REGISTERED].filter(id =>
      patterns.some(pattern => matchesPattern(pattern, id)),
    )

    expect(ambiguous).toEqual([])
  })

  it('still resolves a directly-named permission in the guard itself', () => {
    // The fix this file guards. Without the fallback, `permissionId: 'system.shell'` maps to
    // no permission and the check returns allowed.
    const source = readFileSync(GUARD, 'utf8')

    expect(source).toContain('permissionRegistry.get(normalized)')
    expect(source).toMatch(/return \[normalized\]/)
  })
})
