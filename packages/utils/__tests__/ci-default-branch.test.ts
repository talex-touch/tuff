import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The default branch must be validated, not only incoming PRs (#723).
 *
 * `ci.yml` carries lint, typecheck, the app suites and the integration suite, and was wired to
 * `pull_request` alone. Two PRs that each pass independently can break typecheck or a test in
 * combination — a semantic conflict no PR-level run can see — and with nothing running on the merge
 * commit the branch stays broken until the next PR, whose failure then reads as its own fault.
 *
 * The subtlety this pins is the one that would have made the fix worse than the gap: `job1` uses
 * `dorny/paths-filter`, which resolves the base through the PR API and has no checkout here, so it
 * cannot diff a push. Every other job `needs: job1`. Adding the trigger without gating that step
 * would have left the default branch permanently red instead of unvalidated.
 */

const WORKFLOW = readFileSync(
  path.resolve(__dirname, '../../../.github/workflows/ci.yml'),
  'utf8'
)

describe('ci.yml triggers', () => {
  it('is the workflow that carries the quality gates', () => {
    // Positive control: every assertion below would pass against some other file that happened to
    // have a push trigger.
    expect(WORKFLOW).toContain('name: CI')
    for (const job of ['PR Quality', 'Typecheck (workspace)', 'App suites']) {
      expect(WORKFLOW).toContain(job)
    }
  })

  it('runs on pull requests and on the default branch', () => {
    expect(WORKFLOW).toMatch(/^on:\n\s+pull_request:/m)
    expect(WORKFLOW).toMatch(/^ {2}push:\n {4}branches:\n {6}- main\n {6}- master$/m)
  })
})

describe('the paths filter stays pull-request shaped', () => {
  it('does not run on a push', () => {
    // paths-filter cannot diff a push without a checkout, and job1 has none. Left ungated it fails,
    // and everything downstream needs: job1.
    const step = /id: filter_not_allowed[\s\S]{0,200}/.exec(WORKFLOW)?.[0] ?? ''
    const before = WORKFLOW.slice(0, WORKFLOW.indexOf('id: filter_not_allowed'))

    expect(step).not.toBe('')
    expect(before).toMatch(/if: \$\{\{ github\.event_name == 'pull_request' \}\}\s*\n\s*uses: dorny\/paths-filter/)
  })

  it('gives the downstream gates a full run on a push instead of an empty one', () => {
    // The outputs feed `if:` conditions on the nexus and release-acceptance jobs. Unset, they are
    // empty strings and those jobs silently skip — which would validate the default branch less
    // than a PR, the opposite of the point.
    for (const output of ['release_acceptance', 'nexus']) {
      expect(WORKFLOW).toMatch(
        new RegExp(`${output}: \\$\\{\\{ github\\.event_name == 'push' && 'true' \\|\\|`)
      )
    }
  })

  it('keeps the foreign-lockfile check on pull requests only', () => {
    // A contribution policy. Running it against the branch itself would fail every push that ever
    // touched one of those files.
    expect(WORKFLOW).toMatch(
      /if: \$\{\{ github\.event_name == 'pull_request' && steps\.filter_not_allowed\.outputs\.change == 'true' \}\}/
    )
  })
})
