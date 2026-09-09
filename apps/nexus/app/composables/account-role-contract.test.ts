import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `computed(() => user.value?.role === 'admin')` had been copied into 20 pages
 * and components. The copies had already drifted — some lower-cased first, some
 * compared raw — and a reviewer suggesting a change to "the" admin check had no
 * single place to point at. This keeps the check from being re-inlined.
 *
 * It matches only the *signed-in* user's role. Comparing some other row's role
 * (the user table renders a badge from `entry.role`) is a different operation
 * and stays allowed.
 */
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const CURRENT_USER_ROLE_GATE = /\b(?:user|authUserState|currentUser)\b[^\n]{0,20}\.role\s*[=!]==\s*['"]admin['"]/

/** The two files that define the check, and may therefore describe it. */
const OWNS_THE_CHECK = new Set(['composables/useAccountRole.ts', 'utils/account-role.ts'])

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules')
      continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory())
      sourceFiles(full, found)
    else if ((full.endsWith('.vue') || full.endsWith('.ts')) && !full.endsWith('.test.ts'))
      found.push(full)
  }
  return found
}

describe('account role check', () => {
  it('is not re-inlined outside useAccountRole/isAdminAccountRole', () => {
    const offenders = sourceFiles(APP_ROOT)
      .map(file => path.relative(APP_ROOT, file))
      .filter(file => !OWNS_THE_CHECK.has(file))
      .filter(file => CURRENT_USER_ROLE_GATE.test(readFileSync(path.join(APP_ROOT, file), 'utf8')))

    expect(
      offenders,
      'use `useAccountRole()` for a reactive gate, or `isAdminAccountRole(role)` inside a function',
    ).toEqual([])
  })

  it('has no helper that folds the team owner role into the account role', () => {
    const offenders = sourceFiles(APP_ROOT)
      .map(file => path.relative(APP_ROOT, file))
      .filter(file => !OWNS_THE_CHECK.has(file))
      .filter(file => /['"]admin['"]\s*\|\|[^\n]{0,40}['"]owner['"]/.test(readFileSync(path.join(APP_ROOT, file), 'utf8')))

    expect(
      offenders,
      '`owner` is a TeamMemberRole; requireAdmin only accepts `admin`. Use useTeamRole() instead.',
    ).toEqual([])
  })
})
