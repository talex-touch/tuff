import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { runLocalReleaseGateChecks } from './local-checks.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('check-release-gates local checks', () => {
  it('validates packed publish manifests as part of the local release gate', () => {
    const checks = []

    runLocalReleaseGateChecks({
      repoRoot,
      version: '2.4.12-beta.8',
      stage: 'gate-d',
      pushCheck: (name, status, detail, meta = {}) => {
        checks.push({ name, status, detail, ...meta })
      },
    })

    const sourceCheck = checks.find((item) => item.name === 'publish-manifests')
    const packCheck = checks.find((item) => item.name === 'publish-manifests-pack')

    assert.equal(sourceCheck?.status, 'pass')
    assert.equal(packCheck?.status, 'pass')
    assert.match(packCheck?.output ?? '', /Validation passed \(source\+pack\)/)
  })
})
