import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('check-release-gates cli', () => {
  it('parses --strict as a flag when followed by another option', () => {
    const output = execFileSync(
      'node',
      [
        'scripts/check-release-gates.mjs',
        '--tag',
        'v2.4.12-beta.8',
        '--stage',
        'gate-d',
        '--strict',
        '--timeout-ms',
        '1',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      }
    )
    const summary = JSON.parse(output)

    assert.equal(summary.strict, true)
    assert.equal(summary.tag, 'v2.4.12-beta.8')
    assert.equal(summary.stage, 'gate-d')
  })
})
