import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptsDir, '..')
const gateway = path.join(scriptsDir, 'release-notes-gateway.mjs')

function verify(args = []) {
  // The gate exits non-zero when a check fails, which is the point of it — so read stdout
  // from the thrown result rather than letting execFileSync swallow the report.
  try {
    return JSON.parse(
      execFileSync('node', [gateway, 'verify', ...args], { cwd: repoRoot, encoding: 'utf8' }),
    )
  }
  catch (error) {
    return JSON.parse(String(error.stdout ?? ''))
  }
}

function check(report, name) {
  return report.checks.find(entry => entry.name === name)
}

describe('release notes gateway version checks', () => {
  it('does not claim to have checked the version when nothing was passed to compare', () => {
    // CI reaches this through quality:pr with no flags. --version then defaults to the root
    // package.json and --tag to `v${version}`, so both checks compared a value against
    // itself and reported pass while testing nothing (#731).
    const report = verify()

    assert.equal(check(report, 'root-version').applicable, false)
    assert.equal(check(report, 'tag-version').applicable, false)
    assert.equal(report.valid, true, 'a PR with no release tag must still pass the gate')
  })

  it('really compares the tag once one is supplied', () => {
    // The regression guard: if these ever become tautologies again, a wrong tag passes.
    const report = verify(['--tag', 'v9.9.9'])

    assert.equal(check(report, 'tag-version').applicable, true)
    assert.equal(check(report, 'tag-version').pass, false)
    assert.equal(report.valid, false)
  })

  it('keeps core-version a real check in both modes', () => {
    // Control: core-version never depended on a defaulted input, so it must stay applicable
    // and passing — otherwise this change quietly weakened a check that was working.
    assert.equal(check(verify(), 'core-version').applicable, true)
    assert.equal(check(verify(), 'core-version').pass, true)
  })
})
