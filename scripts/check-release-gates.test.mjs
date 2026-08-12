import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = 'scripts/check-release-gates.mjs'

/** Runs the CLI without throwing, so the exit code itself can be asserted. */
function runGates(args) {
  const result = spawnSync('node', [SCRIPT, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return { status: result.status, summary: JSON.parse(result.stdout) }
}

describe('check-release-gates cli', () => {
  it('parses --strict as a flag when followed by another option', () => {
    const { summary } = runGates([
      '--tag',
      'v2.4.12-beta.8',
      '--stage',
      'gate-d',
      '--strict',
      '--timeout-ms',
      '1',
    ])

    assert.equal(summary.strict, true)
    assert.equal(summary.tag, 'v2.4.12-beta.8')
    assert.equal(summary.stage, 'gate-d')
  })

  it('defaults --tag to the shipped version rather than a literal', () => {
    // The default used to be `v2.4.7`, so a run without --tag gated a release seven
    // versions old and labelled the verdict with that stale tag.
    const shipped = JSON.parse(
      readFileSync(path.join(repoRoot, 'apps', 'core-app', 'package.json'), 'utf8'),
    ).version
    const { summary } = runGates(['--report-only'])

    assert.equal(summary.tag, `v${shipped}`)
    assert.equal(summary.version, shipped)
  })

  it('still lets --tag win over the default', () => {
    const { summary } = runGates(['--tag', 'v9.9.9', '--report-only'])

    assert.equal(summary.tag, 'v9.9.9')
    assert.equal(summary.version, '9.9.9')
  })

  it('exits non-zero whenever the gate does not pass', () => {
    // Asserted against the run's own verdict rather than a hardcoded expectation, so the
    // test states the contract — non-pass is fatal — instead of pinning today's gate state.
    const { status, summary } = runGates([])

    assert.equal(summary.reportOnly, false)
    assert.equal(status, summary.result === 'pass' ? 0 : 1)
  })

  it('exits zero under --report-only even when the gate fails', () => {
    const { status, summary } = runGates(['--report-only'])

    assert.equal(summary.reportOnly, true)
    assert.equal(status, 0)
    // Guards against the test passing vacuously if every gate ever goes green: this case is
    // only meaningful while there is a non-pass result for --report-only to swallow.
    if (summary.result === 'pass')
      console.warn('[check-release-gates.test] gates all pass; --report-only case is vacuous')
  })

  it('emits parseable JSON on the failing path, not just the passing one', () => {
    const result = spawnSync('node', [SCRIPT], { cwd: repoRoot, encoding: 'utf8' })

    assert.doesNotThrow(() => JSON.parse(result.stdout))
    assert.ok(Array.isArray(JSON.parse(result.stdout).checks))
  })
})

describe('check-release-gates argv contract', () => {
  it('keeps --report-only out of the way of --tag parsing', () => {
    // `--report-only` immediately before `--tag` must not be consumed as its value.
    const output = execFileSync(
      'node',
      [SCRIPT, '--report-only', '--tag', 'v1.2.3'],
      { cwd: repoRoot, encoding: 'utf8' },
    )
    const summary = JSON.parse(output)

    assert.equal(summary.tag, 'v1.2.3')
    assert.equal(summary.reportOnly, true)
  })
})
