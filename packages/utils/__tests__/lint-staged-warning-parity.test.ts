import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every lint-staged entry must fail on warnings, not just most of them (#721).
 *
 * Twenty of the twenty-one entries passed `--max-warnings=0`; `apps/core-app` did not. So the same
 * warning blocked a commit in `packages/utils` and passed silently in the largest package in the
 * repo — the one where a slipped warning has the most places to hide.
 *
 * A gate that applies to 20 of 21 paths is worse than no gate, because it reads as one.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
  'lint-staged': Record<string, string | string[]>
}

const entries = Object.entries(manifest['lint-staged'])

describe('lint-staged', () => {
  it('covers the packages it claims to', () => {
    // Positive control: the parity rule below is vacuous against an empty or misread config.
    expect(entries.length).toBeGreaterThan(15)
    expect(entries.some(([glob]) => glob.startsWith('apps/core-app/'))).toBe(true)
  })

  it('fails on warnings in every package, with no exception', () => {
    const missing = entries
      .filter(([, commands]) => {
        const list = Array.isArray(commands) ? commands : [commands]
        return list.some((command) => command.includes('eslint'))
          && !list.some((command) => command.includes('--max-warnings=0'))
      })
      .map(([glob]) => glob)

    expect(missing).toEqual([])
  })

  it('runs eslint for every entry it defines', () => {
    // Guards the rule above against being satisfied by deleting the entry instead of fixing it.
    const withoutEslint = entries
      .filter(([, commands]) => {
        const list = Array.isArray(commands) ? commands : [commands]
        return !list.some((command) => command.includes('eslint'))
      })
      .map(([glob]) => glob)

    expect(withoutEslint).toEqual([])
  })
})
